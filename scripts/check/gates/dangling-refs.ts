// Gate: dangling-refs (UNIFIED-VERIFICATION-DESIGN.md — the ghost-cite class) — a doc-PATH pointer that
// leads nowhere is drift the amnesiac reader can't tell from a real home. Four arms:
//   arm 1 — every gate descriptor's docRow/message/fix string that names a `*.md` path must resolve to a
//           real file (the UNIFIED-VERIFICATION ghost — cited by four sites, never committed — was this class).
//   arm 2 — every markdown LINK `[text](x.md)` in docs/architecture/{core,proposed}/**/*.md must resolve.
//   arm 3 — 2026-08-03 core-docs truth audit: every backticked token in docs/architecture/core/**/*.md that
//           PARSES AS A REPO PATH (a known-prefix shorthand — packages/·docs/·scripts/·tests/·domain/·
//           entry/·infra/·transport/·foundation/·kit/·@orb/<pkg>) must resolve on disk. Unresolvable shapes
//           (no recognized prefix, a `<placeholder>`/glob) skip — never guessed. Two-sided allowlist.
//   arm 4 — same audit: a backticked STRICT UPPER_SNAKE token (`[A-Z][A-Z0-9]*(_[A-Z0-9]+)+` — ≥1
//           underscore, no lowercase) must resolve in the shared ts-morph project's declaration-name index
//           (packages/*/src + tests + gate corpus). Precision over recall (err quiet): a bare single
//           ALL-CAPS word (prose emphasis / this gate corpus's own exemption vocabulary) and a bare
//           `name()` call-cite were both tried and DROPPED — a self-proof pass found zero true positives
//           against React/Vite/CSS builtins and generic verb names (`use()`/`serve()`/`oklch()`) dominating
//           the candidate set. A whole LINE containing "rider" (the corpus's rider-block convention:
//           `BUILD-STATE RIDER`, `truth-audit rider`, …) or text inside `~~struck~~` is exempt structurally
//           — deliberately-dead symbols documented as history must not red. Two-sided allowlist.
// Arms 3/4 are DOC-PATHS-ONLY siblings of arms 1/2, scoped to docs/architecture/core/** only (the law corpus;
// proposed/ and history/ legitimately name dead code in prose). Both carry a two-sided allowlist (`why`
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
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor, GateRunCtx } from "../contract.ts";
import type { Violation } from "../harness.ts";

const GATES_DIR_REL = "scripts/check/gates";
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
  for (const def of n.getDefinitionNodes()) {
    const init = Node.isVariableDeclaration(def) ? def.getInitializer() : undefined;
    if (init !== undefined) {
      return evalString(init, seen);
    }
  }
  return GAP;
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

// ── arm 2: markdown links in core/ + proposed/ ────────────────────────────────────────────────────────
// history/** is EXEMPT as a scan SOURCE (archaeology cites the dead); a link INTO history from here resolves.
const SCAN_DIRS: readonly string[] = ["docs/architecture/core", "docs/architecture/proposed"];
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

/** The markdown corpus arms 2–4 read. Returned to the caller so the gate can DECLARE its scan denominator:
 *  this gate's units are docs on disk, and the harness — which only sees the ts-morph workspace — would
 *  otherwise report a file count it never read (pass.ts `GateScan`). */
function docCorpus(root: string): readonly string[] {
  const files: string[] = [];
  for (const dir of SCAN_DIRS) {
    if (existsSync(join(root, dir))) {
      walkMd(root, dir, files);
    }
  }
  return files;
}

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

// ── arm 3: backticked-PATH existence in docs/architecture/core/**/*.md ────────────────────────────────
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
const RIDER_LINE_RE = /rider|truth[- ]audit|purged|\bdead\b|\bdied\b|the (former|old) `|\bnot an? `|there is no `/iu;
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

// Trailing-token trim components (top-level per biome's useTopLevelRegex — a per-call literal re-compiles).
const TRIM_ANCHOR_RE = /#[^)\s]*$/u;
const TRIM_LINEREF_RE = /:\d+$/u;
const TRIM_PUNCT_RE = /[:.,;)]+$/u;
const TRIM_CROSSREF_RE = /::[A-Za-z_][A-Za-z0-9_]*(\(\))?$/u;

/** Strip trailing prose punctuation / line-ref / anchor a backtick token commonly carries in these docs.
 *  The corpus's `path::Symbol` cross-reference idiom (`entry/compose/chat.ts::activePersonaIdFor`) is a
 *  PATH plus a code-pointer suffix — arm 3 only owns the path half, so strip a trailing `::Name`. */
function trimPathToken(raw: string): string {
  const base = raw.trim().replace(TRIM_ANCHOR_RE, "").replace(TRIM_LINEREF_RE, "").replace(TRIM_PUNCT_RE, "");
  return base.replace(TRIM_CROSSREF_RE, "");
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
      return `packages/${rest}`;
    }
    return `packages/${rest.slice(0, slash)}/src/${rest.slice(slash + 1)}`;
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
  walkBasenames(join(root, "packages", pkg, "src"), out);
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
  `backticked path \`${ref}\` in a core doc resolves to no file/dir on disk (shorthand: domain·entry·infra·` +
  "transport·foundation → packages/server/src/…; kit/<x> → packages/kit/src/<x>; @orb/<pkg>/<mod> → " +
  "packages/<pkg>/src/<mod>). A phantom path is drift the amnesiac reader can't tell from a real home — " +
  "repoint it or delete the mention.";

/** Mask `~~struck~~` spans (same length, blanked) so backticks purely inside deliberately-struck prose never
 *  yield a token — struck content is the corpus's other dead-mention convention (alongside rider lines). */
function maskStrikethrough(line: string): string {
  return line.replace(STRIKETHROUGH_RE, (m) => " ".repeat(m.length));
}

/** Every core doc's relative path, in a stable order. */
function listCoreDocs(root: string): readonly string[] {
  if (!existsSync(join(root, ARM34_SCAN_DIR))) {
    return [];
  }
  return readdirSync(join(root, ARM34_SCAN_DIR))
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => `${ARM34_SCAN_DIR}/${f}`);
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
      return pathExists(root, `packages/${rest}`);
    }
    const pkg = rest.slice(0, slash);
    const mod = rest.slice(slash + 1);
    return orbPkgModExists(root, `packages/${pkg}/src/${mod}`, pkg, mod);
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
type PathLineArgs = {
  readonly root: string;
  readonly rel: string;
  readonly rawLine: string;
  readonly lineNo: number;
  readonly allow: ExemptionTable;
  readonly hitRefs: Set<string>;
};

function pathTokensInLine({ root, rel, rawLine, lineNo, allow, hitRefs }: PathLineArgs): Violation[] {
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

function scanPathTokens(root: string, allow: ExemptionTable): { readonly violations: Violation[]; readonly hitRefs: Set<string> } {
  const violations: Violation[] = [];
  const hitRefs = new Set<string>();
  for (const rel of listCoreDocs(root)) {
    const lines = readFileSync(join(root, rel), "utf8").split("\n");
    if (hasHeadRider(lines)) {
      continue; // the whole doc is declared historical/frozen — every mention below is covered by it
    }
    lines.forEach((rawLine, i) => {
      violations.push(...pathTokensInLine({ root, rel, rawLine, lineNo: i + 1, allow, hitRefs }));
    });
  }
  return { violations, hitRefs };
}

// ── arm 4: backticked-SYMBOL existence in docs/architecture/core/**/*.md ──────────────────────────────
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
 *  complexity cap. The gate corpus (scripts/check/gates/**) routinely cites a DEAD name as a mustFlag/
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
  `backticked symbol \`${ref}\` in a core doc has no declaration anywhere in the workspace (packages/*/src, ` +
  "tests/, the gate corpus). A phantom symbol cite is drift — repoint it to the real name, or strike/rider " +
  "it as deliberate history if the code is gone.";

/** One line's symbol-token findings (arm 4) — split out of `scanSymbolTokens` to stay under the complexity
 *  cap. */
type SymbolLineArgs = {
  readonly rel: string;
  readonly rawLine: string;
  readonly lineNo: number;
  readonly index: ReadonlySet<string>;
  readonly allow: ExemptionTable;
  readonly hitRefs: Set<string>;
};

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

function scanSymbolTokens(root: string, ctx: GateRunCtx, allow: ExemptionTable): { readonly violations: Violation[]; readonly hitRefs: Set<string> } {
  const index = declaredNameIndex(ctx);
  const violations: Violation[] = [];
  const hitRefs = new Set<string>();
  for (const rel of listCoreDocs(root)) {
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
  "domain/hub": { why: CERD_WHY },
  "domain/roster-preset": { why: CERD_WHY },
  "infra/network/hubs/": { why: CERD_WHY },
  "domain/buddy": { why: CERD_WHY },
  "transport/trpc/buddy-bus.ts": { why: CERD_WHY },
};
const ARM4_ALLOW: ExemptionTable = {
  CT_SWEEP_TRIGGERS: {
    why: "declared in `scripts/verify/selection.ts` (UNIFIED-VERIFICATION-DESIGN.md), outside the gate harness workspace (packages/*/src, tests/, scripts/check/gates/ only). Ends if arm 4's index widens to all of scripts/.",
  },
  SQLITE_BUSY: {
    why: "Tier-1-DB.md cites SQLite's own C-API error code name (`sqlite3_busy_timeout`), never a repo-declared symbol. Ends if this ever becomes a repo-defined constant.",
  },
  SERIAL_INT: {
    why: "declared in the repo-root `vitest.config.ts` (Spine-Testing.md), outside the gate harness workspace (packages/*/src, tests/, scripts/check/gates/ only). Ends if arm 4's index widens to root config files.",
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

const STALE_ROW_MSG = (arm: string, key: string): string =>
  `${arm} allowlist row \`${key}\` matches no live phantom — stale entry, delete it ` +
  "(GATE-AUTHORING.md's exemption grammar: every exemption is two-sided).";

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
    "to no file, a markdown link in docs/architecture/{core,proposed}/**/*.md targets a missing doc, a " +
    "backticked path in docs/architecture/core/**/*.md resolves to no file/dir, or a backticked UPPER_SNAKE/" +
    "PascalCase-tailed/`name()` symbol in a core doc has no declaration in the workspace. A ghost cite is " +
    "drift the reader can't distinguish from a real home. Rider lines and `~~struck~~` text are exempt " +
    "structurally (deliberate history). See Core-Enforcement-Active-Gates.md.",
  fix: "repoint the cite to the doc's real home (bare names resolve against core/ then history/ then proposed/ then repo root; a markdown link resolves relative to its own file first; a backtick path/symbol repoints to the live name or rewords as history), or delete a dead link; never delete surrounding prose.",
  run: (ctx) => {
    const docs = docCorpus(ctx.root);
    // This gate reads DOCS off disk, not the shared ts-morph fileset — so it declares its own denominator.
    // Left undeclared, its scan-health row would carry the workspace file count (a number it never read)
    // and the zero-scan alarm could not tell a real blindness from a gate that scans no `.ts` at all.
    ctx.scan({ unit: "doc", scanned: docs.length });
    for (const v of [...scanGateDescriptors(ctx.root), ...scanDocLinks(ctx.root, docs)]) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
    const arm3 = scanPathTokens(ctx.root, ARM3_ALLOW);
    const arm4 = scanSymbolTokens(ctx.root, ctx, ARM4_ALLOW);
    for (const v of [...arm3.violations, ...arm4.violations]) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
    // A real-tree anchor (never touched by any example below), not a `scope.kind` check — GATE-AUTHORING.md
    // §"the exemption grammar" rule 5: `scope.kind === "project"` is also true inside conformance's synthetic
    // mini-projects, which would fire a stale-arm there and red the gate's own self-proof.
    if (existsSync(join(ctx.root, "docs/architecture/core/AGENTS.md"))) {
      for (const v of [
        ...staleAllowlistViolations("arm 3 path", ARM3_ALLOW, arm3.hitRefs),
        ...staleAllowlistViolations("arm 4 symbol", ARM4_ALLOW, arm4.hitRefs),
      ]) {
        ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
      }
    }
  },
  mustFlag: [
    {
      files: {
        // arm 1: a docRow naming a doc that resolves against NO root — the ghost-cite the gate exists to catch.
        "scripts/check/gates/__probe.ts": 'export const gate = { name: "__probe", docRow: "GHOST-DOC-THAT-DOES-NOT-EXIST.md", message: "x" };\n',
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
  ],
  mustPass: [
    {
      // SELF-CONTAINED: every doc the passing gate-stub cites is PLANTED here — the conformance harness
      // materializes examples into a SYNTHETIC tree, so a cite of a real-tree doc would flag where it must pass.
      files: {
        // arm 1: the docRow names a planted bare doc; the message's `.md` token STRADDLES a `+` boundary and
        // must be joined before tokenizing (a per-fragment scan would false-flag the `-target.md` tail).
        "docs/architecture/core/__g_ref_a.md": "---\nkind: law\n---\n\nplanted.\n",
        "docs/architecture/core/__g_split-target.md": "---\nkind: law\n---\n\nplanted.\n",
        "scripts/check/gates/__probe.ts": 'export const gate = { name: "__probe", docRow: "__g_ref_a.md", message: "see (__g_split-" + "target.md §6b)" };\n',
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
  ],
};
