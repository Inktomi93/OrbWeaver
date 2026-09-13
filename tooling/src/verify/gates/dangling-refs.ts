// Gate: dangling-refs (UNIFIED-VERIFICATION-DESIGN.md — the ghost-cite class) — a doc-PATH pointer that
// leads nowhere is drift the amnesiac reader can't tell from a real home. Four arms:
//   arm 1 — every gate descriptor's docRow/message/fix string that names a `*.md` path must resolve to a
//           real file (the UNIFIED-VERIFICATION ghost — cited by four sites, never committed — was this class).
//   arm 2 — every markdown LINK `[text](x.md)` in the LINK corpus must resolve.
//   arm 3 — 2026-08-03 core-docs truth audit: every backticked token in the AUDIT corpus that
//           PARSES AS A REPO PATH (a known-prefix shorthand — packages/·docs/·scripts/·tests/·domain/·
//           entry/·infra/·transport/·foundation/·kit/·@orb/<pkg>) must resolve on disk. Unresolvable shapes
//           (no recognized prefix, a `<placeholder>`/glob) skip — never guessed. Two-sided allowlist.
//   arm 4 — same audit, same corpus: a backticked STRICT UPPER_SNAKE token (`[A-Z][A-Z0-9]*(_[A-Z0-9]+)+` — ≥1
//           underscore, no lowercase) must resolve in the shared ts-morph project's declaration-name index
//           (packages/*/src + tests + gate corpus). Precision over recall (err quiet): a bare single
//           ALL-CAPS word (prose emphasis / this gate corpus's own exemption vocabulary) and a bare
//           `name()` call-cite were both tried and DROPPED — a self-proof pass found zero true positives
//           against React/Vite/CSS builtins and generic verb names (`use()`/`serve()`/`oklch()`) dominating
//           the candidate set. A whole LINE containing "rider" (the corpus's rider-block convention:
//           `BUILD-STATE RIDER`, `truth-audit rider`, …) or text inside `~~struck~~` is exempt structurally
//           — deliberately-dead symbols documented as history must not red. Two-sided allowlist.
//   arm 5 — ABSENT BY DESIGN (#775): a backticked path that is GITIGNORED exists on a full working checkout
//           and never on a clean one, so arm 3's `existsSync` verdict is a property of the CHECKOUT, not the
//           docs — this gate was green on main and RED in every fresh worktree, same commit, same doc line.
//           `GITIGNORED_ABSENT` skips those paths and is THREE-SIDED: the row reds when the docs stop
//           referencing it, when its `cite` stops resolving, and when the path stops being named by a
//           literal `.gitignore` rule (the moment "absent by design" becomes false).
// THE TWO CORPORA ARE DERIVED FROM THE DOC CATALOG, never hand-named (#1036) — `corpora()` below states the
// class rule and its receipts. Arms 3/4 are DOC-PATHS-ONLY siblings of arms 1/2 over the AUDIT corpus (living
// law + the living design homes + the law markdown that sits outside docs/); the parked design sets, frozen
// history and dated reviews are OUT by class, not by a path list. Both carry a two-sided allowlist (`why`
// mandatory; a row matching no live phantom is itself RED — a stale exemption is a loaded gun).
//
// SYMBOL / code-pointer refs beyond arm 4's narrow casing fence are still OUT OF SCOPE (a bare lowercase
// `foo` or PascalCase-but-lowercase-tailed `ChatContext` mention drowns the signal — deliberately deferred,
// per the audit's own tuning). Backtick prose mentions of a `.md` are also out of arm 2 (archaeology
// legitimately name-drops dead/neo docs in prose — only a real navigational LINK must resolve).
// history/** is EXEMPT as a SCAN source (it cites the dead by design); a link FROM core/proposed INTO
// history is still resolved.
//
// Bare-name resolution set (arm 1 docRow convention): docs/architecture/core, then history, then proposed,
// then repo root. A path with a slash resolves as written (and, as a convenience, under docs/architecture).
// A markdown link (arm 2) resolves relative to its OWN file first (standard markdown), then the bare roots.
// Self-hosts via its own ts-morph Project (fsBacked) for arms 1/2 — never imports report.ts, so no import
// cycle. Arms 3/4 read `ctx.root`'s real fs and the SHARED `ctx.project` (no second project).
// BINDING RESOLUTION (#2163): gate-string const aliases resolve through `lib/reference-fact.ts`
// `resolveStableExpression`; this module owns only ordered string composition and its GAP policy.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import type { Violation } from "../contract/harness.ts";
import { resolveStableExpression } from "../lib/reference-fact.ts";

const GATES_DIR_REL = "tooling/src/verify/gates";
const TS_EXT_RE = /\.ts$/u;

// The bare-name resolution roots, IN ORDER (arm 1 docRow convention + arm 2 fallback after the sibling try).
const BARE_ROOTS: readonly string[] = ["docs/architecture/core", "docs/architecture/history", "docs/architecture/proposed", "."];

// A `*.md` token inside a prose string: a path segment run ending in `.md`. Anchored on a non-token char so
// we don't slice a longer path; the char class allows dir separators so `core/Foo.md` is ONE token.
const MD_TOKEN_RE = /([\w][\w./-]*\.md)/gu;
// A markdown link target ending in `.md`, with an optional `#anchor` (arm 2). `[text](path.md#x)`.
const MD_LINK_RE = /\]\(([^)\s]+?\.md)(?:#[^)\s]*)?\)/gu;
// A token carrying a glob / brace-expansion / placeholder is a PROSE PATTERN, not a literal cite — skip it
// (`UI-*.md`, `docs/architecture/**/*.md`, `../history/UI-Lib-{Query,Form}.md`).
const NON_LITERAL_RE = /[*{}]/u;

// ── the string-value evaluator (the load-bearing correctness core) ────────────────────────────────────
// A gate's message/fix is frequently a `+`-concatenation OR a module-const identifier — and a `.md` token
// can straddle a `+` boundary (`"client-architecture-" + "lockdown.md §6b"`). So we must evaluate the
// initializer into its ORDERED runtime string (following identifiers to their const) and tokenize the WHOLE
// value, never per-fragment — a per-fragment scan both false-flags a split-but-valid cite AND false-passes
// a ghost split across a boundary. An interpolation `${…}` we can't statically resolve becomes a gap
// (`\u0000`) so it never fuses two literal fragments into a spurious token.
const GAP = "\u0000";

/** A template expression's ordered value: head + each span's literal, interpolation as a GAP so an
 *  unresolvable `${…}` never fuses two literal fragments into a spurious token. */
function evalTemplate(n: Node): string {
  if (!Node.isTemplateExpression(n)) {
    return GAP;
  }
  let s = n.getHead().getLiteralText();
  for (const span of n.getTemplateSpans()) {
    s += GAP + span.getLiteral().getLiteralText();
  }
  return s;
}

/** Follow an identifier to its const initializer's value (GAP if it isn't a resolvable const). */
function evalIdentifier(n: Node, seen: Set<Node>): string {
  if (!Node.isIdentifier(n)) {
    return GAP;
  }
  const resolved = resolveStableExpression(n);
  return resolved.kind === "resolved" && resolved.value !== n ? evalString(resolved.value, seen) : GAP;
}

/** Evaluate a docRow/message/fix initializer into its ORDERED runtime string — literals, `+`-concats (in
 *  order, so a token straddling a boundary survives), templates, identifier→const. Opaque shapes (calls,
 *  conditionals) become a GAP, never a token source. */
function evalString(n: Node, seen: Set<Node>): string {
  if (seen.has(n)) {
    return GAP;
  }
  seen.add(n);
  if (Node.isStringLiteral(n) || Node.isNoSubstitutionTemplateLiteral(n)) {
    return n.getLiteralText();
  }
  if (Node.isTemplateExpression(n)) {
    return evalTemplate(n);
  }
  if (Node.isParenthesizedExpression(n)) {
    return evalString(n.getExpression(), seen);
  }
  if (Node.isBinaryExpression(n) && n.getOperatorToken().getKind() === SyntaxKind.PlusToken) {
    return evalString(n.getLeft(), seen) + evalString(n.getRight(), seen);
  }
  if (Node.isIdentifier(n)) {
    return evalIdentifier(n, seen);
  }
  return GAP;
}

/** Every distinct `*.md` token in a string (empty match groups dropped). */
function mdTokens(value: string): readonly string[] {
  const out: string[] = [];
  for (const m of value.matchAll(MD_TOKEN_RE)) {
    const ref = m[1];
    if (ref !== undefined && ref.length > 0) {
      out.push(ref);
    }
  }
  return out;
}

// ── resolution ────────────────────────────────────────────────────────────────────────────────────────
function resolvesFromRoot(root: string, ref: string): boolean {
  if (NON_LITERAL_RE.test(ref) || ref === ".md") {
    return true; // a glob/pattern token, not a literal cite
  }
  if (ref.includes("/")) {
    return existsSync(join(root, ref)) || existsSync(join(root, "docs/architecture", ref));
  }
  return BARE_ROOTS.some((r) => existsSync(join(root, r, ref)));
}

/** Arm 2: a markdown link resolves relative to its OWN file first (standard markdown), then the bare roots. */
function resolvesLink(root: string, fromRel: string, ref: string): boolean {
  if (ref.startsWith("http")) {
    return true;
  }
  const sibling = normalize(join(dirname(fromRel), ref));
  return existsSync(join(root, sibling)) || resolvesFromRoot(root, ref);
}

// ── arm 1: gate-descriptor docRow / message / fix ─────────────────────────────────────────────────────
const GATE_REL = (file: string): string => `${GATES_DIR_REL}/${file}`;

const ARM1_MSG = (field: string, ref: string): string =>
  `gate descriptor's \`${field}\` names \`${ref}\` — no such doc resolves (bare names → core/ then history/ ` +
  "then proposed/ then repo root; explicit paths as written). A doc-path cite must land on a live doc, not " +
  "a ghost (the UNIFIED-VERIFICATION-DESIGN.md class). Repoint it to the real home.";

const DESCRIPTOR_FIELDS = ["docRow", "message", "fix"] as const;

/** The unresolved `*.md` cites of ONE descriptor field (its evaluated string value, tokenized). */
function fieldViolations(root: string, obj: Node, field: string, gateRel: string): Violation[] {
  const prop = Node.isObjectLiteralExpression(obj) ? obj.getProperty(field) : undefined;
  const init = prop !== undefined && Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
  if (init === undefined) {
    return [];
  }
  const value = evalString(init, new Set());
  return mdTokens(value)
    .filter((ref) => !resolvesFromRoot(root, ref))
    .map((ref) => ({ file: gateRel, line: 0, message: ARM1_MSG(field, ref) }));
}

function scanGateDescriptors(root: string): Violation[] {
  const gatesDir = join(root, GATES_DIR_REL);
  if (!existsSync(gatesDir)) {
    return [];
  }
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  const out: Violation[] = [];
  for (const entry of readdirSync(gatesDir).sort()) {
    if (!TS_EXT_RE.test(entry)) {
      continue;
    }
    const sf = project.addSourceFileAtPath(join(gatesDir, entry));
    const obj = sf.getVariableDeclaration("gate")?.getInitializer()?.asKind(SyntaxKind.ObjectLiteralExpression);
    if (obj === undefined) {
      continue;
    }
    for (const field of DESCRIPTOR_FIELDS) {
      out.push(...fieldViolations(root, obj, field, GATE_REL(entry)));
    }
  }
  return out;
}

// ── arm 2: markdown links ─────────────────────────────────────────────────────────────────────────────
// history/** is EXEMPT as a scan SOURCE (archaeology cites the dead); a link INTO history from here resolves.
const MD_EXT_RE = /\.md$/u;

const ARM2_MSG = (ref: string): string =>
  `markdown link \`(${ref})\` resolves to no file (relative to this doc, then core/ history/ proposed/ ` +
  "root). A dead doc link is drift — repoint it to the real home or delete the link.";

function walkMd(root: string, relDir: string, out: string[]): void {
  for (const entry of readdirSync(join(root, relDir), { withFileTypes: true })) {
    const rel = `${relDir}/${entry.name}`;
    if (entry.isDirectory()) {
      walkMd(root, rel, out);
    } else if (MD_EXT_RE.test(entry.name)) {
      out.push(rel);
    }
  }
}

// ── the DERIVED doc corpora (#1036) ───────────────────────────────────────────────────────────────────
// Hand-naming the scanned directories is what let `GATE-AUTHORING.md` — the law every gate author reads —
// rot a cite with nothing watching: arms 2–4 read only `docs/architecture/{core,proposed}`, so law outside
// that pair (the two AUTHORING.md files beside their tools) and the living design homes the constitution
// cites (`docs/design/vocabulary-map.md`, …) sat outside the net entirely.
//
// THE CLASS RULE, stated once and derived from `docs/catalog/catalog.json` (the catalog IS the census of
// tracked docs; its freshness is already a `pnpm check` stage): a document owes citation integrity when it
// is a LIVING HOME — `status: active` AND a receipt `authority` of `normative` / `current-reference` /
// `operational` (law) or `design` (a living design home). Three classes are OUT, each for its own reason:
//   - authority `historical` / `review` / `vendor` — FROZEN EVIDENCE. Documentation-Law.md §"Relocation &
//     retirement" step 5 rules that dated reviews and history keep the path that was true then and are NOT
//     repointed, so resolving their cites would red a doc for obeying the law. (`history/**` was already
//     exempt as a scan source; this states the same exemption as a CLASS rather than a directory.)
//   - `status` other than `active` — a draft/parked/complete/archived/superseded doc is not a home a reader
//     is sent to.
//   - the PARKED DESIGN SETS (`docs/architecture/proposed/**` + `docs/architecture/*.md`, the catalog's
//     `architecture-proposed` lane) — they name the homes their unbuilt subject WILL have, which is the
//     ruling this gate's header has always carried ("proposed/ legitimately names dead code in prose").
//     They keep arm 2 (a LINK is navigation to a doc that must exist NOW) and stay out of arms 3/4.
// AND THE LIVING DESIGN HOMES TAKE ARM 3 BUT NOT ARM 4, measured rather than assumed: their PATH cites are
// the review evidence idiom (`path.ts:120-134`) and every survivor of the widening was real drift, but their
// UPPER_SNAKE cites are as often a name the doc is PROPOSING for unbuilt work (`SPIKE_NUDGE`, `TWIST_CAP`,
// `PROTECT_TAIL`, `CREW_ACTIVE_GAME`, `BAKE_MODELS` — 13 of them at the widening) as a live declaration.
// Arm 4's founding tuning is precision over recall / err quiet, so its corpus stays LAW-only.
// Both corpora UNION the directories the gate scanned before, so the widening can only add: arm 2 keeps the
// whole core+proposed trees, arms 3/4 keep the whole core tree (incl. the historical-authority core docs).
const CATALOG_REL = "docs/catalog/catalog.json";
const LAW_AUTHORITIES: ReadonlySet<string> = new Set(["normative", "current-reference", "operational"]);
const DESIGN_AUTHORITY = "design";
const LIVING_STATUS = "active";
const PARKED_SET_LANE = "architecture-proposed";
const LINK_SCAN_DIRS: readonly string[] = ["docs/architecture/core", "docs/architecture/proposed"];
const AUDIT_SCAN_DIRS: readonly string[] = ["docs/architecture/core"];

/** LAW THAT LIVES OUTSIDE `docs/`. The constitution's §7 index names both of these as the law for their
 *  tool, but they sit beside the code they govern, and the catalog's corpus is tracked markdown under
 *  `docs/` — so no derivation can reach them and they are named literally. §4.6: a name-keyed gate detects
 *  its own blindness, so a path here that stops resolving is REPORTED and counted `unresolved`. */
const LAW_OUTSIDE_DOCS: readonly string[] = ["tooling/src/verify/gates/GATE-AUTHORING.md", "tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md"];

/** One catalogued document, read narrowly — only the three coordinates the class rule judges. */
interface CatalogDoc {
  readonly path?: unknown;
  readonly lane?: unknown;
  readonly frontmatter?: { readonly fields?: Readonly<Record<string, unknown>> };
  readonly receipt?: { readonly authority?: unknown };
}

/** The three derived corpora plus the per-class counts the gate declares as its scan receipt. */
interface Corpora {
  readonly links: readonly string[];
  readonly audit: readonly string[];
  readonly symbols: readonly string[];
  readonly law: number;
  readonly design: number;
  readonly lawOutsideDocs: number;
  readonly lawOutsideDocsMissing: readonly string[];
  readonly catalogued: number;
}

function walkDirs(root: string, dirs: readonly string[]): readonly string[] {
  const files: string[] = [];
  for (const dir of dirs) {
    if (existsSync(join(root, dir))) {
      walkMd(root, dir, files);
    }
  }
  return files;
}

function fieldOf(doc: CatalogDoc, key: string): string | undefined {
  const value = doc.frontmatter?.fields?.[key];
  return typeof value === "string" ? value : undefined;
}

/** The catalogued LIVING homes, split by class. A missing catalog yields two empty sets (a conformance
 *  mini-project has no catalog); on a real tree an empty census is REPORTED by the anchor-guarded
 *  `BLIND_CATALOG_MSG` arm in `run`, never passed off as a clean corpus. */
function catalogued(root: string): { readonly law: readonly string[]; readonly design: readonly string[] } {
  const file = join(root, CATALOG_REL);
  if (!existsSync(file)) {
    return { law: [], design: [] };
  }
  // A malformed catalog THROWS (the harness turns it into a ToolError for this gate): the gate cannot
  // derive its own subject, and a silently empty corpus is the exact placebo this widening exists to end.
  const docs = (JSON.parse(readFileSync(file, "utf8")) as { readonly documents?: readonly CatalogDoc[] }).documents ?? [];
  const law: string[] = [];
  const design: string[] = [];
  for (const doc of docs) {
    const path = typeof doc.path === "string" ? doc.path : undefined;
    const authority = typeof doc.receipt?.authority === "string" ? doc.receipt.authority : undefined;
    if (path === undefined || authority === undefined || fieldOf(doc, "status") !== LIVING_STATUS || !existsSync(join(root, path))) {
      continue;
    }
    if (LAW_AUTHORITIES.has(authority)) {
      law.push(path);
    } else if (authority === DESIGN_AUTHORITY && doc.lane !== PARKED_SET_LANE) {
      design.push(path);
    }
  }
  return { law, design };
}

/** The markdown corpora arms 2–4 read. Returned to the caller so the gate can DECLARE its scan denominator:
 *  this gate's units are docs on disk, and the harness — which only sees the ts-morph workspace — would
 *  otherwise report a file count it never read (pass.ts `GateScan`). */
function corpora(root: string): Corpora {
  const { law, design } = catalogued(root);
  const outside = LAW_OUTSIDE_DOCS.filter((rel) => existsSync(join(root, rel)));
  const symbols = [...new Set([...walkDirs(root, AUDIT_SCAN_DIRS), ...law, ...outside])].sort();
  const audit = [...new Set([...symbols, ...design])].sort();
  const links = [...new Set([...walkDirs(root, LINK_SCAN_DIRS), ...audit])].sort();
  return {
    links,
    audit,
    symbols,
    law: law.length,
    design: design.length,
    lawOutsideDocs: outside.length,
    lawOutsideDocsMissing: LAW_OUTSIDE_DOCS.filter((rel) => !existsSync(join(root, rel))),
    catalogued: law.length + design.length,
  };
}

const BLIND_CATALOG_MSG =
  `the doc-catalog census (${CATALOG_REL}) resolved ZERO living law/design documents, so arms 2-4 would judge only the ` +
  "hand-named directories — the blindness this gate's derived corpus exists to prevent (GATE-AUTHORING.md §4.6). Re-run " +
  "`pnpm doc-catalog:write`, or fix the class rule in tooling/src/verify/gates/dangling-refs.ts `catalogued`.";

const LAW_OUTSIDE_MISSING_MSG = (rel: string): string =>
  `\`${rel}\` is named by LAW_OUTSIDE_DOCS in tooling/src/verify/gates/dangling-refs.ts (law the constitution's §7 index ` +
  "cites, living outside docs/ where the catalog cannot see it) and no longer resolves — the widened corpus lost a member " +
  "silently. Repoint the constant to the doc's new home, or delete the row if the doc is gone.";

function scanDocLinks(root: string, files: readonly string[]): Violation[] {
  const out: Violation[] = [];
  for (const rel of files) {
    const src = readFileSync(join(root, rel), "utf8");
    const seen = new Set<string>();
    for (const m of src.matchAll(MD_LINK_RE)) {
      const ref = m[1];
      if (ref === undefined || seen.has(ref)) {
        continue;
      }
      seen.add(ref);
      if (!resolvesLink(root, rel, ref)) {
        out.push({ file: rel, line: 0, message: ARM2_MSG(ref) });
      }
    }
  }
  return out;
}

// ── arm 3: backticked-PATH existence across the AUDIT corpus ─────────────────────────────────────────
// The corpus anchor: where a corpus-level finding (a stale allowlist row, an absent-by-design verdict)
// is filed, since those findings belong to no single doc.
const ARM34_SCAN_DIR = "docs/architecture/core";
const BACKTICK_TOKEN_RE = /`([^`\n]+)`/gu;
const STRIKETHROUGH_RE = /~~[^~\n]*~~/gu;
// The corpus's dead/purged-machinery-as-history convention: "BUILD-STATE RIDER", "truth-audit"/"truth
// audit" (the standalone truth-audit annotation, not always paired with the word "rider" — the ip-ranges.ts
// and RAIL_SLOTS/MODAL_SLOTS fixed-in-place rows use it bare), "PURGED", whole-word "DEAD"/"died", and
// "the former `"/"the old `" (a struck/renamed-name lead-in), and a deliberate NEGATION lead-in ("not an
// `X`", "there is no `X`" — the mention IS the claim of absence). A WHOLE LINE carrying one of these is
// deliberately describing dead/purged/absent machinery as history, structurally (§9 GATE-AUTHORING:
// precision over recall, err quiet) — never a symbol/path fix target.
//
// NARROWED 2026-09-13 (#2068), and the DIRECTION is the point: `dead` is admitted only in the
// DEAD-MACHINERY sense ("`X` is dead", "dead code"), never in the REACHABILITY idiom "a dead end" /
// "dead-end" / "dead ends". The two senses are unrelated: "this reference reads as a dead end" is a
// claim about a code PATH and says nothing about whether the symbol beside it still exists, so the
// unnarrowed alternative silently forgave live phantom cites — `Core-Tooling-Law.md` cites
// `PROJECT_SITES` on a line whose only rider trigger is the words "a dead end", and the gate went quiet
// on it rather than reporting it. The narrowing is a LOOKAHEAD on the idiom only; every other `dead`
// still escapes, which is what the two committed proof rows below fix in BOTH directions.
const RIDER_LINE_RE = /rider|truth[- ]audit|purged|\bdead\b(?![-\s]ends?\b)|\bdied\b|the (former|old) `|\bnot an? `|there is no `/iu;
// A non-literal token (glob/brace/placeholder/ellipsis-elided-path) is a prose pattern, not a literal cite.
const NON_LITERAL_TOKEN_RE = /[*{}<>]|\.\.\.|…/u;
// A HEAD RIDER: several core docs carry a blockquote near the top declaring the WHOLE file (or "rows
// below") historical/frozen (`Core-Audits-and-Debt.md`, `Core-ST-Feature-Gap-Register.md`,
// `Core-SillyTavern-Feature-Map.md`, `Core-STATUS.md`, `Tier-3b-Providers.md`, …). Once that head rider is
// present, every mention below it is covered by it structurally — arms 3/4 skip the WHOLE file rather than
// re-deriving which mentions the rider covers line-by-line.
const HEAD_RIDER_RE = /BUILD-STATE RIDER/u;
const HEAD_RIDER_SCAN_LINES = 20;
// A single-uppercase-letter path SEGMENT (`packages/X/src/`, `tests/X/`) is the corpus's own generic
// example-placeholder convention, not a literal cite.
const PLACEHOLDER_SEGMENT_RE = /(^|\/)[A-Z](\/|$)/u;

/** Known repo-relative path-shorthand prefixes (arm 3). Anything else is an unresolvable shape — skip,
 *  never guess (audit §6 arm 1). */
const PATH_PREFIXES: readonly string[] = [
  "packages/",
  "docs/",
  "scripts/",
  "tests/",
  "domain/",
  "entry/",
  "infra/",
  "transport/",
  "foundation/",
  "kit/",
  "@orb/",
];

const TRIM_ANCHOR_RE = /#[^)\s]*$/u;
// THE LINE-REF SUFFIX, in every spelling the corpus actually writes (#1036 — the single-`:N` form was the
// matcher's blind spot, and it stayed invisible while arm 3 read only `core/`, which cites bare paths; the
// review/design corpus writes RANGES): `:12` · `:12-30` · `:12,18` · `:12-30,44-50` · the multi-anchor
// `:6/:18`. A blind trimmer here is a false-POSITIVE factory over a corpus that cites evidence by line.
const TRIM_LINEREF_RE = /:\d+(?:-\d+)?(?:[,/]:?\d+(?:-\d+)?)*$/u;
const TRIM_PUNCT_RE = /[:.,;)]+$/u;
// The `path::<code pointer>` idiom, read as "everything from the first `::`" rather than as an identifier:
// the pointer half is also written as a CSS/var expression (`globals.css::var(--reading-line-height)`), and
// a path segment can never contain `::` anyway.
const TRIM_CROSSREF_RE = /::.*$/u;

/** Strip trailing prose punctuation / line-ref / anchor a backtick token commonly carries in these docs.
 *  The corpus's `path::Symbol` cross-reference idiom (`entry/compose/chat.ts::activePersonaIdFor`) is a
 *  PATH plus a code-pointer suffix — arm 3 only owns the path half, so strip a trailing `::Name`. */
function trimPathToken(raw: string): string {
  const base = raw.trim().replace(TRIM_ANCHOR_RE, "").replace(TRIM_LINEREF_RE, "").replace(TRIM_PUNCT_RE, "");
  return base.replace(TRIM_CROSSREF_RE, "");
}

/** A workspace package's tree root. Every `@orb/*` package lives at `packages/<pkg>` EXCEPT `@orb/tooling`,
 *  which is the root `tooling/` tree ABOVE the cake (pnpm-workspace.yaml carries it as a second entry) —
 *  hard-coding `packages/` here made every core-doc mention of `@orb/tooling` read as a phantom path. */
function pkgRoot(pkg: string): string {
  return pkg === "tooling" ? "tooling" : `packages/${pkg}`;
}

/** Resolve the shorthand prefix to its real repo-relative home (§6 arm 1's resolver, kept total). */
function shorthandTarget(ref: string): string | undefined {
  if (ref.startsWith("packages/") || ref.startsWith("docs/") || ref.startsWith("scripts/") || ref.startsWith("tests/")) {
    return ref;
  }
  if (ref.startsWith("domain/") || ref.startsWith("entry/") || ref.startsWith("infra/") || ref.startsWith("transport/") || ref.startsWith("foundation/")) {
    return `packages/server/src/${ref}`;
  }
  if (ref.startsWith("kit/")) {
    return `packages/kit/src/${ref.slice("kit/".length)}`;
  }
  if (ref.startsWith("@orb/")) {
    const rest = ref.slice("@orb/".length); // "<pkg>" or "<pkg>/<mod...>"
    const slash = rest.indexOf("/");
    if (slash === -1) {
      return pkgRoot(rest);
    }
    return `${pkgRoot(rest.slice(0, slash))}/src/${rest.slice(slash + 1)}`;
  }
  // biome-ignore lint/complexity/noUselessReturn: false positive — sibling branches return a value, so tsconfig's noImplicitReturns needs this fallthrough to explicitly return too (TS7030 without it)
  return;
}

/** A resolved repo-relative path exists as a file/dir, OR resolves via a common extension / index fallback
 *  (bare mentions like `domain/hub` name a directory; `kit/cel` may name a dir without its own index). */
function pathExists(root: string, target: string): boolean {
  const candidates = [target, `${target}.ts`, `${target}.tsx`, `${target}.md`, `${target}/index.ts`, `${target}/index.tsx`];
  return candidates.some((c) => existsSync(join(root, c)));
}

// A package's public subpath shorthand (`@orb/<pkg>/<mod>`) is a package-export name, not necessarily a
// literal `src/<mod>` file — e.g. `@orb/ui/virtual-list` lives at `src/primitives/virtual-list/…`. Total
// literal-path resolution is unholdable without reading each package's export map; the fail-open fallback
// is a recursive basename search under the package's `src/` (the mod's LAST segment as a dir/file name
// anywhere in the tree) — cached per package so the whole-corpus scan stays one walk per package.
const basenameIndexCache = new Map<string, Set<string>>();
const CODE_EXT_RE = /\.(ts|tsx)$/u;

function walkBasenames(absDir: string, out: Set<string>): void {
  if (!existsSync(absDir)) {
    return;
  }
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      out.add(entry.name);
      walkBasenames(join(absDir, entry.name), out);
    } else if (CODE_EXT_RE.test(entry.name)) {
      out.add(entry.name.replace(CODE_EXT_RE, ""));
    }
  }
}

function basenameIndex(root: string, pkg: string): Set<string> {
  const key = `${root}::${pkg}`;
  const cached = basenameIndexCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  const out = new Set<string>();
  walkBasenames(join(root, pkgRoot(pkg), "src"), out);
  basenameIndexCache.set(key, out);
  return out;
}

/** Arm 3's `@orb/<pkg>/<mod>` fallback: the literal path, or the mod's last segment resolving ANYWHERE
 *  under the package's src tree (the export-map case the literal resolver can't see). */
function orbPkgModExists(root: string, target: string, pkg: string, mod: string): boolean {
  if (pathExists(root, target)) {
    return true;
  }
  const last = mod.split("/").pop();
  return last !== undefined && basenameIndex(root, pkg).has(last);
}

const ARM3_MSG = (ref: string): string =>
  `backticked path \`${ref}\` in a living law/design doc resolves to no file/dir on disk (shorthand: domain·entry·infra·` +
  "transport·foundation → packages/server/src/…; kit/<x> → packages/kit/src/<x>; @orb/<pkg>/<mod> → " +
  "packages/<pkg>/src/<mod>, and @orb/tooling/<mod> → tooling/src/<mod>). A phantom path is drift the " +
  "amnesiac reader can't tell from a real home — " +
  "repoint it or delete the mention.";

/** Mask `~~struck~~` spans (same length, blanked) so backticks purely inside deliberately-struck prose never
 *  yield a token — struck content is the corpus's other dead-mention convention (alongside rider lines). */
function maskStrikethrough(line: string): string {
  return line.replace(STRIKETHROUGH_RE, (m) => " ".repeat(m.length));
}

/** True when this doc's opening lines carry the corpus's head-rider convention — the whole file (or "rows
 *  below") is declared historical/frozen, so no per-line phantom in it is a fresh violation. */
function hasHeadRider(lines: readonly string[]): boolean {
  return lines.slice(0, HEAD_RIDER_SCAN_LINES).some((l) => HEAD_RIDER_RE.test(l));
}

/** Does a shorthand token resolve? `@orb/<pkg>/<mod>` gets the basename-fallback (an export-map subpath,
 *  not necessarily a literal `src/<mod>` file); every other prefix is a literal-path resolve. */
function shorthandExists(root: string, ref: string): boolean {
  if (ref.startsWith("@orb/")) {
    const rest = ref.slice("@orb/".length);
    const slash = rest.indexOf("/");
    if (slash === -1) {
      return pathExists(root, pkgRoot(rest));
    }
    const pkg = rest.slice(0, slash);
    const mod = rest.slice(slash + 1);
    return orbPkgModExists(root, `${pkgRoot(pkg)}/src/${mod}`, pkg, mod);
  }
  // `kit/<x>` is ambiguous prose shorthand: the top-level `@orb/kit` package AND server's own internal
  // `infra`-adjacent `kit/` subdirectory (`packages/server/src/kit/<x>`) both exist on the tree — try both.
  if (ref.startsWith("kit/") && pathExists(root, `packages/server/src/${ref}`)) {
    return true;
  }
  const target = shorthandTarget(ref);
  return target !== undefined && pathExists(root, target);
}

/** One line's path-token findings (arm 3) — split out of `scanPathTokens` to stay under the complexity cap. */
interface PathLineArgs {
  readonly root: string;
  readonly rel: string;
  readonly rawLine: string;
  readonly lineNo: number;
  readonly allow: ExemptionTable;
  readonly hitRefs: Set<string>;
  /** Every path-shaped backtick cite seen (resolved OR not) — the resolution-agnostic set that owns the
   *  absent-by-design rows' "docs stopped referencing it" side (#775 fix; see GITIGNORED_ABSENT). */
  readonly referencedRefs: Set<string>;
}

function pathTokensInLine({ root, rel, rawLine, lineNo, allow, hitRefs, referencedRefs }: PathLineArgs): Violation[] {
  if (RIDER_LINE_RE.test(rawLine)) {
    return []; // rider convention: deliberately names dead/purged homes as history
  }
  const line = maskStrikethrough(rawLine);
  const out: Violation[] = [];
  for (const m of line.matchAll(BACKTICK_TOKEN_RE)) {
    const raw = m[1];
    if (raw === undefined) {
      continue;
    }
    const ref = trimPathToken(raw);
    if (ref.length === 0 || NON_LITERAL_TOKEN_RE.test(ref) || PLACEHOLDER_SEGMENT_RE.test(ref) || !PATH_PREFIXES.some((p) => ref.startsWith(p))) {
      continue;
    }
    referencedRefs.add(ref); // a live path-shaped cite, regardless of whether it resolves on THIS checkout
    if (shorthandExists(root, ref)) {
      continue;
    }
    hitRefs.add(ref);
    if (ref in allow) {
      continue;
    }
    out.push({ file: rel, line: lineNo, message: ARM3_MSG(ref) });
  }
  return out;
}

function scanPathTokens(
  root: string,
  docs: readonly string[],
  allow: ExemptionTable,
): { readonly violations: Violation[]; readonly hitRefs: Set<string>; readonly referencedRefs: Set<string> } {
  const violations: Violation[] = [];
  const hitRefs = new Set<string>();
  const referencedRefs = new Set<string>();
  for (const rel of docs) {
    const lines = readFileSync(join(root, rel), "utf8").split("\n");
    if (hasHeadRider(lines)) {
      continue; // the whole doc is declared historical/frozen — every mention below is covered by it
    }
    lines.forEach((rawLine, i) => {
      violations.push(...pathTokensInLine({ root, rel, rawLine, lineNo: i + 1, allow, hitRefs, referencedRefs }));
    });
  }
  return { violations, hitRefs, referencedRefs };
}

// ── arm 4: backticked-SYMBOL existence across the AUDIT corpus ────────────────────────────────────────
// STRICT UPPER_SNAKE only (`[A-Z][A-Z0-9]*(_[A-Z0-9]+)+` — at least one underscore, no lowercase): the
// tuple/const class the audit's founding phantoms (`REATTRIBUTE_WINDOW`, `ANTH_DIRECT_SAMPLING`,
// `RAIL_SLOTS`/`MODAL_SLOTS`) all share. A bare single ALL-CAPS word (`FLAG`, `BUILT`, `OUT` — prose
// emphasis, and the gate corpus's OWN exemption-vocabulary words) and a bare `name()` call-cite (a
// self-proof precision spike: React/Vite/CSS builtins and generic verb names like `use()`/`serve()`/
// `oklch()` dominated the candidate set with zero true positives) are BOTH deliberately out of scope —
// precision over recall, per the audit's own tuning. PascalCase types are out of scope entirely (a
// lower-tailed name like `ChatContext` never matches this shape).
const SYMBOL_CANDIDATE_RE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/u;
// Declaration-name-bearing node kinds the project-wide index is built from.
const NAME_BEARING_KINDS: readonly SyntaxKind[] = [
  SyntaxKind.VariableDeclaration,
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.ClassDeclaration,
  SyntaxKind.InterfaceDeclaration,
  SyntaxKind.TypeAliasDeclaration,
  SyntaxKind.EnumDeclaration,
  SyntaxKind.EnumMember,
  SyntaxKind.MethodDeclaration,
  SyntaxKind.PropertySignature,
  SyntaxKind.GetAccessor,
  SyntaxKind.PropertyAssignment, // env-schema / registry object keys, e.g. `OIDC_CLIENT_ID: z.string()`
  SyntaxKind.ShorthandPropertyAssignment,
];

/** Every declared name in the shared project (each package's src tree + tests + gate corpus —
 *  harnessGlobs), PLUS every UPPER_SNAKE string-literal VALUE (env-var name lists, `as const` tuples of
 *  string members — `["OIDC_ISSUER", "OIDC_CLIENT_ID", …]`, `BACKEND_KEYS`-style tuples — a symbol the
 *  corpus cites is as often a tuple MEMBER as a declared identifier). A symbol resolving ANYWHERE in that
 *  set counts (the audit's tests/scripts fence, widened to "found at all in the harness workspace" rather
 *  than excluded from it). */
const PROPERTY_KEY_KINDS: readonly SyntaxKind[] = [SyntaxKind.PropertyAssignment, SyntaxKind.ShorthandPropertyAssignment];

/** One node's contribution to the declared-name index — split out of `declaredNameIndex` to stay under the
 *  complexity cap. The gate corpus (tooling/src/verify/gates/**) routinely cites a DEAD name as a mustFlag/
 *  mustPass fixture string (`no-parallel-section-map`'s own examples name `RAIL_ACTIONS`) or as THIS gate's
 *  own ARM3/4_ALLOW object-literal KEY (a PropertyAssignment named after the exact phantom it exempts) —
 *  neither is a live declaration. A real gate-internal const (`own-tables-only.ts`'s `BULK_READERS`) is a
 *  VariableDeclaration, which still counts — only the string-literal and object-property-key arms are
 *  excluded for gate-corpus files. */
function nameFromNode(n: Node, inGateCorpus: boolean): string | undefined {
  if (Node.isStringLiteral(n)) {
    return !inGateCorpus && SYMBOL_CANDIDATE_RE.test(n.getLiteralText()) ? n.getLiteralText() : undefined;
  }
  if (inGateCorpus && PROPERTY_KEY_KINDS.includes(n.getKind())) {
    return;
  }
  if (!NAME_BEARING_KINDS.includes(n.getKind())) {
    return;
  }
  const withName = n as unknown as { getName?: () => string | undefined };
  const name = typeof withName.getName === "function" ? withName.getName() : undefined;
  return name !== undefined && name.length > 0 ? name : undefined;
}

function declaredNameIndex(ctx: GateRunCtx): Set<string> {
  const names = new Set<string>();
  for (const sf of ctx.project.getSourceFiles()) {
    const inGateCorpus = sf.getFilePath().includes(`/${GATES_DIR_REL}/`);
    sf.forEachDescendant((n) => {
      const name = nameFromNode(n, inGateCorpus);
      if (name !== undefined) {
        names.add(name);
      }
    });
  }
  return names;
}

const ARM4_MSG = (ref: string): string =>
  `backticked symbol \`${ref}\` in a living law/design doc has no declaration anywhere in the workspace (packages/*/src, ` +
  "tests/, the gate corpus). A phantom symbol cite is drift — repoint it to the real name, or strike/rider " +
  "it as deliberate history if the code is gone.";

/** One line's symbol-token findings (arm 4) — split out of `scanSymbolTokens` to stay under the complexity
 *  cap. */
interface SymbolLineArgs {
  readonly rel: string;
  readonly rawLine: string;
  readonly lineNo: number;
  readonly index: ReadonlySet<string>;
  readonly allow: ExemptionTable;
  readonly hitRefs: Set<string>;
}

function symbolTokensInLine({ rel, rawLine, lineNo, index, allow, hitRefs }: SymbolLineArgs): Violation[] {
  if (RIDER_LINE_RE.test(rawLine)) {
    return [];
  }
  const line = maskStrikethrough(rawLine);
  const out: Violation[] = [];
  for (const m of line.matchAll(BACKTICK_TOKEN_RE)) {
    const raw = m[1]?.trim();
    if (raw === undefined || raw.length === 0 || !SYMBOL_CANDIDATE_RE.test(raw) || index.has(raw)) {
      continue;
    }
    hitRefs.add(raw);
    if (raw in allow) {
      continue;
    }
    out.push({ file: rel, line: lineNo, message: ARM4_MSG(raw) });
  }
  return out;
}

function scanSymbolTokens(
  root: string,
  docs: readonly string[],
  ctx: GateRunCtx,
  allow: ExemptionTable,
): { readonly violations: Violation[]; readonly hitRefs: Set<string> } {
  const index = declaredNameIndex(ctx);
  const violations: Violation[] = [];
  const hitRefs = new Set<string>();
  for (const rel of docs) {
    const lines = readFileSync(join(root, rel), "utf8").split("\n");
    if (hasHeadRider(lines)) {
      continue; // the whole doc is declared historical/frozen — every mention below is covered by it
    }
    lines.forEach((rawLine, i) => {
      violations.push(...symbolTokensInLine({ rel, rawLine, lineNo: i + 1, index, allow, hitRefs }));
    });
  }
  return { violations, hitRefs };
}

// ── arms 3/4 allowlists — TYPED ROWS, `why` mandatory, two-sided (a stale row REDS) ───────────────────
// Every entry here is a deliberate, permanent exemption — a mention this gate cannot structurally tell
// apart from a phantom (e.g. a shorthand form the resolver doesn't cover).
// The 2026-08-03 truth-audit's own scope split: AGENTS.md, Core-Laws-and-Precedents.md,
// Core-Path-Registry.md, Spine-Identity-and-Auth.md, UI-Architecture-and-Layout.md,
// client-architecture-lockdown.md are the CERD lane's territory — zero edits here (merge-collision
// avoidance, per the audit doc's own §"scope split"). Their phantom-shaped mentions (mostly the pre-M4
// registry-shape history — `RAIL_ACTIONS`/`MODAL_SLOTS`/`SECTION_PANEL_DEFAULTS`/etc. — and the
// D60/D67-class purge shadow — `domain/hub`/`domain/buddy`/`ANTH_DIRECT_SAMPLING`/etc.) are CERD's own
// truth-repair, not this lane's. Ends when CERD's merge lands (its own rider/strike passes over these
// six files) — re-run the gate after that merge and delete whatever rows are then stale.
const CERD_WHY =
  "CERD-lane territory (client-architecture-lockdown.md/Core-Path-Registry.md/UI-Architecture-and-Layout.md) — the 2026-08-03 truth-audit's scope split zero-edits these six merge-collision files; CERD's own pass resolves the phantom. Ends when the CERD merge lands.";

const ARM3_ALLOW: ExemptionTable = {
  "@orb/kit/vector-math.pairwiseCosine": {
    why: "a `module.export` dot-access cite (Knowledge-Cluster.md §inv1) — the resolver's shorthand only checks file/dir existence, never a re-exported member; the file (`packages/kit/src/vector-math.ts`) is real. Ends when arm 3 gains a ts-morph export-member check.",
  },
  "@orb/ui/MessageMedia": { why: CERD_WHY },
  "@orb/tokens": { why: CERD_WHY },
  // "domain/roster-preset" removed 2026-08-28 (#26) — the domain now EXISTS on the tree, so the phantom
  // resolved and the gate's own stale arm demanded the row's deletion (two-sided exemptions).
  // "domain/hub" removed 2026-09-13 (#2068) — same shape, opposite cause: the domain is still purged, but
  // the LAST phantom-shaped mention of it went with the #2068 repairs, so the row stopped matching anything
  // and the stale arm demanded its deletion. Surfaced at the MERGE SEAM, not in the lane: the lane measured
  // dangling-refs 30 → 0 on its own tree, and the same gate read 1 on the merged tree, because both corpora
  // are DERIVED from docs/catalog/catalog.json and that lane's own final commit (the #2071 proposal doc plus
  // its catalog receipt) changed the corpus membership underneath its earlier measurement.
  "infra/network/hubs/": { why: CERD_WHY },
  "domain/buddy": { why: CERD_WHY },
  "transport/trpc/buddy-bus.ts": { why: CERD_WHY },
};
const ARM4_ALLOW: ExemptionTable = {
  SQLITE_BUSY: {
    why: "Tier-1-DB.md cites SQLite's own C-API error code name (`sqlite3_busy_timeout`), never a repo-declared symbol. Ends if this ever becomes a repo-defined constant.",
  },
  HUB_ADAPTERS: { why: CERD_WHY },
  ANTH_DIRECT_SAMPLING: { why: CERD_WHY },
  TAB_EDGE_CLASSES: { why: CERD_WHY },
  MODAL_SLOTS: { why: CERD_WHY },
  RAIL_ACTIONS: { why: CERD_WHY },
  CONTEXT_SLOTS: { why: CERD_WHY },
  RAIL_SECTIONS: { why: CERD_WHY },
  SECTION_PANEL_DEFAULTS: { why: CERD_WHY },
  SECTION_PLACEHOLDER_COPY: { why: CERD_WHY },
  ACCOUNT_ACTION: { why: CERD_WHY },
  YOU_MODAL_ROWS: { why: CERD_WHY },
  MOBILE_PRIMARY_SECTIONS: { why: CERD_WHY },
  CHAT_CONTEXT_SLOTS: { why: CERD_WHY },
  CHAT_SURFACE_SLOTS: { why: CERD_WHY },
  COMMAND_ACTION: { why: CERD_WHY },
};

// ── arm 3's ABSENT-BY-DESIGN rows (#775) ────────────────────────────────────────────────────────────────
// A GITIGNORED path is present on a full working checkout and absent on a clean one, so resolving it with
// `existsSync` makes this gate's verdict a property of the CHECKOUT rather than of the docs: `dangling-refs`
// was green on main and RED in every fresh worktree, on the same commit, for the same doc line. An
// instrument whose answer depends on where it runs is lying in one of the two places. `tsconfig-entry-liveness`
// already carries the identical row for the identical path; this is the same ruling on the doc side.
// THREE-SIDED, so the exemption cannot outlive its justification — and ALL THREE sides are computed in
// `absentByDesignViolations` from env-INDEPENDENT inputs (committed docs, the committed `.gitignore`, the
// committed cite), NEVER via the phantom-hitRefs stale arm: the row reds when the docs stop REFERENCING the
// path (its token is no longer a live backtick path-cite anywhere in the core corpus — counted resolved-or-
// not by `referencedRefs`, so presence on disk is irrelevant), when its `cite` stops resolving, and when the
// path stops being GITIGNORED (the moment "absent by design" becomes false).
//
// WHY NOT the shared `staleAllowlistViolations` arm (the #775-era mistake this fix corrects): that arm keys
// off `hitRefs` = UNRESOLVED tokens only. On a fresh worktree the gitignored path is absent → a phantom → in
// hitRefs → not-stale; on a FULL checkout it resolves → never a phantom → NOT in hitRefs → the stale arm
// falsely red it. So #775 did not remove the env-dependence, it MOVED it from the worktree side to the main
// side (dangling-refs became the one structure red on a full checkout). GITIGNORED_ABSENT is therefore
// DELIBERATELY excluded from the arm-3 stale arm below; its "docs stopped referencing it" side lives on the
// resolution-agnostic `referencedRefs` set instead, which answers identically in both checkouts.
interface AbsentByDesign {
  readonly why: string;
  /** The doc that establishes the path is deliberately gitignored. */
  readonly cite: string;
}

const GITIGNORE_REL = ".gitignore";

const GITIGNORED_ABSENT: ExemptionTable<AbsentByDesign> = {
  "packages/client/dist": {
    why:
      "the client BUILD OUTPUT — present after a build, absent on a clean checkout, gitignored by the `dist/` rule. " +
      "`docs/design/containerize-build-plan.md` quotes the `.dockerignore` entry VERBATIM, and judging that quote with " +
      "existsSync makes this gate's verdict a property of whether THIS checkout happens to have built the client — the " +
      "#775 environment-dependence class, one directory over. Delete this row the day the containerize plan stops " +
      "quoting the .dockerignore entry.",
    cite: ".dockerignore",
  },
  // DELETED 2026-09-13 (#2068): the row for `scripts/probes/st-goldens/sillytavern-runtime`. Its own
  // third side — the resolution-agnostic "docs stopped referencing it" arm — reported it: no core doc
  // carries a live backtick path-cite of that subtree any more, so the exemption was forgiving a
  // reference that no longer exists, and the gate's own UNREFERENCED_MSG prescribes this deletion. The
  // table stays two-sided: should a core doc cite the subtree again, the cite reds as a phantom path on
  // a clean checkout and the row comes back with a fresh `cite`. NOTE FOR THE NEXT READER: the SAME
  // gitignored directory is the subject of #2282, where `p-eslint-fence` fences it out of `lint:eslint`
  // (ESLint cannot read `.gitignore`; the rule is `.gitignore:121`). One directory, two instruments,
  // two independent mechanisms — neither change blocks the other, and they should not be discovered as
  // a surprise.
};

/** Is `path` named by a literal `.gitignore` rule? Read literally — a rule this reader cannot prove is a
 *  MISSING justification, never an assumed one, so the row reds rather than passing on a guess.
 *  TWO literal shapes, both straight out of gitignore's own grammar: the whole path (anchored or not), and
 *  a rule carrying NO slash, which matches a basename AT ANY DEPTH (`dist/` names `packages/client/dist`).
 *  A root-anchored `/dist/` is deliberately NOT accepted for a nested path — it does not name it. */
function gitignoredLiterally(root: string, path: string): boolean {
  const file = join(root, GITIGNORE_REL);
  if (!existsSync(file)) {
    return false;
  }
  const basename = path.split("/").pop() ?? path;
  const wanted = new Set([path, `${path}/`, `/${path}`, `/${path}/`, basename, `${basename}/`]);
  return readFileSync(file, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .some((line) => wanted.has(line));
}

const STALE_ROW_MSG = (arm: string, key: string): string =>
  `${arm} allowlist row \`${key}\` matches no live phantom — stale entry, delete it ` +
  "(GATE-AUTHORING.md's exemption grammar: every exemption is two-sided).";

const UNGITIGNORED_MSG = (key: string): string =>
  `absent-by-design row \`${key}\` is no longer named by a literal ${GITIGNORE_REL} rule — the ONLY thing that made ` +
  "its absence by design is gone, so the row now forgives a real phantom. Delete the row from GITIGNORED_ABSENT in " +
  "tooling/src/verify/gates/dangling-refs.ts, or restore the ignore rule. See tooling/src/verify/gates/GATE-AUTHORING.md §4.4.";

const DEAD_CITE_MSG = (key: string): string =>
  `absent-by-design row \`${key}\`'s cite no longer resolves — the doc that justified the exemption moved or was ` +
  "deleted. Re-derive the cite, or delete the row from GITIGNORED_ABSENT in tooling/src/verify/gates/dangling-refs.ts.";

const UNREFERENCED_MSG = (key: string): string =>
  `absent-by-design row \`${key}\` matches no live backtick path-cite in any core doc — the exemption forgives a ` +
  "reference that no longer exists, so it is stale dead-weight. Delete the row from GITIGNORED_ABSENT in " +
  "tooling/src/verify/gates/dangling-refs.ts (this is the resolution-agnostic 'docs stopped referencing it' side, " +
  "computed off referencedRefs rather than the phantom stale arm so it holds on both a present and an absent checkout).";

/** The three-sided liveness check for the ABSENT-BY-DESIGN rows (#775) — ALL sides env-independent. `referenced`
 *  is every path-shaped backtick cite in the core corpus (resolved OR not), so the "docs stopped referencing it"
 *  side is a property of the committed docs, never of whether the gitignored subtree is checked out here. */
function absentByDesignViolations(root: string, referenced: ReadonlySet<string>): Violation[] {
  const out: Violation[] = [];
  for (const [key, row] of Object.entries(GITIGNORED_ABSENT)) {
    if (!gitignoredLiterally(root, key)) {
      out.push({ file: GITIGNORE_REL, line: 0, message: UNGITIGNORED_MSG(key) });
    }
    if (!existsSync(join(root, row.cite))) {
      out.push({ file: ARM34_SCAN_DIR, line: 0, message: DEAD_CITE_MSG(key) });
    }
    if (!referenced.has(key)) {
      out.push({ file: ARM34_SCAN_DIR, line: 0, message: UNREFERENCED_MSG(key) });
    }
  }
  return out;
}

function staleAllowlistViolations(arm: string, allow: ExemptionTable, hitRefs: ReadonlySet<string>): Violation[] {
  return Object.keys(allow)
    .filter((key) => !hitRefs.has(key))
    .map((key) => ({ file: ARM34_SCAN_DIR, line: 0, message: STALE_ROW_MSG(arm, key) }));
}

export const gate: GateDescriptor = {
  name: "dangling-refs",
  docRow: "Core-Enforcement-Active-Gates.md",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "a doc-path pointer leads nowhere — a gate descriptor's docRow/message/fix names a `*.md` that resolves " +
    "to no file, a markdown link in the LINK corpus targets a missing doc, or a backticked path / " +
    "UPPER_SNAKE symbol in the AUDIT corpus resolves to no file/dir/declaration. Both corpora are DERIVED " +
    "from docs/catalog/catalog.json — every LIVING home (status active + a law or design authority), plus " +
    "the law markdown outside docs/ (tooling/src/verify/gates/GATE-AUTHORING.md, " +
    "tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md); frozen history, dated reviews " +
    "and the parked design sets are out by class. A ghost cite is drift the reader can't distinguish from " +
    "a real home. Rider lines and `~~struck~~` text are exempt structurally (deliberate history). " +
    "See Core-Enforcement-Active-Gates.md.",
  fix: "repoint the cite to the doc's real home (bare names resolve against core/ then history/ then proposed/ then repo root; a markdown link resolves relative to its own file first; a backtick path/symbol repoints to the live name or rewords as history), or delete a dead link; never delete surrounding prose.",
  run: (ctx) => {
    const docs = corpora(ctx.root);
    // This gate reads DOCS off disk, not the shared ts-morph fileset — so it declares its own denominator,
    // BY CLASS. Left undeclared, its scan-health row would carry the workspace file count (a number it never
    // read) and the zero-scan alarm could not tell a real blindness from a gate that scans no `.ts` at all;
    // left unsplit, a class silently emptying (the catalog stops resolving, a law doc outside docs/ moves)
    // would hide inside one healthy-looking total — the #946 denominator-loss shape, which is judged at
    // ops/structure.ts, never here.
    ctx.scan({
      unit: "doc",
      scanned: docs.links.length,
      population: [
        { source: "citation-corpus:law", members: docs.law },
        { source: "citation-corpus:design", members: docs.design },
        { source: "citation-corpus:law-outside-docs", members: docs.lawOutsideDocs, unresolved: docs.lawOutsideDocsMissing.length },
      ],
    });
    for (const v of [...scanGateDescriptors(ctx.root), ...scanDocLinks(ctx.root, docs.links)]) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
    // Arm 3's allow set is the reasoned rows PLUS the absent-by-design ones (#775) — one lookup, so a
    // gitignored path is skipped by the same branch every other exemption uses.
    const arm3Allow: ExemptionTable = { ...ARM3_ALLOW, ...GITIGNORED_ABSENT };
    const arm3 = scanPathTokens(ctx.root, docs.audit, arm3Allow);
    const arm4 = scanSymbolTokens(ctx.root, docs.symbols, ctx, ARM4_ALLOW);
    for (const v of [...arm3.violations, ...arm4.violations]) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
    // A real-tree anchor (never touched by any example below), not a `scope.kind` check — GATE-AUTHORING.md
    // §"the exemption grammar" rule 5: `scope.kind === "project"` is also true inside conformance's synthetic
    // mini-projects, which would fire a stale-arm there and red the gate's own self-proof.
    if (existsSync(join(ctx.root, "docs/architecture/core/AGENTS.md"))) {
      for (const v of [
        // ARM3_ALLOW ONLY — never arm3Allow. The GITIGNORED_ABSENT rows are DELIBERATELY excluded from the
        // phantom-hitRefs stale arm (it is env-dependent for a gitignored path — see GITIGNORED_ABSENT);
        // their three-sided liveness is owned entirely by absentByDesignViolations below.
        ...staleAllowlistViolations("arm 3 path", ARM3_ALLOW, arm3.hitRefs),
        ...staleAllowlistViolations("arm 4 symbol", ARM4_ALLOW, arm4.hitRefs),
        ...absentByDesignViolations(ctx.root, arm3.referencedRefs),
        // §4.6, both halves, and BOTH are real-tree-anchored for the same reason every stale arm is: a
        // conformance mini-project legitimately has neither the catalog nor the law docs outside docs/.
        // A name-keyed member that stopped resolving is REPORTED, never merely counted (the population's
        // `unresolved` is the receipt beside it), and a derived corpus that came back EMPTY is a blind
        // checker rather than a clean one.
        ...docs.lawOutsideDocsMissing.map((rel) => ({ file: GATE_REL("dangling-refs.ts"), line: 0, message: LAW_OUTSIDE_MISSING_MSG(rel) })),
        ...(docs.catalogued === 0 ? [{ file: CATALOG_REL, line: 0, message: BLIND_CATALOG_MSG }] : []),
      ]) {
        ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
      }
    }
  },
  mustFlag: [
    {
      files: {
        // arm 1: a docRow naming a doc that resolves against NO root — the ghost-cite the gate exists to catch.
        "tooling/src/verify/gates/__probe.ts": 'export const gate = { name: "__probe", docRow: "GHOST-DOC-THAT-DOES-NOT-EXIST.md", message: "x" };\n',
      },
      expect: { messageIncludes: "resolves" },
      why: "arm 1: a gate docRow names a doc under no resolution root — the UNIFIED-VERIFICATION ghost class",
    },
    {
      files: {
        // arm 2: a markdown LINK in a core doc pointing at a missing sibling.
        "docs/architecture/core/__probe.md": "---\nkind: law\n---\n\nSee [the ghost](ghost-sibling-xyz.md).\n",
      },
      expect: { messageIncludes: "resolves to no file" },
      why: "arm 2: a markdown link in core/ targets a doc that resolves nowhere — a dead navigational pointer",
    },
    {
      files: {
        // arm 3: a backticked path shorthand resolving to a directory absent from this synthetic tree.
        "docs/architecture/core/__probe3.md": "---\nkind: law\n---\n\nSee `domain/__ghost_domain__/x.ts` for the shape.\n",
      },
      expect: { messageIncludes: "resolves to no file/dir" },
      why: "arm 3: a backticked domain/ shorthand names no real file/dir on disk — the truth-audit phantom-path class",
    },
    {
      files: {
        // arm 4: a backticked UPPER_SNAKE symbol with no declaration anywhere in the synthetic workspace.
        "docs/architecture/core/__probe4.md": "---\nkind: law\n---\n\nScoped to `GHOST_CONST_XYZ` recent turns.\n",
      },
      expect: { messageIncludes: "has no declaration" },
      why: "arm 4: a backticked UPPER_SNAKE token resolves to no declaration — the REATTRIBUTE_WINDOW phantom-symbol class",
    },
    {
      files: {
        // The real-tree ANCHOR, planted so the exemption arms run at all (§4.5), plus a `.gitignore` that does
        // NOT name the absent-by-design path. Other stale-row findings ride along here by construction — this
        // row is matched on its MESSAGE, and the PASS half is un-provable in a mini-project (the anchor turns
        // every stale arm on), so it lives in tests/tooling/verify/gates/dangling-refs-absent-by-design.int.test.ts.
        "docs/architecture/core/AGENTS.md": "---\nkind: law\n---\n\nplanted anchor.\n",
        ".gitignore": "node_modules/\nreports/\n",
      },
      expect: { messageIncludes: "no longer named by a literal" },
      why: "arm 5 two-sidedness (#775): the ONLY thing making the path absent-by-design is its ignore rule — with the rule gone the row would forgive a REAL phantom, so it must red rather than keep skipping",
    },
    {
      files: {
        // The DERIVED corpus (#1036): a catalogued LIVING DESIGN home is inside arm 3, though it lives in
        // no hand-named scan directory. Without the catalog entry this doc is invisible to every arm.
        "docs/catalog/catalog.json":
          '{"documents":[{"path":"docs/design/__probe6.md","lane":"design","frontmatter":{"fields":{"status":"active"}},"receipt":{"authority":"design"}}]}\n',
        "docs/design/__probe6.md": "---\nkind: design\n---\n\nThe write boundary is `domain/__ghost_domain__/x.ts`.\n",
      },
      expect: { messageIncludes: "resolves to no file/dir" },
      why: "the derived corpus: a living design home (catalog authority `design` + status active) owes path-citation integrity, though it sits in no hand-named scan dir",
    },
    {
      files: {
        // LAW OUTSIDE docs/: the constitution's §7 index makes GATE-AUTHORING.md law, and the catalog
        // (tracked markdown under docs/) structurally cannot see it — so it is named literally and scanned.
        "tooling/src/verify/gates/GATE-AUTHORING.md": "---\nkind: law\n---\n\nThe controls live at `tests/tooling/__ghost_controls__.test.ts`.\n",
      },
      expect: { messageIncludes: "resolves to no file/dir" },
      why: "the founding #1036 defect: GATE-AUTHORING.md — the law every gate author reads — sat outside the net, and its cite rotted with nothing watching",
    },
    {
      files: {
        // §4.6 for the ONE hand-named member set: the anchor is planted, so a LAW_OUTSIDE_DOCS path that
        // resolves to nothing must RED rather than shrink the corpus in silence.
        "docs/architecture/core/AGENTS.md": "---\nkind: law\n---\n\nplanted anchor.\n",
      },
      expect: { messageIncludes: "named by LAW_OUTSIDE_DOCS" },
      why: "§4.6 blindness tripwire: a literally-named law doc that stops resolving is REPORTED, never silently dropped from the corpus",
    },
    {
      files: {
        // The other blindness half: a catalog that resolves ZERO living homes would silently return arms
        // 2-4 to the hand-named directories — a placebo with a healthy-looking file count.
        "docs/architecture/core/AGENTS.md": "---\nkind: law\n---\n\nplanted anchor.\n",
        "tooling/src/verify/gates/GATE-AUTHORING.md": "---\nkind: law\n---\n\nplanted.\n",
        "tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md": "---\nkind: law\n---\n\nplanted.\n",
        "docs/catalog/catalog.json":
          '{"documents":[{"path":"docs/history/x.md","lane":"history","frontmatter":{"fields":{"status":"active"}},"receipt":{"authority":"historical"}}]}\n',
      },
      expect: { messageIncludes: "resolved ZERO living law/design documents" },
      why: "the derived corpus must fail LOUD when its census comes back empty — a silently empty derivation is the blind-gate placebo, not a clean tree",
    },
    {
      files: {
        // THE NARROWED `dead` ESCAPE, CAUGHT SIDE (#2068, 2026-09-13). "a dead end" is a REACHABILITY
        // idiom about a code PATH; it asserts nothing about whether the symbol on the same line still
        // exists. Before the narrowing this line was rider-skipped whole and the phantom went unreported
        // — the real instance was `Core-Tooling-Law.md`'s `PROJECT_SITES` cite.
        "docs/architecture/core/__probe_dead_end.md": "---\nkind: law\n---\n\nA message navigating a reader to `GHOST_DEADEND_CONST` read as a dead end.\n",
      },
      expect: { messageIncludes: "has no declaration" },
      why: "the `dead` rider is narrowed to the DEAD-MACHINERY sense: the 'dead end' idiom must NOT escape a live phantom cite sharing its line",
    },
  ],
  mustPass: [
    {
      files: {
        // THE SAME NARROWING, ESCAPED SIDE — the DIRECTION control. `dead` in its machinery sense still
        // rides the rider convention, so the narrowing above cannot have widened into the real class.
        "docs/architecture/core/__probe_dead_sense.md": "---\nkind: law\n---\n\n`GHOST_DEAD_MACHINERY_CONST` is dead — the loader stopped reading it.\n",
      },
      why: "the `dead` rider's SURVIVING half: a deliberately-dead symbol named as history is still exempt structurally — the two rows pin the narrowing in both directions",
    },
    {
      // SELF-CONTAINED: every doc the passing gate-stub cites is PLANTED here — the conformance harness
      // materializes examples into a SYNTHETIC tree, so a cite of a real-tree doc would flag where it must pass.
      files: {
        // arm 1: the docRow names a planted bare doc; the message's `.md` token STRADDLES a `+` boundary and
        // must be joined before tokenizing (a per-fragment scan would false-flag the `-target.md` tail).
        "docs/architecture/core/__g_ref_a.md": "---\nkind: law\n---\n\nplanted.\n",
        "docs/architecture/core/__g_split-target.md": "---\nkind: law\n---\n\nplanted.\n",
        "tooling/src/verify/gates/__probe.ts":
          'export const gate = { name: "__probe", docRow: "__g_ref_a.md", message: "see (__g_split-" + "target.md §6b)" };\n',
      },
      why: "arm 1: a planted bare doc + a cite split across a string-concat boundary that JOINS to a planted doc — no false flag",
    },
    {
      // SELF-CONTAINED: the linked sibling is planted in this same example's tree.
      files: {
        "docs/architecture/core/__g_link-target.md": "---\nkind: law\n---\n\nplanted.\n",
        // arm 2: a real relative link (planted sibling) + a glob-pattern token (not a literal cite) both pass.
        "docs/architecture/core/__probe.md": "---\nkind: law\n---\n\nSee [target](__g_link-target.md) and the `UI-*.md` set.\n",
      },
      why: "arm 2: a link to a planted sibling resolves; a `UI-*.md` glob is a prose pattern, not a literal link — clean",
    },
    {
      // SELF-CONTAINED: the shorthand's resolved target is planted in this same example's tree.
      files: {
        "docs/architecture/core/__probe3.md": "---\nkind: law\n---\n\nSee `domain/__g_ok/x.ts` and `@orb/kit/__g_ok`.\n",
        "packages/server/src/domain/__g_ok/x.ts": "export const x = 1;\n",
        "packages/kit/src/__g_ok/index.ts": "export const y = 1;\n",
      },
      why: "arm 3: domain/ and @orb/kit/ shorthands whose resolved targets are planted — both resolve, no false flag",
    },
    {
      // SELF-CONTAINED: `@orb/tooling` is the ONE package NOT under packages/ — it is the root `tooling/`
      // tree above the cake. A `packages/`-hard-coded resolver read every core-doc mention as a phantom.
      files: {
        "docs/architecture/core/__probe3b.md": "---\nkind: law\n---\n\nSee `@orb/tooling` and `@orb/tooling/__g_ok`.\n",
        "tooling/src/__g_ok/index.ts": "export const z = 1;\n",
      },
      why: "arm 3: the @orb/tooling shorthand resolves against the ROOT tooling/ tree, not packages/tooling — no false flag",
    },
    {
      // SELF-CONTAINED: the const the doc cites is planted as a real declaration in the shared workspace.
      files: {
        "docs/architecture/core/__probe4.md": "---\nkind: law\n---\n\nSee `PLANTED_CONST`.\n",
        "packages/kit/src/__probe4.ts": "export const PLANTED_CONST = 1;\n",
      },
      why: "arm 4: an UPPER_SNAKE const resolves against a planted declaration — no false flag",
    },
    {
      // A rider line and struck-through text both name dead symbols/paths as deliberate history — structural
      // exemption, no allowlist row needed.
      files: {
        "docs/architecture/core/__probe5.md":
          "---\nkind: law\n---\n\n**BUILD-STATE RIDER:** `domain/__g_dead__/x.ts` and `GHOST_RIDER_CONST` are purged.\n\n~~`ANOTHER_GHOST_CONST`~~ struck as dead.\n",
      },
      why: "rider line + struck-through text: deliberately-dead path/symbol mentions must not red (structural skip, not an allowlist row)",
    },
    {
      // THE LINE-REF SUFFIX in every spelling the corpus writes (#1036). Arm 3 read only `core/`, which
      // cites bare paths, so the single-`:N` trimmer looked total; the review/design corpus cites evidence
      // by RANGE, and every one of those was a false positive the day the corpus widened.
      files: {
        "docs/architecture/core/__probe7.md":
          "---\nkind: law\n---\n\nSee `domain/__g_ok/x.ts:19`, `domain/__g_ok/x.ts:12-30`, `domain/__g_ok/x.ts:201,207`,\n`domain/__g_ok/x.ts:33-39,257-282`, `domain/__g_ok/x.ts:6/:18` and `domain/__g_ok/x.ts::readIt()`.\n",
        "packages/server/src/domain/__g_ok/x.ts": "export const x = 1;\n",
      },
      why: "arm 3's trimmer: a `path:line` suffix in ANY house spelling (single · range · comma list · multi-anchor · a `::pointer`) is trimmed before resolution — none of these is a phantom",
    },
    {
      // FROZEN EVIDENCE stays out by CLASS, not by directory (Documentation-Law.md §"Relocation &
      // retirement" step 5: a dated review or a history doc keeps the path that was true then).
      files: {
        "docs/catalog/catalog.json":
          '{"documents":[{"path":"docs/history/__probe8.md","lane":"history","frontmatter":{"fields":{"status":"active"}},"receipt":{"authority":"historical"}},{"path":"docs/design/__probe9.md","lane":"design","frontmatter":{"fields":{"status":"active"}},"receipt":{"authority":"design"}}]}\n',
        "docs/history/__probe8.md": "---\nkind: history\n---\n\nIt used to live at `domain/__ghost_domain__/x.ts`.\n",
        // …and arm 4 does NOT ride the design corpus: a design doc's UPPER_SNAKE cite is as often a name it
        // is PROPOSING as a live declaration, and arm 4's tuning is precision over recall.
        "docs/design/__probe9.md": "---\nkind: design\n---\n\nThe cap would be `GHOST_PROPOSED_CONST`.\n",
      },
      why: "frozen-evidence authorities are out of the corpus by class, and arm 4 stays LAW-only — a design doc naming a constant it proposes is not a phantom cite",
    },
  ],
};
