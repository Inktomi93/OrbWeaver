// typeonly-alive: VALUE exports kept alive only by type positions.

import process from "node:process";
import { Node, SyntaxKind } from "ts-morph";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import { semanticReferenceNodes } from "../../_shared/ts-workspace.ts";
import type { Flags, Hit, TypeOnlyCandidate } from "../contract/types.ts";
import { emit, hitOf, narrate } from "../lib/emit.ts";
import { declKey } from "../lib/keys.ts";
import { corpusPredicate, SKIP_TEST_FILES, scanCorpus } from "../lib/ledger.ts";
import { commentHost } from "../lib/public-markers.ts";
import { TEST_FILE_RE } from "../lib/root.ts";
import { ownExports, resolveScope } from "../lib/scope.ts";
import { printNamedBucket } from "./orphans.ts";
import { byProdFirst, relPath } from "./swallowed.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast <lens>");

// ── typeonly-alive: VALUE exports kept alive ONLY by type positions (the structural-liveness rot) ─
// The owner-named class: "code in server only kept alive by schema or kit or contract" — an export whose
// every reference is a TYPE position (`import type`, `typeof X`, an annotation, a heritage clause). It
// satisfies a SHAPE; nothing ever calls it, reads it, or constructs it. At runtime the module still ships
// the function body, the object literal, the class — dead weight that reads as consumed to every
// import-liveness lens in this file, because the import edge is real. Only the POSITION of each reference
// tells the truth.
//
// SCOPE OF THE CANDIDATE SET — VALUE declarations only (function/variable/class/enum). An `interface` or a
// `type` alias is type-only BY NATURE and legal: flagging one would be pure noise. A class IS a candidate:
// a class only ever named in an annotation is a shape written the expensive way.
//
// V1 CLASSIFIES BY REFERENCE POSITION, NOT BY IMPORT FORM — the complete arm, deliberately (the cheap arm
// would key on `import type` / inline `type` specifiers, which UNDER-reports: a plain `import { X }` whose
// only use is `typeof X` is exactly the defect and looks like value consumption to the import form). Each
// reference comes from `findReferencesAsNodes()` and is classified by ANCESTRY, so the lens sees through
// every hop the language service sees through — measured on probes (2026-08-02):
//   • renaming barrels (`export { inner as outer } from`) and `export *` chains resolve to the origin;
//   • `import * as ns` + `ns.member` and `(await import("./m")).member` come back as real references, so
//     this lens needs NO namespace/dynamic err-alive suppression — unlike the import-edge liveness above,
//     it can SEE the member access. (A namespace passed WHOLESALE into a call names no member at all, so
//     it produces zero references: that export is `swallowed`'s business, never this lens's.)
// The cost is the `refs` verb's cost, once per value export. That is why the lens is MANUAL-tier.
//
// WHY THIS LENS DOES NOT EXTEND `Liveness.arms`. The arm record exists for ONE consumer — `swallowed`'s
// "is `namespace` this key's only arm?" question — and the ERR-ALIVE ARM contract above binds anything that
// MARKS a key alive. This lens marks nothing: it never calls `markImportConsumption`, adds no consumption
// path, and reads no liveness set. A `type`-vs-`value` split of the `named` arm would therefore be recorded
// and never read (and could not change a `swallowed` verdict either way, since that lens only asks whether
// `namespace` stands alone). Reference position strictly dominates import form for this question — the
// import form is a lossy proxy for it.
//
// CANDIDATE lens, never a death sentence: a type-only-alive export is often a DELIBERATE conformance seam —
// a `satisfies`-anchor const, a runtime value whose type is the contract, a factory kept beside its shape.
// A deliberate keep is tagged `// @typeonly-ok: <reason>` on the declaration, and that tag is TWO-SIDED: a
// tag on an export the lens no longer calls type-only (something references it at runtime now, or nothing
// references it at all and it is an `orphans` hit) is reported STALE and exits 1.
//
// THE UNION-SOURCE IDIOM IS BUCKETED, NOT FLAGGED (lens calibration, owner ruling 2026-08-13). Measured on
// this tree: 46 of 47 hits were `export const X = [...] as const` whose ONLY reference is `(typeof X)[number]`
// — THIS REPO'S STANDARD way to give a string union a runtime source of truth (§5.5 string-union dispatch:
// one importable union + the tuple it derives from). Reporting that as rot is the lens crying wolf, and a
// lens that cries wolf gets ignored. So a type-only-alive candidate whose declaration is `<literal> as const`
// (through the `satisfies` wrapper — see {@link isConstAsserted}) is UNION-SOURCE: the author declared a
// frozen runtime value and derived the type FROM it, which is the opposite of "a value kept alive by a shape
// it satisfies". That single tell is what keeps the lens biting instead of blanket-exempting: a zod schema
// whose only reference is `z.infer<typeof s>` carries no `as const` and stays a REAL finding (measured — it
// is the one row of 47 left standing on the calibration corpus). Bucketed rows are NAMED, never silently
// swallowed (the `orphans` star-suppression precedent) — a reader still gets the list, it just is not a
// finding, and it is still a CANDIDATE, so the two-sided `@typeonly-ok` stale arm is unaffected.
const TYPEONLY_OK_RE = /@typeonly-ok:\s*\S/u;

/** True if the declaration carries a leading `// @typeonly-ok: <reason>` — a deliberate keep of an export
 *  only type positions reach. The reason is required (a bare marker does NOT exempt, as with
 *  `@swallowed-ok:`/`@server-only:`). Reads through {@link commentHost}: an `export const`'s marker lives on
 *  the VariableStatement, not on the VariableDeclaration `getExportedDeclarations()` hands back. */
export function isTypeOnlyExempt(decl: Node): boolean {
  return commentHost(decl)
    .getLeadingCommentRanges()
    .some((range) => TYPEONLY_OK_RE.test(range.getText()));
}

/** The declaration kinds that can be runtime-dead while still satisfying a shape. An interface / type alias
 *  declares nothing at runtime, so "every reference is a type position" is its DEFINITION, not a defect. */
function isValueDeclaration(decl: Node): boolean {
  return Node.isFunctionDeclaration(decl) || Node.isVariableDeclaration(decl) || Node.isClassDeclaration(decl) || Node.isEnumDeclaration(decl);
}

/** What one reference to an export says about its liveness. `neutral` = a binding hop that carries no
 *  verdict (an import/export specifier is where the name TRAVELS, never where it is USED — treating it as
 *  a value reference is exactly the under-report the import-form arm suffers). */
const REF_POSITIONS = ["type", "value", "neutral"] as const;
type RefPosition = (typeof REF_POSITIONS)[number];

/** Node kinds that are pure binding hops: the specifier itself, the clause holding it, a namespace binding.
 *  Matched against BOTH the reference node and its parent — a renaming re-export comes back as the
 *  `ExportSpecifier` node itself (`inner as outer`), a plain one as the identifier inside it. */
const NEUTRAL_REF_KINDS = new Set<SyntaxKind>([
  SyntaxKind.ImportSpecifier,
  SyntaxKind.ExportSpecifier,
  SyntaxKind.NamedImports,
  SyntaxKind.NamedExports,
  SyntaxKind.ImportClause,
  SyntaxKind.NamespaceImport,
  SyntaxKind.NamespaceExport,
  SyntaxKind.ImportEqualsDeclaration,
]);

/** Classify ONE reference node by ancestry. Climbs only through the nodes a qualified type name is built
 *  from (`Identifier`, `QualifiedName`); anything else terminates the climb as a runtime expression. */
function refPosition(ref: Node): RefPosition {
  const parent = ref.getParent();
  if (parent === undefined) {
    return "value";
  }
  if (NEUTRAL_REF_KINDS.has(ref.getKind()) || NEUTRAL_REF_KINDS.has(parent.getKind())) {
    return "neutral";
  }
  return climbsToTypeContext(parent) ? "type" : "value";
}

/** Does the ancestry of a reference land in a TYPE context? */
function climbsToTypeContext(from: Node): boolean {
  // A parsed Identifier/QualifiedName ALWAYS has a parent, so the climb below can only end at the
  // `return false` arms — there is no undefined-parent exit to guard.
  let cur: Node = from;
  for (;;) {
    // MUST precede the isTypeNode test: `class D extends Base` puts `Base` in an ExpressionWithTypeArguments,
    // which IS a TypeNode by kind — but a class's `extends` target is CONSTRUCTED at runtime (measured; a
    // naive isTypeNode check calls every base class type-only). `implements`, and an interface's `extends`,
    // are the genuinely type-only heritage arms.
    if (Node.isExpressionWithTypeArguments(cur)) {
      return isTypeOnlyHeritage(cur);
    }
    if (Node.isTypeNode(cur)) {
      return true;
    }
    if (!(Node.isIdentifier(cur) || Node.isQualifiedName(cur))) {
      return false;
    }
    cur = cur.getParent();
  }
}

/** A heritage reference is type-only unless it is a CLASS's `extends` target (the one runtime-constructing
 *  heritage position). */
function isTypeOnlyHeritage(node: Node): boolean {
  const clause = node.getParentIfKind(SyntaxKind.HeritageClause);
  if (clause === undefined) {
    return true;
  }
  const owner = clause.getParent();
  return !(clause.getToken() === SyntaxKind.ExtendsKeyword && (Node.isClassDeclaration(owner) || Node.isClassExpression(owner)));
}

/** Value exports of `inScope` whose every reference is a type position. Pure enumeration — no exemption
 *  policy, no printing (the verb owns both), so the self-test drives the same function the CLI does. */
export function collectTypeOnlyCandidates(project: SourceCorpus, inScope: (filePath: string) => boolean): TypeOnlyCandidate[] {
  const out: TypeOnlyCandidate[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!inScope(fp) || TEST_FILE_RE.test(fp)) {
      continue;
    }
    for (const { name, decl } of ownExports(sf)) {
      const candidate = typeOnlyCandidateOf(name, decl);
      if (candidate !== undefined) {
        out.push(candidate);
      }
    }
  }
  return out;
}

/** The candidate for one export, or undefined when it is not one: not a value declaration, ONE runtime
 *  reference is enough to make it alive, and ZERO type references means nothing reaches it at all — an
 *  `orphans` hit, not this lens's class (the two lenses never overlap, as with `swallowed`). */
function typeOnlyCandidateOf(name: string, decl: Node): TypeOnlyCandidate | undefined {
  if (!(isValueDeclaration(decl) && Node.isReferenceFindable(decl))) {
    return;
  }
  const sites = new Set<string>();
  for (const ref of semanticReferenceNodes(decl)) {
    // The declaration's OWN name node — its parent IS the declaration (true for function/class/enum/variable
    // alike). Measured: the language service does not currently hand it back, but a lens that would call
    // every candidate "value-referenced" if it ever did is one TypeScript bump from a silent permanent zero.
    if (ref.getSourceFile() === decl.getSourceFile() && ref.getParent()?.getStart() === decl.getStart()) {
      continue;
    }
    const position = refPosition(ref);
    if (position === "value") {
      return;
    }
    if (position === "type") {
      sites.add(`${relPath(ref.getSourceFile().getFilePath())}:${ref.getStartLineNumber()}`);
    }
  }
  if (sites.size === 0) {
    return;
  }
  return { name, decl, sites: [...sites].sort(byProdFirst), unionSource: isConstAsserted(decl) };
}

/** The union-source idiom's TELL: the declaration is `<literal> as const` (through the `satisfies` /
 *  parenthesis wrappers this repo writes it with — `as const satisfies readonly string[]` is the live
 *  spelling in `packages/contracts/src/preset/index.ts:123`, and missing it cost two false hits in the first
 *  cut of this calibration). The `as const` is the author declaring "this frozen value is the source of
 *  truth"; a plain object/array literal makes no such claim, which is what keeps a zod schema whose only
 *  reference is `z.infer<typeof s>` a REAL finding.
 *
 *  WHY THE `typeof` HALF IS NOT A SEPARATE TEST, stated because its absence looks like a gap: the candidate
 *  is already type-only-alive, and TypeScript has NO way to name a `const` in a type position except through
 *  a `typeof` query (a value is not a type). So "every reference is a type query" is entailed here, not
 *  checked — and a check that cannot fail is not evidence, it is decoration. The first cut of this lens
 *  carried one; no control could make it bite, and that is why it is gone. */
function isConstAsserted(decl: Node): boolean {
  if (!Node.isVariableDeclaration(decl)) {
    return false;
  }
  let cur = decl.getInitializer();
  while (cur !== undefined && (Node.isSatisfiesExpression(cur) || Node.isParenthesizedExpression(cur))) {
    cur = cur.getExpression();
  }
  return cur !== undefined && Node.isAsExpression(cur) && cur.getTypeNode()?.getText() === "const";
}

/** How many type-position sites a hit names before it collapses to a count. */
const TYPEONLY_SITES_SHOWN = 2;

export function typeOnlyHit(candidate: TypeOnlyCandidate, kind = "typeonly-alive"): Hit {
  const shown = candidate.sites.slice(0, TYPEONLY_SITES_SHOWN).join(", ");
  const more = candidate.sites.length > TYPEONLY_SITES_SHOWN ? ` +${candidate.sites.length - TYPEONLY_SITES_SHOWN} more` : "";
  const h = hitOf(candidate.decl, kind);
  h.text = `${candidate.name}  ←  ${candidate.sites.length} type-position ref(s): ${shown}${more}  —  ${h.text}`;
  return h;
}

/** The STALE side of the `@typeonly-ok` marker: a tag on an export the lens no longer calls type-only-alive —
 *  something references it at runtime now, or nothing references it at all (an `orphans` hit), or it was
 *  never a value declaration. Printed and exit-1 so the marker cannot rot into a permanent lie. */
function printStaleTypeOnlyTags(project: SourceCorpus, inScope: (fp: string) => boolean, candidateKeys: Set<string>, flags: Flags): void {
  const stale: Hit[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!inScope(fp) || TEST_FILE_RE.test(fp)) {
      continue;
    }
    for (const { name, decl } of ownExports(sf)) {
      if (!isTypeOnlyExempt(decl) || candidateKeys.has(declKey(decl))) {
        continue;
      }
      const h = hitOf(decl, "stale-typeonly-ok");
      h.text = `${name}  —  ${h.text}`;
      stale.push(h);
    }
  }
  if (stale.length === 0) {
    return;
  }
  narrate(
    flags,
    `typeonly-alive: ${stale.length} STALE \`@typeonly-ok:\` marker(s) — the export is no longer alive by type positions ALONE (a runtime reference reaches it now, nothing reaches it at all and it is an \`orphans\` hit, or it is not a value declaration). Delete the marker or re-state the reason:`,
  );
  for (const h of stale) {
    narrate(flags, `  ! ${h.file}:${h.line}  [${h.kind}]  ${h.text}`);
  }
  process.exitCode = 1;
}

/** VALUE exports (functions/consts/classes/enums) whose EVERY reference is a type position — runtime-dead
 *  code kept alive only by the shapes it satisfies. Optional scope (a package name / path); bare = every
 *  package. A deliberate conformance seam carries `// @typeonly-ok: <reason>`; a stale marker exits 1. */
export function cmdTypeOnly(project: SourceCorpus, arg: string, flags: Flags): void {
  const scope = arg === "" ? { prefix: "/packages/", label: "(all packages)" } : resolveScope(project, arg, "typeonly-alive");
  const inScope = corpusPredicate(scanCorpus(project, { scope: scope.prefix, label: `path:${scope.prefix}`, skip: [SKIP_TEST_FILES] }));
  const candidates = collectTypeOnlyCandidates(project, inScope);
  printStaleTypeOnlyTags(project, inScope, new Set(candidates.map((c) => declKey(c.decl))), flags);
  const reportable = candidates.filter((c) => !isTypeOnlyExempt(c.decl));
  const hits = reportable.filter((c) => !c.unionSource).map((c) => typeOnlyHit(c));
  const bucketed = reportable.filter((c) => c.unionSource).map((c) => typeOnlyHit(c, "union-source"));
  const exempt = candidates.length - reportable.length;
  printUnionSourceBucket(bucketed, flags);
  narrate(
    flags,
    `typeonly-alive is a CANDIDATE lens — a hit may be a DELIBERATE conformance seam (a \`satisfies\` anchor, a runtime value whose type IS the contract). It finds value exports whose every reference is a type position; the verdict is a human's. Keep one deliberately with \`// @typeonly-ok: <reason>\` on the declaration.${exempt === 0 ? "" : ` (${exempt} candidate(s) exempted by a reasoned marker.)`}`,
  );
  emit(hits, flags, `typeonly-alive ${scope.label}`);
}

/** Name every UNION-SOURCE row — bucketed rows are NOT counted as hits, so the epilogue's `matches` stays
 *  the number of things the lens is actually claiming. */
function printUnionSourceBucket(bucketed: readonly Hit[], flags: Flags): void {
  printNamedBucket(
    bucketed,
    flags,
    (count) =>
      `typeonly-alive: ${count} candidate(s) BUCKETED as the union-source idiom (\`export const X = […] as const\`, the type derived from it as \`(typeof X)[number]\` — this repo's runtime source of truth for a derived union, §5.5). Named below, NOT counted as hits:`,
  );
}
