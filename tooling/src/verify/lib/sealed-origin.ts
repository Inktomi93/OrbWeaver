// One reader for "does this reference enter through a declaration that lives in THIS implementation home".
// A seal is a claim about where a symbol is DECLARED, never about how a consumer spelled it: an alias, a
// namespace member and a name-preserving re-export all resolve to the same canonical declaration, while a
// same-named export of another module resolves to a different one. Consumers pass an absolute-path INFIX
// because a canonical declaration is routinely OUTSIDE the consuming policy's population, where
// `ctx.relativePath` refuses by contract.
import type { Node as MorphNode } from "ts-morph";
import type { ModuleMemberOrigin, ReferenceFact } from "../contract/reference-fact.ts";
import { resolveModuleMemberOrigin } from "./reference-fact.ts";

/** The verdict for one candidate reference. `unresolved` is never absence: a candidate whose origin cannot
 *  be read is fail-closed evidence for the caller, not a silent pass. */
export type SealedOriginVerdict =
  | { readonly kind: "sealed"; readonly exportedName: string; readonly origin: ModuleMemberOrigin }
  | { readonly kind: "foreign"; readonly origin: ModuleMemberOrigin }
  | { readonly kind: "unresolved"; readonly fact: Extract<ReferenceFact<ModuleMemberOrigin>, { readonly kind: "unresolved" }> };

export interface SealedHome {
  /** Absolute-path infix of the implementation home, e.g. `/packages/server/src/infra/providers/`. */
  readonly pathInfix: string;
  /** The exported names this home seals. */
  readonly exportedNames: ReadonlySet<string>;
}

function projectPath(origin: ModuleMemberOrigin): string | null {
  return origin.canonical.kind === "project" ? origin.canonical.sourceFile.getFilePath().replaceAll("\\", "/") : null;
}

/** Resolve one reference against a sealed implementation home. */
export function readSealedOrigin(node: MorphNode, home: SealedHome): SealedOriginVerdict {
  const origin = resolveModuleMemberOrigin(node);
  if (origin.kind === "unresolved") {
    return { kind: "unresolved", fact: origin };
  }
  const path = projectPath(origin.value);
  const exportedName = origin.value.canonical.exportedName;
  return path !== null && path.includes(home.pathInfix) && home.exportedNames.has(exportedName)
    ? { kind: "sealed", exportedName, origin: origin.value }
    : { kind: "foreign", origin: origin.value };
}

/** The authored door a resolved origin entered through — the external package name when the door is not a
 *  project file, else the specifier the consumer wrote. */
export function originModuleSpecifier(origin: ModuleMemberOrigin): string {
  return origin.canonical.kind === "external-door" ? origin.canonical.moduleSpecifier : origin.moduleSpecifier;
}
