import type ts from "typescript";
import type { InventoryInput } from "../code-facts/semantic-inventory-contract.ts";

export interface RouterDeclarationInputs {
  readonly system: ts.System;
  readonly inputs: Map<string, InventoryInput>;
  readonly assertCurrent: () => void;
}

export interface RouterDeclarationPublication {
  readonly output: string;
  readonly staging: string;
  readonly ambientPaths: readonly string[];
  readonly declarations: number;
  readonly inputs: readonly InventoryInput[];
  readonly assertInputsCurrent: () => void;
}

/** An immutable native family, not a grant of executing-producer currentness. */
export interface RouterDeclarationPreparation {
  readonly entry: string;
  readonly generation: string;
  readonly declarations: number;
  readonly inputs: readonly InventoryInput[];
  readonly assertSubjectCurrent: () => void;
}
