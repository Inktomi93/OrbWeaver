// Policy: contract-derives-not-respells-health — the RENAME/RESHAPE TRIPWIRE for the sibling
// `contract-derives-not-respells` gate's ARM-B ALLOWLIST (family "contract-derives-not-respells", shared
// verbatim). A row exempts a specific `<file>::<ShapeName>` pair because it is a homonym or a read-time
// aggregate, not a re-spelled DB row; the exemption is a claim about that exact shape STILL matching a
// table name today. When it stops (the shape is renamed, deleted, or its matching table disappears) the
// row is a permission nobody is using — a loaded gun for the next author who reuses that shape name — and
// this policy REDS it, unsuppressibly, because the promise it audits is precisely the door the sibling's
// ordinary marker would otherwise reopen.
//
// FAMILY READER: `lib/contract-derives-not-respells.ts` — `ALLOWLIST`, `DOMAIN_CONTRACT_RE`,
// `handWrittenShapes`, `matchedTable`, `tableNames`. This module used to import all five from the SIBLING
// GATE MODULE, which a `v-unaudited-finals` audit refuted against §5b.4 (a family is "a real shared `lib/`
// reader (module + function, named in the header)") and the owner ruled generally on 2026-09-12
// (#2091/#2096): **a gate module NEVER imports another gate module; a shared predicate moves to
// `lib/<family>.ts`.** Nothing about the computation changed — both policies read the identical rows, which
// is the invariant this tripwire depends on.
import { defineGate } from "../contract/policy.ts";
import { ALLOWLIST, DOMAIN_CONTRACT_RE, handWrittenShapes, matchedTable, tableNames } from "../lib/contract-derives-not-respells.ts";

/** Real-tree anchor (GATE-AUTHORING.md §4.5): a stable domain contract file, present on every real run and
 *  needed by no ALLOWLIST row. Also the report anchor, since a finding must land inside this policy's own
 *  declared population. */
const ANCHOR = "packages/server/src/domain/chat/contract/service.ts";

const STALE_ALLOW = (key: string): string =>
  `ALLOWLIST entry \`${key}\` no longer names a hand-spelled table-row shape (renamed, derived, or deleted) — ` +
  "delete the stale row (ratchet down): tooling/src/verify/lib/contract-derives-not-respells.ts";

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
      expect: { count: 1, messageIncludes: "`packages/server/src/domain/discovery/contract/results.ts::ThemeRow`" },
      why: "THE RENAME TRIPWIRE: the anchor is loaded; the stats homonym row still resolves, but discovery's `ThemeRow` was renamed away — that row's claim is dead and ratchets down. The `messageIncludes` names the KEY, not the shared sentence: every finding this policy can emit carries `no longer names a hand-spelled table-row shape`, so pinning that fragment asserted nothing about WHICH allowlist row died (the live `policy-proof-expectations` finding at this row, closed with #2090). The key is the only varying part of `STALE_ALLOW`, which makes it the row's real discriminator",
    },
    {
      mode: "source",
      files: {
        [ANCHOR]: "export interface ChatService {\n  readonly noop: () => void;\n}\n",
        "packages/server/src/domain/discovery/contract/results.ts": "export interface ThemeRow {\n  readonly id: string;\n}\n",
        "packages/db/src/schema/stats.ts": 'export const modelStats = sqliteTable("model_stats", {});\n',
        "packages/server/src/domain/stats/contract/views.ts": "export interface ModelStatRow {\n  readonly model: string;\n}\n",
      },
      expect: { count: 1, messageIncludes: "`packages/server/src/domain/discovery/contract/results.ts::ThemeRow`" },
      why: "THE TABLE-DISAPPEARED DEATH MODE (#2090), and it is a SECOND death mode, not a spelling of the first. The header has always promised three — the shape is `renamed, deleted, or its matching table disappears` — and only the rename was ever pinned: here `ThemeRow` is still spelled exactly as the ALLOWLIST row names it, and the `themes` TABLE is what is gone, so `matchedTable` is the clause that decides. THE CUT DIRECTION IS INVERTED BECAUSE THIS IS A TRIPWIRE (§4.1): its fences ACQUIT, so opening `matchedTable(...) !== undefined` to `true` makes it flag FEWER, and the falsifier is THIS `mustFlag` ROW GOING GREEN. Measured 2026-09-12: with the fence open this row reports 0 and reds, and before it existed the same cut came back CLEAN across the whole module",
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
