// Gate: ledger-symbol-liveness — backticked file-path identifiers in D-ledger entries must resolve on
// the tree. Catches the exact rot class that needed 6 manual truth-repairs: a file is renamed or deleted
// but its backticked path in a D-entry survives, silently directing the next reader to a dead location.
// ARM A: a backticked path with a recognized extension that does not exist in the tracked-file set.
// ARM B: a backticked path matching a packages/ or tooling/ prefix, same check with prefix resolution.
// DECLARED LIMITS: only file-path-shaped backticked text is checked (must contain a `/` and end with a
// recognized extension). Bare symbol names, config keys, CSS selectors and inline code samples are not
// file paths and are intentionally excluded. A path that was never a real file (example pseudocode) is
// the ONE false-positive class, and its remedy is this policy's ordinary door.
// THE DOOR (standing law §5, §6.2): an HTML-comment marker on its own line directly ABOVE the ledger line,
// positioned on the backticked path exactly as written — the central engine reads a Markdown carrier's
// `<!-- -->` comments and binds one to the FOLLOWING line (`lib/ordinary-waiver.ts#followingResourceCarrier`).
// The identity arm is the `mustPass` row whose fixture carries that marker over the one illustrative path
// it names; move the position and the row reds on the dead-position alarm.
// CARRIER DEMAND, stated because it is the least obvious consequence of `ordinary` here: `tracked-files`
// publishes every tracked path (`ops/resource-tracked.ts`), the resolver folds a fact's paths into the
// owner's effective resource population (`lib/resource-declaration.ts#resolveResourceDeclarations`), and an
// ORDINARY owner's effective resource paths are demanded as waiver carriers
// (`lib/policy-pass.ts#ordinaryWaiverAcquisition`). So every tracked `.md/.css/.json/.jsonc/.sql` file is a
// live marker carrier on every run of this policy: a tracked Markdown symlink would surface as an
// `unresolved` carrier each time, and an `@orb-waive` spelled INSIDE an HTML comment in any tracked
// Markdown file — a review doc quoting a fixture marker — is parsed as a marker and alarmed (the two
// 2026-09-18 alarms in `docs/reviews/gate-runtime/v-conversions-2026-09-13.md`). Prose about a marker
// stays outside the comment span; the demand itself is the same one #1947 ruled by design for
// `native-config`.
// FAMILY: singleton — subject is the D-ledger prose, not a code shape.
// POPULATION: resource-only (no source population); the D-ledger and tracked-files.
import { defineGate } from "../contract/policy.ts";
import type { MarkdownDocument } from "../contract/resource-document.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

/** Extensions that identify a backticked token as a file-path reference. */
const PATH_EXTENSIONS = /\.(ts|tsx|md|json|sql|cjs|mjs|css|html|sh|yaml|yml)$/u;

/** A token carrying a glob, brace, placeholder, relative prefix, absolute path or package specifier
 *  is a PROSE PATTERN or a non-resolvable reference, never a literal file cite. */
const NON_LITERAL_RE = /[*{}<>]|^\.\.\/|^\.\/|^\/|^@orb\//u;

/** Package-name-to-prefix mapping: D-ledger paths like `contracts/rpg/foo.ts` mean
 *  `packages/contracts/src/rpg/foo.ts` — the first segment is the package name. */
const PACKAGE_NAME_PREFIXES: Readonly<Record<string, string>> = {
  contracts: "packages/contracts/src/",
  kit: "packages/kit/src/",
  db: "packages/db/src/",
  ui: "packages/ui/src/",
  client: "packages/client/src/",
  server: "packages/server/src/",
};

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
  "deleted but the ledger still directs readers to it. The ledger is one decision per file, indexed by docs/adr/README.md.";

/** The whole remedy, on the descriptor AND on every finding: the repair first, then the door for the one
 *  class the repair does not fit. The door spells the exact carrier comment and the exact position
 *  (§7.3): the position is the backticked path as written, and the marker sits on the line above. */
const FIX =
  "update the backticked path to the current location, or remove the reference if the concept was deleted. " +
  "For an ILLUSTRATIVE path that was never a file, add `<!-- @orb-waive ledger-symbol-liveness(<the backticked path, exactly as written>): <reason> -->` " +
  "on its own line directly ABOVE the ledger line that carries the path — the HTML comment is the Markdown carrier the central engine reads, " +
  "and the position is the path text the finding points at";

/** Extract backticked file-path-shaped identifiers from markdown text. A file path must contain at
 *  least one `/` and end with a recognized extension. `scanned` is the line count the receipt reports —
 *  what the policy MEASURED (standing law §3), never the cites it found, because a clean ledger legitimately
 *  finds zero and a zero receipt is a refusal, not a verdict. */
function extractPathCites(document: MarkdownDocument): { cites: { path: string; line: number; column: number }[]; scanned: number } {
  const results: { path: string; line: number; column: number }[] = [];
  const lines = document.text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) {
      continue;
    }
    for (const match of line.matchAll(/`([^`]+)`/gu)) {
      const candidate = match[1];
      // Skip paths inside strikethrough (~~...~~) — historical references to deleted files
      const precedingText = line.slice(0, match.index);
      const strikeOpen = (precedingText.match(/~~/gu) ?? []).length;
      if (strikeOpen % 2 !== 0) {
        continue;
      }
      if (candidate !== undefined && candidate.includes("/") && PATH_EXTENSIONS.test(candidate) && !NON_LITERAL_RE.test(candidate)) {
        // +2 for 1-based columns and to skip the opening backtick
        const column = match.index + 2;
        results.push({ path: candidate, line: i + 1, column });
      }
    }
  }
  return { cites: results, scanned: lines.length };
}

/** Check if a cited path resolves against the tracked file set, trying the path as-is first, then
 *  with common prefix patterns, package-name resolution, and suffix matching. */
function resolveOnTree(citedPath: string, trackedSet: ReadonlySet<string>, trackedSuffixIndex: ReadonlyMap<string, boolean>): boolean {
  if (trackedSet.has(citedPath)) {
    return true;
  }
  for (const prefix of RESOLUTION_PREFIXES) {
    if (trackedSet.has(`${prefix}${citedPath}`)) {
      return true;
    }
  }
  // Package-name resolution: `contracts/rpg/foo.ts` -> `packages/contracts/src/rpg/foo.ts`
  const firstSlash = citedPath.indexOf("/");
  if (firstSlash > 0) {
    const firstSegment = citedPath.slice(0, firstSlash);
    const rest = citedPath.slice(firstSlash + 1);
    const packagePrefix = PACKAGE_NAME_PREFIXES[firstSegment];
    if (packagePrefix !== undefined && trackedSet.has(`${packagePrefix}${rest}`)) {
      return true;
    }
  }
  // Suffix match: a D-ledger path relative to a domain root
  return trackedSuffixIndex.has(`/${citedPath}`);
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
  resources: [{ kind: "ledger", id: "d-ledger" }, { kind: "tracked-files" }],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const ledger = readyResourceValue(ctx.resources.ledger("d-ledger"));
      const tracked = readyResourceValue(ctx.resources.trackedFiles()).repoPaths;
      const trackedSet = new Set(tracked);
      // Build a suffix index for domain-relative path resolution
      const trackedSuffixIndex = new Map<string, boolean>();
      for (const p of tracked) {
        let idx = p.indexOf("/");
        while (idx !== -1) {
          trackedSuffixIndex.set(p.slice(idx), true);
          idx = p.indexOf("/", idx + 1);
        }
      }

      let linesScanned = 0;

      for (const document of ledger.documents) {
        const { cites, scanned } = extractPathCites(document);
        linesScanned += scanned;
        for (const cite of cites) {
          if (resolveOnTree(cite.path, trackedSet, trackedSuffixIndex)) {
            continue;
          }
          ctx.report.file(document.path, {
            line: cite.line,
            column: cite.column,
            token: cite.path,
            message: `\`${cite.path}\` does not resolve on the tree — ${MESSAGE}`,
            fix: FIX,
          });
        }
      }

      // Both receipts count what was SCANNED. The retired `path-cites-checked` receipt counted what was
      // FOUND, so the two clean-ledger `mustPass` rows below — zero path cites by construction — refused
      // on `members: 0` instead of passing (measured 2026-09-18 through `verifyPolicyProofs`).
      ctx.receipt({ kind: "population", source: "ledger-documents", members: ledger.documents.length, unresolved: 0 });
      ctx.receipt({ kind: "population", source: "ledger-lines-scanned", members: linesScanned, unresolved: 0 });
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        "docs/adr/0001-an-entry.md": "- **D1** — `domain/chat/verbs/nonexistent-file.ts` is the home for chat reads.\n",
      },
      expect: { count: 1, token: "domain/chat/verbs/nonexistent-file.ts" },
      why: "the founding defect: a backticked file path in a D-entry that names a file not on the tree — the exact rot class this gate exists to catch",
    },
    {
      mode: "resource",
      files: {
        "docs/adr/0001-an-entry.md": "- **D2** — See `packages/server/src/domain/deleted/service.ts` for the implementation.\n",
      },
      expect: { count: 1, token: "packages/server/src/domain/deleted/service.ts" },
      why: "a fully-qualified packages/ path that does not exist on the tree — the typical shape after a domain delete or rename",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "docs/adr/0001-an-entry.md":
          "<!-- @orb-waive ledger-symbol-liveness(domain/chat/verbs/illustrative-only.ts): an illustrative path in the entry's own prose, never a file on the tree. Ends if the entry cites a real home. -->\n" +
          "- **D1** — a read verb shaped like `domain/chat/verbs/illustrative-only.ts` owns the chat read.\n",
      },
      why: "THE POSITIVE IDENTITY ARM (standing law §6.2) over the MARKDOWN carrier: the fixture produces exactly ONE finding — the illustrative path resolves nowhere — and the HTML-comment marker on the line above, positioned on the backticked path exactly as written, consumes it (0 effective, 1 waived, 0 alarms). This is the one false-positive class the header declares and the door the `fix` spells; move the position by one character and the row reds on the dead-position alarm",
    },
    {
      mode: "resource",
      files: {
        "docs/adr/0001-an-entry.md": "- **D1** — `domain/chat` is the chat domain home.\n- **D2** — the `can()` kernel is the one permission site.\n",
      },
      why: "backticked text without a `/` and extension is not a file path and must not trigger — `can()` is a function call, `domain/chat` has no extension",
    },
    {
      mode: "resource",
      files: {
        "docs/adr/0001-an-entry.md": "- **D1** — entry.\n",
        "packages/server/src/domain/chat/verbs/read.ts": "export const x = 1;\n",
      },
      why: "no backticked file paths in the ledger text means no findings — a clean ledger stays clean",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: { "packages/server/src/domain/chat/verbs/read.ts": "export const x = 1;\n" },
      expect: { messageIncludes: "ledger:d-ledger is" },
      why: "THE SUPPLY REFUSAL (law §6.3): mustPass[2] minus the ledger. With no `docs/adr` entry the `d-ledger` resource is not ready, so the owner refuses at the population phase instead of reporting zero dead cites over a ledger it never read",
    },
  ],
});
