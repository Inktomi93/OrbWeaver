// Policy: dangling-ref-citations — the grantable path/symbol half of the dangling-refs family.
// Backticked repo-path and strict UPPER_SNAKE mentions in the derived living-doc corpus must resolve.
// The former ARM3_ALLOW/ARM4_ALLOW tables were permissions, not classifications: every row is now an
// exact central reviewed grant, and central reconciliation owns zero-use staleness. The hard sibling
// retains descriptor/link integrity, derived-corpus blindness, and the three-sided generated-path
// classification. Both siblings read the same corpus and citation predicates from lib/.
import type { GatePolicyContext, GatePolicyProof } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { PathStatusIndex } from "../lib/dangling-ref-citations.ts";
import {
  collectDeclarationName,
  DECLARATION_NAME_VISITOR_KINDS,
  scanPathCitations,
  scanSymbolCitations,
  shorthandCandidates,
  shorthandExists,
} from "../lib/dangling-ref-citations.ts";
import { CATALOG_REL, danglingRefCorpora, danglingRefTextIndex, GITIGNORED_ABSENT, LAW_OUTSIDE_DOCS } from "../lib/dangling-ref-corpus.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import type { ReviewedGrantFileCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantFileCandidates } from "../lib/reviewed-grant-findings.ts";

export const DANGLING_PATH_OPERATION = "dangling-path-cite";
export const DANGLING_SYMBOL_OPERATION = "dangling-symbol-cite";

const MESSAGE =
  "a backticked path or UPPER_SNAKE symbol in a living law/design doc has no matching authored path or declaration. " +
  "A phantom citation is drift; an intentional temporary or external reference requires one exact central reviewed grant.";
const UNREADABLE = "a living-doc citation could not be resolved to a grant identity.";
const FIX =
  "repoint the cite to the live path or declaration, strike/rider deliberate history, or add an exact reviewed grant with a cited reason and end condition.";

function statusIndex(ctx: GatePolicyContext, selectors: readonly string[]): PathStatusIndex {
  const demanded = [...new Set(selectors)];
  const identities = readyResourceValue(ctx.resources.authoredPaths(demanded.length > 0 ? demanded : [CATALOG_REL])).identities;
  return new Map(identities.map((identity) => [identity.selector, identity.status]));
}

function reportCitations(ctx: GatePolicyContext, declaredNames: ReadonlySet<string>): void {
  const documentFacts = readyResourceValue(ctx.resources.documents());
  const catalog = readyResourceValue(ctx.resources.json("doc-catalog"));
  const packageEntries = readyResourceValue(ctx.resources.authoredTree("packages"));
  const toolingEntries = readyResourceValue(ctx.resources.authoredTree("tooling"));
  const outsidePaths = LAW_OUTSIDE_DOCS.filter((path) => toolingEntries.some((entry) => entry.kind === "file" && entry.path === path));
  const outsideText = readyResourceValue(ctx.resources.authoredText(outsidePaths.length > 0 ? outsidePaths : [CATALOG_REL]));
  const texts = danglingRefTextIndex(documentFacts, outsideText);
  const docs = danglingRefCorpora(
    catalog.value,
    documentFacts.documents.map((document) => document.path),
    outsidePaths,
  );
  const pathScan = scanPathCitations(texts, docs.audit);
  const paths = statusIndex(
    ctx,
    pathScan.cites.flatMap(({ ref }) => shorthandCandidates(ref)),
  );
  const entries = [...packageEntries, ...toolingEntries];
  const pathCandidates: ReviewedGrantFileCandidate[] = pathScan.cites
    .filter(({ ref }) => !(ref in GITIGNORED_ABSENT || shorthandExists(paths, entries, ref)))
    .map(({ file, line, ref }) => ({ file, line, note: ref, subject: ref, operation: DANGLING_PATH_OPERATION }));
  const symbolCandidates: ReviewedGrantFileCandidate[] = scanSymbolCitations(texts, docs.symbols, declaredNames).map(({ file, line, ref }) => ({
    file,
    line,
    note: ref,
    subject: ref,
    operation: DANGLING_SYMBOL_OPERATION,
  }));
  reportReviewedGrantFileCandidates(ctx.report, [...pathCandidates, ...symbolCandidates], {
    message: MESSAGE,
    unreadableMessage: UNREADABLE,
    fix: FIX,
  });
  if (docs.law > 0) {
    ctx.receipt({ kind: "population", source: "citation-corpus:law", members: docs.law });
  }
  if (docs.design > 0) {
    ctx.receipt({ kind: "population", source: "citation-corpus:design", members: docs.design });
  }
  if (docs.lawOutsideDocs > 0) {
    ctx.receipt({ kind: "population", source: "citation-corpus:law-outside-docs", members: docs.lawOutsideDocs });
  }
}

const PROOF_DOC = "docs/architecture/core/__dangling_refs_resource_anchor.md";
const PROOF_FILES = {
  [PROOF_DOC]: "---\nkind: law\n---\n\nResource proof anchor.\n",
  [CATALOG_REL]:
    '{"documents":[{"path":"docs/architecture/core/__dangling_refs_resource_anchor.md","lane":"core","frontmatter":{"fields":{"status":"active"}},"receipt":{"authority":"normative"}}]}\n',
  ".gitignore": "dist/\n",
  "packages/kit/src/__dangling_refs_resource_anchor.ts": "export const DANGLING_REFS_RESOURCE_ANCHOR = true;\n",
  "tooling/src/__dangling_refs_resource_anchor.ts": "export const danglingRefsResourceAnchor = true;\n",
} as const;

function proof(files: Readonly<Record<string, string>>, why: string, grant?: { readonly subject: string; readonly operation: string }): GatePolicyProof {
  return { mode: "resource" as const, files: { ...PROOF_FILES, ...files }, ...(grant === undefined ? {} : { grant }), why };
}

export const gate = defineGate({
  id: "dangling-ref-citations",
  family: "dangling-refs",
  authority: "reviewed-grant",
  severity: "error",
  population: ["@authored", "@showcase"],
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [
    { kind: "documents" },
    { kind: "json", id: "doc-catalog" },
    { kind: "authored-tree", id: "packages" },
    { kind: "authored-tree", id: "tooling" },
    { kind: "authored-text" },
    { kind: "authored-path" },
  ],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const declaredNames = new Set<string>();
    return {
      visitors: [
        {
          kinds: DECLARATION_NAME_VISITOR_KINDS,
          visit: (node, sourceFile) => collectDeclarationName(declaredNames, node, sourceFile),
        },
      ],
      evaluate: () => reportCitations(ctx, declaredNames),
    };
  },
  mustFlag: [
    {
      mode: "resource" as const,
      files: {
        ...PROOF_FILES,
        "docs/architecture/core/__probe3.md": "---\nkind: law\n---\n\nSee `domain/__ghost_domain__/x.ts` for the shape.\n",
      },
      expect: { count: 1 },
      grant: { subject: "domain/__ghost_domain__/x.ts", operation: DANGLING_PATH_OPERATION },
      why: "LEGACY mustFlag[2]: a backticked domain shorthand names no authored path",
    },
    {
      mode: "resource" as const,
      files: {
        ...PROOF_FILES,
        "docs/architecture/core/__probe4.md": "---\nkind: law\n---\n\nScoped to `GHOST_CONST_XYZ` recent turns.\n",
      },
      expect: { count: 1 },
      grant: { subject: "GHOST_CONST_XYZ", operation: DANGLING_SYMBOL_OPERATION },
      why: "LEGACY mustFlag[3]: a strict UPPER_SNAKE token names no declaration",
    },
    {
      mode: "resource" as const,
      files: {
        ...PROOF_FILES,
        [CATALOG_REL]:
          '{"documents":[{"path":"docs/design/__probe6.md","lane":"design","frontmatter":{"fields":{"status":"active"}},"receipt":{"authority":"design"}}]}\n',
        "docs/design/__probe6.md": "---\nkind: design\n---\n\nThe write boundary is `domain/__ghost_domain__/x.ts`.\n",
      },
      expect: { count: 1 },
      grant: { subject: "domain/__ghost_domain__/x.ts", operation: DANGLING_PATH_OPERATION },
      why: "LEGACY mustFlag[5]: a catalogued living design home participates in path citation integrity",
    },
    {
      mode: "resource" as const,
      files: {
        ...PROOF_FILES,
        "tooling/src/verify/gates/GATE-AUTHORING.md": "---\nkind: law\n---\n\nThe controls live at `tests/tooling/__ghost_controls__.test.ts`.\n",
      },
      expect: { count: 1 },
      grant: { subject: "tests/tooling/__ghost_controls__.test.ts", operation: DANGLING_PATH_OPERATION },
      why: "LEGACY mustFlag[6]: named law outside docs participates in path citation integrity",
    },
    {
      mode: "resource" as const,
      files: {
        ...PROOF_FILES,
        "docs/architecture/core/__probe_dead_end.md": "---\nkind: law\n---\n\nA message navigating a reader to `GHOST_DEADEND_CONST` read as a dead end.\n",
      },
      expect: { count: 1 },
      grant: { subject: "GHOST_DEADEND_CONST", operation: DANGLING_SYMBOL_OPERATION },
      why: "LEGACY mustFlag[9]: the reachability idiom dead end is not a deliberate-history rider",
    },
  ],
  mustPass: [
    proof(
      {
        "docs/architecture/core/__probe3.md": "---\nkind: law\n---\n\nSee `domain/__g_ok/x.ts` and `@orb/kit/__g_ok`.\n",
        "packages/server/src/domain/__g_ok/x.ts": "export const x = 1;\n",
        "packages/kit/src/__g_ok/index.ts": "export const y = 1;\n",
      },
      "LEGACY mustPass[2]: domain and package shorthands resolve",
    ),
    proof(
      {
        "docs/architecture/core/__probe3b.md": "---\nkind: law\n---\n\nSee `@orb/tooling` and `@orb/tooling/__g_ok`.\n",
        "tooling/src/__g_ok/index.ts": "export const z = 1;\n",
      },
      "LEGACY mustPass[3]: @orb/tooling resolves against the root tooling tree",
    ),
    proof(
      {
        "docs/architecture/core/__probe4.md": "---\nkind: law\n---\n\nSee `PLANTED_CONST`.\n",
        "packages/kit/src/__probe4.ts": "export const PLANTED_CONST = 1;\n",
      },
      "LEGACY mustPass[4]: a planted UPPER_SNAKE declaration resolves through dispatcher-fed evidence",
    ),
    proof(
      {
        "docs/architecture/core/__probe5.md":
          "---\nkind: law\n---\n\n**BUILD-STATE RIDER:** `domain/__g_dead__/x.ts` and `GHOST_RIDER_CONST` are purged.\n\n~~`ANOTHER_GHOST_CONST`~~ struck as dead.\n",
      },
      "LEGACY mustPass[5]: rider and struck history stay structurally exempt",
    ),
    proof(
      {
        "docs/architecture/core/__probe7.md":
          "---\nkind: law\n---\n\nSee `domain/__g_ok/x.ts:19`, `domain/__g_ok/x.ts:12-30`, `domain/__g_ok/x.ts:201,207`,\n`domain/__g_ok/x.ts:33-39,257-282`, `domain/__g_ok/x.ts:6/:18` and `domain/__g_ok/x.ts::readIt()`.\n",
        "packages/server/src/domain/__g_ok/x.ts": "export const x = 1;\n",
      },
      "LEGACY mustPass[6]: every supported line-reference suffix trims before resolution",
    ),
    proof(
      {
        [CATALOG_REL]:
          '{"documents":[{"path":"docs/history/__probe8.md","lane":"history","frontmatter":{"fields":{"status":"active"}},"receipt":{"authority":"historical"}},{"path":"docs/design/__probe9.md","lane":"design","frontmatter":{"fields":{"status":"active"}},"receipt":{"authority":"design"}}]}\n',
        "docs/history/__probe8.md": "---\nkind: history\n---\n\nIt used to live at `domain/__ghost_domain__/x.ts`.\n",
        "docs/design/__probe9.md": "---\nkind: design\n---\n\nThe cap would be `GHOST_PROPOSED_CONST`.\n",
      },
      "LEGACY mustPass[7]: frozen evidence stays outside the corpus and arm 4 remains law-only",
    ),
    proof(
      { "docs/architecture/core/__probe_dead_sense.md": "---\nkind: law\n---\n\n`GHOST_DEAD_MACHINERY_CONST` is dead — the loader stopped reading it.\n" },
      "LEGACY mustPass[0]: deliberate dead machinery remains a rider",
    ),
  ],
});
