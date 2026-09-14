// Policy: dangling-refs — the hard half of the ghost-citation family.
// A descriptor docRow/message/fix cite and a Markdown link must resolve. The policy also owns the
// unsuppressible health of the derived living-doc corpus and the generated-path absent-by-design
// classification. Backticked repo-path and UPPER_SNAKE findings moved to the reviewed-grant sibling
// `dangling-ref-citations`; one descriptor cannot carry both hard and reviewed authority.
//
// The two policies share `lib/dangling-ref-corpus.ts` and `lib/dangling-ref-citations.ts`. The latter
// receives declaration-name nodes from the dispatcher; neither policy opens a private project or walks
// descendants. Authority rows and gate-family fixture strings are excluded from UPPER_SNAKE declaration
// evidence so a reviewed grant or its proof cannot manufacture the declaration that makes itself clean.
//
// The document corpora derive from docs/catalog/catalog.json. Active normative/current/operational homes
// and active design homes participate; parked design sets and frozen historical evidence do not. The two
// named law files outside docs are explicit because the catalog cannot derive them. Missing members and an
// empty derived catalog are hard blindness findings.
//
// ABSENT BY DESIGN (#775): packages/client/dist is generated and gitignored. Its classification is
// three-sided and checkout-independent: the doc must still cite the path, the justification doc must
// resolve, and a literal .gitignore rule must still name it. Presence after a local build cannot change the
// verdict.
//
// BINDING RESOLUTION (#2163): descriptor const aliases resolve through _shared/reference-fact.ts
// resolveStableExpression. Bare descriptor names resolve core, history, proposed, then repository root;
// Markdown links resolve relative to their own document first.
import { dirname, join, normalize } from "node:path";
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { resolveStableExpression } from "../../_shared/reference-fact.ts";
import type { GatePolicyContext, GatePolicyProof } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { PathStatusIndex } from "../lib/dangling-ref-citations.ts";
import { CORE_ANCHOR, scanPathCitations, shorthandCandidates } from "../lib/dangling-ref-citations.ts";
import type { DanglingRefCorpora } from "../lib/dangling-ref-corpus.ts";
import { CATALOG_REL, danglingRefCorpora, danglingRefTextIndex, GITIGNORED_ABSENT, LAW_OUTSIDE_DOCS } from "../lib/dangling-ref-corpus.ts";
import { finalDescriptorOf } from "../lib/policy-descriptor-read.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const GATES_DIR_REL = "tooling/src/verify/gates";
interface Violation {
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

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
function rootCandidates(ref: string): readonly string[] {
  if (NON_LITERAL_RE.test(ref) || ref === ".md") {
    return [];
  }
  if (ref.includes("/")) {
    return [ref, `docs/architecture/${ref}`];
  }
  return BARE_ROOTS.map((root) => (root === "." ? ref : `${root}/${ref}`));
}

/** Arm 2: a markdown link resolves relative to its OWN file first (standard markdown), then the bare roots. */
function linkCandidates(fromRel: string, ref: string): readonly string[] {
  if (ref.startsWith("http")) {
    return [];
  }
  const sibling = normalize(join(dirname(fromRel), ref));
  return [sibling, ...rootCandidates(ref)];
}

function resolvesAny(index: PathStatusIndex, selectors: readonly string[]): boolean {
  return selectors.length === 0 || selectors.some((selector) => index.get(selector) === "file" || index.get(selector) === "directory");
}

// ── arm 1: gate-descriptor docRow / message / fix ─────────────────────────────────────────────────────
const ARM1_MSG = (field: string, ref: string): string =>
  `gate descriptor's \`${field}\` names \`${ref}\` — no such doc resolves (bare names → core/ then history/ ` +
  "then proposed/ then repo root; explicit paths as written). A doc-path cite must land on a live doc, not " +
  "a ghost (the UNIFIED-VERIFICATION-DESIGN.md class). Repoint it to the real home.";

const DESCRIPTOR_FIELDS = ["docRow", "message", "fix"] as const;

interface DescriptorCite {
  readonly file: string;
  readonly field: string;
  readonly ref: string;
}

/** The `*.md` cites of ONE descriptor field (its evaluated string value, tokenized). */
function fieldCites(obj: Node, field: string, gateRel: string): readonly DescriptorCite[] {
  const prop = Node.isObjectLiteralExpression(obj) ? obj.getProperty(field) : undefined;
  const init = prop !== undefined && Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
  if (init === undefined) {
    return [];
  }
  return mdTokens(evalString(init, new Set())).map((ref) => ({ file: gateRel, field, ref }));
}

function descriptorCites(sourceFile: SourceFile): readonly DescriptorCite[] {
  const rel = sourceFile.getFilePath().replaceAll("\\", "/");
  const marker = `${GATES_DIR_REL}/`;
  const offset = rel.lastIndexOf(marker);
  if (offset === -1) {
    return [];
  }
  const gateRel = rel.slice(offset);
  const legacy = sourceFile.getVariableDeclaration("gate")?.getInitializer()?.asKind(SyntaxKind.ObjectLiteralExpression);
  const descriptor = finalDescriptorOf(sourceFile) ?? legacy;
  if (descriptor === undefined) {
    return [];
  }
  return DESCRIPTOR_FIELDS.flatMap((field) => fieldCites(descriptor, field, gateRel));
}

// ── arm 2: markdown links ─────────────────────────────────────────────────────────────────────────────
// history/** is EXEMPT as a scan SOURCE (archaeology cites the dead); a link INTO history from here resolves.
const ARM2_MSG = (ref: string): string =>
  `markdown link \`(${ref})\` resolves to no file (relative to this doc, then core/ history/ proposed/ ` +
  "root). A dead doc link is drift — repoint it to the real home or delete the link.";

const BLIND_CATALOG_MSG =
  `the doc-catalog census (${CATALOG_REL}) resolved ZERO living law/design documents, so arms 2-4 would judge only the ` +
  "hand-named directories — the blindness this gate's derived corpus exists to prevent (GATE-AUTHORING.md §4.6). Re-run " +
  "`pnpm doc-catalog:write`, or fix the class rule in tooling/src/verify/gates/dangling-refs.ts `catalogued`.";

const LAW_OUTSIDE_MISSING_MSG = (rel: string): string =>
  `\`${rel}\` is named by LAW_OUTSIDE_DOCS in tooling/src/verify/gates/dangling-refs.ts (law the constitution's §7 index ` +
  "cites, living outside docs/ where the catalog cannot see it) and no longer resolves — the widened corpus lost a member " +
  "silently. Repoint the constant to the doc's new home, or delete the row if the doc is gone.";

interface LinkCite {
  readonly file: string;
  readonly ref: string;
}

function docLinkCites(textByPath: ReadonlyMap<string, string>, files: readonly string[]): readonly LinkCite[] {
  const out: LinkCite[] = [];
  for (const rel of files) {
    const src = textByPath.get(rel) ?? "";
    const seen = new Set<string>();
    for (const m of src.matchAll(MD_LINK_RE)) {
      const ref = m[1];
      if (ref === undefined || seen.has(ref)) {
        continue;
      }
      seen.add(ref);
      out.push({ file: rel, ref });
    }
  }
  return out;
}

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
const GITIGNORE_REL = ".gitignore";

/** Is `path` named by a literal `.gitignore` rule? Read literally — a rule this reader cannot prove is a
 *  MISSING justification, never an assumed one, so the row reds rather than passing on a guess.
 *  TWO literal shapes, both straight out of gitignore's own grammar: the whole path (anchored or not), and
 *  a rule carrying NO slash, which matches a basename AT ANY DEPTH (`dist/` names `packages/client/dist`).
 *  A root-anchored `/dist/` is deliberately NOT accepted for a nested path — it does not name it. */
function gitignoredLiterally(gitignore: string, path: string): boolean {
  const basename = path.split("/").pop() ?? path;
  const wanted = new Set([path, `${path}/`, `/${path}`, `/${path}/`, basename, `${basename}/`]);
  return gitignore
    .split("\n")
    .map((line) => line.trim())
    .some((line) => wanted.has(line));
}

const UNGITIGNORED_MSG = (key: string): string =>
  `absent-by-design row \`${key}\` is no longer named by a literal ${GITIGNORE_REL} rule — the ONLY thing that made ` +
  "its absence by design is gone, so the row now forgives a real phantom. Delete the row from GITIGNORED_ABSENT in " +
  "tooling/src/verify/lib/dangling-ref-corpus.ts, or restore the ignore rule. See tooling/src/verify/gates/GATE-AUTHORING.md §4.4.";

const DEAD_CITE_MSG = (key: string): string =>
  `absent-by-design row \`${key}\`'s cite no longer resolves — the doc that justified the exemption moved or was ` +
  "deleted. Re-derive the cite, or delete the row from GITIGNORED_ABSENT in tooling/src/verify/lib/dangling-ref-corpus.ts.";

const UNREFERENCED_MSG = (key: string): string =>
  `absent-by-design row \`${key}\` matches no live backtick path-cite in any core doc — the exemption forgives a ` +
  "reference that no longer exists, so it is stale dead-weight. Delete the row from GITIGNORED_ABSENT in " +
  "tooling/src/verify/lib/dangling-ref-corpus.ts (this is the resolution-agnostic 'docs stopped referencing it' side, " +
  "computed off referencedRefs rather than the phantom stale arm so it holds on both a present and an absent checkout).";

/** The three-sided liveness check for the ABSENT-BY-DESIGN rows (#775) — ALL sides env-independent. `referenced`
 *  is every path-shaped backtick cite in the core corpus (resolved OR not), so the "docs stopped referencing it"
 *  side is a property of the committed docs, never of whether the gitignored subtree is checked out here. */
function absentByDesignViolations(gitignore: string, paths: PathStatusIndex, referenced: ReadonlySet<string>): Violation[] {
  const out: Violation[] = [];
  for (const [key, row] of Object.entries(GITIGNORED_ABSENT)) {
    if (!gitignoredLiterally(gitignore, key)) {
      out.push({ file: GITIGNORE_REL, line: 0, message: UNGITIGNORED_MSG(key) });
    }
    if (!resolvesAny(paths, [row.cite])) {
      out.push({ file: CORE_ANCHOR, line: 0, message: DEAD_CITE_MSG(key) });
    }
    if (!referenced.has(key)) {
      out.push({ file: CORE_ANCHOR, line: 0, message: UNREFERENCED_MSG(key) });
    }
  }
  return out;
}

function statusIndex(ctx: GatePolicyContext, selectors: readonly string[]): PathStatusIndex {
  const demanded = [...new Set(selectors)];
  const identities = readyResourceValue(ctx.resources.authoredPaths(demanded.length > 0 ? demanded : [CATALOG_REL])).identities;
  return new Map(identities.map((identity) => [identity.selector, identity.status]));
}

interface CarriedProof {
  readonly files: Readonly<Record<string, string>>;
  readonly expect?: GatePolicyProof["expect"];
  readonly why: string;
}

const PROOF_DOC = "docs/architecture/core/__dangling_refs_resource_anchor.md";
const PROOF_FILES = {
  [PROOF_DOC]: "---\nkind: law\n---\n\nResource proof anchor.\n",
  [CATALOG_REL]:
    '{"documents":[{"path":"docs/architecture/core/__dangling_refs_resource_anchor.md","lane":"core","frontmatter":{"fields":{"status":"active"}},"receipt":{"authority":"normative"}}]}\n',
  [GITIGNORE_REL]: "dist/\n",
  "packages/kit/src/__dangling_refs_resource_anchor.ts": "export const DANGLING_REFS_RESOURCE_ANCHOR = true;\n",
  "tooling/src/__dangling_refs_resource_anchor.ts": "export const danglingRefsResourceAnchor = true;\n",
} as const;

function resourceProof(proof: CarriedProof): GatePolicyProof {
  return {
    mode: "resource",
    files: { ...PROOF_FILES, ...proof.files },
    ...(proof.expect === undefined ? {} : { expect: proof.expect }),
    why: proof.why,
  };
}

function reportViolations(ctx: GatePolicyContext, violations: readonly Violation[]): void {
  for (const violation of violations) {
    ctx.report.file(violation.file, { line: Math.max(1, violation.line), column: 1, message: violation.message });
  }
}

function receiptPopulation(ctx: GatePolicyContext, source: string, members: number): void {
  if (members > 0) {
    ctx.receipt({ kind: "population", source, members });
  }
}

function referenceViolations(descriptors: readonly DescriptorCite[], links: readonly LinkCite[], paths: PathStatusIndex): readonly Violation[] {
  const descriptorViolations = descriptors
    .filter(({ ref }) => !resolvesAny(paths, rootCandidates(ref)))
    .map(({ file, field, ref }) => ({ file, line: 0, message: ARM1_MSG(field, ref) }));
  const linkViolations = links
    .filter(({ file, ref }) => !resolvesAny(paths, linkCandidates(file, ref)))
    .map(({ file, ref }) => ({ file, line: 0, message: ARM2_MSG(ref) }));
  return [...descriptorViolations, ...linkViolations];
}

interface LivenessInputs {
  readonly docs: DanglingRefCorpora;
  readonly referencedRefs: ReadonlySet<string>;
  readonly gitignore: string;
  readonly paths: PathStatusIndex;
}

function livenessViolations({ docs, referencedRefs, gitignore, paths }: LivenessInputs): readonly Violation[] {
  return [
    ...absentByDesignViolations(gitignore, paths, referencedRefs),
    ...docs.lawOutsideDocsMissing.map((rel) => ({ file: CORE_ANCHOR, line: 0, message: LAW_OUTSIDE_MISSING_MSG(rel) })),
    ...(docs.catalogued === 0 ? [{ file: CATALOG_REL, line: 0, message: BLIND_CATALOG_MSG }] : []),
  ];
}

function evaluateDanglingRefs(ctx: GatePolicyContext, descriptorRefs: readonly DescriptorCite[]): void {
  const documentFacts = readyResourceValue(ctx.resources.documents());
  const catalog = readyResourceValue(ctx.resources.json("doc-catalog"));
  const toolingEntries = readyResourceValue(ctx.resources.authoredTree("tooling"));
  const outsidePaths = LAW_OUTSIDE_DOCS.filter((path) => toolingEntries.some((entry) => entry.kind === "file" && entry.path === path));
  const outsideText = readyResourceValue(ctx.resources.authoredText(outsidePaths.length > 0 ? outsidePaths : [CATALOG_REL]));
  const texts = danglingRefTextIndex(documentFacts, outsideText);
  const docPaths = documentFacts.documents.map((document) => document.path);
  const docs = danglingRefCorpora(catalog.value, docPaths, outsidePaths);
  const links = docLinkCites(texts, docs.links);
  const arm3 = scanPathCitations(texts, docs.audit);
  const selectors = [
    ...descriptorRefs.flatMap(({ ref }) => rootCandidates(ref)),
    ...links.flatMap(({ file, ref }) => linkCandidates(file, ref)),
    ...arm3.cites.flatMap(({ ref }) => shorthandCandidates(ref)),
    ...Object.values(GITIGNORED_ABSENT).map(({ cite }) => cite),
  ];
  const paths = statusIndex(ctx, selectors);
  reportViolations(ctx, referenceViolations(descriptorRefs, links, paths));
  const gitignore = readyResourceValue(ctx.resources.exactFiles(["gitignore"])).get("gitignore");
  if (gitignore === undefined) {
    throw new Error("exact gitignore resource returned no gitignore member");
  }
  if (docPaths.includes(CORE_ANCHOR)) {
    reportViolations(
      ctx,
      livenessViolations({
        docs,
        referencedRefs: arm3.referencedRefs,
        gitignore: gitignore.text,
        paths,
      }),
    );
  }
  receiptPopulation(ctx, "citation-corpus:law", docs.law);
  receiptPopulation(ctx, "citation-corpus:design", docs.design);
  receiptPopulation(ctx, "citation-corpus:law-outside-docs", docs.lawOutsideDocs);
}

export const gate = defineGate({
  id: "dangling-refs",
  family: "dangling-refs",
  authority: "hard",
  severity: "error",
  population: ["@authored", "@showcase"],
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [
    { kind: "documents" },
    { kind: "json", id: "doc-catalog" },
    { kind: "authored-tree", id: "tooling" },
    { kind: "authored-text" },
    { kind: "authored-path" },
    { kind: "exact-file", id: "gitignore" },
  ],
  message:
    "a doc-path pointer leads nowhere — a gate descriptor's docRow/message/fix names a `*.md` that resolves " +
    "to no file, or a markdown link in the LINK corpus targets a missing doc. The derived corpus, its named " +
    "law outside docs, and the generated-path absent-by-design classification are hard health arms. Corpora are DERIVED " +
    "from docs/catalog/catalog.json — every LIVING home (status active + a law or design authority), plus " +
    "the law markdown outside docs/ (tooling/src/verify/gates/GATE-AUTHORING.md, " +
    "tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md); frozen history, dated reviews " +
    "and the parked design sets are out by class. The `dangling-ref-citations` sibling owns grantable backticked path/symbol findings. " +
    "See Core-Enforcement-Active-Gates.md.",
  fix: "repoint the descriptor or link to the doc's real home, repair the derived corpus/classification input, or delete a dead link; never delete surrounding prose.",
  create: (ctx) => {
    const descriptorRefs: DescriptorCite[] = [];
    return {
      visitFile: (sourceFile) => {
        descriptorRefs.push(...descriptorCites(sourceFile));
      },
      evaluate: () => evaluateDanglingRefs(ctx, descriptorRefs),
    };
  },
  mustFlag: [
    {
      mode: "resource" as const,
      files: {
        ...PROOF_FILES,
        // arm 1: a docRow naming a doc that resolves against NO root — the ghost-cite the gate exists to catch.
        "tooling/src/verify/gates/__probe.ts": 'export const gate = { name: "__probe", docRow: "GHOST-DOC-THAT-DOES-NOT-EXIST.md", message: "x" };\n',
      },
      expect: { count: 1, messageIncludes: "resolves" },
      why: "arm 1: a gate docRow names a doc under no resolution root — the UNIFIED-VERIFICATION ghost class",
    },
    {
      mode: "resource" as const,
      files: {
        ...PROOF_FILES,
        // arm 2: a markdown LINK in a core doc pointing at a missing sibling.
        "docs/architecture/core/__probe.md": "---\nkind: law\n---\n\nSee [the ghost](ghost-sibling-xyz.md).\n",
      },
      expect: { count: 1, messageIncludes: "resolves to no file" },
      why: "arm 2: a markdown link in core/ targets a doc that resolves nowhere — a dead navigational pointer",
    },
    {
      mode: "resource" as const,
      files: {
        ...PROOF_FILES,
        // The real-tree ANCHOR, planted so the exemption arms run at all (§4.5), plus a `.gitignore` that does
        // NOT name the absent-by-design path. Other stale-row findings ride along here by construction — this
        // row is matched on its MESSAGE, and the PASS half is un-provable in a mini-project (the anchor turns
        // every stale arm on), so it lives in tests/tooling/verify/gates/dangling-refs-absent-by-design.int.test.ts.
        "docs/architecture/core/AGENTS.md": "---\nkind: law\n---\n\nplanted anchor.\n",
        ".gitignore": "node_modules/\nreports/\n",
      },
      expect: { count: 5, messageIncludes: "no longer named by a literal" },
      why: "arm 5 two-sidedness (#775): the ONLY thing making the path absent-by-design is its ignore rule — with the rule gone the row would forgive a REAL phantom, so it must red rather than keep skipping",
    },
    {
      mode: "resource" as const,
      files: {
        ...PROOF_FILES,
        // §4.6 for the ONE hand-named member set: the anchor is planted, so a LAW_OUTSIDE_DOCS path that
        // resolves to nothing must RED rather than shrink the corpus in silence.
        "docs/architecture/core/AGENTS.md": "---\nkind: law\n---\n\nplanted anchor.\n",
      },
      expect: { count: 4, messageIncludes: "named by LAW_OUTSIDE_DOCS" },
      why: "§4.6 blindness tripwire: a literally-named law doc that stops resolving is REPORTED, never silently dropped from the corpus",
    },
    {
      mode: "resource" as const,
      files: {
        ...PROOF_FILES,
        // The other blindness half: a catalog that resolves ZERO living homes would silently return arms
        // 2-4 to the hand-named directories — a placebo with a healthy-looking file count.
        "docs/architecture/core/AGENTS.md": "---\nkind: law\n---\n\nplanted anchor.\n",
        "tooling/src/verify/gates/GATE-AUTHORING.md": "---\nkind: law\n---\n\nplanted.\n",
        "tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md": "---\nkind: law\n---\n\nplanted.\n",
        "docs/catalog/catalog.json":
          '{"documents":[{"path":"docs/history/x.md","lane":"history","frontmatter":{"fields":{"status":"active"}},"receipt":{"authority":"historical"}}]}\n',
      },
      expect: { count: 3, messageIncludes: "resolved ZERO living law/design documents" },
      why: "the derived corpus must fail LOUD when its census comes back empty — a silently empty derivation is the blind-gate placebo, not a clean tree",
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
  ].map(resourceProof),
});
