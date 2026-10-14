import type { Node } from "ts-morph";
import type { PackageName, World } from "../compiler/project-worlds.ts";

export const TYPE_HOME_CATEGORIES = [
  "primitive",
  "wire",
  "db-row",
  "domain",
  "client-view",
  "component",
  "package-contract",
  "standalone-declarations",
  "unqualified",
] as const;
export type TypeHomeCategory = (typeof TYPE_HOME_CATEGORIES)[number];

export type PackageTypeHomePolicy =
  | { readonly category: Extract<TypeHomeCategory, "package-contract">; readonly nativePilot: boolean }
  | { readonly category: Exclude<TypeHomeCategory, "package-contract">; readonly nativePilot: false };

/** A null home answer requires a declaration-semantic judgment rather than path admission. */
export interface PackageTypeHomeClassification {
  readonly packageName: PackageName;
  readonly world: World | undefined;
  readonly category: TypeHomeCategory;
  readonly home: boolean | null;
  readonly nativePilot: boolean;
}

export const TYPE_HOME_DECLARATION_CLAIMS = ["alias-or-schema", "interface", "wire-interface"] as const;
export type TypeHomeDeclarationClaim = (typeof TYPE_HOME_DECLARATION_CLAIMS)[number];

export const TYPE_HOME_DECLARATION_PLANES = ["direct-export", "local-export", "schema-origin"] as const;
export type TypeHomeDeclarationPlane = (typeof TYPE_HOME_DECLARATION_PLANES)[number];

/** Structural package contracts are proven here; other categories still need declaration-specific evidence. */
export type DeclarationTypeHomeOwnership =
  | { readonly kind: "owned"; readonly packageName: PackageName; readonly home: string }
  | { readonly kind: "misplaced"; readonly packageName: PackageName; readonly home: string }
  | { readonly kind: "unqualified"; readonly category: TypeHomeCategory | null; readonly reason: string };

export interface TypeHomeDeclarationInput {
  readonly path: string;
  /** The existing policy has already admitted this declaration's source population. */
  readonly claim: TypeHomeDeclarationClaim;
}

export interface TypeHomeDeclarationShape {
  readonly name: Node;
  readonly plane: TypeHomeDeclarationPlane;
}

/** Not-subject is not an ownership verdict; unqualified ownership never cancels an admitted finding. */
export type TypeHomeDeclarationJudgment =
  | { readonly kind: "not-subject" }
  | { readonly kind: "refused"; readonly reason: string }
  | { readonly kind: "subject"; readonly shapes: readonly TypeHomeDeclarationShape[]; readonly ownership: DeclarationTypeHomeOwnership };
