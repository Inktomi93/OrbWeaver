// THE §4.6 CONVERSION DIFFERENTIAL for the Drizzle schema-fact family — #2000 Tier 2b + Tier 2c, lane
// p-parity-tier2bc. NINE legacy descriptors, every one of their 86 `mustFlag`/`mustPass` examples replayed
// through the FROZEN legacy `runPass` AND through the final policies, with all three §4.6 comparisons
// declared per example: FINDINGS, POPULATIONS and TOOL ERRORS. `schema-fact-wave-1.test.ts` and
// `ledger-banned-shapes.test.ts` are CONFORMANCE — they run each final policy's own rewritten rows, which
// only proves the new code agrees with itself. Nothing on the tree compared the two engines until this file.
//
// READ THE LEGACY-SIDE NUMBER FIRST, because a zero there downgrades everything after it to a
// population/outcome receipt. It is NOT zero here: across the nine modules the legacy side produces 42
// findings on 41 of the 86 examples, so every declared row below is an informative comparison rather than
// the both-sides-zero vacuity §4.6 warns about. The per-module numbers are in each test's header and are
// two-sided — each is the sum of that module's declared `legacy` arrays, so changing one reds its row;
// this file total is their sum:
//   schema-banned-shapes 9/9 · nullable-column-inequality 7 on 6 · db-enum-from-tuple 1/1 ·
//   fk-columns-indexed 7/7 · fk-ondelete-stated 2/2 · table-explicit-primary-key 4/4 ·
//   ownerid-registry 3/3 · own-tables-only 4/4 · schema-branding 5/5.
//
// ─── THE ONE FINDING THIS DIFFERENTIAL PRODUCED, and it is the whole family at once ───────────────────
// THE LEGACY ENGINE RECOGNISED DRIZZLE BY TEXT; THE FINAL ENGINE RESOLVES IDENTITY AND REFUSES WHEN IT
// CANNOT. Every legacy module matched the IDENTIFIER `sqliteTable` (and the FK target's NAME) lexically,
// so a fixture that imports nothing, or names a parent table it never declares, still produced findings.
// The final family consumes `drizzleSchemaFact`, whose members must resolve to the canonical
// `drizzle-orm/sqlite-core` builders and whose FK targets must bind to a real lexical symbol; every
// consumer calls `recordReadySchemaFact`, which THROWS on any non-`ready` status. So 61 of the 86 legacy
// examples now produce a TOOL ERROR instead of a verdict.
//
// THAT IS FAIL-CLOSED, NOT A LOST CATCH — a tool error is louder than a finding, never quieter — but a
// replay that stopped there would be exactly the vacuous receipt §4.6 exists to prevent: it would prove
// only that the legacy FIXTURES are under-declared, and say nothing about whether the defect they encode
// is still caught. So every such example carries a CONSTRUCTED TWIN: the same fixture, minimally completed
// so the fact resolves (the missing `drizzle-orm/sqlite-core` import, the undeclared parent table, or the
// unresolvable `@orb/db` specifier), replayed through BOTH engines again.
//
// EVERY TWIN CARRIES ITS OWN INERTNESS CONTROL, asserted mechanically rather than declared: the LEGACY
// engine's verdict on the twin must equal its verdict on the raw example (compared without line numbers,
// because a prepended declaration shifts every line below it). If the completion moved the legacy verdict,
// the twin is a DIFFERENT example and proves nothing about parity — that control is the difference between
// this file and a table of numbers.
//
// VERDICT, per module, in the test headers below. The catch survives in every case; the four genuine
// behavioural differences are each classified at their row: the D12 import arm RETIRED to biome, the
// `contract-banned-shapes` population NARROWING (7,138 → 105) with its two-sided successor, the
// `nullable-column-inequality` CO-LOCATION strengthening that flips one legacy `mustPass` red, and
// `schema-branding`'s presence-only → CANONICAL brand strengthening that flips four.
//
// WHY THE HEADER SHIM IS LINE-ANCHORED. A blanket `String.replace` over a frozen gate module also patches
// its FIXTURE STRINGS — these modules embed authored source containing `import … from "./x-columns"` — and
// then BOTH engines judge a broken specifier and report a matching pair of WRONG numbers, which a count
// comparison structurally cannot detect. `shimHeaderImports` rewrites only the header import block and
// asserts the body is byte-identical afterwards.
import { gate as contractBannedShapes } from "../../../../tooling/src/verify/gates/contract-banned-shapes.ts";
import { gate as dbEnumFromTuple } from "../../../../tooling/src/verify/gates/db-enum-from-tuple.ts";
import { gate as fkColumnsIndexed } from "../../../../tooling/src/verify/gates/fk-columns-indexed.ts";
import { gate as fkOnDeleteStated } from "../../../../tooling/src/verify/gates/fk-ondelete-stated.ts";
import { gate as nullableColumnInequality } from "../../../../tooling/src/verify/gates/nullable-column-inequality.ts";
import { gate as ownTablesOnly } from "../../../../tooling/src/verify/gates/own-tables-only.ts";
import { gate as ownerIdRegistry } from "../../../../tooling/src/verify/gates/ownerid-registry.ts";
import { gate as schemaBannedShapes } from "../../../../tooling/src/verify/gates/schema-banned-shapes.ts";
import { gate as schemaBranding } from "../../../../tooling/src/verify/gates/schema-branding.ts";
import { gate as tableExplicitPrimaryKey } from "../../../../tooling/src/verify/gates/table-explicit-primary-key.ts";
import type { Files, Repair, Scenario } from "../../../support/legacy-differential.ts";
import { createDifferential, frozenLegacyGate, label } from "../../../support/legacy-differential.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

/** Each module replays every example FOUR times (legacy raw, final raw, legacy twin, final twin) over a
 *  fresh type checker, so the per-test default is the wrong number for the same reason `schema-fact-wave-1`
 *  raised its own. */
const TIMEOUT_MS = scaledBudget(120_000);

const EMPTY_SCHEMA = /^drizzle schema fact empty: schema source population declares no Drizzle SQLite tables$/u;
const ZERO_PATHS = /^Invalid population resolution: expression admitted zero paths from (?<count>\d+) candidate\(s\)$/u;
const UNRESOLVED = /^drizzle schema fact unresolved: (?<detail>.+)$/u;
const FACT_FAILED =
  /^declared fact failed: drizzle-schema: population: Invalid population resolution: expression admitted zero paths from (?<count>\d+) candidate\(s\)$/u;

/** TOTAL by construction: an unclassified tool error THROWS rather than collapsing into a code. A
 *  differential that silently absorbs a new refusal shape is the vacuity this file exists to prevent. */
function toolErrorCode(owner: string, phase: string, message: string): string {
  if (EMPTY_SCHEMA.test(message)) {
    return `${owner} EMPTY-SCHEMA`;
  }
  const zero = ZERO_PATHS.exec(message);
  if (zero?.groups !== undefined) {
    return `${owner} ZERO-PATHS(${zero.groups["count"] as string})`;
  }
  const failed = FACT_FAILED.exec(message);
  if (failed?.groups !== undefined) {
    return `${owner} FACT-FAILED-ZERO-PATHS(${failed.groups["count"] as string})`;
  }
  const unresolved = UNRESOLVED.exec(message);
  if (unresolved?.groups !== undefined) {
    return `${owner} UNRESOLVED(${unresolved.groups["detail"] as string})`;
  }
  throw new Error(`unclassified tool error — the differential must not absorb one silently: ${owner}/${phase}: ${message}`);
}

const { finalReplay, legacyReplay, runScenarios } = createDifferential("/schema-fact-parity", toolErrorCode);

// ─── THE CONSTRUCTED COMPLETIONS ─────────────────────────────────────────────────────────────────────
// A repair exists ONLY to make a legacy fixture resolvable to the final engine's readers. It never edits
// the defect, and `runScenarios` proves that mechanically per example.

/** THE MISSING IMPORT. The legacy gates matched the identifier `sqliteTable` lexically, so most of their
 *  fixtures never imported it; the fact requires the canonical `drizzle-orm/sqlite-core` origin. */
const DRIZZLE = 'import { index, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";\n';
/** THE MISSING PARENT. Legacy FK fixtures name a target table they never declare. SELF-CONTAINED and
 *  ALIASED so it can be prepended to a file that already imports from the same module under its own
 *  names — the aliases bind nothing the example uses. */
const PARENTS = (names: readonly string[]): string =>
  `import { sqliteTable as parentTable, text as parentText } from "drizzle-orm/sqlite-core";\n${names
    .map((name) => `export const ${name} = parentTable("${name}", { id: parentText("id").primaryKey() });\n`)
    .join("")}`;
/** THE UNRESOLVABLE PACKAGE DOOR (guide §4.8b, one layer over). `nullable-column-inequality`'s legacy
 *  fixtures import their table from `@orb/db`, which resolves to NOTHING in a virtual project with no
 *  `node_modules`; the final's column reader then answers `unresolved` and fails QUIET by its declared
 *  limit. The final policy's OWN rows use the relative path for exactly this reason, so the repair is to
 *  spell the same door the module's proofs already spell. */
const ORB_DB_DOOR: Repair = {
  replace: { "packages/server/src/domain/x/persistence/reads.ts": [['from "@orb/db"', 'from "../../../../../db/src/schema/x"']] },
};

// ─── 1. TIER 2b — schema-banned-shapes → schema-banned-shapes + contract-banned-shapes (+ biome) ──────
// LEGACY-SIDE COVERAGE: 9 findings on 9 of 12 examples. The legacy module was SPLIT BY EVIDENCE PLANE at
// `1bf7ff7d9`, so the legacy gate's behaviour is now the behaviour of the two policies TOGETHER plus a
// biome rule, and nothing compared the union. The frozen SHA is the module's own header claim,
// re-verified: `0593a6a6c` is the parent of the split commit.
//
// THE POPULATION NARROWING #2000 NAMES (7,138 → 105) IS VISIBLE HERE AS A FENCE, not as a count: the
// contract rows are now judged ONLY inside `@contracts`, and a schema-only fixture makes that policy
// report a `[population]` tool error rather than a silent zero (§4.8). The narrowing's SUCCESSOR — the
// two-sided missing-subject arm that reds when a ruled name stops resolving in its declared home — fires
// in EVERY contracts-side row below, which is why those rows carry a second finding the legacy never had.
const BANNED_BASE = "0593a6a6cbd151faa088ddd3f9cbaca0ce69b4ef";
const CBS_ZERO_1 = "contract-banned-shapes ZERO-PATHS(1)";
const CBS_ZERO_2 = "contract-banned-shapes ZERO-PATHS(2)";
const SBS_EMPTY = "schema-banned-shapes EMPTY-SCHEMA";
const CBS_MISSING_SETTINGS = "contract-banned-shapes | packages/contracts/src/identity/index.ts:1 | - | the ledger ban on `appSettingsSchema` no longe";

test(
  "schema-banned-shapes: the evidence-plane split reproduces every legacy catch, and the contract narrowing is a fence with a successor",
  async ({ scratch }) => {
    const legacy = await frozenLegacyGate(scratch, BANNED_BASE, "tooling/src/verify/gates/schema-banned-shapes.ts");
    const compared = runScenarios(legacy, [schemaBannedShapes, contractBannedShapes], "packages/db/src/schema/x.ts", [
      {
        why: "mustFlag[0] the #1035 SHORTHAND red. The final anchors on the COLUMN declaration rather than the legacy line-1 stub",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: ["legacy | packages/db/src/schema/chat.ts:1 | - | a *presetId* column is a ledger-REJECTED schem"],
        final: [],
        finalErrors: [CBS_ZERO_1, SBS_EMPTY],
        repair: { prepend: { "packages/db/src/schema/chat.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: ["schema-banned-shapes | packages/db/src/schema/chat.ts:3 | activePresetId | a *presetId* column is a ledger-REJECTED schem"],
        twinFinalErrors: [CBS_ZERO_1],
      },
      {
        why: "mustFlag[1] the #945 IMPORTED-COLUMNS red — the final reports in the DECLARING file, which is the improvement the legacy header wanted",
        legacyPopulation: 2,
        finalPopulation: 2,
        legacy: ["legacy | packages/db/src/schema/x.ts:1 | - | a *presetId* column is a ledger-REJECTED schem"],
        final: [],
        finalErrors: [CBS_ZERO_2, SBS_EMPTY],
        repair: { prepend: { "packages/db/src/schema/x-columns.ts": DRIZZLE, "packages/db/src/schema/x.ts": DRIZZLE } },
        twinFinalPopulation: 2,
        twinFinal: ["schema-banned-shapes | packages/db/src/schema/x-columns.ts:2 | activePresetId | a *presetId* column is a ledger-REJECTED schem"],
        twinFinalErrors: [CBS_ZERO_2],
      },
      {
        why: "mustFlag[2] D18 chats.ownerId — 1:1 on the twin",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: ["legacy | packages/db/src/schema/chat.ts:1 | - | `chats.ownerId` is a ledger-REJECTED schema/co"],
        final: [],
        finalErrors: [CBS_ZERO_1, SBS_EMPTY],
        repair: { prepend: { "packages/db/src/schema/chat.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: ["schema-banned-shapes | packages/db/src/schema/chat.ts:2 | ownerId | `chats.ownerId` is a ledger-REJECTED schema/co"],
        twinFinalErrors: [CBS_ZERO_1],
      },
      {
        why: "mustFlag[3] D26 messages economics — 1:1 on the twin",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: ["legacy | packages/db/src/schema/message.ts:1 | - | `messages.content` is a ledger-REJECTED schema"],
        final: [],
        finalErrors: [CBS_ZERO_1, SBS_EMPTY],
        repair: { prepend: { "packages/db/src/schema/message.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: ["schema-banned-shapes | packages/db/src/schema/message.ts:2 | content | `messages.content` is a ledger-REJECTED schema"],
        twinFinalErrors: [CBS_ZERO_1],
      },
      {
        why: "mustFlag[4] the D58 column-PATTERN arm — 1:1 on the twin",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: ["legacy | packages/db/src/schema/chat.ts:1 | - | a *presetId* column is a ledger-REJECTED schem"],
        final: [],
        finalErrors: [CBS_ZERO_1, SBS_EMPTY],
        repair: { prepend: { "packages/db/src/schema/chat.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: ["schema-banned-shapes | packages/db/src/schema/chat.ts:2 | activePresetId | a *presetId* column is a ledger-REJECTED schem"],
        twinFinalErrors: [CBS_ZERO_1],
      },
      {
        why: "mustFlag[5] the D28 TABLE-ban arm — 1:1 on the twin, anchored on the table binding",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: ["legacy | packages/db/src/schema/character.ts:1 | - | the `character_versions` table is a ledger-REJ"],
        final: [],
        finalErrors: [CBS_ZERO_1, SBS_EMPTY],
        repair: { prepend: { "packages/db/src/schema/character.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: ["schema-banned-shapes | packages/db/src/schema/character.ts:2 | t | the `character_versions` table is a ledger-REJ"],
        twinFinalErrors: [CBS_ZERO_1],
      },
      {
        why: "mustFlag[6] D60 Principal.kind — the CONTRACT half, caught 1:1 with NO repair needed. The SECOND finding is the narrowing's successor: this fixture carries no settings home, so the appSettingsSchema row reports rather than going quiet",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: ["legacy | packages/contracts/src/identity/index.ts:3 | - | `Principal.kind` is a ledger-REJECTED schema/c"],
        final: [
          CBS_MISSING_SETTINGS,
          "contract-banned-shapes | packages/contracts/src/identity/index.ts:3 | kind | `Principal.kind` is a ledger-REJECTED schema/c",
        ],
        finalErrors: ["schema-banned-shapes ZERO-PATHS(1)"],
      },
      {
        why: "mustFlag[7] D33 appSettingsSchema.guidedActions — caught 1:1, plus the mirror-image successor for the absent Principal home",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: ["legacy | packages/contracts/src/settings/index.ts:2 | - | `appSettingsSchema.guidedActions` is a ledger-"],
        final: [
          "contract-banned-shapes | packages/contracts/src/settings/index.ts:1 | - | the ledger ban on `Principal` no longer resolv",
          "contract-banned-shapes | packages/contracts/src/settings/index.ts:1 | appSettingsSchema | `appSettingsSchema.guidedActions` is a ledger-",
        ],
        finalErrors: ["schema-banned-shapes ZERO-PATHS(1)"],
      },
      {
        why: "mustFlag[8] D12 — CLASSIFIED ARM RETIREMENT, the one arm that left the gate corpus. The `@orb/contracts/sessions` import ban is biome's native noRestrictedImports now; its successor proof is `tests/tooling/verify/lib/ledger-banned-shapes.int.test.ts`, which drives the real binary over a copy of the real config. Both policies correctly admit ZERO paths from a server-only fixture",
        legacyPopulation: 1,
        finalPopulation: 0,
        legacy: ["legacy | packages/server/src/x.ts:1 | - | an import of `@orb/contracts/sessions` is a le"],
        final: [],
        finalErrors: [CBS_ZERO_1, "schema-banned-shapes ZERO-PATHS(1)"],
      },
      {
        why: "mustPass[0] the SHORTHAND green twin — silent on both engines",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: [CBS_ZERO_1, SBS_EMPTY],
        repair: { prepend: { "packages/db/src/schema/chat.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: [],
        twinFinalErrors: [CBS_ZERO_1],
      },
      {
        why: "mustPass[1] an ordinary column — silent on both engines",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: [CBS_ZERO_1, SBS_EMPTY],
        repair: { prepend: { "packages/db/src/schema/chat.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: [],
        twinFinalErrors: [CBS_ZERO_1],
      },
      {
        why: "mustPass[2] born-compliant across every arm. The final reports ONE finding the legacy could not: this fixture has no settings home, so the D33 row's subject does not resolve — the narrowing's two-sided arm, firing exactly where §4.6 says a name-keyed ban must",
        legacyPopulation: 3,
        finalPopulation: 2,
        legacy: [],
        final: [CBS_MISSING_SETTINGS],
        finalErrors: [SBS_EMPTY],
        repair: { prepend: { "packages/db/src/schema/chat.ts": DRIZZLE } },
        twinFinalPopulation: 2,
        twinFinal: [CBS_MISSING_SETTINGS],
        twinFinalErrors: [],
      },
    ]);
    expect(compared, "every frozen mustFlag/mustPass example was compared").toBe(legacy.mustFlag.length + legacy.mustPass.length);
  },
  TIMEOUT_MS,
);

// ─── 2. TIER 2b — nullable-column-inequality (D124) ───────────────────────────────────────────────────
// LEGACY-SIDE COVERAGE: 7 findings on 6 of 15 examples — three real inequality catches and three MARKER
// arms. The frozen SHA is the module's own header claim: `521780ac6`, the parent of `66d28b127`.
//
// TWO CLASSIFIED DIFFERENCES, both recorded in `docs/reviews/gate-runtime/schema-fact-family-1584.md`:
//   1. THE MARKER ARMS MOVED TO THE CENTRAL WAIVER ENGINE. The legacy module parsed its own
//      `@nullable-cmp-ok` block grammar and reported malformed / over-broad / stale markers itself. The
//      final has no private grammar; those are `lib/ordinary-waiver.ts` behaviours, proven once in
//      `ordinary-waiver.test.ts`. So on rows 3-5 the legacy marker finding has no final counterpart — and
//      the UNDERLYING inequality still reports on the twin, which is the part that matters.
//   2. CO-LOCATION IS NOT GUARDING. The final requires a guard to participate in the CONTROLLING boolean
//      expression; the legacy accepted a guard anywhere in the enclosing statement. That is an intentional
//      strengthening and it FLIPS legacy mustPass[3] red on the twin — the same flip the family record
//      reports changed the live product verdict.
const NULLABLE_BASE = "521780ac67160db90e8ff0a0bab4fad850443c6c";
const NE_AVATAR =
  "nullable-column-inequality | packages/server/src/domain/x/persistence/reads.ts:3 | characters.avatarAssetId | an inequality predicate (`ne` / `notInArray`) ";

test(
  "nullable-column-inequality: every legacy inequality catch survives; the marker arms moved to the central engine and co-location stopped guarding",
  async ({ scratch }) => {
    const legacy = await frozenLegacyGate(scratch, NULLABLE_BASE, "tooling/src/verify/gates/nullable-column-inequality.ts");
    const raw = (line: number): string =>
      `legacy | packages/server/src/domain/x/persistence/reads.ts:${line} | - | an inequality predicate (\`ne\` / \`notInArray\`) `;
    const compared = runScenarios(legacy, [nullableColumnInequality], "packages/server/src/x.ts", [
      {
        why: "mustFlag[0] the founding `ne()` on a nullable column — caught by both once the `@orb/db` door resolves",
        legacyPopulation: 2,
        finalPopulation: 2,
        legacy: [raw(3)],
        final: [],
        repair: ORB_DB_DOOR,
        twinFinalPopulation: 2,
        twinFinal: [NE_AVATAR],
      },
      {
        why: "mustFlag[1] `notInArray` — the same three-valued defect, caught by both",
        legacyPopulation: 2,
        finalPopulation: 2,
        legacy: [raw(3)],
        final: [],
        repair: ORB_DB_DOOR,
        twinFinalPopulation: 2,
        twinFinal: [NE_AVATAR],
      },
      {
        why: "mustFlag[2] the nullable column on the RIGHT-hand side — caught by both",
        legacyPopulation: 2,
        finalPopulation: 2,
        legacy: [raw(3)],
        final: [],
        repair: ORB_DB_DOOR,
        twinFinalPopulation: 2,
        twinFinal: [
          "nullable-column-inequality | packages/server/src/domain/x/persistence/reads.ts:3 | messages.selectedVariantId | an inequality predicate (`ne` / `notInArray`) ",
        ],
      },
      {
        why: "mustFlag[3] MALFORMED marker. CLASSIFIED: the marker finding is the central engine's now; the inequality it failed to excuse still reports on the twin, so nothing was licensed by the move",
        legacyPopulation: 2,
        finalPopulation: 2,
        legacy: ["legacy | packages/server/src/domain/x/persistence/reads.ts:3 | - | a `@nullable-cmp-ok` marker carries no reason.", raw(4)],
        final: [],
        repair: ORB_DB_DOOR,
        twinFinalPopulation: 2,
        twinFinal: [
          "nullable-column-inequality | packages/server/src/domain/x/persistence/reads.ts:4 | characters.avatarAssetId | an inequality predicate (`ne` / `notInArray`) ",
        ],
      },
      {
        why: "mustFlag[4] OVER-MARK. CLASSIFIED the same way — and the twin shows the final reporting BOTH guarded comparisons the bare marker could not name, which is strictly louder than the legacy's one position-name complaint",
        legacyPopulation: 2,
        finalPopulation: 2,
        legacy: ["legacy | packages/server/src/domain/x/persistence/reads.ts:3 | - | a bare `@nullable-cmp-ok` marker sits in a blo"],
        final: [],
        repair: ORB_DB_DOOR,
        twinFinalPopulation: 2,
        twinFinal: [
          "nullable-column-inequality | packages/server/src/domain/x/persistence/reads.ts:5 | characters.avatarAssetId | an inequality predicate (`ne` / `notInArray`) ",
          "nullable-column-inequality | packages/server/src/domain/x/persistence/reads.ts:5 | characters.coverAssetId | an inequality predicate (`ne` / `notInArray`) ",
        ],
      },
      {
        why: "mustFlag[5] STALE marker on an `eq`. CLASSIFIED: stale-marker detection is the central engine's, and there is genuinely no inequality here to catch — the twin is silent on both sides",
        legacyPopulation: 2,
        finalPopulation: 2,
        legacy: ["legacy | packages/server/src/domain/x/persistence/reads.ts:3 | - | a `@nullable-cmp-ok(characters.avatarAssetId)`"],
        final: [],
        repair: ORB_DB_DOOR,
        twinFinalPopulation: 2,
        twinFinal: [],
      },
      {
        why: "mustPass[0] a `.notNull()` column — silent on both engines, twin included",
        legacyPopulation: 2,
        finalPopulation: 2,
        legacy: [],
        final: [],
        repair: ORB_DB_DOOR,
        twinFinalPopulation: 2,
        twinFinal: [],
      },
      {
        why: "mustPass[1] the SANCTIONED `or(isNull(col), ne(col, x))` total form — still acquitted by the final's combinator-ancestor rule",
        legacyPopulation: 2,
        finalPopulation: 2,
        legacy: [],
        final: [],
        repair: ORB_DB_DOOR,
        twinFinalPopulation: 2,
        twinFinal: [],
      },
      {
        why: "mustPass[2] the `isNotNull` sanctioned form — still acquitted",
        legacyPopulation: 2,
        finalPopulation: 2,
        legacy: [],
        final: [],
        repair: ORB_DB_DOOR,
        twinFinalPopulation: 2,
        twinFinal: [],
      },
      {
        why: "mustPass[3] THE ONE LEGACY GREEN THAT GOES RED. A POSITION-NAMED marker in the enclosing function's leading comment block licensed this site under the legacy grammar; under the final it is a raw finding that the central waiver plane must consume. This is the intentional strengthening the family record says changed the live verdict — a behaviour change, recorded, not a regression",
        legacyPopulation: 2,
        finalPopulation: 2,
        legacy: [],
        final: [],
        repair: ORB_DB_DOOR,
        twinFinalPopulation: 2,
        twinFinal: [
          "nullable-column-inequality | packages/server/src/domain/x/persistence/reads.ts:5 | characters.avatarAssetId | an inequality predicate (`ne` / `notInArray`) ",
        ],
      },
      {
        why: "mustPass[4] a same-named LOCAL `ne` is not drizzle SQL. NO REPAIR: the fixture imports no table door, and the module-origin fence is what acquits it on both engines",
        legacyPopulation: 2,
        finalPopulation: 2,
        legacy: [],
        final: [],
      },
      {
        why: "mustPass[5] the VOCABULARY-HOME fence — a tooling file mentioning the marker. On the final this became POPULATION ALGEBRA (`@packages`/`@tests` admits no `tooling/` path), so the fence is enforced by the population rather than by a gate-local predicate; both engines silent",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
      },
      {
        why: "mustPass[6] DECLARED LIMIT `not(eq(...))` — the limit survives the conversion on both engines",
        legacyPopulation: 2,
        finalPopulation: 2,
        legacy: [],
        final: [],
        repair: ORB_DB_DOOR,
        twinFinalPopulation: 2,
        twinFinal: [],
      },
      {
        why: "mustPass[7] DECLARED LIMIT a `.primaryKey()` column reads as NOT NULL — survives",
        legacyPopulation: 2,
        finalPopulation: 2,
        legacy: [],
        final: [],
        repair: ORB_DB_DOOR,
        twinFinalPopulation: 2,
        twinFinal: [],
      },
      {
        why: "mustPass[8] DECLARED LIMIT an unknown table fails QUIET. NO REPAIR — there is no schema file to point a door at, which is why the FINAL side is a `[population]` tool error: the drizzle fact's own population admits zero paths. That refusal IS the successor of the legacy's silent pass",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: ["drizzle-schema ZERO-PATHS(1)", "nullable-column-inequality FACT-FAILED-ZERO-PATHS(1)"],
      },
    ]);
    expect(compared, "every frozen mustFlag/mustPass example was compared").toBe(legacy.mustFlag.length + legacy.mustPass.length);
  },
  TIMEOUT_MS,
);

// ─── 3. TIER 2c — db-enum-from-tuple (D34) ────────────────────────────────────────────────────────────
// LEGACY-SIDE COVERAGE: 1 finding on 1 of 4 examples — thin, and said so. The conversion STRENGTHENED the
// identifier arm (a named reference must now EARN the pass through a canonical origin or a co-located
// `as const`), so the real catch evidence for the new arms is the module's own eight conformance rows.
const SCHEMA_BASE = "f2e1e2f3d41d02e1443072d009b19012b4762b44";

test(
  "db-enum-from-tuple: the inline-array catch is 1:1; the identifier arm strengthened and its new rows are conformance's",
  async ({ scratch }) => {
    const legacy = await frozenLegacyGate(scratch, "1bf7ff7d9", "tooling/src/verify/gates/db-enum-from-tuple.ts");
    const compared = runScenarios(legacy, [dbEnumFromTuple], "packages/db/src/schema/x.ts", [
      {
        why: "mustFlag[0] the inline-array enum config — caught by both; the final anchors on the literal element rather than the whole config",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: ["legacy | packages/db/src/schema/x.ts:1 | enum: [...] | drizzle column enum config is an INLINE ARRAY "],
        final: [],
        finalErrors: ["db-enum-from-tuple EMPTY-SCHEMA"],
        repair: { prepend: { "packages/db/src/schema/x.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: ['db-enum-from-tuple | packages/db/src/schema/x.ts:2 | "a" | a Drizzle column `enum` config is an INLINE AR'],
      },
      {
        why: "mustPass[0] an imported contracts tuple. The repair plants the `@orb/contracts` door as well, because the final RESOLVES the tuple's origin where the legacy accepted any named reference — with the door present both engines pass it",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: ["db-enum-from-tuple EMPTY-SCHEMA"],
        repair: {
          prepend: { "packages/db/src/schema/y.ts": DRIZZLE },
          add: { "node_modules/@orb/contracts/index.ts": 'export const KINDS = ["a", "b"] as const;\n' },
        },
        twinFinalPopulation: 1,
        twinFinal: [],
      },
      {
        why: "mustPass[1] a co-located `as const satisfies` tuple — the sanctioned db idiom, acquitted by both",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: ["db-enum-from-tuple EMPTY-SCHEMA"],
        repair: { prepend: { "packages/db/src/schema/z.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: [],
      },
      {
        why: "mustPass[2] POPULATION: an inline enum outside the schema dir. The legacy scanned nothing; the final admits zero paths and says so — the §4.8 refusal that replaced the silent zero. The legacy `mustPass` was retired for exactly this reason (a mustPass cannot prove a population in a virtual project) and the equality receipt is the family record's 30 = 30",
        legacyPopulation: 0,
        finalPopulation: 0,
        legacy: [],
        final: [],
        finalErrors: ["db-enum-from-tuple ZERO-PATHS(1)"],
      },
    ]);
    expect(compared, "every frozen mustFlag/mustPass example was compared").toBe(legacy.mustFlag.length + legacy.mustPass.length);
  },
  TIMEOUT_MS,
);

// ─── 4. TIER 2c — fk-columns-indexed ─────────────────────────────────────────────────────────────────
// LEGACY-SIDE COVERAGE: 7 findings on 7 of 14 examples — the richest set in the family. Frozen SHA
// `f2e1e2f3d` (the module header's own claim, the parent of the `fa5612835` conversion).
const FK_INDEX = (file: string, line: number, token: string): string =>
  `fk-columns-indexed | packages/db/src/schema/${file}:${line} | ${token} | a foreign-key column does not LEAD any B-tree `;
const LEGACY_INDEX = (file: string, line: number, token: string): string =>
  `legacy | packages/db/src/schema/${file}:${line} | ${token} | a foreign-key column that does not LEAD any in`;
const FK_UNBOUND = (detail: string): string => `fk-columns-indexed UNRESOLVED(${detail})`;

test(
  "fk-columns-indexed: all seven legacy catches survive on the completed twin; the two impostor-builder fixtures fail closed LOUDER",
  async ({ scratch }) => {
    const legacy = await frozenLegacyGate(scratch, SCHEMA_BASE, "tooling/src/verify/gates/fk-columns-indexed.ts");
    const compared = runScenarios(legacy, [fkColumnsIndexed], "packages/db/src/schema/x.ts", [
      {
        why: "mustFlag[0] the #1035 SHORTHAND red — caught by both once `chats` is declared",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [LEGACY_INDEX("chat.ts", 3, "chatId")],
        final: [],
        finalErrors: [FK_UNBOUND("packages/db/src/schema/chat.ts#messages.chatId references target: no lexical symbol binds chats")],
        repair: { prepend: { "packages/db/src/schema/chat.ts": PARENTS(["chats"]) } },
        twinFinalPopulation: 1,
        twinFinal: [FK_INDEX("chat.ts", 6, "chatId")],
      },
      {
        why: "mustFlag[1] the #945 IMPORTED-COLUMNS red — caught by both, in the declaring file",
        legacyPopulation: 2,
        finalPopulation: 2,
        legacy: [LEGACY_INDEX("chat-columns.ts", 4, "chatId")],
        final: [],
        finalErrors: [FK_UNBOUND("packages/db/src/schema/chat.ts#messages.chatId references target: no lexical symbol binds chats")],
        repair: { prepend: { "packages/db/src/schema/chat-columns.ts": PARENTS(["chats"]) } },
        twinFinalPopulation: 2,
        twinFinal: [FK_INDEX("chat-columns.ts", 6, "chatId")],
      },
      {
        why: "mustFlag[2] the founding shape — an unindexed FK beside a correctly-indexed sibling that must NOT flag. Exactly one finding on both engines",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [LEGACY_INDEX("chat.ts", 7, "characterId")],
        final: [],
        finalErrors: [FK_UNBOUND("packages/db/src/schema/chat.ts#messages.chatId references target: no lexical symbol binds chats")],
        repair: { prepend: { "packages/db/src/schema/chat.ts": PARENTS(["chats", "characters"]) } },
        twinFinalPopulation: 1,
        twinFinal: [FK_INDEX("chat.ts", 10, "characterId")],
      },
      {
        why: "mustFlag[3] the LEADING-position arm — `userId` covered only as the SECOND column of a composite unique. Caught by both",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [LEGACY_INDEX("chat.ts", 7, "userId")],
        final: [],
        finalErrors: [FK_UNBOUND("packages/db/src/schema/chat.ts#chatParticipants.chatId references target: no lexical symbol binds chats")],
        repair: { prepend: { "packages/db/src/schema/chat.ts": PARENTS(["chats", "users"]) } },
        twinFinalPopulation: 1,
        twinFinal: [FK_INDEX("chat.ts", 10, "userId")],
      },
      {
        why: "mustFlag[4] a junction whose composite PK covers the FIRST FK only — caught by both",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [LEGACY_INDEX("tag.ts", 6, "tagId")],
        final: [],
        finalErrors: [FK_UNBOUND("packages/db/src/schema/tag.ts#chatTags.chatId references target: no lexical symbol binds chats")],
        repair: { prepend: { "packages/db/src/schema/tag.ts": PARENTS(["chats", "tags"]) } },
        twinFinalPopulation: 1,
        twinFinal: [FK_INDEX("tag.ts", 9, "tagId")],
      },
      {
        why: "mustFlag[5] the IMPOSTOR `fake.primaryKey` fixture. CLASSIFIED, and it is the conversion working as designed: the legacy REPORTED a finding while quietly treating the impostor as no index; the final refuses the whole builder as unresolvable. A tool error is the louder half of fail-closed, and the legacy row's own `why` asked for exactly this behaviour",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [LEGACY_INDEX("tag.ts", 6, "characterId")],
        final: [],
        finalErrors: [FK_UNBOUND("packages/db/src/schema/tag.ts#characterTags.characterId references target: no lexical symbol binds characters")],
        repair: { prepend: { "packages/db/src/schema/tag.ts": PARENTS(["characters", "character"]) } },
        twinFinalPopulation: 1,
        twinFinal: [],
        twinFinalErrors: [FK_UNBOUND("ObjectLiteralExpression is not a Drizzle builder call")],
      },
      {
        why: "mustFlag[6] an UNRESOLVED bare `primaryKey` name. Same classification as [5] — the legacy failed closed by reporting, the final fails closed by refusing",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [LEGACY_INDEX("tag.ts", 5, "characterId")],
        final: [],
        finalErrors: [FK_UNBOUND("packages/db/src/schema/tag.ts#characterTags.characterId references target: no lexical symbol binds characters")],
        repair: { prepend: { "packages/db/src/schema/tag.ts": PARENTS(["characters", "character"]) } },
        twinFinalPopulation: 1,
        twinFinal: [],
        twinFinalErrors: [FK_UNBOUND("Drizzle builder root primaryKey is unresolved: Identifier is not a member access")],
      },
      {
        why: "mustPass[0] the SHORTHAND green twin — silent on both",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: [FK_UNBOUND("packages/db/src/schema/chat.ts#messages.chatId references target: no lexical symbol binds chats")],
        repair: { prepend: { "packages/db/src/schema/chat.ts": PARENTS(["chats"]) } },
        twinFinalPopulation: 1,
        twinFinal: [],
      },
      {
        why: "mustPass[1] the sanctioned single-column B-tree index — silent on both",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: [FK_UNBOUND("packages/db/src/schema/chat.ts#messages.characterId references target: no lexical symbol binds characters")],
        repair: { prepend: { "packages/db/src/schema/chat.ts": PARENTS(["characters"]) } },
        twinFinalPopulation: 1,
        twinFinal: [],
      },
      {
        why: "mustPass[2] a composite whose LEADING column is the FK — silent on both",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: [FK_UNBOUND("packages/db/src/schema/chat.ts#messageVariants.messageId references target: no lexical symbol binds messages")],
        repair: { prepend: { "packages/db/src/schema/chat.ts": PARENTS(["messages"]) } },
        twinFinalPopulation: 1,
        twinFinal: [],
      },
      {
        why: "mustPass[3] a NAMESPACE-qualified composite key — the import-spelling arm, acquitted by both",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: [FK_UNBOUND("packages/db/src/schema/tag.ts#characterTags.characterId references target: no lexical symbol binds characters")],
        repair: { prepend: { "packages/db/src/schema/tag.ts": PARENTS(["characters", "character"]) } },
        twinFinalPopulation: 1,
        twinFinal: [],
      },
      {
        why: "mustPass[4] an ALIASED composite key — acquitted by both",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: [FK_UNBOUND("packages/db/src/schema/tag.ts#characterTags.characterId references target: no lexical symbol binds characters")],
        repair: { prepend: { "packages/db/src/schema/tag.ts": PARENTS(["characters", "character"]) } },
        twinFinalPopulation: 1,
        twinFinal: [],
      },
      {
        why: "mustPass[5] the FK IS the primary key — acquitted by both",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: [FK_UNBOUND("packages/db/src/schema/stats.ts#ownerStats.ownerId references target: no lexical symbol binds users")],
        repair: { prepend: { "packages/db/src/schema/stats.ts": PARENTS(["users"]) } },
        twinFinalPopulation: 1,
        twinFinal: [],
      },
      {
        why: "mustPass[6] a table with NO foreign key at all — the only legacy example whose fixture is already complete, so both engines agree with NO repair at all",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
      },
    ]);
    expect(compared, "every frozen mustFlag/mustPass example was compared").toBe(legacy.mustFlag.length + legacy.mustPass.length);
  },
  TIMEOUT_MS,
);

// ─── 5. TIER 2c — fk-ondelete-stated ─────────────────────────────────────────────────────────────────
// LEGACY-SIDE COVERAGE: 2 findings on 2 of 4 examples. Both catches survive 1:1 on the twin.
const FK_DELETE = "fk-ondelete-stated | packages/db/src/schema/chat.ts:6 | chatId | a `.references(...)` has no `onDelete` action ";

test(
  "fk-ondelete-stated: both legacy catches survive, and the mustPass arms stay silent on the completed twin",
  async ({ scratch }) => {
    const legacy = await frozenLegacyGate(scratch, SCHEMA_BASE, "tooling/src/verify/gates/fk-ondelete-stated.ts");
    const rawDelete = "legacy | packages/db/src/schema/chat.ts:4 | - | a `.references(...)` with no `onDelete` action";
    const compared = runScenarios(legacy, [fkOnDeleteStated], "packages/db/src/schema/x.ts", [
      {
        why: "mustFlag[0] a `.references()` with no `onDelete` — caught by both; the final names the COLUMN token the legacy left blank",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [rawDelete],
        final: [],
        finalErrors: ["fk-ondelete-stated UNRESOLVED(packages/db/src/schema/chat.ts#messages.chatId references target: no lexical symbol binds chats)"],
        repair: { prepend: { "packages/db/src/schema/chat.ts": PARENTS(["chats"]) } },
        twinFinalPopulation: 1,
        twinFinal: [FK_DELETE],
      },
      {
        why: "mustFlag[1] the second `onDelete`-less spelling — caught by both",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [rawDelete],
        final: [],
        finalErrors: ["fk-ondelete-stated UNRESOLVED(packages/db/src/schema/chat.ts#messages.chatId references target: no lexical symbol binds chats)"],
        repair: { prepend: { "packages/db/src/schema/chat.ts": PARENTS(["chats"]) } },
        twinFinalPopulation: 1,
        twinFinal: [FK_DELETE],
      },
      {
        why: "mustPass[0] every FK states its action — silent on both",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: ["fk-ondelete-stated UNRESOLVED(packages/db/src/schema/chat.ts#messages.chatId references target: no lexical symbol binds chats)"],
        repair: { prepend: { "packages/db/src/schema/chat.ts": PARENTS(["chats", "personas"]) } },
        twinFinalPopulation: 1,
        twinFinal: [],
      },
      {
        why: "mustPass[1] the plugin-assets FK — silent on both",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: [
          "fk-ondelete-stated UNRESOLVED(packages/db/src/schema/plugin.ts#plugins.bundleAssetId references target: no lexical symbol binds assets)",
        ],
        repair: { prepend: { "packages/db/src/schema/plugin.ts": PARENTS(["assets"]) } },
        twinFinalPopulation: 1,
        twinFinal: [],
      },
    ]);
    expect(compared, "every frozen mustFlag/mustPass example was compared").toBe(legacy.mustFlag.length + legacy.mustPass.length);
  },
  TIMEOUT_MS,
);

// ─── 6. TIER 2c — table-explicit-primary-key ─────────────────────────────────────────────────────────
// LEGACY-SIDE COVERAGE: 4 findings on 4 of 9 examples — and this is the ONE module in the family whose
// legacy fixtures are complete enough to compare with NO completion at all. Two of the four are exact,
// byte-for-byte, node-for-node matches; the other two are the impostor/unresolved-builder pair, which the
// final refuses rather than judges.
test(
  "table-explicit-primary-key: two exact 1:1 catches with no completion needed, and the impostor pair fails closed louder",
  async ({ scratch }) => {
    const legacy = await frozenLegacyGate(scratch, SCHEMA_BASE, "tooling/src/verify/gates/table-explicit-primary-key.ts");
    const rawPk = (file: string, line: number, token: string): string =>
      `legacy | packages/db/src/schema/${file}:${line} | ${token} | a \`sqliteTable\` with no PRIMARY KEY — SQLite f`;
    const finalPk = (file: string, line: number, token: string): string =>
      `table-explicit-primary-key | packages/db/src/schema/${file}:${line} | ${token} | a \`sqliteTable\` has no PRIMARY KEY — SQLite's `;
    const compared = runScenarios(legacy, [tableExplicitPrimaryKey], "packages/db/src/schema/x.ts", [
      {
        why: "mustFlag[0] a table with no PRIMARY KEY — SAME node, SAME line, SAME token on both engines",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [rawPk("chat.ts", 2, "chatLocks")],
        final: [finalPk("chat.ts", 2, "chatLocks")],
      },
      {
        why: "mustFlag[1] a junction with no PK — SAME node, SAME line, SAME token",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [rawPk("tag.ts", 2, "characterTags")],
        final: [finalPk("tag.ts", 2, "characterTags")],
      },
      {
        why: "mustFlag[2] the IMPOSTOR `fake.primaryKey`. CLASSIFIED: the legacy reported; the final refuses the builder outright. Fail-closed both ways, louder on the final",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [rawPk("tag.ts", 3, "characterTags")],
        final: [],
        finalErrors: ["table-explicit-primary-key UNRESOLVED(ObjectLiteralExpression is not a Drizzle builder call)"],
      },
      {
        why: "mustFlag[3] an UNRESOLVED bare `primaryKey`. Same classification as [2]",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [rawPk("tag.ts", 2, "characterTags")],
        final: [],
        finalErrors: ["table-explicit-primary-key UNRESOLVED(Drizzle builder root primaryKey is unresolved: Identifier is not a member access)"],
      },
      { why: "mustPass[0] an inline `.primaryKey()` — silent on both", legacyPopulation: 1, finalPopulation: 1, legacy: [], final: [] },
      { why: "mustPass[1] a composite `primaryKey({columns})` — silent on both", legacyPopulation: 1, finalPopulation: 1, legacy: [], final: [] },
      { why: "mustPass[2] a namespace-qualified composite key — silent on both", legacyPopulation: 1, finalPopulation: 1, legacy: [], final: [] },
      { why: "mustPass[3] an aliased composite key — silent on both", legacyPopulation: 1, finalPopulation: 1, legacy: [], final: [] },
      { why: "mustPass[4] the settings singleton — silent on both", legacyPopulation: 1, finalPopulation: 1, legacy: [], final: [] },
    ]);
    expect(compared, "every frozen mustFlag/mustPass example was compared").toBe(legacy.mustFlag.length + legacy.mustPass.length);
  },
  TIMEOUT_MS,
);

// ─── 7. TIER 2c — ownerid-registry (D23/D30/D21/D49) ─────────────────────────────────────────────────
// LEGACY-SIDE COVERAGE: 3 findings on 3 of 6 examples. All three survive on the completed twin.
// NOTE THE DECLARED LIMIT THE REPLAY CANNOT REACH: the final's STALE arm requires
// `packages/db/src/schema/index.ts` in the effective population, and no legacy example loads it — so that
// arm has ZERO legacy coverage and is proven by the module's own conformance rows, not here. Saying so is
// the §4.6 coverage statement; a silent clean replay over it would be evidence of nothing.
const OWNERID = (file: string, line: number): string =>
  `ownerid-registry | packages/db/src/schema/${file}:${line} | ownerId | a table stamps an \`ownerId\` column but is NOT `;
const OWNERID_LEGACY = (line: number): string =>
  `legacy | packages/db/src/schema/x.ts:${line} | ownerId on "not_allowlisted" | a table stamps an \`ownerId\` column but is NOT `;
const OWNERID_EMPTY = "ownerid-registry EMPTY-SCHEMA";

test(
  "ownerid-registry: all three stamp catches survive; the STALE arm has zero legacy coverage and is stated rather than faked",
  async ({ scratch }) => {
    const legacy = await frozenLegacyGate(scratch, "66d28b1272c9dc255545a073276a3b159eddf85a", "tooling/src/verify/gates/ownerid-registry.ts");
    const compared = runScenarios(legacy, [ownerIdRegistry], "packages/db/src/schema/x.ts", [
      {
        why: 'mustFlag[0] an unallowlisted `ownerId` stamp — caught by both; the final\'s token is the column name where the legacy carried a composed `ownerId on "table"` string',
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [OWNERID_LEGACY(2)],
        final: [],
        finalErrors: [OWNERID_EMPTY],
        repair: { prepend: { "packages/db/src/schema/x.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: [OWNERID("x.ts", 3)],
      },
      {
        why: "mustFlag[1] the #945 imported-columns leg — caught by both, and the final reports in the DECLARING file",
        legacyPopulation: 2,
        finalPopulation: 2,
        legacy: [OWNERID_LEGACY(2)],
        final: [],
        finalErrors: [OWNERID_EMPTY],
        repair: { prepend: { "packages/db/src/schema/x-columns.ts": DRIZZLE, "packages/db/src/schema/x.ts": DRIZZLE } },
        twinFinalPopulation: 2,
        twinFinal: [OWNERID("x-columns.ts", 2)],
      },
      {
        why: "mustFlag[2] the JS-binding-name-disagrees-with-the-SQL-table counterfactual — both engines key on the SQL name",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [OWNERID_LEGACY(1)],
        final: [],
        finalErrors: [OWNERID_EMPTY],
        repair: { prepend: { "packages/db/src/schema/x.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: [OWNERID("x.ts", 2)],
      },
      {
        why: "mustPass[0] an allowlisted table — silent on both",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: [OWNERID_EMPTY],
        repair: { prepend: { "packages/db/src/schema/x.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: [],
      },
      {
        why: "mustPass[1] a classified character table — silent on both",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: [OWNERID_EMPTY],
        repair: { prepend: { "packages/db/src/schema/character.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: [],
      },
      {
        why: "mustPass[2] a table with no `ownerId` at all — silent on both",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: [OWNERID_EMPTY],
        repair: { prepend: { "packages/db/src/schema/chat.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: [],
      },
    ]);
    expect(compared, "every frozen mustFlag/mustPass example was compared").toBe(legacy.mustFlag.length + legacy.mustPass.length);
  },
  TIMEOUT_MS,
);

// ─── 8. TIER 2c — own-tables-only ────────────────────────────────────────────────────────────────────
// LEGACY-SIDE COVERAGE: 4 findings on 4 of 13 examples. This module's POPULATION is `@server` under
// `packages/server/src/domain/**` while its FACT is the schema, which is why the legacy/final population
// numbers disagree on mustPass[1] (1 vs 2): the legacy `scanRoot` admitted only the accused file, the
// final admits every domain file in the fixture. Declared rather than averaged.
const OWN_TABLES_EMPTY = "own-tables-only EMPTY-SCHEMA";

test(
  "own-tables-only: every cross-domain catch and the no-owner arm survive; the population shape differs on one row and is declared",
  async ({ scratch }) => {
    const legacy = await frozenLegacyGate(scratch, "fe7b5ea38~1", "tooling/src/verify/gates/own-tables-only.ts");
    const pass = (index: number, file: string, why: string, twinPopulation: number): Scenario => ({
      why,
      legacyPopulation: index === 5 ? 1 : 2,
      finalPopulation: twinPopulation,
      legacy: [],
      final: [],
      finalErrors: [OWN_TABLES_EMPTY],
      repair: { prepend: { [`packages/db/src/schema/${file}`]: DRIZZLE } },
      twinFinalPopulation: twinPopulation,
      twinFinal: [],
    });
    const compared = runScenarios(legacy, [ownTablesOnly], "packages/server/src/domain/x/verb.ts", [
      {
        why: "mustFlag[0] a cross-domain READ outside `persistence/` — caught by both; the final splits the legacy's composed `read <table>` token into a table token plus a READ-specific message",
        legacyPopulation: 2,
        finalPopulation: 2,
        legacy: [
          "legacy | packages/server/src/domain/persona/verbs/create-from-character.ts:1 | read characters | cross-domain table access outside `persistence",
        ],
        final: [],
        finalErrors: [OWN_TABLES_EMPTY],
        repair: { prepend: { "packages/db/src/schema/character.ts": DRIZZLE } },
        twinFinalPopulation: 2,
        twinFinal: [
          "own-tables-only | packages/server/src/domain/persona/verbs/create-from-character.ts:1 | characters | cross-domain READ of `characters` outside `per",
        ],
      },
      {
        why: "mustFlag[1] a cross-domain WRITE — caught by both, and the final's message now distinguishes WRITE from READ where the legacy used one sentence for both",
        legacyPopulation: 2,
        finalPopulation: 2,
        legacy: ["legacy | packages/server/src/domain/export/verbs/export-chat.ts:3 | write messages | cross-domain table access outside `persistence"],
        final: [],
        finalErrors: [OWN_TABLES_EMPTY],
        repair: { prepend: { "packages/db/src/schema/chat.ts": DRIZZLE } },
        twinFinalPopulation: 2,
        twinFinal: ["own-tables-only | packages/server/src/domain/export/verbs/export-chat.ts:3 | messages | cross-domain WRITE into `messages` — a drizzle"],
      },
      {
        why: "mustFlag[2] the OWNERLESS-schema-file arm. CLASSIFIED ANCHOR MOVE: the legacy reported on the schema file itself, which is OUTSIDE the final policy's `@server` population — so the final anchors the same accusation on a population member and names the schema file in the message. A finding that anchored outside the population would have vanished",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: ["legacy | packages/db/src/schema/nobody.ts:1 | - | schema file declares tables but has NO owner: "],
        final: [],
        finalErrors: [OWN_TABLES_EMPTY],
        repair: { prepend: { "packages/db/src/schema/nobody.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: ["own-tables-only | packages/server/src/domain/chat/verbs/read.ts:1 | - | schema file packages/db/src/schema/nobody.ts d"],
      },
      {
        why: "mustFlag[3] a cross-domain read from a `workload-contributions.ts` slot — caught by both",
        legacyPopulation: 2,
        finalPopulation: 2,
        legacy: ["legacy | packages/server/src/domain/assets/workload-contributions.ts:1 | read characters | cross-domain table access outside `persistence"],
        final: [],
        finalErrors: [OWN_TABLES_EMPTY],
        repair: { prepend: { "packages/db/src/schema/character.ts": DRIZZLE } },
        twinFinalPopulation: 2,
        twinFinal: [
          "own-tables-only | packages/server/src/domain/assets/workload-contributions.ts:1 | characters | cross-domain READ of `characters` outside `per",
        ],
      },
      {
        why: "mustPass[0] a domain reading its OWN table — silent on both",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: [OWN_TABLES_EMPTY],
        repair: { prepend: { "packages/db/src/schema/persona.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: [],
      },
      pass(
        5,
        "character.ts",
        "mustPass[1] a cross-domain read INSIDE `persistence/` — silent on both. POPULATION DELTA, declared: legacy 1, final 2, because the legacy `scanRoot` admitted only the accused file while the final admits every domain file in the fixture",
        2,
      ),
      pass(6, "character.ts", "mustPass[2] the discovery reader — silent on both", 2),
      pass(7, "world-info.ts", "mustPass[3] the chat assembly world-info pool — silent on both", 2),
      pass(8, "character.ts", "mustPass[4] a nested verb path — silent on both", 2),
      pass(9, "character.ts", "mustPass[5] a same-domain verb — silent on both", 2),
      pass(10, "character.ts", "mustPass[6] a sanctioned reader — silent on both", 2),
      pass(11, "character.ts", "mustPass[7] a sanctioned reader, second spelling — silent on both", 2),
      {
        why: "mustPass[8] the admin users read — silent on both",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: [OWN_TABLES_EMPTY],
        repair: { prepend: { "packages/db/src/schema/users.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: [],
      },
    ]);
    expect(compared, "every frozen mustFlag/mustPass example was compared").toBe(legacy.mustFlag.length + legacy.mustPass.length);
  },
  TIMEOUT_MS,
);

// ─── 9. TIER 2c — schema-branding ────────────────────────────────────────────────────────────────────
// LEGACY-SIDE COVERAGE: 5 findings on 5 of 9 examples.
//
// THE ONE MODULE WHOSE CONVERSION DELIBERATELY CHANGED THE PREDICATE, and the differential shows it in
// both directions. The legacy accepted ANY `.$type<T>()` as a brand; the final requires the CANONICAL
// `packages/kit/src/ids/index.ts` brand value and exact FK brand agreement (a `UserId` child no longer
// satisfies a `ChatId` parent merely because both are strings). So:
//   · every legacy mustFlag still flags — nothing was lost;
//   · legacy mustFlag[2]/[4] flag the PARENT's non-canonical brand rather than the child's missing one,
//     because the final reports the upstream cause on the same corpus;
//   · all FOUR legacy mustPass rows go RED, because their brands are locally declared types that name no
//     canonical id. That is the strengthening, not a regression, and the CONTROL at the bottom of this
//     test proves it is satisfiable: the same shape with the real `@orb/kit/ids` declaration passes.
const BRANDING_UNBRANDED = (file: string, line: number, subject: string): string =>
  // The label slices the message at 46 characters, and this message LEADS with the table's SQL name, so
  // the visible tail depends on that name's length — sliced here rather than hand-transcribed per row.
  `schema-branding | packages/db/src/schema/${file}:${line} | id | ${`${subject}.id is a primary-key entity id without a canonical @orb/kit/ids brand.`.slice(0, 46)}`;
const BRANDING_LEGACY_PK = (file: string, line: number): string =>
  `legacy | packages/db/src/schema/${file}:${line} | - | t.id is a primary-key id with no .$type<…>() b`;
const BRANDING_LEGACY_FK = (file: string, line: number): string =>
  `legacy | packages/db/src/schema/${file}:${line} | - | child.parentId is a FK to branded parent.id bu`;
const BRANDING_EMPTY = "schema-branding EMPTY-SCHEMA";
const ID_TYPES_PATH = "packages/kit/src/ids/index.ts";
const ID_TYPES =
  'declare const brand: unique symbol;\nexport type Branded<B extends string> = string & { readonly [brand]: B };\nexport type TypeIdOf<P extends string> = Branded<P>;\nexport type ChatId = TypeIdOf<"chat">;\n';

test(
  "schema-branding: every legacy catch survives, and the presence-only → CANONICAL brand strengthening is shown in both directions",
  async ({ scratch }) => {
    const legacy = await frozenLegacyGate(scratch, "fa56128359a0a5e107d1dde042dfe5c95001ec2f", "tooling/src/verify/gates/schema-branding.ts");
    const compared = runScenarios(legacy, [schemaBranding], "packages/db/src/schema/x.ts", [
      {
        why: "mustFlag[0] the #1035 SHORTHAND red — an unbranded primary-key id. Caught by both",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [BRANDING_LEGACY_PK("x.ts", 1)],
        final: [],
        finalErrors: [BRANDING_EMPTY],
        repair: { prepend: { "packages/db/src/schema/x.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: [BRANDING_UNBRANDED("x.ts", 3, "t")],
      },
      {
        why: "mustFlag[1] the #945 IMPORTED-COLUMNS red, leg 1 — caught by both, in the declaring file",
        legacyPopulation: 2,
        finalPopulation: 2,
        legacy: [BRANDING_LEGACY_PK("x-columns.ts", 1)],
        final: [],
        finalErrors: [BRANDING_EMPTY],
        repair: { prepend: { "packages/db/src/schema/x-columns.ts": DRIZZLE, "packages/db/src/schema/x.ts": DRIZZLE } },
        twinFinalPopulation: 2,
        twinFinal: [BRANDING_UNBRANDED("x-columns.ts", 2, "t")],
      },
      {
        why: "mustFlag[2] leg 2 — an unbranded FK to a BRANDED parent, imported. CLASSIFIED: the completion must also IMPORT `parent` into the columns file, because the legacy matched the name lexically while the final resolves the binding — and under `lib.dom` a bare `parent` binds `Window.parent`, which the final correctly refuses as mutable. The twin then flags the PARENT's non-canonical `$type<ParentId>` first: the same corpus, the upstream cause, still red",
        legacyPopulation: 2,
        finalPopulation: 2,
        legacy: [BRANDING_LEGACY_FK("child-columns.ts", 1)],
        final: [],
        finalErrors: [BRANDING_EMPTY],
        repair: {
          prepend: { "packages/db/src/schema/child-columns.ts": `${DRIZZLE}import { parent } from "./x";\n`, "packages/db/src/schema/x.ts": DRIZZLE },
        },
        twinFinalPopulation: 2,
        twinFinal: [BRANDING_UNBRANDED("x.ts", 3, "parent")],
      },
      {
        why: "mustFlag[3] an inline unbranded primary-key id — caught by both",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [BRANDING_LEGACY_PK("x.ts", 1)],
        final: [],
        finalErrors: [BRANDING_EMPTY],
        repair: { prepend: { "packages/db/src/schema/x.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: [BRANDING_UNBRANDED("x.ts", 2, "t")],
      },
      {
        why: "mustFlag[4] the same-file FK-brand-flow arm — the twin reports the parent's non-canonical brand, same classification as [2]",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [BRANDING_LEGACY_FK("fk.ts", 2)],
        final: [],
        finalErrors: [BRANDING_EMPTY],
        repair: { prepend: { "packages/db/src/schema/fk.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: [BRANDING_UNBRANDED("fk.ts", 2, "parent")],
      },
      {
        why: "mustPass[0] a locally-declared brand. STRENGTHENING: green under the legacy's presence-only check, RED under the final's canonical-brand requirement",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: [BRANDING_EMPTY],
        repair: { prepend: { "packages/db/src/schema/x.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: [BRANDING_UNBRANDED("x.ts", 3, "t")],
      },
      {
        why: "mustPass[1] the same strengthening on a second spelling",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: [BRANDING_EMPTY],
        repair: { prepend: { "packages/db/src/schema/y.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: [BRANDING_UNBRANDED("y.ts", 2, "t")],
      },
      {
        why: "mustPass[2] a plain non-id table — still flagged for its own unbranded `id` under the strengthening",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: [BRANDING_EMPTY],
        repair: { prepend: { "packages/db/src/schema/plain.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: [BRANDING_UNBRANDED("plain.ts", 4, "t")],
      },
      {
        why: "mustPass[3] a plain FK pair — same strengthening, reported on the parent",
        legacyPopulation: 1,
        finalPopulation: 1,
        legacy: [],
        final: [],
        finalErrors: [BRANDING_EMPTY],
        repair: { prepend: { "packages/db/src/schema/plainfk.ts": DRIZZLE } },
        twinFinalPopulation: 1,
        twinFinal: [BRANDING_UNBRANDED("plainfk.ts", 4, "parent")],
      },
    ]);
    expect(compared, "every frozen mustFlag/mustPass example was compared").toBe(legacy.mustFlag.length + legacy.mustPass.length);

    // THE STRENGTHENING IS SATISFIABLE — the control that stops the four red mustPass rows above from
    // reading as "the final flags every branded schema". The same shape with the REAL canonical brand
    // declaration passes on the final engine, and the legacy engine passes it too.
    const canonical: Files = {
      [ID_TYPES_PATH]: ID_TYPES,
      "packages/db/src/schema/x.ts":
        'import type { ChatId } from "../../../kit/src/ids/index";\n' +
        'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
        'export const chats = sqliteTable("chats", { id: text("id").primaryKey().$type<ChatId>() });\n',
    };
    expect(finalReplay([schemaBranding], canonical, label).findings, "the canonical-brand control passes the FINAL engine").toEqual([]);
    expect(finalReplay([schemaBranding], canonical, label).toolErrors, "and reaches a verdict rather than refusing").toEqual([]);
    expect(
      legacyReplay(legacy, canonical, label).findings,
      "and the LEGACY engine passed the same bytes — so the strengthening added an obligation, it did not move the goalposts",
    ).toEqual([]);
  },
  TIMEOUT_MS,
);
