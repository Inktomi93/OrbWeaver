// Canonical registry-definition and JSX-tag facts for final Orb policies.
import type { InterfaceDeclaration, Node, ObjectLiteralExpression, TypeAliasDeclaration } from "ts-morph";
import type { ReferenceFact } from "../../_shared/reference-fact-contract.ts";
import type { StaticAuthoredValue } from "./static-authored-value.ts";

export const REGISTRY_DEFINITION_KINDS = ["section", "modal", "home-tile", "config-group", "collection", "config-section", "chrome"] as const;
export type RegistryDefinitionKind = (typeof REGISTRY_DEFINITION_KINDS)[number];

export type RegistryTypeDeclaration = InterfaceDeclaration | TypeAliasDeclaration;

export interface RegistryTypeOrigin {
  readonly exportedName: string;
  readonly declaration: RegistryTypeDeclaration;
}

export interface RegistryDefinitionFact {
  readonly kind: RegistryDefinitionKind;
  readonly shape: "const" | "factory";
  readonly declaration: Node;
  readonly typeOrigin: RegistryTypeOrigin;
  readonly object: ReferenceFact<ObjectLiteralExpression>;
  /** The complete JSON-like authored value when one exists; function-valued fields remain unsupported. */
  readonly authoredValue: ReferenceFact<StaticAuthoredValue>;
}

export type RegistryTypeTargetFact =
  | { readonly kind: "resolved"; readonly value: RegistryTypeOrigin }
  | {
      readonly kind: "unresolved";
      readonly reason: "missing" | "ambiguous";
      readonly detail: string;
      readonly declarations: readonly RegistryTypeDeclaration[];
    };

export interface RegistryDefinitionKindFacts {
  readonly source: string;
  readonly target: RegistryTypeTargetFact;
  readonly definitions: readonly RegistryDefinitionFact[];
  /** Every definition this kind's registry TYPE admits, readable object or not. */
  readonly members: number;
  /** 1 when the registry TYPE itself is missing or ambiguous — the rename tripwire. An unreadable authored
   *  object is NOT counted here: it is resolved data on `object`, which the consumer judges fail-closed. */
  readonly unresolved: number;
}

export interface JsxTagFact {
  readonly element: Node;
  readonly tagName: Node;
  readonly origin: import("../../_shared/reference-fact-contract.ts").ModuleMemberOrigin;
}
