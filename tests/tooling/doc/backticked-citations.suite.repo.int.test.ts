// A backticked repository path or UPPER_SNAKE symbol in a living law, decision or design doc must name something real.
// A path resolves on disk (or is an absent ignored build output); a symbol must be declared in authored source.
import { blankText } from "@orb/kit/strings";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ts } from "ts-morph";
import { describe } from "vitest";
import { populationIncludes } from "../../../tooling/src/verify/lib/population-resolver.ts";
import { loadAuthoredPaths } from "../../../tooling/src/verify/ops/resource-path.ts";
import { scaledBudget } from "../_load-budget.ts";
import type { LivingCorpora } from "./_living-docs.ts";
import { livingCorpora } from "./_living-docs.ts";
import type { RepoTree } from "./_tree.ts";
import { isTypeScript, loadPlantedTree, loadTree } from "./_tree.ts";

const BACKTICK_TOKEN_RE = /`([^`\n]+)`/gu;
const STRIKETHROUGH_RE = /~~[^~\n]*~~/gu;
// A line that records what was retired, or a build-state rider in a doc's head, states history rather than a live claim.
const RIDER_LINE_RE = /rider|truth[- ]audit|purged|\bdead\b(?![-\s]ends?\b)|\bdied\b|the (former|old) `|\bnot an? `|there is no `/iu;
const NON_LITERAL_TOKEN_RE = /[*{}<>…]|\.\.\./u;
const HEAD_RIDER_SCAN_LINES = 20;
const HEAD_RIDER_MARKER = "BUILD-STATE RIDER";
const PLACEHOLDER_SEGMENT_RE = /(^|\/)[A-Z](\/|$)/u;
const PATH_PREFIXES: readonly string[] = [
  "packages/",
  "docs/",
  "scripts/",
  "tests/",
  "tooling/",
  "domain/",
  "entry/",
  "infra/",
  "transport/",
  "foundation/",
  "kit/",
  "@orb/",
];
const REPO_ROOT_PREFIXES: readonly string[] = ["packages/", "docs/", "scripts/", "tests/", "tooling/"];
const SERVER_SOURCE_PREFIXES: readonly string[] = ["domain/", "entry/", "infra/", "transport/", "foundation/"];
const TRIM_ANCHOR_RE = /#[^)\s]*$/u;
const TRIM_LINEREF_RE = /:\d+(?:-\d+)?(?:[,/]:?\d+(?:-\d+)?)*$/u;
const TRIM_PUNCT_RE = /[:.,;)]+$/u;
const TRIM_CROSSREF_RE = /::.*$/u;
const CODE_EXT_RE = /\.(ts|tsx)$/u;
const SYMBOL_CANDIDATE_RE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/u;
const TESTKIT_PACKAGE = "testkit";
const TESTKIT_ROOT = "tests/support";
// Authority rows and gate fixtures repeat the exact symbol they police, so their string values (and a gate's own
// property keys) must not credit a declaration; neither may this suite's own fixtures.
const SELF_EVIDENCE_PREFIXES: readonly string[] = [
  "tooling/src/verify/gates/",
  "tooling/src/verify/lib/reviewed-grants",
  "tests/tooling/verify/gates/",
  "tests/tooling/doc/",
];
const GATE_SOURCE_PREFIX = "tooling/src/verify/gates/";

const NAME_BEARING_KINDS: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.VariableDeclaration,
  ts.SyntaxKind.FunctionDeclaration,
  ts.SyntaxKind.ClassDeclaration,
  ts.SyntaxKind.InterfaceDeclaration,
  ts.SyntaxKind.TypeAliasDeclaration,
  ts.SyntaxKind.EnumDeclaration,
  ts.SyntaxKind.EnumMember,
  ts.SyntaxKind.MethodDeclaration,
  ts.SyntaxKind.PropertySignature,
  ts.SyntaxKind.GetAccessor,
  ts.SyntaxKind.PropertyAssignment,
  ts.SyntaxKind.ShorthandPropertyAssignment,
]);
const PROPERTY_KEY_KINDS: ReadonlySet<ts.SyntaxKind> = new Set([ts.SyntaxKind.PropertyAssignment, ts.SyntaxKind.ShorthandPropertyAssignment]);

interface Citation {
  readonly file: string;
  readonly line: number;
  readonly ref: string;
}

function trimPathToken(raw: string): string {
  return raw.trim().replace(TRIM_ANCHOR_RE, "").replace(TRIM_LINEREF_RE, "").replace(TRIM_PUNCT_RE, "").replace(TRIM_CROSSREF_RE, "");
}

function pathToken(raw: string): string | undefined {
  const ref = trimPathToken(raw);
  return ref.length > 0 && !NON_LITERAL_TOKEN_RE.test(ref) && !PLACEHOLDER_SEGMENT_RE.test(ref) && PATH_PREFIXES.some((prefix) => ref.startsWith(prefix))
    ? ref
    : undefined;
}

/** Backticked tokens of a doc, line by line, skipping a doc with a head rider and any rider line; struck text is masked. */
function backtickedTokens(text: string): readonly { readonly token: string; readonly line: number }[] {
  const lines = text.split(/\r?\n/u);
  if (lines.slice(0, HEAD_RIDER_SCAN_LINES).some((line) => line.includes(HEAD_RIDER_MARKER))) {
    return [];
  }
  return lines.flatMap((rawLine, index) =>
    RIDER_LINE_RE.test(rawLine)
      ? []
      : [...rawLine.replace(STRIKETHROUGH_RE, blankText).matchAll(BACKTICK_TOKEN_RE)].flatMap((match) =>
          match[1] === undefined ? [] : [{ token: match[1], line: index + 1 }],
        ),
  );
}

function pathCitations(tree: RepoTree, docs: readonly string[]): readonly Citation[] {
  return docs.flatMap((file) =>
    backtickedTokens(tree.read(file)).flatMap(({ token, line }) => {
      const ref = pathToken(token);
      return ref === undefined ? [] : [{ file, line, ref }];
    }),
  );
}

function symbolCitations(tree: RepoTree, docs: readonly string[]): readonly Citation[] {
  return docs.flatMap((file) =>
    backtickedTokens(tree.read(file)).flatMap(({ token, line }) => (SYMBOL_CANDIDATE_RE.test(token.trim()) ? [{ file, line, ref: token.trim() }] : [])),
  );
}

// ── resolution of a path citation ────────────────────────────────────────────────────────────────────

function pkgRoot(pkg: string): string {
  if (pkg === "tooling") {
    return "tooling";
  }
  return pkg === TESTKIT_PACKAGE ? TESTKIT_ROOT : `packages/${pkg}`;
}

function pkgSourceRoot(pkg: string): string {
  return pkg === TESTKIT_PACKAGE ? pkgRoot(pkg) : `${pkgRoot(pkg)}/src`;
}

function pathCandidates(target: string): readonly string[] {
  return [target, `${target}.ts`, `${target}.tsx`, `${target}.md`, `${target}/index.ts`, `${target}/index.tsx`];
}

function shorthandTarget(ref: string): string | undefined {
  if (REPO_ROOT_PREFIXES.some((prefix) => ref.startsWith(prefix))) {
    return ref;
  }
  if (SERVER_SOURCE_PREFIXES.some((prefix) => ref.startsWith(prefix))) {
    return `packages/server/src/${ref}`;
  }
  return ref.startsWith("kit/") ? `packages/kit/src/${ref.slice("kit/".length)}` : undefined;
}

/** Every repository path that could make `ref` resolve; the identity door answers all of them in one batch. */
function shorthandCandidates(ref: string): readonly string[] {
  if (ref.startsWith("@orb/")) {
    const rest = ref.slice("@orb/".length);
    const slash = rest.indexOf("/");
    return slash === -1 ? pathCandidates(pkgRoot(rest)) : pathCandidates(`${pkgSourceRoot(rest.slice(0, slash))}/${rest.slice(slash + 1)}`);
  }
  const target = shorthandTarget(ref);
  if (target === undefined) {
    return [];
  }
  return ref.startsWith("kit/") ? [...pathCandidates(target), ...pathCandidates(`packages/server/src/${ref}`)] : pathCandidates(target);
}

/** File and directory names under a package's source root, as module names: `a/b/c.ts` yields `a`, `b` and `c`. */
function moduleNames(tree: RepoTree, pkg: string): ReadonlySet<string> {
  const root = `${pkgSourceRoot(pkg)}/`;
  const names = new Set<string>();
  for (const path of tree.paths.filter((candidate) => candidate.startsWith(root))) {
    const segments = path.slice(root.length).split("/");
    const file = segments.pop() ?? "";
    for (const directory of segments) {
      names.add(directory);
    }
    if (CODE_EXT_RE.test(file)) {
      names.add(file.replace(CODE_EXT_RE, ""));
    }
  }
  return names;
}

type PathStatus = (selector: string) => string | undefined;

function shorthandExists(statusOf: PathStatus, tree: RepoTree, ref: string): boolean {
  const exists = (base: string): boolean => pathCandidates(base).some((candidate) => statusOf(candidate) === "file" || statusOf(candidate) === "directory");
  if (ref.startsWith("@orb/")) {
    const rest = ref.slice("@orb/".length);
    const slash = rest.indexOf("/");
    if (slash === -1) {
      return exists(pkgRoot(rest));
    }
    const pkg = rest.slice(0, slash);
    const mod = rest.slice(slash + 1);
    const last = mod.split("/").pop();
    return exists(`${pkgSourceRoot(pkg)}/${mod}`) || (pkg !== TESTKIT_PACKAGE && last !== undefined && moduleNames(tree, pkg).has(last));
  }
  if (ref.startsWith("kit/") && exists(`packages/server/src/${ref}`)) {
    return true;
  }
  const target = shorthandTarget(ref);
  return target !== undefined && exists(target);
}

// ── declarations ────────────────────────────────────────────────────────────────────────────────────

function creditDeclarations(path: string, text: string, into: Set<string>): void {
  const scriptKind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, false, scriptKind);
  const evidence = SELF_EVIDENCE_PREFIXES.some((prefix) => path.startsWith(prefix));
  const inGateCorpus = path.startsWith(GATE_SOURCE_PREFIX);
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteral(node)) {
      if (!evidence && SYMBOL_CANDIDATE_RE.test(node.text)) {
        into.add(node.text);
      }
    } else if (NAME_BEARING_KINDS.has(node.kind) && !(inGateCorpus && PROPERTY_KEY_KINDS.has(node.kind))) {
      const name = (node as ts.Node & { readonly name?: ts.Node }).name;
      if (name !== undefined) {
        into.add(name.getText(sourceFile));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}

/** Names declared in authored source, read only from files whose text mentions a cited symbol. */
function declaredNames(tree: RepoTree, cited: ReadonlySet<string>): ReadonlySet<string> {
  const names = new Set<string>();
  if (cited.size === 0) {
    return names;
  }
  const mentioned = new RegExp([...cited].join("|"), "u");
  for (const path of tree.paths) {
    if (isTypeScript(path) && populationIncludes("@authored", path)) {
      const text = tree.read(path);
      if (mentioned.test(text)) {
        creditDeclarations(path, text, names);
      }
    }
  }
  return names;
}

// ── the check ───────────────────────────────────────────────────────────────────────────────────────

interface Finding {
  readonly file: string;
  readonly line: number;
  readonly kind: "path" | "symbol";
  readonly ref: string;
}

interface BacktickedCitations {
  readonly findings: readonly Finding[];
  readonly corpora: LivingCorpora;
}

function pathIdentities(tree: RepoTree, refs: readonly string[]): ReadonlyMap<string, { readonly status: string; readonly ignoredBuildOutput: boolean }> {
  const selectors = [...new Set(refs.flatMap((ref) => shorthandCandidates(ref)))];
  if (selectors.length === 0) {
    return new Map();
  }
  const loaded = loadAuthoredPaths(tree.root, selectors);
  if (loaded.status !== "ready") {
    throw new Error(`path identities unavailable: ${loaded.reason}`);
  }
  return new Map(
    loaded.value.identities.map((identity) => [
      identity.selector,
      { status: identity.status, ignoredBuildOutput: identity.status === "absent" && identity.ignoredBuildOutput === true },
    ]),
  );
}

function backtickedCitations(tree: RepoTree): BacktickedCitations {
  const corpora = livingCorpora(tree);
  const paths = pathCitations(tree, corpora.audit);
  const identities = pathIdentities(
    tree,
    paths.map(({ ref }) => ref),
  );
  const statusOf: PathStatus = (selector) => identities.get(selector)?.status;
  const danglingPaths = paths
    .filter(({ ref }) => !(identities.get(ref)?.ignoredBuildOutput === true || shorthandExists(statusOf, tree, ref)))
    .map((citation): Finding => ({ ...citation, kind: "path" }));
  const symbols = symbolCitations(tree, corpora.symbols);
  const declared = declaredNames(tree, new Set(symbols.map(({ ref }) => ref)));
  const danglingSymbols = symbols.filter(({ ref }) => !declared.has(ref)).map((citation): Finding => ({ ...citation, kind: "symbol" }));
  return { findings: [...danglingPaths, ...danglingSymbols], corpora };
}

const render = ({ file, line, kind, ref }: Finding): string => `${file}:${String(line)} ${kind} ${ref}`;
const sorted = (findings: readonly Finding[]): readonly string[] => findings.map(render).toSorted((left, right) => left.localeCompare(right));

/** Citations that name something absent on purpose. Each entry is one (doc, kind, reference) with its reason; an entry no
 *  finding consumes fails the suite, so the list only shrinks. */
const DELIBERATE_CITATIONS = [
  {
    file: "docs/adr/0061-marinara-borrow-dispositions.md",
    kind: "symbol",
    ref: "HUB_ADAPTERS",
    reason: "the decision proposes a hub feature that is not built; it names the registry it would add",
  },
  {
    file: "docs/adr/0061-marinara-borrow-dispositions.md",
    kind: "path",
    ref: "infra/network/hubs/",
    reason: "the decision proposes a hub feature that is not built; it names the sealed directory it would add",
  },
  {
    file: "docs/adr/0068-sampling-completeness-rides-capability-descriptor.md",
    kind: "symbol",
    ref: "ANTH_DIRECT_SAMPLING",
    reason: "the decision records that the table has no declaration and is design-of-record, not built",
  },
  {
    file: "docs/adr/0119-on-an-engaged-game-chat-the-rpg-waystone.md",
    kind: "symbol",
    ref: "TAB_EDGE_CLASSES",
    reason: "the decision records the symbol among the things deleted in the same change",
  },
  {
    file: "docs/law/Tier-3b-Providers.md",
    kind: "symbol",
    ref: "SYSTEM_PROMPT_DYNAMIC_BOUNDARY",
    reason: "an export of the external agent SDK package, imported by the agent-sdk translator; it is no repository declaration",
  },
  {
    file: "docs/law/Core-Enforcement-Active-Gates.md",
    kind: "symbol",
    ref: "EXEMPT_PROCEDURES",
    reason: "the generated catalog records where a retired gate-local exemption table went",
  },
  {
    file: "docs/law/Core-Enforcement-Active-Gates.md",
    kind: "symbol",
    ref: "ELEVATED_ALLOW",
    reason: "the generated catalog records where a retired gate-local prefix table went",
  },
] as const satisfies readonly { readonly file: string; readonly kind: Finding["kind"]; readonly ref: string; readonly reason: string }[];

const deliberate = (finding: Finding): boolean =>
  DELIBERATE_CITATIONS.some((entry) => entry.file === finding.file && entry.kind === finding.kind && entry.ref === finding.ref);

describe("the real tree", () => {
  test("every backticked path and UPPER_SNAKE symbol in a living doc resolves", { timeout: scaledBudget(120_000) }, ({ repoRoot }) => {
    const result = backtickedCitations(loadTree(repoRoot));
    // A derivation that resolved nothing would pass: each corpus class must have members.
    expect(result.corpora.law).toBeGreaterThan(0);
    expect(result.corpora.design).toBeGreaterThan(0);
    expect(result.corpora.lawOutsideDocs).toBeGreaterThan(0);
    expect(sorted(result.findings.filter((finding) => !deliberate(finding)))).toEqual([]);
    // An exception no finding consumes is stale: delete it.
    const consumed = new Set(result.findings.map((finding) => `${finding.file} ${finding.kind} ${finding.ref}`));
    expect(
      DELIBERATE_CITATIONS.filter((entry) => !consumed.has(`${entry.file} ${entry.kind} ${entry.ref}`)).map((entry) => `${entry.file} ${entry.ref}`),
    ).toEqual([]);
  });
});

const GENERATED_IGNORE = { ".gitignore": "dist/\n" } as const;

describe("a planted tree", () => {
  test.for([
    {
      why: "a fixture in another testkit world does not establish the cited node-world path",
      files: {
        "docs/law/__testkit_missing.md": "---\nkind: law\nstatus: active\n---\n\nSee `@orb/testkit/node/fixtures.ts`.\n",
        "tests/support/package.json": '{"name":"@orb/testkit"}\n',
        "tests/support/browser/fixtures.ts": "export const fixtures = true;\n",
      },
      expected: ["docs/law/__testkit_missing.md:6 path @orb/testkit/node/fixtures.ts"],
    },
    {
      why: "a missing descendant under an existing ignored build directory is a typo, not an absent build",
      files: {
        ...GENERATED_IGNORE,
        "docs/law/__generated_typo.md": "---\nkind: law\nstatus: active\n---\n\nSee `packages/showcase-plugins/dist/bundlez/`.\n",
        "packages/showcase-plugins/dist/bundles/live.js": "export const live = 1;\n",
      },
      expected: ["docs/law/__generated_typo.md:6 path packages/showcase-plugins/dist/bundlez/"],
    },
    {
      why: "a backticked domain shorthand names no authored path",
      files: { "docs/law/__probe3.md": "---\nkind: law\n---\n\nSee `domain/__ghost_domain__/x.ts` for the shape.\n" },
      expected: ["docs/law/__probe3.md:5 path domain/__ghost_domain__/x.ts"],
    },
    {
      why: "a strict UPPER_SNAKE token names no declaration",
      files: { "docs/law/__probe4.md": "---\nkind: law\n---\n\nScoped to `GHOST_CONST_XYZ` recent turns.\n" },
      expected: ["docs/law/__probe4.md:5 symbol GHOST_CONST_XYZ"],
    },
    {
      why: "a plan's design document is a living design home and takes part in path integrity",
      files: { "docs/plans/__probe6/design.md": "---\nkind: plan\nstatus: active\n---\n\nThe write boundary is `domain/__ghost_domain__/x.ts`.\n" },
      expected: ["docs/plans/__probe6/design.md:6 path domain/__ghost_domain__/x.ts"],
    },
    {
      why: "named law outside docs takes part in path integrity",
      files: {
        "tooling/src/verify/gates/GATE-AUTHORING.md": "---\nkind: law\n---\n\nThe controls live at `tests/tooling/__ghost_controls__.test.ts`.\n",
      },
      expected: ["tooling/src/verify/gates/GATE-AUTHORING.md:5 path tests/tooling/__ghost_controls__.test.ts"],
    },
    {
      why: "the reachability idiom dead end is not a deliberate-history rider",
      files: { "docs/law/__probe_dead_end.md": "---\nkind: law\n---\n\nA message navigating a reader to `GHOST_DEADEND_CONST` read as a dead end.\n" },
      expected: ["docs/law/__probe_dead_end.md:5 symbol GHOST_DEADEND_CONST"],
    },
    {
      why: "a grant-table sibling spelling the subject is evidence of the grant, not a declaration",
      files: {
        "docs/law/__fence_probe__.md": "---\nkind: law\nstatus: active\n---\n\nThe vocabulary is `ORB_FENCE_PROBE`.\n",
        "tooling/src/verify/lib/reviewed-grants-fence-probe.ts": 'export const PROBE = [{ subject: "ORB_FENCE_PROBE", operation: "dangling-symbol-cite" }];\n',
      },
      expected: ["docs/law/__fence_probe__.md:6 symbol ORB_FENCE_PROBE"],
    },
    {
      why: "a phantom path authored in law outside docs is found, and the same phantom in a dated review is not",
      files: {
        "tooling/src/verify/gates/GATE-AUTHORING.md": "---\nkind: law\n---\n\nThe shape lives at `domain/__p1036_ghost_domain__/x.ts`.\n",
        "docs/reviews/__frozen_probe__.md": "---\nkind: review\nstatus: active\n---\n\nIt used to live at `domain/__p1036_ghost_domain__/x.ts`.\n",
      },
      expected: ["tooling/src/verify/gates/GATE-AUTHORING.md:5 path domain/__p1036_ghost_domain__/x.ts"],
    },
  ])("is flagged: $why", async ({ files, expected }, { plantedTree }) => {
    expect(sorted(backtickedCitations(loadPlantedTree(await plantedTree(files))).findings)).toEqual(expected);
  });

  test.for([
    {
      why: "testkit citations resolve its package and exact world homes outside packages and without a src directory",
      files: {
        "docs/law/__testkit.md":
          "---\nkind: law\nstatus: active\n---\n\nSee `@orb/testkit`, `@orb/testkit/node`, `@orb/testkit/node/fixtures.ts`, `@orb/testkit/iso/clock` and `@orb/testkit/browser/ct-door`.\n",
        "tests/support/package.json": '{"name":"@orb/testkit"}\n',
        "tests/support/node/fixtures.ts": "export const fixtures = true;\n",
        "tests/support/iso/clock.ts": "export const clock = true;\n",
        "tests/support/browser/ct-door.ts": "export const door = true;\n",
      },
    },
    {
      why: "a fresh checkout has no ignored build directory; its generated citation is classified without a grant",
      files: {
        ...GENERATED_IGNORE,
        "docs/law/__generated.md": "---\nkind: law\nstatus: active\n---\n\nSee `packages/showcase-plugins/dist/bundles/`.\n",
        "packages/showcase-plugins/package.json": "{}\n",
      },
    },
    {
      why: "domain and package shorthands resolve",
      files: {
        "docs/law/__probe3.md": "---\nkind: law\n---\n\nSee `domain/__g_ok/x.ts` and `@orb/kit/__g_ok`.\n",
        "packages/server/src/domain/__g_ok/x.ts": "export const x = 1;\n",
        "packages/kit/src/__g_ok/index.ts": "export const y = 1;\n",
      },
    },
    {
      why: "@orb/tooling resolves against the root tooling tree",
      files: {
        "docs/law/__probe3b.md": "---\nkind: law\n---\n\nSee `@orb/tooling` and `@orb/tooling/__g_ok`.\n",
        "tooling/src/__g_ok/index.ts": "export const z = 1;\n",
      },
    },
    {
      why: "a planted UPPER_SNAKE declaration resolves",
      files: {
        "docs/law/__probe4.md": "---\nkind: law\n---\n\nSee `PLANTED_CONST`.\n",
        "packages/kit/src/__probe4.ts": "export const PLANTED_CONST = 1;\n",
      },
    },
    {
      why: "rider and struck history stay exempt",
      files: {
        "docs/law/__probe5.md":
          "---\nkind: law\n---\n\n**BUILD-STATE RIDER:** `domain/__g_dead__/x.ts` and `GHOST_RIDER_CONST` are purged.\n\n~~`ANOTHER_GHOST_CONST`~~ struck as dead.\n",
      },
    },
    {
      why: "every supported line-reference suffix trims before resolution",
      files: {
        "docs/law/__probe7.md":
          "---\nkind: law\n---\n\nSee `domain/__g_ok/x.ts:19`, `domain/__g_ok/x.ts:12-30`, `domain/__g_ok/x.ts:201,207`,\n`domain/__g_ok/x.ts:33-39,257-282`, `domain/__g_ok/x.ts:6/:18` and `domain/__g_ok/x.ts::readIt()`.\n",
        "packages/server/src/domain/__g_ok/x.ts": "export const x = 1;\n",
      },
    },
    {
      why: "frozen evidence stays outside the corpus and symbols are law-only",
      files: {
        "docs/reviews/__probe8.md": "---\nkind: review\n---\n\nIt used to live at `domain/__ghost_domain__/x.ts`.\n",
        "docs/plans/__probe9/design.md": "---\nkind: plan\nstatus: active\n---\n\nThe cap would be `GHOST_PROPOSED_CONST`.\n",
      },
    },
    {
      why: "deliberate dead machinery remains a rider",
      files: { "docs/law/__probe_dead_sense.md": "---\nkind: law\n---\n\n`GHOST_DEAD_MACHINERY_CONST` is dead — the loader stopped reading it.\n" },
    },
    {
      why: "the same literal in an ordinary module still counts as a declaration",
      files: {
        "docs/law/__fence_probe__.md": "---\nkind: law\nstatus: active\n---\n\nThe vocabulary is `ORB_FENCE_PROBE`.\n",
        "tooling/src/verify/lib/__ordinary_probe__.ts": 'export const PROBE = [{ subject: "ORB_FENCE_PROBE", operation: "dangling-symbol-cite" }];\n',
      },
    },
  ])("passes: $why", async ({ files }, { plantedTree }) => {
    const result = backtickedCitations(loadPlantedTree(await plantedTree(files)));
    expect(result.corpora.docPaths.length).toBeGreaterThan(0);
    expect(sorted(result.findings)).toEqual([]);
  });
});
