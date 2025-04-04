// Copyright (c) HashiCorp, Inc
// SPDX-License-Identifier: MPL-2.0
import { Construct, IConstruct, Node } from "constructs";
import { resolve } from "./_tokens";

import { TerraformElement } from "./terraform-element";
import { deepMerge } from "./util";
import { TerraformProvider } from "./terraform-provider";
import { LocalBackend } from "./backends/local-backend";
import { ref } from "./tfExpression";
import { TerraformOutput } from "./terraform-output";
import { TerraformRemoteState } from "./terraform-remote-state";
import { makeUniqueId } from "./private/unique";
import { IStackSynthesizer } from "./synthesize/types";
import { StackSynthesizer } from "./synthesize/synthesizer";

const STACK_SYMBOL = Symbol.for("cdktf/TerraformStack");
import { ValidateProviderPresence } from "./validations";
import { App } from "./app";
import { TerraformBackend } from "./terraform-backend";
import { TerraformResourceTargets } from "./terraform-resource-targets";
import { TerraformResource } from "./terraform-resource";
import {
  renderDatasource,
  renderModule,
  renderMoved,
  renderOutput,
  renderProvider,
  renderResource,
  renderTerraform,
  renderLocals,
  renderVariable,
  renderImport,
  cleanForMetadata,
} from "./hcl/render";
import {
  noStackForConstruct,
  stackContainsDisallowedChar,
  stackHasCircularDependency,
  stackIdContainsWhitespace,
  stackValidationFailure,
} from "./errors";

type StackIdentifier = string;
type OutputIdMap =
  | { [constructId: string]: string }
  | { [stackOrConstructId: string]: OutputIdMap };

export interface TerraformStackMetadata {
  readonly stackName: string;
  readonly version: string;
  readonly backend: string;
  readonly cloud?: string;
}

// eslint-disable-next-line jsdoc/require-jsdoc
function throwIfIdIsGlobCharacter(str: string): void {
  ["*", "?", "[", "]", "{", "}", "!"].forEach((char) => {
    if (str.includes(char)) {
      throw stackContainsDisallowedChar(str, char);
    }
  });
}

// eslint-disable-next-line jsdoc/require-jsdoc
function throwIfIdContainsWhitespace(str: string): void {
  if (/\s/.test(str)) {
    throw stackIdContainsWhitespace(str);
  }
}

// eslint-disable-next-line jsdoc/require-jsdoc
export class TerraformStack extends Construct {
  private readonly rawOverrides: any = {};
  private readonly cdktfVersion: string;
  private crossStackOutputs: Record<StackIdentifier, TerraformOutput> = {};
  private crossStackDataSources: Record<StackIdentifier, TerraformRemoteState> =
    {};
  public synthesizer: IStackSynthesizer;
  public dependencies: TerraformStack[] = [];
  public moveTargets: TerraformResourceTargets = new TerraformResourceTargets();

  constructor(scope: Construct, id: string) {
    super(scope, id);

    throwIfIdIsGlobCharacter(id);
    throwIfIdContainsWhitespace(id);
    this.cdktfVersion = this.node.tryGetContext("cdktfVersion");
    this.synthesizer = new StackSynthesizer(
      this,
      process.env.CDKTF_CONTINUE_SYNTH_ON_ERROR_ANNOTATIONS !== undefined,
      process.env.SYNTH_HCL_OUTPUT === "true" ||
        process.env.SYNTH_HCL_OUTPUT === "1",
    );
    Object.defineProperty(this, STACK_SYMBOL, { value: true });
    this.node.addValidation(new ValidateProviderPresence(this));
  }

  public static isStack(x: any): x is TerraformStack {
    return x !== null && typeof x === "object" && STACK_SYMBOL in x;
  }

  public static of(construct: IConstruct): TerraformStack {
    return _lookup(construct);

    // eslint-disable-next-line jsdoc/require-jsdoc
    function _lookup(c: IConstruct): TerraformStack {
      if (TerraformStack.isStack(c)) {
        return c;
      }

      const node = c.node;

      if (!node.scope) {
        let hint = "";
        if (construct.node.scope === c && App.isApp(c)) {
          // the scope of the originally passed construct equals the construct c
          // which has no scope (i.e. has no parent construct) and c is an App
          // and our construct is a Backend
          hint = `. You seem to have passed your root App as scope to a construct. Pass a stack (inheriting from TerraformStack) as scope to your construct instead.`;
        }

        throw noStackForConstruct(construct.node.path, hint);
      }

      return _lookup(node.scope);
    }
  }

  private findAll<T extends IConstruct>(
    predicate: (node: unknown) => node is T,
  ): T[] {
    const items: T[] = [];

    const visit = async (node: IConstruct) => {
      if (predicate(node)) {
        items.push(node);
      }

      for (const child of node.node.children) {
        visit(child);
      }
    };

    visit(this);

    return items;
  }

  public prepareStack() {
    // Ensure we have a backend configured
    this.ensureBackendExists();
    // A preparing resolve run might add new resources to the stack, e.g. for cross stack references.
    terraformElements(this).forEach((e) =>
      resolve(this, e.toTerraform(), true),
    );
  }

  public addOverride(path: string, value: any) {
    const parts = path.split(".");
    let curr: any = this.rawOverrides;

    while (parts.length > 1) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const key = parts.shift()!;

      // if we can't recurse further or the previous value is not an
      // object overwrite it with an object.
      const isObject =
        curr[key] != null &&
        typeof curr[key] === "object" &&
        !Array.isArray(curr[key]);
      if (!isObject) {
        curr[key] = {};
      }

      curr = curr[key];
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const lastKey = parts.shift()!;
    curr[lastKey] = value;
  }

  public getLogicalId(tfElement: TerraformElement | Node): string {
    // wrap the allocation for future renaming support
    return this.allocateLogicalId(tfElement);
  }

  /**
   * Returns the naming scheme used to allocate logical IDs. By default, uses
   * the `HashedAddressingScheme` but this method can be overridden to customize
   * this behavior.
   *
   * @param tfElement The element for which the logical ID is allocated.
   */
  protected allocateLogicalId(tfElement: TerraformElement | Node): string {
    const node = TerraformElement.isTerraformElement(tfElement)
      ? tfElement.node
      : tfElement;
    const stack = TerraformElement.isTerraformElement(tfElement)
      ? tfElement.cdktfStack
      : this;

    const stackIndex = node.scopes.indexOf(stack);

    const components = node.scopes.slice(stackIndex + 1).map((c) => c.node.id);
    return components.length > 0 ? makeUniqueId(components) : "";
  }

  public allProviders(): TerraformProvider[] {
    return this.findAll(TerraformProvider.isTerraformProvider);
  }

  public ensureBackendExists(): TerraformBackend {
    const backends = this.findAll(TerraformBackend.isBackend);
    return backends[0] || new LocalBackend(this, {});
  }

  public toHclTerraform(): { [key: string]: any } {
    const metadata: TerraformStackMetadata = {
      version: this.cdktfVersion,
      stackName: this.node.id,
      backend: "local", // overwritten by backend implementations if used
      cloud: undefined, // overwritten by cloud and remote backend implementations
      ...(Object.keys(this.rawOverrides).length > 0
        ? { overrides: { stack: Object.keys(this.rawOverrides) } }
        : {}),
    };

    const elements = terraformElements(this);

    const metadatas = elements.map((e) => resolve(this, e.toMetadata()));
    for (const meta of metadatas) {
      deepMerge(metadata, meta);
    }

    const outputs: OutputIdMap = elements.reduce((carry, item) => {
      if (!TerraformOutput.isTerraformOutput(item)) {
        return carry;
      }

      deepMerge(
        carry,
        item.node.path.split("/").reduceRight((innerCarry, part) => {
          if (Object.keys(innerCarry).length === 0) {
            return { [part]: item.friendlyUniqueId };
          }
          return { [part]: innerCarry };
        }, {}),
      );

      return carry;
    }, {});

    const tf = {};
    const fragments = elements.map((e) => resolve(this, e.toHclTerraform()));
    const locals: { locals?: any } = {};

    const tfMeta = {
      "//": {
        metadata,
        outputs,
      },
    };
    const hclFragments = fragments
      .map((frag) => {
        let res = "";
        if (frag.resource) {
          const { hcl, metadata } = renderResource(frag.resource);
          deepMerge(tfMeta, metadata);
          res = [res, hcl].join("\n");
        }

        if (frag.data) {
          const { hcl, metadata } = renderDatasource(frag.data);
          deepMerge(tfMeta, metadata);
          res = [res, hcl].join("\n");
        }

        if (frag.provider) {
          deepMerge(tf, frag);
          res = [res, renderProvider(frag.provider)].join("\n\n");
        }

        if (frag.terraform) {
          deepMerge(tf, frag);
        }

        if (frag.module) {
          const { hcl, metadata } = renderModule(frag.module);
          deepMerge(tfMeta, metadata);
          res = [res, hcl].join("\n");
        }

        if (frag.output) {
          res = [res, renderOutput(frag.output)].join("\n\n");
        }

        if (frag.moved) {
          res = [res, renderMoved(frag.moved)].join("\n\n");
        }

        if (frag.import) {
          res = [res, renderImport(frag.import)].join("\n\n");
        }

        if (frag.locals) {
          deepMerge(locals, frag);
        }

        if (frag.variable) {
          res = [res, renderVariable(frag.variable)].join("\n\n");
        }

        return res;
      })
      .filter((frag) => frag !== undefined);

    deepMerge(tf, this.rawOverrides);
    const terraformBlock = (tf as any)?.terraform;

    let terraformBlockHcl = "";
    if (terraformBlock) {
      terraformBlockHcl = renderTerraform(terraformBlock);
      deepMerge(tfMeta, { terraform: cleanForMetadata(terraformBlock) });
    }

    let localsHcl = "";
    if (locals) {
      localsHcl = renderLocals(locals.locals);

      if (localsHcl) {
        // Hacky way to add a newline between the terraform block and the locals block
        localsHcl = "\n\n" + localsHcl;
      }
    }

    return {
      hcl: resolve(
        this,
        [terraformBlockHcl, localsHcl, ...hclFragments].join(""),
      ),
      metadata: resolve(this, tfMeta),
    };
  }

  public toTerraform(): any {
    const tf = {};

    const metadata: TerraformStackMetadata = {
      version: this.cdktfVersion,
      stackName: this.node.id,
      backend: "local", // overwritten by backend implementations if used
      cloud: undefined, // overwritten by cloud and remote backend implementations
      ...(Object.keys(this.rawOverrides).length > 0
        ? { overrides: { stack: Object.keys(this.rawOverrides) } }
        : {}),
    };

    const elements = terraformElements(this);

    const metadatas = elements.map((e) => resolve(this, e.toMetadata()));
    for (const meta of metadatas) {
      deepMerge(metadata, meta);
    }

    const outputs: OutputIdMap = elements.reduce((carry, item) => {
      if (!TerraformOutput.isTerraformOutput(item)) {
        return carry;
      }

      deepMerge(
        carry,
        item.node.path.split("/").reduceRight((innerCarry, part) => {
          if (Object.keys(innerCarry).length === 0) {
            return { [part]: item.friendlyUniqueId };
          }
          return { [part]: innerCarry };
        }, {}),
      );

      return carry;
    }, {});

    (tf as any)["//"] = { metadata, outputs };

    const fragments = elements.map((e) => resolve(this, e.toTerraform()));
    for (const fragment of fragments) {
      deepMerge(tf, fragment);
    }

    deepMerge(tf, this.rawOverrides);

    return resolve(this, tf);
  }

  public registerOutgoingCrossStackReference(identifier: string) {
    if (this.crossStackOutputs[identifier]) {
      return this.crossStackOutputs[identifier];
    }

    const output = new TerraformOutput(
      this,
      `cross-stack-output-${identifier}`,
      {
        value: ref(identifier, this),
        sensitive: true,
      },
    );

    this.crossStackOutputs[identifier] = output;
    return output;
  }

  public registerIncomingCrossStackReference(fromStack: TerraformStack) {
    if (this.crossStackDataSources[String(fromStack)]) {
      return this.crossStackDataSources[String(fromStack)];
    }
    const originBackend = fromStack.ensureBackendExists();
    const originPath = fromStack.node.path;

    const remoteState = originBackend.getRemoteStateDataSource(
      this,
      `cross-stack-reference-input-${originPath}`,
      originPath,
    );

    this.crossStackDataSources[originPath] = remoteState;
    return remoteState;
  }

  // Check here for loops in the dependency graph
  public dependsOn(stack: TerraformStack): boolean {
    return (
      this.dependencies.includes(stack) ||
      this.dependencies.some((d) => d.dependsOn(stack))
    );
  }

  public addDependency(dependency: TerraformStack) {
    if (dependency.dependsOn(this)) {
      throw stackHasCircularDependency(this, dependency);
    }

    if (this.dependencies.includes(dependency)) {
      return;
    }

    this.dependencies.push(dependency);
  }

  /**
   * Run all validations on the stack.
   */
  public runAllValidations() {
    const errors: { message: string; source: IConstruct }[] = this.node
      .findAll()
      .map((node) =>
        node.node.validate().map((error) => ({ message: error, source: node })),
      )
      .reduce((prev, curr) => [...prev, ...curr], []);
    if (errors.length > 0) {
      const errorList = errors
        .map((e) => `[${e.source.node.path}] ${e.message}`)
        .join("\n  ");
      throw stackValidationFailure(errorList);
    }
  }

  public hasResourceMove(): boolean {
    return terraformElements(this).some((e) => {
      if (TerraformResource.isTerraformResource(e) && e.hasResourceMove()) {
        return true;
      }
      return false;
    });
  }
}

// eslint-disable-next-line jsdoc/require-jsdoc
function terraformElements(
  node: IConstruct,
  into: TerraformElement[] = [],
): TerraformElement[] {
  if (TerraformElement.isTerraformElement(node)) {
    into.push(node);
  }

  for (const child of node.node.children) {
    // Don't recurse into a substack
    if (TerraformStack.isStack(child)) {
      continue;
    }

    terraformElements(child, into);
  }

  return into;
}
