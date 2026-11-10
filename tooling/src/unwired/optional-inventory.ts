// Rows reference the same field and witness inventories. Repeating an owner's unknown writes for each
// field pair makes the JSON grow with both the number of pairs and the number of constructions.
import type { Site } from "./classify.ts";

export interface ConstructionSite extends Site {
  readonly branches: readonly { readonly condition: number; readonly positive: boolean }[];
}

type Witness = Site | ConstructionSite | string;

export interface OptionalPair {
  /** Index in optionalGroups. The group's id and these two field names identify a reviewed pair. */
  readonly group: number;
  readonly left: string;
  readonly right: string;
  /** Each evidence reference indexes optionalWitnessSets; its entries index optionalWitnesses. */
  readonly testCoSets: number;
  readonly possibleCoSets: number;
  readonly fallbackReaders: number;
  readonly jointDomReads: number;
}

export interface OptionalGroup {
  readonly id: string;
  readonly file: string;
  readonly line: number;
  readonly owner: string;
  readonly unknownWrites: number;
  readonly fields: readonly {
    readonly name: string;
    readonly line: number;
    readonly writes: number;
    readonly testWrites: number;
    readonly unknownWrites: number;
  }[];
}

export interface OptionalInventory {
  readonly optionalGroups: readonly OptionalGroup[];
  readonly optionalAlternatives: readonly OptionalPair[];
  readonly optionalWitnesses: readonly Witness[];
  readonly optionalWitnessSets: readonly (readonly number[])[];
}

export class OptionalEvidence {
  readonly groups: OptionalGroup[] = [];
  readonly pairs: OptionalPair[] = [];
  readonly #witnesses: Witness[] = [];
  readonly #sets: number[][] = [[]];
  readonly #witnessIds = new Map<string, number>();
  readonly #setIds = new Map<string, number>([["", 0]]);

  record(items: Iterable<Witness>): number {
    const ids = new Set<number>();
    for (const item of items) {
      const id = this.#witnessIds.getOrInsertComputed(JSON.stringify(item), () => this.#witnesses.push(item) - 1);
      ids.add(id);
    }
    const members = [...ids].sort((left, right) => left - right);
    return this.#setIds.getOrInsertComputed(members.join(","), () => this.#sets.push(members) - 1);
  }

  inventory(): OptionalInventory {
    return { optionalGroups: this.groups, optionalAlternatives: this.pairs, optionalWitnesses: this.#witnesses, optionalWitnessSets: this.#sets };
  }
}
