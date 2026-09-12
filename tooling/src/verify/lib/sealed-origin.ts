// One reader for "does this reference enter through a declaration that lives in THIS implementation home".
// A seal is a claim about where a symbol is DECLARED, never about how a consumer spelled it: an alias, a
// namespace member and a name-preserving re-export all resolve to the same canonical declaration, while a
// same-named export of another module resolves to a different one. Consumers pass an absolute-path INFIX
// because a canonical declaration is routinely OUTSIDE the consuming policy's population, where
// `ctx.relativePath` refuses by contract.
import type { Node as MorphNode } from "ts-morph";
import type { ModuleMemberOrigin } from "../contract/reference-fact.ts";
import type { SealedOriginVerdict } from "../contract/sealed-origin.ts";
import { classifyOriginRefusal } from "./origin-verdict.ts";
import { resolveModuleMemberOrigin } from "./reference-fact.ts";

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

/** Does one candidate REPORT under a seal? `sealed` always does, `foreign` never does, and an `unresolved`
 *  verdict is SCOPED by the shared refusal classifier: a DECLARED import door with no reachable target is
 *  unreadable and reports (a seal an unreadable barrel can walk through is not a seal), while a member read
 *  that provably binds something else — a local object's key, a project interface's property — is simply not
 *  a subject. Conflating the two is how a seal acquires either permanent exemption rows or a silent green. */
export function sealedOriginReports(verdict: SealedOriginVerdict, anchor: MorphNode): boolean {
  if (verdict.kind === "foreign") {
    return false;
  }
  return verdict.kind === "sealed" || classifyOriginRefusal(verdict.fact.reason, anchor) === "unreadable";
}

/** The authored door a resolved origin entered through — the external package name when the door is not a
 *  project file, else the specifier the consumer wrote. */
export function originModuleSpecifier(origin: ModuleMemberOrigin): string {
  return origin.canonical.kind === "external-door" ? origin.canonical.moduleSpecifier : origin.moduleSpecifier;
}
