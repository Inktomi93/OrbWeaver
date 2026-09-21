// respell (+ --near): domain contract/ shapes structurally identical to @orb/contracts shapes.

import process from "node:process";
import type { Project } from "ts-morph";
import { Node } from "ts-morph";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import { coLocatedSemanticNodes, semanticWorkspaceOf } from "../../_shared/ts-workspace.ts";
import type { Flags, Hit, NearFieldDiff, NearPairCandidate } from "../contract/types.ts";
import { emit, hitOf, narrate } from "../lib/emit.ts";
import { declKey } from "../lib/keys.ts";
import { exitToolError, noteUnits, scanCorpus } from "../lib/ledger.ts";
import { commentHost } from "../lib/public-markers.ts";
import { TEST_FILE_RE } from "../lib/root.ts";
import { ownExports } from "../lib/scope.ts";

refuseDirectInvocation(import.meta.url, "pnpm ast <lens>");

// ── respell: a domain `contract/` shape STRUCTURALLY identical to an @orb/contracts shape ───────
// The gate (`contract-derives-not-respells`) catches a re-spell that kept the OWNER'S NAME. This lens
// catches the one that renamed it — the shape a syntactic reader cannot see, because nothing about
// `interface SeatKnobs { … }` in `domain/chat/contract/` says it is `RosterMemberSpec`'s body again.
//
// It is a CANDIDATE lens, and deliberately NOT a gate: structural identity is EVIDENCE of a re-spell, never
// proof of one. Two shapes may agree today by coincidence (`{id, name, createdAt}`) and be free to diverge
// tomorrow — reding a commit on that would train agents to rename a field to dodge the gate, which is worse
// than the rot. So it prints candidates for a human/agent to judge, exactly like `clientgap`.
//
// The comparison is the shape's PROPERTY SIGNATURE — sorted `name:typeText` pairs, resolved through the
// checker so a `z.infer<…>` contracts export compares as its inferred object. Floor: 3 properties (a 1-2
// property agreement is noise — every `{id}` in the repo would match).
/** How many properties a shape needs before an exact structural match means anything. */
const RESPELL_PROPERTY_FLOOR = 3;

interface ShapeEntry {
  readonly name: string;
  readonly decl: Node;
  readonly signature: string;
}

/** The compiler checker's mutual-assignability primitive. It is a TS INTERNAL, so it is resolved once and
 *  its ABSENCE is a tool error (exit 2), never a silent zero — a lens that quietly stops comparing is worse
 *  than no lens. (Present on TS 5.x/TS7's checker object; re-verify on a TypeScript bump.) */
interface AssignabilityChecker {
  isTypeAssignableTo: (source: unknown, target: unknown) => boolean;
}

export function assignabilityChecker(project: Pick<Project, "getTypeChecker">): AssignabilityChecker {
  const compiler = project.getTypeChecker().compilerObject as unknown as Partial<AssignabilityChecker>;
  if (typeof compiler.isTypeAssignableTo !== "function") {
    exitToolError(
      "ast respell: this TypeScript build exposes no `checker.isTypeAssignableTo` (a TS internal this lens depends on) — the comparison cannot run. Re-verify the API after a TypeScript bump; tooling/src/ast/ops/respell.ts.",
    );
  }
  return { isTypeAssignableTo: compiler.isTypeAssignableTo.bind(compiler) };
}

function checkerProjectOf(corpus: SourceCorpus): Pick<Project, "getTypeChecker"> {
  if ("getTypeChecker" in corpus && typeof corpus.getTypeChecker === "function") {
    return corpus as Pick<Project, "getTypeChecker">;
  }
  const project = semanticWorkspaceOf(corpus)?.programs[0]?.project();
  if (project === undefined) {
    exitToolError("ast respell: semantic corpus has no runnable compiler program");
  }
  return project;
}

/** MUTUALLY assignable = the same shape, whatever the two spell their fields' types as. Assignability (not
 *  type TEXT) is the comparison because a text signature is ALIAS-SENSITIVE: `CharacterId` and
 *  `TypeIdOf<"character">` print differently and are the same type, so a text lens reports a clean zero on a
 *  literal re-spell (measured — the first cut of this lens missed a planted twin for exactly that reason). */
function mutuallyAssignable(checker: AssignabilityChecker, a: Node, b: Node): boolean {
  const colocated = coLocatedSemanticNodes(a, b);
  if (colocated.length === 0) {
    if (a.getProject() !== b.getProject()) {
      exitToolError("ast respell: compared declarations share no native compiler program");
    }
    const ta = a.getType().compilerType;
    const tb = b.getType().compilerType;
    return checker.isTypeAssignableTo(ta, tb) && checker.isTypeAssignableTo(tb, ta);
  }
  const answers = new Set(
    colocated.map(({ project, left, right }) => {
      const effectiveChecker = assignabilityChecker(project);
      const ta = left.getType().compilerType;
      const tb = right.getType().compilerType;
      return effectiveChecker.isTypeAssignableTo(ta, tb) && effectiveChecker.isTypeAssignableTo(tb, ta);
    }),
  );
  if (answers.size !== 1) {
    exitToolError("ast respell: native compiler programs disagree about declaration assignability");
  }
  return answers.has(true);
}

/** The sorted PROPERTY-NAME signature of a declaration's type — the cheap prefilter that keeps the O(n²)
 *  assignability probe off every unrelated pair. Undefined when it is not an object shape with at least
 *  {@link RESPELL_PROPERTY_FLOOR} properties (a union/primitive/function type has no signature here). */
function shapeSignature(decl: Node): string | undefined {
  const type = decl.getType();
  if (type.isUnion() || type.isIntersection()) {
    return; // a discriminated union is not the re-spell class; its arms are compared on their own if exported
  }
  // OBJECT shapes only. A primitive (a numeric `const` such as TOOL_RECURSE_LIMIT_DEFAULT) reports its
  // APPARENT type's members — `toFixed`/`toString`/… — which sails past the property floor and matched every
  // other numeric constant in the repo (measured, first run of this lens). Functions and arrays are likewise
  // not the re-spell class.
  if (!type.isObject() || type.isArray() || type.isTuple() || type.getCallSignatures().length > 0) {
    return;
  }
  const props = type.getProperties();
  if (props.length < RESPELL_PROPERTY_FLOOR) {
    return;
  }
  return props
    .map((p) => p.getName())
    .sort()
    .join("|");
}

/** Every exported declaration of the files under `prefix` that HAS a shape signature. */
function shapesUnder(project: SourceCorpus, prefix: string): ShapeEntry[] {
  const out: ShapeEntry[] = [];
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    if (!fp.includes(prefix) || TEST_FILE_RE.test(fp)) {
      continue;
    }
    for (const { name, decl } of ownExports(sf)) {
      const signature = shapeSignature(decl);
      if (signature !== undefined) {
        out.push({ name, decl, signature });
      }
    }
  }
  return out;
}

/** Domain dirs under `packages/server/src/domain/` that have a `contract/`, filtered by an optional arg. */
function domainsWithContracts(project: SourceCorpus, arg: string): string[] {
  const found = new Set<string>();
  for (const sf of project.getSourceFiles()) {
    const domain = DOMAIN_CONTRACT_DIR_RE.exec(sf.getFilePath())?.groups?.["domain"];
    if (domain !== undefined && (arg === "" || domain === arg)) {
      found.add(domain);
    }
  }
  return [...found].sort();
}

const DOMAIN_CONTRACT_DIR_RE = /\/packages\/server\/src\/domain\/(?<domain>[^/]+)\/contract\//u;

/** Origin declarations named by a bare alias (`type X = Y`), resolved through import/re-export hops.
 *  Direct aliases are the recommended derive, so reporting their mutual assignability would flag the fix. */
function bareAliasTargetKeys(decl: Node): Set<string> {
  const keys = new Set<string>();
  if (!Node.isTypeAliasDeclaration(decl)) {
    return keys;
  }
  const typeNode = decl.getTypeNode();
  if (typeNode === undefined || !Node.isTypeReference(typeNode) || typeNode.getTypeArguments().length > 0) {
    return keys;
  }
  const entity = typeNode.getTypeName();
  const identifier = Node.isQualifiedName(entity) ? entity.getRight() : entity;
  const symbol = identifier.getSymbol();
  if (symbol === undefined) {
    return keys;
  }
  // An IMPORTED name's own symbol is the import alias; getAliasedSymbol follows the whole re-export chain to
  // the declaration the contracts side keys on. A same-file reference has no alias — use the symbol itself.
  for (const d of (symbol.getAliasedSymbol() ?? symbol).getDeclarations()) {
    keys.add(declKey(d));
  }
  return keys;
}

/** Shared `typeof value` provenance through a generic derive (`z.infer`, `ReturnType`, and equivalents).
 * The generic's spelling is irrelevant: two aliases are already derived when TypeScript resolves their
 * type-query operand to the same declaration. Other generic aliases remain candidates. */
function typeQueryDerivationKeys(decl: Node): Set<string> {
  const keys = new Set<string>();
  if (!Node.isTypeAliasDeclaration(decl)) {
    return keys;
  }
  const typeNode = decl.getTypeNode();
  if (typeNode === undefined || !Node.isTypeReference(typeNode)) {
    return keys;
  }
  const [argument] = typeNode.getTypeArguments();
  if (argument === undefined || typeNode.getTypeArguments().length !== 1 || !Node.isTypeQuery(argument)) {
    return keys;
  }
  const genericSymbol = typeNode.getTypeName().getSymbol();
  const genericKeys = ((genericSymbol?.getAliasedSymbol() ?? genericSymbol)?.getDeclarations() ?? []).map(declKey);
  const operandSymbol = argument.getExprName().getSymbol();
  const operandKeys = ((operandSymbol?.getAliasedSymbol() ?? operandSymbol)?.getDeclarations() ?? []).map(declKey);
  for (const genericKey of genericKeys) {
    for (const operandKey of operandKeys) {
      keys.add(`${genericKey}\0${operandKey}`);
    }
  }
  return keys;
}

function overlaps(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return [...left].some((key) => right.has(key));
}

/** ONE domain's structural twins, excluding aliases with the same direct target or resolved generic
 *  `typeof` provenance because those already derive from the shared declaration. */
export function respellHitsFor(project: SourceCorpus, checker: AssignabilityChecker, domain: string): Hit[] {
  const contractsShapes = shapesUnder(project, `/packages/contracts/src/${domain}/`);
  if (contractsShapes.length === 0) {
    return [];
  }
  const bySignature = new Map<string, ShapeEntry[]>();
  for (const shape of contractsShapes) {
    bySignature.set(shape.signature, [...(bySignature.get(shape.signature) ?? []), shape]);
  }
  const hits: Hit[] = [];
  for (const domainShape of shapesUnder(project, `/packages/server/src/domain/${domain}/contract/`)) {
    const derivedFrom = bareAliasTargetKeys(domainShape.decl);
    const domainOrigins = typeQueryDerivationKeys(domainShape.decl);
    for (const twin of bySignature.get(domainShape.signature) ?? []) {
      // The domain shape IS this contracts symbol, under a local name — the recommended derive, not a hit.
      if (
        derivedFrom.has(declKey(twin.decl)) ||
        overlaps(domainOrigins, typeQueryDerivationKeys(twin.decl)) ||
        !mutuallyAssignable(checker, domainShape.decl, twin.decl)
      ) {
        continue;
      }
      const h = hitOf(domainShape.decl, domainShape.name === twin.name ? "respell-same-name" : "respell-renamed");
      h.text = `${domainShape.name}  ≡  @orb/contracts/${domain}::${twin.name}`;
      hits.push(h);
    }
  }
  return hits;
}

/** Domain `contract/` shapes structurally identical to a shape the sibling `@orb/contracts/<domain>` already
 *  exports — the RENAMED re-spell the syntactic gate cannot see. Optional arg = one domain; bare = all. */
export function cmdRespell(project: SourceCorpus, arg: string, flags: Flags): void {
  const domains = domainsWithContracts(project, arg);
  noteUnits("domains", domains.length);
  if (domains.length === 0) {
    exitToolError(`ast respell: no domain contract/ dir matched "${arg}" — try a domain name (chat, rpg, preset, …) or run bare for all.`);
  }
  // The candidate corpus is BOTH sides of the comparison: the domain `contract/` dirs and their sibling
  // `@orb/contracts/<domain>` packages. A domain whose contracts package is empty is why a run can be
  // legitimately quiet — `scanned` shows which side actually held files.
  scanCorpus(project, {
    scope: domains.flatMap((d) => [`/packages/contracts/src/${d}/`, `/packages/server/src/domain/${d}/contract/`]),
    label: `path:domain-contracts(${domains.length})`,
  });
  const checker = assignabilityChecker(checkerProjectOf(project));
  const hits: Hit[] = [];
  for (const domain of domains) {
    hits.push(...respellHitsFor(project, checker, domain));
  }
  narrate(
    flags,
    `respell is a CANDIDATE lens — structural identity is EVIDENCE of a re-spell, not proof: two shapes may agree today and be free to diverge tomorrow. Verify intent before acting, and prefer a derive when the domain shape IS the contracts shape. (${RESPELL_PROPERTY_FLOOR}+ properties, checker-resolved; a \`respell-same-name\` hit is already RED at the \`contract-derives-not-respells\` gate.)`,
  );
  emit(hits, flags, `respell ${arg === "" ? "(all domains)" : arg}`);
  // `--near` is ADDITIVE: when it is absent, nothing below this line runs and the exact tier's output
  // (everything above) is byte-identical to before it existed.
  if (flags.near !== null) {
    cmdRespellNear(project, checker, { domains, thresholdPct: flags.near }, flags);
  }
}

// ── respell --near: a NEAR tier beside the exact one — Jaccard over semantic field identity ──
// Exact `respell` asks "is this shape MUTUALLY ASSIGNABLE with a contracts sibling" — a yes/no that misses
// the shape that STARTED as a copy and drifted a field or two (a rename, a dropped/added property). This
// tier is a SIMILARITY score on the SAME axis (domain `contract/` vs `@orb/contracts/<domain>`, never
// widened to all-pairs — a `RequestInit`-shaped coincidence anywhere in the workspace is noise, not a
// re-spell candidate), reported as a FIELD-LEVEL DIFF because the percentage alone tells a reader nothing
// actionable: "82%" doesn't say WHICH field moved. The diff does: shared-field count, fields that kept
// their TYPE but changed NAME (the rename a syntactic tool cannot see either), and each side's leftover
// fields.
//
// FLOOR: {@link RESPELL_NEAR_PROPERTY_FLOOR}+ fields on BOTH sides — below it, two shapes coincide on most
// of a tiny signature by chance (every `{id, name}`-ish pair in the repo would score high).
//
// EXCLUDED deliberately: exact-tier hits, plus direct aliases and generic `typeof` aliases with shared
// resolved provenance. A derive is the recommended fix, never a defect at either tier.
/** How many fields a shape needs on BOTH sides before a near-match means anything. */
const RESPELL_NEAR_PROPERTY_FLOOR = 4;

/** Ratio-to-percentage scale — the ONE place `nearFieldDiffOf` converts. */
const PCT_SCALE = 100;

/** ONE field: its name and display type. Identity is decided by the checker in
 *  {@link semanticallyEqualFieldType}; text is report-only because aliases preserve their spelling. */
interface FieldPair {
  readonly name: string;
  readonly type: string;
}

interface FieldIdentity {
  readonly decl: Node;
  readonly name: string;
}

/** A shape's fields. Reuses `decl.getType().getProperties()` — the same property enumeration
 *  `shapeSignature`'s floor already filters to object shapes with. */
function fieldPairsOf(decl: Node): FieldPair[] {
  const type = decl.getType();
  return type.getProperties().map((prop) => ({ name: prop.getName(), type: prop.getTypeAtLocation(decl).getText() }));
}

/** Whether two named properties are mutually assignable in every native compiler program that owns both
 *  declarations. This is the field-level twin of {@link mutuallyAssignable}; checker text is diagnostic,
 *  never identity (`CharacterId` and `TypeIdOf<"CharacterId">` can print differently). */
function semanticallyEqualFieldType(checker: AssignabilityChecker, leftField: FieldIdentity, rightField: FieldIdentity): boolean {
  const compare = (effectiveChecker: AssignabilityChecker, left: Node, right: Node): boolean => {
    const leftType = left.getType().getProperty(leftField.name)?.getTypeAtLocation(left).compilerType;
    const rightType = right.getType().getProperty(rightField.name)?.getTypeAtLocation(right).compilerType;
    return (
      leftType !== undefined &&
      rightType !== undefined &&
      effectiveChecker.isTypeAssignableTo(leftType, rightType) &&
      effectiveChecker.isTypeAssignableTo(rightType, leftType)
    );
  };
  const colocated = coLocatedSemanticNodes(leftField.decl, rightField.decl);
  if (colocated.length === 0) {
    if (leftField.decl.getProject() !== rightField.decl.getProject()) {
      exitToolError("ast respell --near: compared fields share no native compiler program");
    }
    return compare(checker, leftField.decl, rightField.decl);
  }
  const answers = new Set(colocated.map(({ project, left, right }) => compare(assignabilityChecker(project), left, right)));
  if (answers.size !== 1) {
    exitToolError("ast respell --near: native compiler programs disagree about field assignability");
  }
  return answers.has(true);
}

function nearFieldDiffOf(checker: AssignabilityChecker, domainDecl: Node, contractsDecl: Node): NearFieldDiff {
  const domainFields = fieldPairsOf(domainDecl);
  const contractsFields = fieldPairsOf(contractsDecl);
  const sharedNames = new Set(
    domainFields
      .filter((domainField) => {
        const contractsField = contractsFields.find((candidate) => candidate.name === domainField.name);
        return (
          contractsField !== undefined &&
          semanticallyEqualFieldType(checker, { decl: domainDecl, name: domainField.name }, { decl: contractsDecl, name: contractsField.name })
        );
      })
      .map((field) => field.name),
  );
  const sharedCount = sharedNames.size;
  const totalFields = domainFields.length + contractsFields.length - sharedCount;
  const pct = totalFields === 0 ? 0 : (sharedCount / totalFields) * PCT_SCALE;
  const contractsRemainder = contractsFields.filter((field) => !sharedNames.has(field.name));
  const renamed: { from: string; to: string; type: string }[] = [];
  const domainOnly: string[] = [];
  for (const df of domainFields.filter((field) => !sharedNames.has(field.name))) {
    const matchAt = contractsRemainder.findIndex(
      (cf) =>
        cf.name !== df.name &&
        !renamed.some((rename) => rename.to === cf.name) &&
        semanticallyEqualFieldType(checker, { decl: domainDecl, name: df.name }, { decl: contractsDecl, name: cf.name }),
    );
    if (matchAt === -1) {
      domainOnly.push(df.name);
      continue;
    }
    const match = contractsRemainder[matchAt] as FieldPair;
    renamed.push({ from: df.name, to: match.name, type: df.type });
  }
  const renamedTo = new Set(renamed.map((r) => r.to));
  const contractsOnly = contractsRemainder.filter((f) => !renamedTo.has(f.name)).map((f) => f.name);
  return { pct, sharedCount, totalFields, renamed, domainOnly, contractsOnly };
}

/** ONE domain's near-tier candidates: every (domain shape, contracts shape) pair at ≥{@link thresholdPct},
 *  minus any pair the EXACT tier already resolves and minus the domain shapes below the field floor. Pure
 *  enumeration — no exemption policy, no printing (the verb owns both), so the self-test drives the same
 *  function the CLI does. */
export function respellNearCandidatesFor(project: SourceCorpus, checker: AssignabilityChecker, domain: string, thresholdPct: number): NearPairCandidate[] {
  const contractsShapes = shapesUnder(project, `/packages/contracts/src/${domain}/`).filter((s) => fieldPairsOf(s.decl).length >= RESPELL_NEAR_PROPERTY_FLOOR);
  if (contractsShapes.length === 0) {
    return [];
  }
  const out: NearPairCandidate[] = [];
  for (const domainShape of shapesUnder(project, `/packages/server/src/domain/${domain}/contract/`)) {
    const domainFields = fieldPairsOf(domainShape.decl);
    if (domainFields.length < RESPELL_NEAR_PROPERTY_FLOOR) {
      continue;
    }
    const derivedFrom = bareAliasTargetKeys(domainShape.decl);
    for (const twin of contractsShapes) {
      // The exact-tier exclusion — same predicate `respellHitsFor` uses for both its arms.
      if (derivedFrom.has(declKey(twin.decl)) || (twin.signature === domainShape.signature && mutuallyAssignable(checker, domainShape.decl, twin.decl))) {
        continue;
      }
      const diff = nearFieldDiffOf(checker, domainShape.decl, twin.decl);
      if (diff.pct >= thresholdPct) {
        out.push({ domain, domainName: domainShape.name, domainDecl: domainShape.decl, contractsName: twin.name, contractsDecl: twin.decl, diff });
      }
    }
  }
  return out;
}

const NEARPAIR_OK_RE = /@nearpair-ok:\s*\S/u;

/** True if the domain shape carries a leading `// @nearpair-ok: <reason>` — a deliberate keep of a
 *  near-match (the discipline `@typeonly-ok:`/`@swallowed-ok:` already use). */
export function isNearPairExempt(decl: Node): boolean {
  return commentHost(decl)
    .getLeadingCommentRanges()
    .some((range) => NEARPAIR_OK_RE.test(range.getText()));
}

/** `N/M shared (P%) · renamed-same-type: a→b · domain-only: x · contracts-only: y` — the field-level
 *  deliverable; the percentage is the admission threshold, never the report on its own. */
function nearFieldDiffText(diff: NearFieldDiff): string {
  const renamedText = diff.renamed.length === 0 ? "" : ` · renamed-same-type: ${diff.renamed.map((r) => `${r.from}→${r.to}`).join(", ")}`;
  const domainOnlyText = diff.domainOnly.length === 0 ? "" : ` · domain-only: ${diff.domainOnly.join(", ")}`;
  const contractsOnlyText = diff.contractsOnly.length === 0 ? "" : ` · contracts-only: ${diff.contractsOnly.join(", ")}`;
  return `${diff.sharedCount}/${diff.totalFields} shared (${diff.pct.toFixed(0)}%)${renamedText}${domainOnlyText}${contractsOnlyText}`;
}

function nearPairHit(candidate: NearPairCandidate): Hit {
  const h = hitOf(candidate.domainDecl, "respell-near");
  h.text = `${candidate.domainName}  ≈  @orb/contracts/${candidate.domain}::${candidate.contractsName}  —  ${nearFieldDiffText(candidate.diff)}`;
  return h;
}

/** The STALE side of `@nearpair-ok:` — a marker on a domain shape that no longer near-matches ANY
 *  contracts sibling above the current threshold (the exact tier resolved it, a field diverged past the
 *  floor, or the shape/contract disappeared). Printed and exit-1, the two-sided-gate law every other
 *  marker in this file follows. */
function printStaleNearPairTags(project: SourceCorpus, domains: readonly string[], candidateKeys: ReadonlySet<string>, flags: Flags): void {
  const stale: Hit[] = [];
  for (const domain of domains) {
    for (const shape of shapesUnder(project, `/packages/server/src/domain/${domain}/contract/`)) {
      if (!isNearPairExempt(shape.decl) || candidateKeys.has(declKey(shape.decl))) {
        continue;
      }
      const h = hitOf(shape.decl, "stale-nearpair-ok");
      h.text = `${shape.name}  —  ${h.text}`;
      stale.push(h);
    }
  }
  if (stale.length === 0) {
    return;
  }
  narrate(
    flags,
    `respell --near: ${stale.length} STALE \`@nearpair-ok:\` marker(s) — the shape no longer near-matches any contracts sibling at the current threshold. Delete the marker or re-state the reason:`,
  );
  for (const h of stale) {
    narrate(flags, `  ! ${h.file}:${h.line}  [${h.kind}]  ${h.text}`);
  }
  process.exitCode = 1;
}

/** The `--near` tier's own args, bundled to keep `cmdRespellNear` under the house parameter budget. */
interface RespellNearScope {
  readonly domains: readonly string[];
  readonly thresholdPct: number;
}

/** The `--near` tier: run for every domain already resolved by the exact tier, at `thresholdPct`. A
 *  SEPARATE `emit` call (its own RESULT line) beside the exact tier's — additive, never mixed into it. */
function cmdRespellNear(project: SourceCorpus, checker: AssignabilityChecker, scope: RespellNearScope, flags: Flags): void {
  const { domains, thresholdPct } = scope;
  const candidates = domains.flatMap((domain) => respellNearCandidatesFor(project, checker, domain, thresholdPct));
  printStaleNearPairTags(project, domains, new Set(candidates.map((c) => declKey(c.domainDecl))), flags);
  const reportable = candidates.filter((c) => !isNearPairExempt(c.domainDecl));
  const exempt = candidates.length - reportable.length;
  narrate(
    flags,
    `respell --near is a CANDIDATE lens — Jaccard similarity over (fieldName, semanticType) pairs at ≥${thresholdPct}%, where semantic type identity is bidirectional checker assignability in every co-located native program; floor ${RESPELL_NEAR_PROPERTY_FLOOR}+ fields on both sides, EXCLUDING every pair the exact tier already resolves. A near-twin that STARTED as a copy and drifted a field is the drift class this exists to catch; a genuinely deliberate near-pair (two shapes that happen to share most fields) is legitimate — verify before acting. Keep one deliberately with \`// @nearpair-ok: <reason>\` on the domain declaration.${exempt === 0 ? "" : ` (${exempt} candidate(s) exempted by a reasoned marker.)`}`,
  );
  emit(reportable.map(nearPairHit), flags, `respell --near>=${thresholdPct} ${domains.length === 1 ? domains[0] : "(all domains)"}`);
}
