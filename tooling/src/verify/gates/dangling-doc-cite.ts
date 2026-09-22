// Gate: dangling-doc-cite (#873) — a source COMMENT naming a `docs/**.md` that does not exist. Code DOES
// cite docs (Documentation-Law.md §Relocation & retirement, amended 2026-08-30: ~250 comment sites), so a
// doc move that skips the citer sweep leaves a pointer to nowhere — the exact lie the previous archival
// pass left in eight comments. COMMENTS-INTENDED: comments ARE the subject, and scoping to them is what
// keeps a gate/test FIXTURE STRING (a deliberately-absent doc path inside a proof map) out of scope with
// no exemption grammar at all. This header may not spell a live example path — the gate would flag itself.
//
// FAMILY: `text-citation`, the shared reader `lib/text-cite-scan.ts#scanTextCitations`, with
// `d-citation-integrity` and `pd-citation-integrity`. All three scan RAW TEXT and need the same
// offset→authored-position answer; this module is the one whose text is COMMENT text on both sides.
//
// POPULATION PORT (legacy SHA `1f5e25c00`, verified byte-identical to HEAD at conversion). Arm A walked
// `ctx.files` — the harness corpus, `_shared/ts-workspace.ts#harnessGlobs` — which is `@authored` plus
// shipped `packages/showcase-plugins` and default content, now members of `@authored`. The st-goldens
// captured runtime needs no `notUnder`: it is excluded from the PROJECT, and
// a policy's candidates are the project's own files (`lib/policy-pass.ts:402`).
//
// ONE INVENTORY, THE GIT INDEX, FOR BOTH HALVES — A DELIBERATE AND STATED DELTA. The legacy descriptor
// asked the FILESYSTEM twice: `readdirSync(root)` plus a `packages/*/public` walk for arm B's fileset,
// and `existsSync(join(root, ref))` for whether a cited doc is there. A final policy has no filesystem,
// so both become `trackedFiles()` — still DERIVED from the tree and never a path list (a hardcoded file
// constant dies silently on rename), but the inventory is now `git ls-files` rather than disk. Two
// consequences, both stated rather than discovered later: an UNTRACKED root config or public asset leaves
// the citer corpus, and an UNTRACKED doc no longer satisfies a cite. Both are the correct boundary — an
// untracked file is not part of the repository a doc move has to sweep — and the delta is EMPTY today:
// `git ls-files --others --exclude-standard -- docs` returns 0 at the conversion commit. It is also the
// only repo-wide inventory a resource policy can declare (`authored-tree` has no repo-ROOT id, and
// `static-config`'s closed five ids are exactly the hardcoded list this derivation exists to avoid).
// The `authored-path` identity door was weighed and NOT taken: it would answer `outside` for an in-repo
// symlink escaping the checkout — a verdict `existsSync` could never give — but it is a DEMAND door whose
// declaration is consumed only when the corpus happens to carry a cite, so a corpus with no doc cite at
// all would refuse the whole policy for an unconsumed request. One inventory, two questions, no door that
// can go unconsumed.
//
// AUTHORITY IS `hard`, AND THAT IS A MEASURED RUNTIME FACT RATHER THAN A PREFERENCE. Two independent
// reasons, either sufficient:
//   1. Every finding this policy makes is INSIDE A COMMENT — that is its whole subject — and
//      `lib/ordinary-waiver.ts#locateFinding` refuses an ordinary finding whose token does not survive
//      comment blanking (*"points into comment trivia rather than authored code"*, measured 2026-09-12
//      across this family). So no ordinary door exists, and a policy has ONE authority.
//   2. `tracked-files` publishes the WHOLE repository inventory as this policy's resource population, and
//      an ORDINARY owner's waiver-carrier demand covers every one of those paths
//      (`lib/policy-pass.ts#ordinaryWaiverAcquisition`). `.codex/agent-doctrine.md` is a TRACKED SYMLINK
//      with a Markdown waiver format, and the authored reader refuses a symlink by design, so an ordinary
//      spelling would file a standing carrier refusal on every run. Guide §12.4 states this hazard for
//      `native-config` and records that both shipped consumers of a whole-inventory kind are `hard`.
// The legacy runtime did bind a line-adjacent `@orb-gate-ignore` to arm A's comment-resident findings
// (`lib/pass.ts#findingSuppressedAt`) and could never bind one in arm B at all (no SourceFile). The
// conversion loses the arm-A half of that half-door and says so rather than shipping a door that alarms
// on first use. The loss is empty in practice: the legacy `ALLOW` table was armed EMPTY at mint (its four
// real lies were FIXED in the authoring lane, never parked) and the tree carries ZERO
// `@orb-gate-ignore dangling-doc-cite` markers, measured repo-wide at the conversion commit — so the
// marker reconciliation closes at 0 legacy = 0 waives = 0 dead, and the table and its two-sided stale arm
// are DELETED rather than re-homed. A gate-owned exemption table is forbidden behind `defineGate`
// (guide §2); if a deliberate absent-doc cite ever appears, the answer is to fix the comment.
//
// WHERE A BROKEN RESOURCE REFUSES — not here. A declared resource that comes back
// missing/empty/unresolved/malformed makes `resolveResourceDeclarations` (`lib/resource-declaration.ts`)
// THROW during the POPULATION phase and the receipt phase withholds every consumer, both before
// `create`/`evaluate` run (guide §3's acquisition-refusal rule, `docs/design/resource-policy-contract.md` §4). This module
// owns no not-ready branch. The refusal pins are in
// `tests/tooling/verify/gates/text-citation-family.suite.test.ts`.
//
// TWO IN-POLICY REFUSALS, BOTH TOOL ERRORS RATHER THAN FINDINGS, BECAUSE BOTH MEAN "I COULD NOT JUDGE".
// (1) A demanded arm-B member the text door will not serve. (2) A tracked inventory from which the
// root-config + public-asset derivation resolves zero members. The family `runPolicyPass` controls retain
// the complete runtime outcome beyond refusal-text matching: no effective findings, an exact policy/phase/
// message tool error, an incomplete owner, and this policy withheld. The complete-population twin also
// pins every declared receipt (proof law §6.3).
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `dangling-doc-cite` descriptor at 80b81a3471b24c88ef503f8896c4796831474a4f, the parent of the conversion
// `ff3eacb44` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The `1f5e25c00`
// cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both citations
// resolve to this source. Over the SAME 7,435 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy harness dispatch (no `scanRoot`) admits 7,435 and final
// `population` admits 7,435. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `docs/__cbbhr_out_control.ts` (virtual) rejected by both.
// OUTSIDE-CONTROL CAVEAT (verifier cb-v-header-residue): `docs/__cbbhr_out_control.ts` is rejected by `harnessGlobs`,
// not by the legacy descriptor — which has no path predicate of its own and admits it — so it proves only that
// neither side reaches outside the harness corpus, not that the legacy filter discriminates.
import type { SourceFile } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { blankTsComments } from "../lib/comment-spans.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import { scanTextCitations } from "../lib/text-cite-scan.ts";

// A repo-relative doc token. Two GRAMMARS, the second added by #1334 and WIDENED again by #1334's own
// follow-up (gate-scope-D, 2026-09-19) to close the bare-filename gap for real:
//
//   1. A `docs/`-prefixed repo path — the original grammar. The LOOKBEHIND IS LOAD-BEARING: a vendor URL
//      carries the same segment, and without the fence three live comments citing a vendor's own published
//      docs read as phantom REPO paths. The CHARACTER CLASS IS THE TRAILING-COORDINATE FENCE: neither `#`
//      nor `:` is in the class, so a `#section` anchor and a `:<line>` coordinate already END the match.
//
//   2. A BARE `.md` path (#1334, widened gate-scope-D) — the house idiom. Comments cite a doc's basename,
//      or a short relative path like `tooling/x` + `.md`, without a `docs/` prefix. FIRST WIDENING (#1334)
//      required a Capital letter or a digit-after-hyphen; that missed 438 all-lowercase hyphenated doc
//      names. SECOND WIDENING (gate-scope-D) dropped the capital/hyphen fence entirely: the DoD census
//      (#1334's own follow-up finding) proved the excluded shape — short all-lowercase UNHYPHENATED
//      basenames like `chat` + `.md`, one per gutted per-domain doc — carried 100 of the then-current
//      dangling comment pointers, i.e. the fence was hiding the majority of the real defect population,
//      not protecting against noise. This header may not spell one of those dead examples as a contiguous
//      token either — the gate would flag itself, the same discipline grammar 1's header already states.
//      The grammar now matches ANY `.md` basename or short relative path (multiple `/`-joined segments),
//      fenced only against a `docs/`-prefixed start (owned by grammar 1, `(?!docs\/)`) and an `http(s)`
//      start (the vendor-URL fence — a URL's OWN internal segments stay excluded because every one is
//      preceded by a `/`, `.` or `-`, all in the lookbehind's excluded class, so only the scheme word
//      itself needed a direct fence). Losing the "unhyphenated lowercase is never a cite" assumption means
//      an unhyphenated all-lowercase basename is now IN GRAMMAR too — correct, because resolution (below)
//      is tree-wide by basename/suffix, so a real doc at that basename resolves clean and a truly dead
//      cite of that shape would dangle exactly like any other. Resolution: bare (no `/`) — the BASENAME set
//      of every tracked `.md` file, not `docs/**` alone (widened together with the grammar: the gate- and
//      rule-authoring guides are LAW living outside `docs/`, and a docs-only basename map read their bare
//      cites as dangling even though `dangling-refs.ts`'s own `LAW_OUTSIDE_DOCS` treats them as first-class
//      law). Path-shaped (has `/`) — first an exact/suffix match against every tracked `.md` path, then the
//      same basename fallback (matches the DoD census resolver exactly, this gate's own gate-scope-D fix).
const DOC_TOKEN_RE = /(?<![\w./-])docs\/[A-Za-z0-9_./+-]*\.md/gu;
const BARE_DOC_RE = /(?<![\w./+-])(?!https?\b)(?!docs\/)([A-Za-z0-9_][A-Za-z0-9_/.+-]*\.md)/gu;
// A token carrying a glob / brace / placeholder / elision is a PROSE PATTERN, never a literal cite.
// ONLY THE ELISION HALF IS LIVE, and the split is measured rather than assumed (§4.1 cut, this lane):
// `*`, `{`, `}`, `<`, `>` and `…` are all OUTSIDE `DOC_TOKEN_RE`'s character class, so a token carrying
// one can never reach here — that half is mutually redundant with the token grammar and is kept only
// because deleting five characters from one class would not change a verdict. `...` CAN appear (`.` is in
// the class), and `mustPass[3]` is the row that dies without it.
const NON_LITERAL_RE = /[*{}<>]|\.\.\.|…/u;

const ROOT_EXTS = [".ts", ".js", ".cjs", ".mjs", ".yaml", ".yml"] as const;
const PUBLIC_EXTS = [".svg", ".css"] as const;
const PUBLIC_ASSET_RE = /^packages\/[^/]+\/public\//u;
const LINE_COMMENT_BY_EXT: Readonly<Record<string, string>> = { ".yaml": "#", ".yml": "#" };
const XML_COMMENT_EXTS = new Set([".svg"]);
const BLOCK_OPEN = "/*";
const BLOCK_CLOSE = "*/";
const XML_OPEN = "<!--";
const XML_CLOSE = "-->";
const SLASH_LINE = "//";
/** Unchanged by comment blanking ⇒ the character is CODE. `blankTsComments` is LENGTH-PRESERVING, which
 *  is what makes the diff a comment projection that stays line- and column-aligned with the raw text. */
const COMMENT_CHAR = " ";

const MESSAGE =
  "a source COMMENT cites a `docs/**.md` path that does not exist. Code DOES cite docs (Documentation-Law.md §Relocation & retirement, amended 2026-08-30), so a move owes the citer sweep — and a comment pointing at a doc that is gone is drift the amnesiac reader cannot tell from a real home. Only COMMENTS are in scope: a fixture/example path inside a string literal is deliberately not a cite.";
const BLIND_MESSAGE =
  "dangling-doc-cite derived ZERO non-project files from the tracked inventory — its root-config + public-asset derivation is blind, so every lie living outside the ts-morph workspace (an eslint.config.js comment, a shipped .svg) reads as clean. Re-point the derivation in tooling/src/verify/gates/dangling-doc-cite.ts.";

interface Cite {
  readonly path: string;
  readonly ref: string;
  readonly line: number;
  readonly column: number;
  /** When true the ref is a bare basename (no `docs/` prefix), resolved against the doc-tree basenames. */
  readonly bare: boolean;
}

function extOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot);
}

function isArmBMember(path: string): boolean {
  const ext = extOf(path);
  if (!path.includes("/")) {
    return (ROOT_EXTS as readonly string[]).includes(ext);
  }
  return PUBLIC_ASSET_RE.test(path) && (PUBLIC_EXTS as readonly string[]).includes(ext);
}

function xmlCommentsOfLine(raw: string): string {
  const open = raw.indexOf(XML_OPEN);
  if (open === -1) {
    return "";
  }
  const close = raw.indexOf(XML_CLOSE, open);
  return close === -1 ? raw.slice(open) : raw.slice(open, close);
}

/** One line of a C-style syntax (line comments plus block comments). Block state carries across lines. */
function slashCommentsOfLine(raw: string, inBlock: boolean): { readonly kept: string; readonly open: boolean } {
  if (inBlock) {
    const close = raw.indexOf(BLOCK_CLOSE);
    return close === -1 ? { kept: raw, open: true } : { kept: raw.slice(0, close), open: false };
  }
  const block = raw.indexOf(BLOCK_OPEN);
  const slash = raw.indexOf(SLASH_LINE);
  if (block !== -1 && (slash === -1 || block < slash)) {
    const close = raw.indexOf(BLOCK_CLOSE, block);
    if (close === -1) {
      return { kept: raw.slice(block), open: true };
    }
    const rest = slashCommentsOfLine(raw.slice(close + BLOCK_CLOSE.length), false);
    return { kept: `${raw.slice(block, close)} ${rest.kept}`, open: rest.open };
  }
  return { kept: slash === -1 ? "" : raw.slice(slash), open: false };
}

/** Blank everything outside a comment, for a file the ts-morph project does not carry. Deliberately
 *  SIMPLE per syntax: a false POSITIVE here is loud and fixable, a false pass is a gate that reads ✓
 *  forever — the permissive direction is the dangerous one. */
function commentsOnlyText(path: string, text: string): string {
  const ext = extOf(path);
  const line = LINE_COMMENT_BY_EXT[ext];
  const xml = XML_COMMENT_EXTS.has(ext);
  let out = "";
  let inBlock = false;
  for (const raw of text.split("\n")) {
    if (xml) {
      out += `${xmlCommentsOfLine(raw)}\n`;
      continue;
    }
    if (line !== undefined) {
      const at = raw.indexOf(line);
      out += `${at === -1 ? "" : raw.slice(at)}\n`;
      continue;
    }
    const { kept, open } = slashCommentsOfLine(raw, inBlock);
    inBlock = open;
    out += `${kept}\n`;
  }
  return out;
}

/** One source file's text with every NON-comment character blanked — the inverse of `blankTsComments`.
 *  Diffing against the length-preserving blanked projection is how this gate reads comments through the
 *  ONE home instead of hand-rolling a `//`-regex, the exact hazard `comment-spans.ts` exists to end (a
 *  `https://` inside a string literal ate the rest of its line in a hand-rolled sweep). */
function commentsOnlySource(sourceFile: SourceFile): string {
  const raw = sourceFile.getFullText();
  const blanked = blankTsComments(sourceFile);
  let out = "";
  for (let index = 0; index < raw.length; index += 1) {
    const character = raw[index] ?? "";
    // A newline survives on both sides, so keep it: the line arithmetic depends on it.
    if (character === "\n") {
      out += character;
      continue;
    }
    // Unchanged by the blanking ⇒ this character is CODE, so blank it; changed ⇒ it was a comment.
    out += blanked[index] === character ? COMMENT_CHAR : character;
  }
  return out;
}

/** Report one cite if it is dangling — extracted to keep the evaluate body under the complexity cap. */
function reportCite(
  cite: Cite,
  present: ReadonlySet<string>,
  docBasenames: ReadonlyMap<string, string>,
  ctx: { readonly report: { readonly file: (path: string, details: { line: number; column: number; token: string; message: string }) => void } },
): void {
  if (cite.bare) {
    // A bare/path cite resolves against every tracked `.md` file (gate-scope-D): first an exact/suffix
    // path match (so a short relative path like `reports/tooling/x` + `.md` resolves against any tracked
    // path ending with that same segment run, and a literal tracked relative path resolves too), then the
    // basename fallback (so `GATE-AUTHORING.md` resolves even though it lives outside `docs/`) — the same
    // two-step resolver the DoD census scorer uses, so the gate and the DoD agree.
    const hasSlash = cite.ref.includes("/");
    const basename = hasSlash ? (cite.ref.split("/").pop() ?? cite.ref) : cite.ref;
    const suffixMatch = hasSlash && [...docBasenames.values()].some((path) => path === cite.ref || path.endsWith(`/${cite.ref}`));
    const resolved = suffixMatch || docBasenames.has(basename);
    if (!resolved) {
      ctx.report.file(cite.path, {
        line: cite.line,
        column: cite.column,
        token: cite.ref,
        message: `comment cites doc \`${cite.ref}\` — no tracked \`.md\` file resolves it (by exact/suffix path or by basename). Use the doc's real repo-relative path, or fix the doc name. (Documentation-Law.md §Relocation)`,
      });
    }
    return;
  }
  if (!present.has(cite.ref)) {
    ctx.report.file(cite.path, {
      line: cite.line,
      column: cite.column,
      token: cite.ref,
      message: `comment cites \`${cite.ref}\` — no such doc exists. A doc move owes its citer sweep (Documentation-Law.md §Relocation & retirement step 2); a pointer to nowhere is worse than no pointer.`,
    });
  }
}

/** Build a basename to full repo-relative path map from EVERY tracked `.md` path (gate-scope-D: widened
 *  from `docs/**` alone so law living outside `docs/` — `GATE-AUTHORING.md`, `RULE-AUTHORING.md` — and a
 *  root `README.md` resolve too, matching the DoD census's tree-wide `git ls-files "*.md"` corpus). */
function docBasenameMap(tracked: readonly string[]): ReadonlyMap<string, string> {
  const out = new Map<string, string>();
  for (const path of tracked) {
    if (path.endsWith(".md")) {
      const slash = path.lastIndexOf("/");
      const basename = slash === -1 ? path : path.slice(slash + 1);
      out.set(basename, path);
    }
  }
  return out;
}

export const gate = defineGate({
  id: "dangling-doc-cite",
  family: "text-citation",
  authority: "hard",
  severity: "error",
  population: "@authored",
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "tracked-files" }, { kind: "authored-text" }],
  message: MESSAGE,
  fix: "repoint the comment at the doc's real home, or — where D141's no-bare-pointers rule applies — replace the pointer with the fact the comment actually needed and drop the path.",
  create: (ctx) => {
    const cites: Cite[] = [];
    /** Every distinct literal doc cite in a chunk of COMMENT text, which is line- and column-aligned with
     *  the raw file, so the reported coordinates are the authored ones. */
    const collect = (path: string, commentText: string): void => {
      for (const hit of scanTextCitations(commentText, DOC_TOKEN_RE)) {
        if (!NON_LITERAL_RE.test(hit.token)) {
          cites.push({ path, ref: hit.token, line: hit.line, column: hit.column, bare: false });
        }
      }
      // #1334: bare `.md` basenames — the house idiom for citing docs without the `docs/` prefix.
      for (const hit of scanTextCitations(commentText, BARE_DOC_RE)) {
        if (!NON_LITERAL_RE.test(hit.token)) {
          cites.push({ path, ref: hit.token, line: hit.line, column: hit.column, bare: true });
        }
      }
    };
    const readArmB = (members: readonly string[]): void => {
      const corpus = readyResourceValue(ctx.resources.authoredText(members));
      for (const refusal of corpus.refusals) {
        if (refusal.status !== "empty") {
          throw new Error(`non-project citer ${refusal.path} was tracked and refused by the text door (${refusal.status}): ${refusal.reason}`);
        }
      }
      for (const file of corpus.files) {
        collect(file.path, commentsOnlyText(file.path, file.text));
      }
    };
    return {
      visitFile: (sourceFile) => {
        const raw = sourceFile.getFullText();
        // The candidate fence: a file whose RAW text cannot match either grammar cannot match blanked
        // either. `.md` is the shared suffix; a file with no `.md` has no cite in either grammar.
        if (raw.includes(".md")) {
          collect(ctx.relativePath(sourceFile), commentsOnlySource(sourceFile));
        }
      },
      evaluate: () => {
        const tracked = readyResourceValue(ctx.resources.trackedFiles()).repoPaths;
        const members = tracked.filter(isArmBMember);
        if (members.length === 0) {
          // THE BLINDNESS TRIPWIRE. A derivation that resolved nothing means arm B was not judged: this
          // is an evaluate-phase refusal, not a clean finding verdict. The family test pins the refusal
          // text together with zero findings, an incomplete owner, and this policy withheld (§6.3).
          throw new Error(BLIND_MESSAGE);
        }
        readArmB(members);
        const present = new Set(tracked);
        // #1334: bare basenames resolve against the doc tree's basename vocabulary.
        const docBasenames = docBasenameMap(tracked);
        for (const cite of cites) {
          reportCite(cite, present, docBasenames, ctx);
        }
        // What this run MEASURED — every citer file it read — never the census of cites it FOUND. A
        // receipt whose count can legitimately be zero turns its own clean corpus into a refusal
        // (`lib/policy-pass.ts` receiptFailures, `count === 0`).
        ctx.receipt({ kind: "population", source: "doc-citers", members: ctx.files.length + members.length });
      },
    };
  },
  mustFlag: [
    {
      mode: "resource",
      files: {
        "knip.ts": "export const config = 1;\n",
        "packages/kit/src/thing.ts": "// See docs/design/gone-forever.md for the ruling.\nexport const x = 1;\n",
      },
      expect: { count: 1, line: 1, token: "docs/design/gone-forever.md" },
      why: "the founding defect: a `//` comment cites a doc that no longer exists — the eight lies the previous archival pass left behind",
    },
    {
      mode: "resource",
      files: {
        "knip.ts": "export const config = 1;\n",
        // A JSDoc BLOCK comment, and a `:line` coordinate that must be stripped before the identity
        // question — otherwise every coordinate-suffixed `.md` cite (a `path` at line 42, say) in the
        // corpus reads as a phantom.
        "packages/kit/src/block.ts": "/** Home: docs/design/vanished.md:88 — the shape. */\nexport const y = 2;\n",
      },
      expect: { count: 1, token: "docs/design/vanished.md" },
      why: "a block comment, and a `:line` coordinate the TOKEN GRAMMAR excludes (`:` is not in DOC_TOKEN_RE's character class) — the live corpus idiom that would otherwise flag every coordinate-carrying cite",
    },
    {
      mode: "resource",
      files: {
        // ARM B: a repo-ROOT config, which `harnessGlobs` never loads. Two of the four real lies the #873
        // census found lived exactly here, so a project-only gate is a false clean at those sites. The
        // silent `packages/kit/src/anchor.ts` is the population ANCHOR every row needs: a fixture that
        // admits zero source paths is a `[population]` tool error, never a finding.
        "eslint.config.js": "// See docs/Documentation-Law.md §Enforcement.\nexport default [];\n",
        "packages/kit/src/anchor.ts": "export const anchor = 1;\n",
      },
      expect: { count: 1, token: "docs/Documentation-Law.md" },
      why: "arm B: a root config the ts-morph workspace never carries — the eslint.config.js class, invisible to a project-only scan and now derived from the git index",
    },
    {
      mode: "resource",
      files: {
        "knip.ts": "export const config = 1;\n",
        // ARM B, the shipped-asset half: an XML comment in a public SVG, the other real-lie site.
        "packages/client/public/favicon.svg": "<svg><!-- Source: docs/design/login-loading-screen.md §9 --></svg>\n",
        "packages/kit/src/anchor.ts": "export const anchor = 1;\n",
      },
      expect: { count: 1, token: "docs/design/login-loading-screen.md" },
      why: "arm B: an XML comment in a shipped public asset — the favicon/orb-mark class the #873 census found dangling",
    },
    {
      mode: "resource",
      files: {
        "knip.ts": "export const config = 1;\n",
        // #1334: a BARE basename cite to a doc that does not exist.
        "packages/kit/src/bare.ts": "// See Gone-Forever-Design.md for the ruling.\nexport const x = 1;\n",
      },
      expect: { count: 1, token: "Gone-Forever-Design.md" },
      why: "#1334: a bare-basename doc cite (no `docs/` prefix) to a doc that does not exist under `docs/` — the house idiom the original grammar missed",
    },
    {
      mode: "resource",
      files: {
        "knip.ts": "export const config = 1;\n",
        // #1334 WIDENED: an all-lowercase hyphenated doc cite to a doc that does not exist.
        "packages/kit/src/lower-hyph.ts": "// See gate-runtime-gone-forever.md for the design.\nexport const x = 1;\n",
      },
      expect: { count: 1, token: "gate-runtime-gone-forever.md" },
      why: "#1334 WIDENED: an all-lowercase hyphenated bare-basename cite — the dominant pattern (438 docs) the original grammar missed by requiring uppercase after a hyphen",
    },
    {
      mode: "resource",
      files: {
        "knip.ts": "export const config = 1;\n",
        // gate-scope-D: an UNHYPHENATED all-lowercase bare `.md` — the shape the #1334 grammar still missed
        // (one per gutted per-domain doc — chat, providers, stats, 12 more — 100 of the real
        // 2026-09-19 dangling population).
        "packages/kit/src/unhyph.ts": "// See providers.md for the connection design.\nexport const x = 1;\n",
      },
      expect: { count: 1, token: "providers.md" },
      why: "gate-scope-D: an unhyphenated all-lowercase bare `.md` to a doc that does not exist — the fence #1334 kept (capital-or-hyphen) hid the majority of the real defect population",
    },
    {
      mode: "resource",
      files: {
        "knip.ts": "export const config = 1;\n",
        // gate-scope-D: a SHORT RELATIVE PATH (multiple `/`-joined segments, no `docs/` prefix) to a doc
        // that does not exist anywhere in the tree — the `reports/tooling/x` + `.md`-shaped class.
        "packages/kit/src/relpath.ts": "// See reports/tooling/GONE-REPORT.md for the numbers.\nexport const x = 1;\n",
      },
      expect: { count: 1, token: "reports/tooling/GONE-REPORT.md" },
      why: "gate-scope-D: a short relative path (not `docs/`-prefixed, not a bare basename) resolves neither by suffix nor by basename — the `reports/**` class of dead pointers the census found",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "knip.ts": "export const config = 1;\n",
        "docs/design/real.md": "---\nkind: design\n---\n\nplanted.\n",
        "packages/kit/src/ok.ts": "// See docs/design/real.md §2 for the ruling.\nexport const x = 1;\n",
      },
      why: "a comment citing a doc that EXISTS, with a `§` suffix — the overwhelmingly common shape; no false flag",
    },
    {
      mode: "resource",
      files: {
        "knip.ts": "export const config = 1;\n",
        // THE DECLARED LIMIT that makes this gate need no fixture-string exemption grammar: a gate's own
        // proof map and a test's planted tree name doc paths that MUST NOT exist. They are string
        // literals, so scoping to comments excludes them structurally rather than by allowlist.
        "packages/kit/src/fixture.ts":
          'export const example = { files: { "docs/example.md": "x", "docs/architecture/core/__probe.md": "y" } };\nexport const p = "docs/design/never-existed.md";\n',
      },
      why: "THE DECLARED LIMIT and the row that dies without the comment projection: a fixture/example doc path in a STRING LITERAL is not a cite — 24 of the 28 dangling paths the #873 census found are exactly this, and comment-scoping excludes them with no allowlist",
    },
    {
      mode: "resource",
      files: {
        "knip.ts": "export const config = 1;\n",
        "packages/kit/src/prose.ts": "// Sweep docs/architecture/**/*.md and docs/design/<name>.md before moving.\nexport const x = 1;\n",
      },
      why: "a glob and a `<placeholder>` are prose patterns — and this row is honest about WHICH fence holds it: `*` and `<` are outside DOC_TOKEN_RE's character class, so it passes with `NON_LITERAL_RE` cut. mustPass[3] is the row that dies",
    },
    {
      mode: "resource",
      files: {
        "knip.ts": "export const config = 1;\n",
        "packages/kit/src/elision.ts": "// The ruling moved; see docs/design/.../ruling.md once the tree settles.\nexport const x = 1;\n",
      },
      why: "THE NARROWING ROW for the LIVE half of `NON_LITERAL_RE`: `.` IS in the token character class, so an ELISION reaches the fence where a glob never can. Drop `\\.\\.\\.` and this row reds",
    },
    {
      mode: "resource",
      files: {
        "knip.ts": "export const config = 1;\n",
        "packages/kit/src/url.ts": 'export const u = "https://x.test/docs/design/not-ours.md";\n',
      },
      why: "a `//` inside a STRING literal is not a comment — arm A reads comments through comment-spans.ts, never a hand-rolled regex",
    },
    {
      mode: "resource",
      files: {
        "knip.ts": "export const config = 1;\n",
        // THE VENDOR-URL FENCE. An external doc URL carries the same `docs/` segment, and without the
        // lookbehind three live comments citing a vendor's published docs read as phantom REPO paths.
        "packages/kit/src/vendor.ts":
          "// Not supported by the subset (https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md).\nexport const x = 1;\n",
      },
      why: "THE NARROWING ROW for the `DOC_TOKEN_RE` lookbehind: a VENDOR doc URL is not a repo cite, and dropping the fence reds this row",
    },
    {
      mode: "resource",
      files: {
        "knip.ts": "export const config = 1;\n",
        "docs/design/real.md": "---\nkind: design\n---\n\nplanted.\n",
        "packages/client/public/orb.svg": "<svg><!-- Source: docs/design/real.md §1 --></svg>\n",
        // The neighbour carries a C-style comment cite ON PURPOSE. A `.md` or `.txt` of PROSE would pass
        // with the fence cut too (the comment projection finds no comment in it), so the row would
        // discriminate nothing — the fence and the projection would be mutually redundant and the clean
        // cut would read as unenforced.
        "packages/client/public/extra.txt": "// docs/design/gone.md is cited in a shipped text asset.\n",
        "packages/kit/src/anchor.ts": "export const anchor = 1;\n",
      },
      why: "THE NARROWING ROW for arm B's PUBLIC_EXTS filter: the `.svg` asset IS a member and the neighbouring `.txt` is NOT; widen the filter to everything under `public/` and this row reds",
    },
    {
      mode: "resource",
      files: {
        "knip.ts": "export const config = 1;\n",
        // A repo-ROOT file whose extension carries no config comment syntax this gate claims.
        "README.md": "// docs/design/gone.md is cited in root prose.\n",
        "packages/kit/src/anchor.ts": "export const anchor = 1;\n",
      },
      why: "THE NARROWING ROW for arm B's ROOT_EXTS filter: a root `.md` is not a config this gate reads, and widening the root filter to every extension reds this row",
    },
    {
      mode: "resource",
      files: {
        "knip.ts": "export const config = 1;\n",
        // #1334: a bare basename whose doc EXISTS — it resolves, so no finding.
        "docs/design/Real-Design.md": "---\nkind: design\n---\n\nplanted.\n",
        "packages/kit/src/bare-ok.ts": "// See Real-Design.md for the design.\nexport const x = 1;\n",
      },
      why: "#1334: a bare-basename cite to a doc that EXISTS under `docs/` — the basename resolves and is not a finding",
    },
    {
      mode: "resource",
      files: {
        "knip.ts": "export const config = 1;\n",
        // #1334 WIDENED: an all-lowercase hyphenated basename whose doc EXISTS — resolves, so no finding.
        "docs/design/gate-runtime-real.md": "---\nkind: design\n---\n\nplanted.\n",
        "packages/kit/src/lower-hyph-ok.ts": "// See gate-runtime-real.md for the design.\nexport const x = 1;\n",
      },
      why: "#1334 WIDENED: an all-lowercase hyphenated bare-basename cite to a doc that EXISTS under `docs/` — the basename resolves and is not a finding",
    },
    {
      mode: "resource",
      files: {
        "knip.ts": "export const config = 1;\n",
        // gate-scope-D: an all-lowercase unhyphenated basename is NOW IN GRAMMAR (the capital/hyphen fence
        // is gone), but a matching doc is tracked at the repo root under the SAME case (basename resolution
        // is case-sensitive, so the planted file's case must match the cite's), and the bare cite resolves
        // via the basename fallback.
        "readme.md": "planted root readme.\n",
        "packages/kit/src/lower.ts": "// See readme.md for setup instructions.\nexport const x = 1;\n",
      },
      why: "gate-scope-D: an unhyphenated all-lowercase bare cite now resolves against a REAL tracked doc of the same basename via the basename fallback — no false flag once the doc actually exists",
    },
    {
      mode: "resource",
      files: {
        "knip.ts": "export const config = 1;\n",
        // gate-scope-D: a bare cite of a LAW doc living OUTSIDE `docs/` (the GATE-AUTHORING.md class) now
        // resolves — the basename map is tree-wide, not `docs/**`-only.
        "tooling/src/verify/gates/OUTSIDE-DOCS-LAW.md": "planted law outside docs.\n",
        "packages/kit/src/outside.ts": "// See OUTSIDE-DOCS-LAW.md for the rule.\nexport const x = 1;\n",
      },
      why: 'gate-scope-D: a bare cite to a tracked `.md` living OUTSIDE `docs/` resolves — the widened basename map matches the DoD census\'s tree-wide `git ls-files "*.md"` corpus, closing the divergence #2255/#1334 found (a `GATE-AUTHORING.md` cite was a gate finding but a DoD pass)',
    },
    {
      mode: "resource",
      files: {
        "knip.ts": "export const config = 1;\n",
        // gate-scope-D: a short relative path that resolves via SUFFIX match against a real tracked doc.
        "docs/architecture/core/Real-Relpath.md": "---\nkind: law\n---\n\nplanted.\n",
        "packages/kit/src/relpath-ok.ts": "// See core/Real-Relpath.md for the rule.\nexport const x = 1;\n",
      },
      why: "gate-scope-D: a short relative path (`core/Real-Relpath.md`) resolves via suffix match against `docs/architecture/core/Real-Relpath.md` — no false flag",
    },
    {
      mode: "resource",
      files: {
        "knip.ts": "export const config = 1;\n",
        // #1334: a bare basename in a STRING LITERAL is not a comment cite — the comment projection excludes it.
        "packages/kit/src/str.ts": 'export const name = "Gone-Design.md";\n',
      },
      why: "#1334: a bare basename in a STRING LITERAL is not a cite — the comment projection excludes it structurally",
    },
  ],
});
