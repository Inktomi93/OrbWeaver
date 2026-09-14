// The SHARED READER for the `freeze-provenance` family (owner ruling 2026-09-12, #2096 / §12.3): the
// guarded table's IDENTITY, the provenance triple, the declared write population, and the write-chain
// verdict both policies decide with.
//
// WHY IT IS HERE AND NOT IN A GATE MODULE. `freeze-provenance-write-pairing` judges each write site;
// `freeze-provenance-write-pairing-health` proves the triple is still the live table's columns and that
// the writer set it guards is the same one. A two-sided ratchet is only a ratchet while both halves answer
// "is this write OURS" with the SAME predicate — two copies of a table-identity reader drift apart
// silently, and the drift is invisible because each module's own proofs stay green. The health sibling used
// to reach these by importing the occurrence gate module directly, which the owner banned on 2026-09-12:
// **a gate module NEVER imports another gate module; a shared predicate moves to `lib/<family>.ts`.**
// `lib/contract-derives-not-respells.ts` is the worked precedent.
//
// THE IDENTITY IS BINDING AND DOOR, NEVER SPELLING, and the three verdicts are not interchangeable:
// `other` is a name that PROVABLY is not ours (including an identifier nothing binds — a plain name this
// family has simply never met), `unreadable` is a table EXPRESSION that reduces to no name at all, and
// `no-write-chain` is a call with no Drizzle write verb in it at all (`map.set(…)`) — the boundary that
// stops the fail-closed posture from redding every `.set()`.

import { resolveModuleMemberOrigin } from "@orb/tooling/_shared/reference-fact";
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { readDrizzleWriteTable } from "./drizzle-write-target.ts";

/** The Drizzle declaration every guarded write goes through, and the two homes that prove a binding IS it. */
export const GUARDED_TABLE = "messageVariants";
const DB_DOOR = "@orb/db";
const SCHEMA_HOME_PREFIX = "packages/db/src/schema/";
/** The three provenance columns, named ONCE. The occurrence policy reads them individually (its two
 *  arms ask different questions of the same three names); the `-health` sibling reads them as TRIPLE. */
export const CONTENT = "content";
export const RAW = "rawContent";
export const FREEZES = "macroFreezes";

/** The three columns that describe ONE body. Written together or not at all. The `-health` sibling proves
 *  they are still the live table's columns; keeping them as data here keeps the occurrence policy free of a
 *  fact it would otherwise declare and barely read. */
export const TRIPLE: readonly string[] = [CONTENT, RAW, FREEZES];

/** Shared so both halves judge exactly the same writer set.
 *
 *  THE FAMILY'S POPULATION PORT IS DERIVED ONCE HERE (§5b.5), beside the constant rather than copied into
 *  two headers. The legacy descriptor's `scanRoot: (p) => p.includes("packages/") && p.includes("/src/")`
 *  (`5c17068b7^`) becomes `@packages`, the explicit six-root list — an INTENTIONAL NARROWING BY EXACTLY ONE
 *  PACKAGE, `packages/showcase-plugins/src`, which #1980 keeps deliberately outside the composite sets.
 *  Lossless, and measured rather than assumed: that package holds ONE file carrying ZERO drizzle write
 *  calls, so no write this policy would have judged leaves the population. The legacy DECLARED LIMIT is
 *  unchanged — `tests/**` was outside `scanRoot` and is outside `@packages`, because scanning tests reds
 *  the family's own proofs. The `-health` half declares this CONSTANT, never its value, so the two writer
 *  sets cannot drift even by a correct-looking copy. */
export const WRITE_POPULATION = "@packages" as const;

/** A declaration's HOME is read off the declaration's OWN path — the house spelling for this question
 *  (`lib/id-brand.ts`, `lib/sealed-origin.ts`) and, here, the only TOTAL one. `ctx.relativePath` refuses any
 *  file outside the effective population (`lib/policy-pass-context.ts:214`), and a binding's canonical
 *  declaration is routinely outside it: on the real tree the first react-query import in a `@packages` file
 *  resolves into a node_modules declaration file, which threw and WITHHELD the occurrence policy for a whole
 *  run (2026-09-11). Membership in `ctx.files` is NOT the alternative — `policy-pass.ts:316` intersects that
 *  with a scoped run's requested paths, so it would read clean under every `--scope`.
 *
 *  (The gate module spelled that example as a literal import statement inside a code span. TSDoc is enforced
 *  on `lib/**` and NOT on `tooling/src/verify/gates/**`, the same config asymmetry that keeps the tenancy
 *  registry out of `lib/`, so a multi-line code span that was legal in the gate is an eslint error here. It
 *  is reworded rather than suppressed.) */
function declaredAtSchemaHome(sourceFile: SourceFile): boolean {
  return sourceFile.getFilePath().replaceAll("\\", "/").includes(`/${SCHEMA_HOME_PREFIX}`);
}

/** THE TABLE-IDENTITY QUESTION, answered by BINDING and by the DOOR rather than by spelling. */
export function guardedTableVerdict(tableNode: MorphNode): "ours" | "other" | "unreadable" {
  const origin = resolveModuleMemberOrigin(tableNode);
  if (origin.kind === "unresolved") {
    return origin.reason === "missing" ? "other" : "unreadable";
  }
  const { memberPath, canonical } = origin.value;
  const home = canonical.kind === "project" ? declaredAtSchemaHome(canonical.sourceFile) : canonical.moduleSpecifier === DB_DOOR;
  return memberPath.length === 0 && canonical.exportedName === GUARDED_TABLE && home ? "ours" : "other";
}

/** The table a write chain under `callee` targets, or `no-write-chain` when the chain has no Drizzle write
 *  verb in it at all. */
export function writeChainVerdict(callee: MorphNode): "ours" | "other" | "unreadable" | "no-write-chain" {
  const table = readDrizzleWriteTable(callee);
  if (table.kind === "unresolved") {
    return "unreadable";
  }
  return table.value === null ? "no-write-chain" : guardedTableVerdict(table.value);
}
