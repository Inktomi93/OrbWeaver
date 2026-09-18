// Gate: ledger-symbol-liveness — backticked file-path identifiers in D-ledger entries must resolve on
// the tree. Catches the exact rot class that needed 6 manual truth-repairs: a file is renamed or deleted
// but its backticked path in a D-entry survives, silently directing the next reader to a dead location.
// ARM A: a backticked path with a recognized extension that does not exist in the tracked-file set.
// ARM B: a backticked path matching a packages/ or tooling/ prefix, same check with prefix resolution.
// DECLARED LIMITS: only file-path-shaped backticked text is checked (must contain a `/` and end with a
// recognized extension). Bare symbol names, config keys, CSS selectors and inline code samples are not
// file paths and are intentionally excluded. A path that was never a real file (example pseudocode) will
// false-positive — those are waivable via @orb-waive.
// FAMILY: singleton — subject is the D-ledger prose, not a code shape.
// POPULATION: resource-only (no source population); the D-ledger and tracked-files.
import { defineGate } from "../contract/policy.ts";
import type { MarkdownDocument } from "../contract/resource-document.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

/** Extensions that identify a backticked token as a file-path reference. */
const PATH_EXTENSIONS = /\.(ts|tsx|md|json|sql|cjs|mjs|css|html|sh|yaml|yml)$/u;

/** Common prefix patterns: D-entries often cite paths relative to a package root. */
const RESOLUTION_PREFIXES = [
  "packages/server/src/",
  "packages/client/src/",
  "packages/kit/src/",
  "packages/contracts/src/",
  "packages/db/src/",
  "packages/ui/src/",
  "tooling/src/",
  "tests/",
  "scripts/",
  "docs/",
];

const MESSAGE =
  "a backticked file path in a D-ledger entry does not resolve on the tree — the file was renamed or " +
  "deleted but the ledger still directs readers to it. See Core-Path-Registry.md";

const FIX = "update the backticked path to the current location, or remove the reference if the concept was deleted";

/** Extract backticked file-path-shaped identifiers from markdown text. A file path must contain at
 *  least one `/` and end with a recognized extension. */
function extractPathCites(document: MarkdownDocument): { path: string; line: number }[] {
  const results: { path: string; line: number }[] = [];
  const lines = document.text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) {
      continue;
    }
    for (const match of line.matchAll(/`([^`]+)`/gu)) {
      const candidate = match[1];
      if (candidate !== undefined && candidate.includes("/") && PATH_EXTENSIONS.test(candidate)) {
        results.push({ path: candidate, line: i + 1 });
      }
    }
  }
  return results;
}

/** Check if a cited path resolves against the tracked file set, trying the path as-is first, then
 *  with common prefix patterns. */
function resolveOnTree(citedPath: string, trackedSet: ReadonlySet<string>): boolean {
  if (trackedSet.has(citedPath)) {
    return true;
  }
  for (const prefix of RESOLUTION_PREFIXES) {
    if (trackedSet.has(`${prefix}${citedPath}`)) {
      return true;
    }
  }
  return false;
}

export const gate = defineGate({
  id: "ledger-symbol-liveness",
  family: "ledger-symbol-liveness",
  authority: "ordinary",
  severity: "error",
  population: { of: "none", why: "resource-only policy: the D-ledger and tracked-files are the entire subject" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "ledger", id: "core-path-registry" }, { kind: "tracked-files" }],
  message: MESSAGE,
  fix: `@orb-waive ledger-symbol-liveness(<pos>): <reason> — ${FIX}`,
  create: (ctx) => ({
    evaluate: () => {
      const ledger = readyResourceValue(ctx.resources.ledger("core-path-registry"));
      const tracked = readyResourceValue(ctx.resources.trackedFiles()).repoPaths;
      const trackedSet = new Set(tracked);

      let citesChecked = 0;

      for (const document of ledger.documents) {
        const cites = extractPathCites(document);
        for (const cite of cites) {
          citesChecked++;
          if (resolveOnTree(cite.path, trackedSet)) {
            continue;
          }
          ctx.report.file(document.path, {
            line: cite.line,
            column: 1,
            token: cite.path,
            message: `\`${cite.path}\` does not resolve on the tree — ${MESSAGE}`,
            fix: FIX,
          });
        }
      }

      ctx.receipt({ kind: "population", source: "ledger-documents", members: ledger.documents.length, unresolved: 0 });
      ctx.receipt({ kind: "population", source: "path-cites-checked", members: citesChecked, unresolved: 0 });
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        "docs/architecture/core/Core-Path-Registry.md": "- **D1** — `domain/chat/verbs/nonexistent-file.ts` is the home for chat reads.\n",
      },
      expect: { count: 1, token: "domain/chat/verbs/nonexistent-file.ts", messageIncludes: "does not resolve" },
      why: "the founding defect: a backticked file path in a D-entry that names a file not on the tree — the exact rot class this gate exists to catch",
    },
    {
      mode: "resource",
      files: {
        "docs/architecture/core/Core-Path-Registry.md": "- **D2** — See `packages/server/src/domain/deleted/service.ts` for the implementation.\n",
      },
      expect: { count: 1, token: "packages/server/src/domain/deleted/service.ts", messageIncludes: "does not resolve" },
      why: "a fully-qualified packages/ path that does not exist on the tree — the typical shape after a domain delete or rename",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "docs/architecture/core/Core-Path-Registry.md":
          "- **D1** — `domain/chat` is the chat domain home.\n- **D2** — the `can()` kernel is the one permission site.\n",
      },
      why: "backticked text without a `/` and extension is not a file path and must not trigger — `can()` is a function call, `domain/chat` has no extension",
    },
    {
      mode: "resource",
      files: {
        "docs/architecture/core/Core-Path-Registry.md": "- **D1** — entry.\n",
        "packages/server/src/domain/chat/verbs/read.ts": "export const x = 1;\n",
      },
      why: "no backticked file paths in the ledger text means no findings — a clean ledger stays clean",
    },
  ],
});
