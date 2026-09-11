// Policy: contract-derives-not-respells-health — the RENAME/RESHAPE TRIPWIRE for the sibling
// `contract-derives-not-respells` gate's ARM-B ALLOWLIST (family "contract-derives-not-respells", shared
// verbatim). A row exempts a specific `<file>::<ShapeName>` pair because it is a homonym or a read-time
// aggregate, not a re-spelled DB row; the exemption is a claim about that exact shape STILL matching a
// table name today. When it stops (the shape is renamed, deleted, or its matching table disappears) the
// row is a permission nobody is using — a loaded gun for the next author who reuses that shape name — and
// this policy REDS it, unsuppressibly, because the promise it audits is precisely the door the sibling's
// ordinary marker would otherwise reopen.
import { defineGate } from "../contract/policy.ts";
import { ALLOWLIST, DOMAIN_CONTRACT_RE, handWrittenShapes, matchedTable, tableNames } from "./contract-derives-not-respells.ts";

/** Real-tree anchor (GATE-AUTHORING.md §4.5): a stable domain contract file, present on every real run and
 *  needed by no ALLOWLIST row. Also the report anchor, since a finding must land inside this policy's own
 *  declared population. */
const ANCHOR = "packages/server/src/domain/chat/contract/service.ts";

const STALE_ALLOW = (key: string): string =>
  `ALLOWLIST entry \`${key}\` no longer names a hand-spelled table-row shape (renamed, derived, or deleted) — ` +
  "delete the stale row (ratchet down): tooling/src/verify/gates/contract-derives-not-respells.ts";

/** Every ALLOWLIST key that STILL resolves to a live `*Row`/`*Insert` shape matching a real table, re-derived
 *  independently of the sibling occurrence gate (which only reads ALLOWLIST to skip a report, never to
 *  prove liveness). */
function liveAllowlistKeys(files: Parameters<typeof tableNames>[0], relativePath: Parameters<typeof tableNames>[1]): ReadonlySet<string> {
  const tables = tableNames(files, relativePath);
  const seen = new Set<string>();
  for (const sf of files) {
    const domain = DOMAIN_CONTRACT_RE.exec(relativePath(sf))?.groups?.["domain"];
    if (domain === undefined) {
      continue;
    }
    const rel = relativePath(sf);
    for (const shape of handWrittenShapes(sf)) {
      const key = `${rel}::${shape.name}`;
      if (key in ALLOWLIST && matchedTable(shape.name, tables) !== undefined) {
        seen.add(key);
      }
    }
  }
  return seen;
}

export const gate = defineGate({
  id: "contract-derives-not-respells-health",
  family: "contract-derives-not-respells",
  authority: "hard",
  severity: "error",
  population: ["@server", "@db"],
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message:
    'an ALLOWLIST row in contract-derives-not-respells.ts no longer names a live hand-spelled "<table>Row"/"<table>Insert" shape — the homonym/aggregate claim behind the exemption is dead and the row is a standing permission nobody uses.',
  create: (ctx) => ({
    evaluate: () => {
      if (!ctx.files.some((sf) => ctx.relativePath(sf) === ANCHOR)) {
        return;
      }
      const live = liveAllowlistKeys(ctx.files, ctx.relativePath);
      for (const key of Object.keys(ALLOWLIST)) {
        if (!live.has(key)) {
          ctx.report.file(ANCHOR, { line: 1, message: STALE_ALLOW(key) });
        }
      }
    },
  }),

  mustFlag: [
    {
      mode: "source",
      files: {
        [ANCHOR]: "export interface ChatService {\n  readonly noop: () => void;\n}\n",
        "packages/db/src/schema/discovery.ts": 'export const themes = sqliteTable("themes", {});\n',
        "packages/server/src/domain/discovery/contract/results.ts": "export interface RenamedThemeCluster {\n  readonly id: string;\n}\n",
        "packages/db/src/schema/stats.ts": 'export const modelStats = sqliteTable("model_stats", {});\n',
        "packages/server/src/domain/stats/contract/views.ts": "export interface ModelStatRow {\n  readonly model: string;\n}\n",
      },
      expect: { count: 1, messageIncludes: "no longer names a hand-spelled table-row shape" },
      why: "THE RENAME TRIPWIRE: the anchor is loaded; the stats homonym row still resolves, but discovery's `ThemeRow` was renamed away — that row's claim is dead and ratchets down",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        [ANCHOR]: "export interface ChatService {\n  readonly noop: () => void;\n}\n",
        "packages/db/src/schema/discovery.ts": 'export const themes = sqliteTable("themes", {});\n',
        "packages/server/src/domain/discovery/contract/results.ts": "export interface ThemeRow {\n  readonly id: string;\n}\n",
        "packages/db/src/schema/stats.ts": 'export const modelStats = sqliteTable("model_stats", {});\n',
        "packages/server/src/domain/stats/contract/views.ts": "export interface ModelStatRow {\n  readonly model: string;\n}\n",
      },
      why: "both ALLOWLIST rows STILL EARNED, judged against the real-tree anchor: each shape still resolves to its named table, so neither arm fires",
    },
    {
      mode: "source",
      files: { "packages/server/src/unrelated.ts": "export const clean = true;\n" },
      why: "the anchor is not loaded (a plain fixture run) — the tripwire self-guards off, never claiming both rows dead",
    },
  ],
});
