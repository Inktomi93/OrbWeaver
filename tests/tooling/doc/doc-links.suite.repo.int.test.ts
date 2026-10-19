// A gate's message or fix that names a Markdown doc, and a Markdown link in a living law, decision or design doc, must land on a doc.
// The derived corpus must also be live: a walk that resolved no law doc, or a named law doc that vanished, is reported rather than read clean.
import { dirname, join, normalize } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { describe } from "vitest";
import { loadGateCorpus } from "../../../tooling/src/verify/lib/loader.ts";
import { loadAuthoredPaths } from "../../../tooling/src/verify/ops/resource-path.ts";
import { scaledBudget } from "../_load-budget.ts";
import type { LivingCorpora } from "./_living-docs.ts";
import { CORE_ANCHOR, LAW_OUTSIDE_DOCS, livingCorpora } from "./_living-docs.ts";
import type { RepoTree } from "./_tree.ts";
import { loadPlantedTree, loadTree } from "./_tree.ts";

// A `.md` token inside prose: a path segment run ending in `.md`. A leading dot that opens a token (a dot-directory such as `.claude`)
// belongs to it; a token never starts right after a section sign, so `§5/§7/name` is a section list and then a doc.
const MD_TOKEN_RE = /((?:(?<![\w./])\.)?(?<!§)\w[\w./-]*\.md)/gu;
// A Markdown link target ending in `.md`, with an optional anchor.
const MD_LINK_RE = /\]\(([^)\s]+?\.md)(?:#[^)\s]*)?\)/gu;
// A glob or brace expansion is a prose pattern, not a literal cite.
const NON_LITERAL_RE = /[*{}]/u;
// A bare name resolves under docs/law, then the repository root.
const BARE_ROOTS: readonly string[] = ["docs/law", "."];

interface DescriptorText {
  readonly id: string;
  readonly field: string;
  readonly value: string;
}

interface Finding {
  readonly file: string;
  readonly kind: "descriptor" | "link" | "corpus";
  readonly detail: string;
}

interface DocLinks {
  readonly findings: readonly Finding[];
  readonly corpora: LivingCorpora;
}

function mdTokens(value: string): readonly string[] {
  return [...value.matchAll(MD_TOKEN_RE)].flatMap((match) => (match[1] === undefined || match[1].length === 0 ? [] : [match[1]]));
}

function rootCandidates(ref: string): readonly string[] {
  if (NON_LITERAL_RE.test(ref) || ref === ".md") {
    return [];
  }
  if (ref.includes("/")) {
    return [ref, `docs/${ref}`];
  }
  return BARE_ROOTS.map((root) => (root === "." ? ref : `${root}/${ref}`));
}

/** A link resolves relative to its own document first (standard Markdown), then under the bare roots. */
function linkCandidates(fromRel: string, ref: string): readonly string[] {
  return ref.startsWith("http") ? [] : [normalize(join(dirname(fromRel), ref)), ...rootCandidates(ref)];
}

function linkCites(tree: RepoTree, files: readonly string[]): readonly { readonly file: string; readonly ref: string }[] {
  return files.flatMap((file) =>
    [...new Set([...tree.read(file).matchAll(MD_LINK_RE)].flatMap((match) => (match[1] === undefined ? [] : [match[1]])))].map((ref) => ({ file, ref })),
  );
}

function resolvesAny(statuses: ReadonlyMap<string, string>, selectors: readonly string[]): boolean {
  return selectors.length === 0 || selectors.some((selector) => statuses.get(selector) === "file" || statuses.get(selector) === "directory");
}

function statusesOf(tree: RepoTree, selectors: readonly string[]): ReadonlyMap<string, string> {
  const distinct = [...new Set(selectors)];
  if (distinct.length === 0) {
    return new Map();
  }
  const loaded = loadAuthoredPaths(tree.root, distinct);
  if (loaded.status !== "ready") {
    throw new Error(`path identities unavailable: ${loaded.reason}`);
  }
  return new Map(loaded.value.identities.map((identity) => [identity.selector, identity.status]));
}

function docLinks(tree: RepoTree, descriptors: readonly DescriptorText[]): DocLinks {
  const corpora = livingCorpora(tree);
  const descriptorCites = descriptors.flatMap(({ id, field, value }) => mdTokens(value).map((ref) => ({ id, field, ref })));
  const links = linkCites(tree, corpora.links);
  const statuses = statusesOf(tree, [
    ...descriptorCites.flatMap(({ ref }) => rootCandidates(ref)),
    ...links.flatMap(({ file, ref }) => linkCandidates(file, ref)),
  ]);
  const findings: Finding[] = [
    ...descriptorCites
      .filter(({ ref }) => !resolvesAny(statuses, rootCandidates(ref)))
      .map(({ id, field, ref }): Finding => ({ file: `gate:${id}`, kind: "descriptor", detail: `${field} names ${ref}, which resolves under no root` })),
    ...links
      .filter(({ file, ref }) => !resolvesAny(statuses, linkCandidates(file, ref)))
      .map(({ file, ref }): Finding => ({ file, kind: "link", detail: `link ${ref} resolves to no file` })),
  ];
  // The two liveness arms judge a real checkout: a stub tree without the core anchor has no law to be blind to.
  if (corpora.docPaths.includes(CORE_ANCHOR)) {
    findings.push(
      ...corpora.lawOutsideDocsMissing.map(
        (rel): Finding => ({ file: CORE_ANCHOR, kind: "corpus", detail: `${rel} is a named law doc that no longer resolves` }),
      ),
      ...(corpora.law === 0 ? [{ file: CORE_ANCHOR, kind: "corpus", detail: "the law corpus resolved ZERO living law documents" } as const] : []),
    );
  }
  return { findings, corpora };
}

const render = ({ file, kind, detail }: Finding): string => `${file} ${kind}: ${detail}`;
const rendered = (findings: readonly Finding[]): readonly string[] => findings.map(render).toSorted((left, right) => left.localeCompare(right));

/** Every gate's message and fix as the policies carry them at runtime, so an evaluated concatenation is judged whole. */
async function gateDescriptors(root: string): Promise<readonly DescriptorText[]> {
  const corpus = await loadGateCorpus(root);
  return corpus.gates.flatMap((gate) => [
    { id: gate.id, field: "message", value: gate.message },
    ...(gate.fix === undefined ? [] : [{ id: gate.id, field: "fix", value: gate.fix }]),
  ]);
}

const LAW = "---\nkind: law\nstatus: active\n---\n\nanchor.\n";
const DRAFT = "---\nkind: law\nstatus: draft\n---\n\nanchor.\n";
const OUTSIDE_LAW = Object.fromEntries(LAW_OUTSIDE_DOCS.map((path) => [path, "---\nkind: law\n---\n\nplanted.\n"]));

describe("the real tree", () => {
  test("every doc a gate message or a living-doc link names resolves, and the derived corpus is live", { timeout: scaledBudget(120_000) }, async ({
    repoRoot,
  }) => {
    const descriptors = await gateDescriptors(repoRoot);
    const result = docLinks(loadTree(repoRoot), descriptors);
    // A derivation that resolved nothing would pass: each corpus class must have members, and the gates must have been read.
    expect(descriptors.length).toBeGreaterThan(0);
    expect(result.corpora.law).toBeGreaterThan(0);
    expect(result.corpora.design).toBeGreaterThan(0);
    expect(result.corpora.lawOutsideDocs).toBeGreaterThan(0);
    expect(rendered(result.findings)).toEqual([]);
  });
});

describe("a planted tree", () => {
  test.for([
    {
      why: "a gate message names a doc that resolves under no root",
      files: { "docs/law/__anchor.md": LAW },
      descriptors: [{ id: "__probe", field: "message", value: "see GHOST-DOC-THAT-DOES-NOT-EXIST.md" }],
      expected: ["gate:__probe descriptor: message names GHOST-DOC-THAT-DOES-NOT-EXIST.md, which resolves under no root"],
    },
    {
      why: "a link in a law doc targets a missing sibling",
      files: { "docs/law/__probe.md": "---\nkind: law\n---\n\nSee [the ghost](ghost-sibling-xyz.md).\n" },
      descriptors: [],
      expected: ["docs/law/__probe.md link: link ghost-sibling-xyz.md resolves to no file"],
    },
    {
      why: "a dead link in law outside docs is found, and the same link in a dated review is not",
      files: {
        "docs/law/__anchor.md": LAW,
        "tooling/src/verify/gates/GATE-AUTHORING.md": "---\nkind: law\n---\n\nSee [the ghost](ghost-sibling-xyz.md).\n",
        "docs/reviews/__frozen_probe__.md": "---\nkind: review\n---\n\nSee [the ghost](ghost-sibling-xyz.md).\n",
      },
      descriptors: [],
      expected: ["tooling/src/verify/gates/GATE-AUTHORING.md link: link ghost-sibling-xyz.md resolves to no file"],
    },
    {
      why: "a named law doc that stops resolving is reported rather than shrinking the corpus in silence",
      files: { [CORE_ANCHOR]: LAW },
      descriptors: [],
      expected: LAW_OUTSIDE_DOCS.map((rel) => `${CORE_ANCHOR} corpus: ${rel} is a named law doc that no longer resolves`).toSorted((left, right) =>
        left.localeCompare(right),
      ),
    },
    {
      why: "a walk that finds every path but no living law is blind, not clean",
      files: { [CORE_ANCHOR]: DRAFT, "docs/law/__anchor.md": DRAFT, ...OUTSIDE_LAW },
      descriptors: [],
      expected: [`${CORE_ANCHOR} corpus: the law corpus resolved ZERO living law documents`],
    },
  ])("is flagged: $why", async ({ files, descriptors, expected }, { plantedTree }) => {
    expect(rendered(docLinks(loadPlantedTree(await plantedTree(files)), descriptors).findings)).toEqual(expected);
  });

  test.for([
    {
      why: "a descriptor cites planted docs by bare name and with a section suffix",
      files: { "docs/law/__g_ref_a.md": "---\nkind: law\n---\n\nplanted.\n", "docs/law/__g_split-target.md": "---\nkind: law\n---\n\nplanted.\n" },
      descriptors: [{ id: "__probe", field: "message", value: "see __g_ref_a.md and (__g_split-target.md §6b), clauses §5/§7/__g_split-target.md" }],
    },
    {
      why: "a link to a planted sibling resolves, and a glob is a prose pattern rather than a link",
      files: {
        "docs/law/__g_link-target.md": "---\nkind: law\n---\n\nplanted.\n",
        "docs/law/__probe.md": "---\nkind: law\n---\n\nSee [target](__g_link-target.md) and the `UI-*.md` set.\n",
      },
      descriptors: [],
    },
    {
      why: "a cite under a dot-directory keeps its leading dot",
      files: { ".claude/rules/__g_rule.md": '---\npaths:\n  - "x/**"\n---\n\nplanted.\n', "docs/law/__anchor.md": LAW },
      descriptors: [{ id: "__probe", field: "message", value: "see .claude/rules/__g_rule.md" }],
    },
  ])("passes: $why", async ({ files, descriptors }, { plantedTree }) => {
    const result = docLinks(loadPlantedTree(await plantedTree(files)), descriptors);
    expect(result.corpora.docPaths.length).toBeGreaterThan(0);
    expect(rendered(result.findings)).toEqual([]);
  });
});
