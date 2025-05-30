// Copyright (c) HashiCorp, Inc
// SPDX-License-Identifier: MPL-2.0
// copied from https://github.com/aws/constructs/blob/e01e47f78ef1e9b600efcd23ff7705aa8d384017/lib/private/dependency.ts

/* eslint-disable @typescript-eslint/no-empty-object-type */

import { IConstruct } from "constructs";
import { doesNotImplementDependableTrait } from "../../errors";

/**
 * Trait marker for classes that can be depended upon
 *
 * The presence of this interface indicates that an object has
 * an `IDependableTrait` implementation.
 *
 * This interface can be used to take an (ordering) dependency on a set of
 * constructs. An ordering dependency implies that the resources represented by
 * those constructs are deployed before the resources depending ON them are
 * deployed.
 */
export interface IDependable {
  // Empty, this interface is a trait marker
}

/**
 * A set of constructs to be used as a dependable
 *
 * This class can be used when a set of constructs which are disjoint in the
 * construct tree needs to be combined to be used as a single dependable.
 *
 * @experimental
 */
export class ConcreteDependable implements IDependable {
  private readonly _dependencyRoots = new Array<IConstruct>();

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    DependableTrait.implement(this, {
      get dependencyRoots() {
        return self._dependencyRoots;
      },
    });
  }

  /**
   * Add a construct to the dependency roots
   */
  public add(construct: IConstruct) {
    this._dependencyRoots.push(construct);
  }
}

const DEPENDABLE_SYMBOL = Symbol.for("@aws-cdk/core.DependableTrait");

/**
 * Trait for IDependable
 *
 * Traits are interfaces that are privately implemented by objects. Instead of
 * showing up in the public interface of a class, they need to be queried
 * explicitly. This is used to implement certain framework features that are
 * not intended to be used by Construct consumers, and so should be hidden
 * from accidental use.
 *
 * @example
 *
 * // Usage
 * const roots = DependableTrait.get(construct).dependencyRoots;
 *
 * // Definition
 * DependableTrait.implement(construct, {
 *   get dependencyRoots() { return []; }
 * });
 *
 * @experimental
 */
export abstract class DependableTrait {
  /**
   * Register `instance` to have the given DependableTrait
   *
   * Should be called in the class constructor.
   */
  public static implement(instance: IDependable, trait: DependableTrait) {
    // I would also like to reference classes (to cut down on the list of objects
    // we need to manage), but we can't do that either since jsii doesn't have the
    // concept of a class reference.
    (instance as any)[DEPENDABLE_SYMBOL] = trait;
  }

  /**
   * Return the matching DependableTrait for the given class instance.
   */
  public static get(instance: IDependable): DependableTrait {
    const ret = (instance as any)[DEPENDABLE_SYMBOL];
    if (!ret) {
      throw doesNotImplementDependableTrait(instance);
    }
    return ret;
  }

  /**
   * The set of constructs that form the root of this dependable
   *
   * All resources under all returned constructs are included in the ordering
   * dependency.
   */
  public abstract readonly dependencyRoots: IConstruct[];
}
