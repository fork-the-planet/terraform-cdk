// Copyright (c) HashiCorp, Inc
// SPDX-License-Identifier: MPL-2.0
import {
  TerraformResource,
  TerraformMetaArguments,
  IResolvable,
} from "../../lib";
import { Construct } from "constructs";
import { TestProviderMetadata } from "./provider";
import { listMapper, stringToTerraform } from "../../lib/runtime";
import { ComplexList, ComplexObject } from "../../lib/complex-computed-list";
import { ITerraformResource } from "../../lib/terraform-resource";

export interface TestResourceConfig extends TerraformMetaArguments {
  name: string;
  names?: string[];
  tags?: { [key: string]: string };
  nestedType?: { [key: string]: string };
  anyMap?: { [key: string]: any };
  listBlock?: IResolvable;
  listAttribute?: IResolvable;
}

export class TestResource extends TerraformResource {
  public static readonly tfResourceType: string = "test_resource";
  public name: string;
  public names?: string[];
  public tags?: { [key: string]: string };
  public nestedType?: { [key: string]: string };
  public anyMap?: { [key: string]: any };
  public listBlock?: IResolvable; // real life bindings also allow an interface here, but we don't use that in our tests using this
  public listAttribute?: IResolvable;

  constructor(scope: Construct, id: string, config: TestResourceConfig) {
    super(scope, id, {
      terraformResourceType: "test_resource",
      terraformGeneratorMetadata: {
        providerName: TestProviderMetadata.TYPE,
        providerVersionConstraint: "~> 2.0",
      },
      provider: config.provider,
      dependsOn: config.dependsOn,
      count: config.count,
      lifecycle: config.lifecycle,
      provisioners: config.provisioners,
      forEach: config.forEach,
    });

    this.name = config.name;
    this.names = config.names;
    this.tags = config.tags;
    this.anyMap = config.anyMap;
    this.nestedType = config.nestedType;
    this.listBlock = config.listBlock;
    this.listAttribute = config.listAttribute;
  }

  protected synthesizeAttributes(): { [name: string]: any } {
    return {
      name: this.name,
      names: this.names,
      tags: this.tags,
      nested_type: this.nestedType,
      any_map: this.anyMap,
      list_block: listMapper((a) => a, true)(this.listBlock), // identity function to skip writing a toTerraform function
      list_attribute: listMapper((a) => a, false)(this.listAttribute), // identity function to skip writing a toTerraform function
    };
  }

  protected synthesizeHclAttributes(): { [name: string]: any } {
    return Object.fromEntries(
      Object.entries({
        name: {
          value: this.name,
          type: "simple",
          storageClassType: "string",
        },
        names: {
          value: this.names,
          type: "simple",
          storageClassType: "string",
        },
        tags: {
          value: this.tags,
          type: "map",
          storageClassType: "stringMap",
        },

        nested_type: {
          value: this.nestedType,
          type: "map",
          storageClassType: "stringMap",
        },

        any_map: {
          value: this.anyMap,
          type: "map",
          storageClassType: "anyMap",
        },
        list_block: listMapper((a) => a, true)(this.listBlock), // identity function to skip writing a toTerraform function
        list_attribute: listMapper((a) => a, false)(this.listAttribute), // identity function to skip writing a toTerraform function
      }).filter(
        ([_, value]) => value !== undefined && value.value !== undefined,
      ),
    );
  }

  public get stringValue() {
    return this.getStringAttribute("string_value");
  }

  public get numericValue() {
    return this.getNumberAttribute("numeric_value");
  }

  public get listValue() {
    return this.getListAttribute("list_value");
  }

  public get anyList() {
    return this.interpolationForAttribute("any_list");
  }

  public get stringMap() {
    return this.getStringMapAttribute("string_map");
  }

  public get numberList() {
    return this.getNumberListAttribute("number_list_value");
  }
}

export class TestOutputReference extends ComplexObject {
  /**
   * @param terraformResource The parent resource
   * @param terraformAttribute The attribute on the parent resource this class is referencing
   */
  public constructor(
    terraformResource: ITerraformResource,
    terraformAttribute: string,
  ) {
    super(terraformResource, terraformAttribute, false, 0);
  }

  public get value() {
    return this.getStringAttribute("value");
  }
}

export class OtherTestResource extends TerraformResource {
  public static readonly tfResourceType: string = "other_test_resource";
  constructor(scope: Construct, id: string, config: TerraformMetaArguments) {
    super(scope, id, {
      terraformResourceType: "other_test_resource",
      terraformGeneratorMetadata: {
        providerName: TestProviderMetadata.TYPE,
        providerVersionConstraint: "~> 2.0",
      },
      provider: config.provider,
      dependsOn: config.dependsOn,
      count: config.count,
      lifecycle: config.lifecycle,
      provisioners: config.provisioners,
      forEach: config.forEach,
    });
  }

  public get names(): string[] {
    return this.getListAttribute("names");
  }

  public get complexComputedList() {
    return new TestComplexList(this, "complex_computed_list", false);
  }

  public get outputRef() {
    return new TestOutputReference(this, "outputRef");
  }

  protected synthesizeAttributes(): { [name: string]: any } {
    return {};
  }
}

class TestComplexObject extends ComplexObject {
  public get id() {
    return this.getStringAttribute("id");
  }
}

class TestComplexList extends ComplexList {
  public get(index: number): TestComplexObject {
    return new TestComplexObject(
      this.terraformResource,
      this.terraformAttribute,
      this.wrapsSet,
      index,
    );
  }
}

// Generated Docker image to test real-world scenarios
export class DockerImage extends TerraformResource {
  public static readonly tfResourceType: string = "docker_image";
  private _name: string;
  public constructor(scope: Construct, id: string, config: { name: string }) {
    super(scope, id, {
      terraformResourceType: "docker_image",
      terraformGeneratorMetadata: {
        providerName: "docker",
      },
    });

    this._name = config.name;
  }

  protected synthesizeAttributes(): { [name: string]: any } {
    return {
      name: stringToTerraform(this._name),
    };
  }
}
