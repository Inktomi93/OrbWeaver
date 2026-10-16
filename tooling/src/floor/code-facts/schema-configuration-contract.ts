// Native builder configuration observations carry authored data, not a tuple-policy verdict.
import type { Node } from "ts-morph";
import type { NativeAuthoredValueProjection } from "./authored-value-projection.ts";
import type { ModuleMemberOrigin, ReferenceFact } from "./reference-fact-contract.ts";
import type { SchemaObjectEntry } from "./schema-object-contract.ts";

export interface SchemaConfigurationValue {
  readonly node: Node;
  readonly module: ReferenceFact<ModuleMemberOrigin>;
  readonly stable: ReferenceFact<Node>;
  readonly authored: NativeAuthoredValueProjection;
  readonly children: readonly Node[];
}

export interface SchemaConfiguration {
  readonly entries: ReferenceFact<readonly Pick<SchemaObjectEntry, "name" | "value">[]>;
  readonly values: readonly SchemaConfigurationValue[];
}
