// Gate: contract-derives-not-respells — a server domain's `contract/` DERIVES its shapes; it never
// re-spells one a lower package already owns (AGENTS §0.2 "a type/shape has exactly ONE home, by who needs
// it": DB row → `db` via `$inferSelect`; cross-boundary wire → `contracts`; domain-internal → that domain's
// `contract/`). A re-spelled shape is not a duplicate that merely costs bytes: it is a shape that goes
// SILENTLY STALE the day the owner grows a field, and tsc cannot tell you (two structurally-identical types
// are assignable, so the drift only surfaces as a missing column at runtime).
//
// TWO SYNTACTIC ARMS (both commit-tier — pure AST over the declared population, no type graph):
//
//   ARM A (the contracts re-spell) — an exported interface / object-literal type alias in
//   `packages/server/src/domain/<d>/contract/**` whose NAME is also exported by `packages/contracts/src/<d>/`
//   must be a type REFERENCE (`export type X = ContractsX` / an alias or derive), never a hand-written body.
//   Measured on the tree at landing: FOUR name collisions exist (assets `ListOwnedParams`/`GalleryAddParams`/
//   `GalleryListParams`, imagery `ExtractionMode`) and ALL FOUR are already references — so this arm lands at
//   zero and is a pure ratchet against reintroduction, which is the only honest thing a gate at zero is.
//
//   ARM B (the hand-spelled db row) — an exported `*Row`/`*Insert` interface / object-literal type alias in a
//   domain `contract/` whose PREFIX names a real drizzle table (`WorkloadScheduleRow` → `workloadSchedules`,
//   matched singular/plural against the `sqliteTable(…)` exports of `packages/db/src/schema/`) must derive
//   through `typeof <table>.$inferSelect` / `$inferInsert`.
//
// WHY ARM B IS NAME-MATCHED TO A REAL TABLE, and not "every `*Row` in a contract/" (the seed-set discovery):
// `*Row` is ALSO the repo's word for a query PROJECTION and a UI row — `LeaderboardRow`, `MomentumRow`,
// `PersonaUsageRow`, `MsgRow`, `DigestRow`, `ReuseRow`, `RevealBodyRow`, `WorkloadRunnableRow`, … Eleven such
// types exist and every one is a legitimate hand-written aggregate. A blanket `*Row` rule would have flooded
// with eleven false reds; the table-name match reduced the candidate set to THREE, of which one was a real
// defect (fixed in the landing commit: `WorkloadScheduleRow` now derives) and two are homonyms carrying
// central reviewed-grant rows (see AUTHORITY below). That is the whole discipline: scope the gate with the
// evidence, never ship an exemption that lies about what it is exempting.
//
// DECLARED BLIND SPOTS: a shape re-spelled under a DIFFERENT name (only a mutual-assignability probe finds
// that — `pnpm ast respell <domain>`, the push-tier candidate lens, deliberately NOT a gate: assignability
// alone cannot tell a re-spell from two shapes that merely agree today); a re-spell of a shape owned by
// `kit` (no per-domain name space to key on); and a `contracts` shape re-spelled in a domain dir whose name
// differs from the contracts dir name (the domain map has no such pair today).
//
// AUTHORITY: `reviewed-grant`, and the family is a SINGLETON (#1922 / #2176 Phase F, 2026-09-15). Until
// this commit the gate was `ordinary` + a gate-local `ALLOWLIST` of two homonym/aggregate rows, audited by
// a `hard` sibling `contract-derives-not-respells-health` whose ONLY subject was that table's two-sided
// staleness. Both halves are retired into the CENTRAL mechanism, which owns each of their jobs exactly:
//   - the exemption itself → `lib/reviewed-grants.ts` rows keyed `(contract-derives-not-respells,
//     "<file>::<ShapeName>", "contract-hand-row:<table>")`. The SUBJECT is byte-identical to the retired
//     ALLOWLIST key and each `why` is carried verbatim; the OPERATION carries the TABLE the shape collides
//     with, so a grant binds the collision it reviewed and not whatever later occupies that name.
//   - the health sibling's "this row names nothing any more" → `stale-reviewed-grant`, raised by
//     `lib/gate-authority.ts` after a COMPLETE owner run when a grant is consumed zero times. That is
//     strictly stronger than the sibling was: it also catches an over-broad row (two matching findings
//     license neither), which the hand-written tripwire could not see.
// The `@orb-waive` door is gone with the `ordinary` authority: a homonym is a REVIEWED claim about a
// `(file, shape, table)` triple, never a line-local marker an author can mint. That closure is PROVEN, but
// not by a declared row: the retired mustPass fixture's marker now raises the central
// `ordinary-waiver … targets non-ordinary policy` alarm, and §6.2 puts an expected authority alarm in an
// importing family test driven through `runPolicyPass`, never in a proof row — so it lives in
// `tests/tooling/verify/gates/contract-shape-wave-1.test.ts`.
//
// SINGLETON REASON (§2, §7.4): with the health sibling retired this policy has no partner, and none is
// meaningful — the only other production consumer of a contract-shape-vs-table match would be a second
// verdict over the same predicate, which is what the retired split was. The shared reader stays at
// `lib/contract-derives-not-respells.ts` (#2091, owner decision #2096) because a gate owns no private
// reader either; the family field names this module's own id.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `contract-derives-not-respells` descriptor at 534c1327f682be2578e1dee7c7a2bfa488fb672a, the parent of the
// conversion `bd56189ba` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over
// the SAME 7,358 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy
// `scanRoot` admits 1,283 and final `population` admits 1,640. legacy − final = ∅. final − legacy = 357 — `@server`
// outside `domain/` (345) and `@db` outside `schema/` (12): root-level declaration, no arm reads them. Controls:
// inside `packages/contracts/src/assets/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import type { SourceFile } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { ContractShape } from "../lib/contract-derives-not-respells.ts";
import { DOMAIN_CONTRACT_RE, handWrittenShapes, matchedTable, tableNames } from "../lib/contract-derives-not-respells.ts";

const CONTRACTS_DIR_RE = /^packages\/contracts\/src\/(?<domain>[^/]+)\//u;

const MESSAGE =
  "a domain `contract/` re-spells a shape a lower package already owns. AGENTS §0.2: a shape has exactly ONE " +
  "home — a DB row is `typeof <table>.$inferSelect` in `db`, a cross-boundary wire shape is `contracts` — and a " +
  "hand-written copy goes silently stale the day the owner grows a field (two structurally-identical types stay " +
  "assignable, so tsc never tells you). Derive it. See packages/server/src/domain/rpg/contract/service.ts for the " +
  "`$inferSelect` form and docs/architecture/core/Spine-TypeScript-and-Patterns.md for the home table.";

const FIX =
  "replace the hand-written body with a derive: `export type X = <ContractsX>` (importing the sibling " +
  "@orb/contracts export) or `export type XRow = typeof <table>.$inferSelect` / `$inferInsert` (importing the " +
  "table from @orb/db). If the shape genuinely is NOT the owner's shape (a homonym, or a read-time aggregate " +
  "with computed fields), rename it so the collision stops lying — or, when the collision is the honest one, it " +
  "is a REVIEWED GRANT: add one row to tooling/src/verify/lib/reviewed-grants.ts keyed `policyId: " +
  '"contract-derives-not-respells"` with this finding\'s exact subject and operation, a `why` stating the ' +
  "homonym/aggregate claim and an `endsWhen` naming what retires it. The row goes STALE the day the shape or " +
  "the colliding table stops existing, so it is a claim the central engine keeps checking — not a parking space.";

/** The ARM descriptors. Each carries the offending SHAPE NAME — `render.ts` prints the position token, and
 *  the descriptor rides the MESSAGE because the final contract requires the token to be an exact authored
 *  slice (§2.1) and `respells "…"` appears nowhere in the file. The KIND prefix keeps the two arms
 *  distinguishable on one node. */
const respellToken = (name: string): string => `respells "${name}"`;
const handRowToken = (name: string): string => `hand-row "${name}"`;

/** The reviewed-grant identity. SUBJECT is the `<file>::<ShapeName>` pair — byte-identical to the retired
 *  ALLOWLIST key, so a migrated row keeps naming the same site. OPERATION names the licensed act and carries
 *  its discriminator: for ARM B the drizzle TABLE the name collides with, for ARM A the \@orb/contracts
 *  DOMAIN that owns the name. A grant therefore binds the collision it reviewed and expires when that
 *  collision changes, rather than licensing whatever later occupies the same file and name. */
const subjectOf = (rel: string, name: string): string => `${rel}::${name}`;
const RESPELL_OPERATION_PREFIX = "contract-respell:";
const HAND_ROW_OPERATION_PREFIX = "contract-hand-row:";

/** Every export NAME declared under `packages/contracts/src/<domain>/`, keyed by domain. Syntactic: the
 *  declarations' own names plus named export specifiers — no module resolution, no type graph. */
function contractsExportsByDomain(files: readonly SourceFile[], relativePath: (sourceFile: SourceFile) => string): Map<string, Set<string>> {
  const byDomain = new Map<string, Set<string>>();
  for (const sf of files) {
    const domain = CONTRACTS_DIR_RE.exec(relativePath(sf))?.groups?.["domain"];
    if (domain === undefined) {
      continue;
    }
    const names = byDomain.get(domain) ?? new Set<string>();
    for (const [name] of sf.getExportedDeclarations()) {
      names.add(name);
    }
    byDomain.set(domain, names);
  }
  return byDomain;
}

/** One shape's verdict: the message and the reviewed-grant identity, or undefined when it is clean. The
 *  report NODE-anchor requires the token to be an exact slice of the node's own text, so the ARM
 *  distinction (respells / hand-row) rides the message instead of the token — the shape NAME is the token.
 *  NOTHING is skipped here: under reviewed-grant authority the policy always reports, and the central
 *  engine is what licenses a reviewed collision. */
function shapeFinding(
  shape: ContractShape,
  site: { readonly rel: string; readonly domain: string },
  siblings: ReadonlySet<string>,
  tables: ReadonlySet<string>,
): { readonly message: string; readonly subject: string; readonly operation: string } | undefined {
  const { rel, domain } = site;
  const subject = subjectOf(rel, shape.name);
  if (siblings.has(shape.name)) {
    const operation = `${RESPELL_OPERATION_PREFIX}${domain}`;
    return { message: `${MESSAGE} (${respellToken(shape.name)}) Subject: ${subject}, operation: ${operation}.`, subject, operation };
  }
  const match = matchedTable(shape.name, tables);
  if (match === undefined) {
    return;
  }
  const operation = `${HAND_ROW_OPERATION_PREFIX}${match.table}`;
  return { message: `${MESSAGE} (${handRowToken(shape.name)}) Subject: ${subject}, operation: ${operation}.`, subject, operation };
}

export const gate = defineGate({
  id: "contract-derives-not-respells",
  family: "contract-derives-not-respells",
  authority: "reviewed-grant",
  severity: "error",
  // Cross-file by nature: the verdict needs the sibling @orb/contracts export names and the db table names.
  population: ["@server", "@contracts", "@db"],
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const contractsExports = contractsExportsByDomain(ctx.files, ctx.relativePath);
      const tables = tableNames(ctx.files, ctx.relativePath);
      for (const sf of ctx.files) {
        const domain = DOMAIN_CONTRACT_RE.exec(ctx.relativePath(sf))?.groups?.["domain"];
        if (domain === undefined) {
          continue;
        }
        const siblings = contractsExports.get(domain) ?? new Set<string>();
        const rel = ctx.relativePath(sf);
        for (const shape of handWrittenShapes(sf)) {
          const finding = shapeFinding(shape, { rel, domain }, siblings, tables);
          if (finding !== undefined) {
            const offset = shape.node.getText().indexOf(shape.name);
            ctx.report.node(shape.node, { token: shape.name, offset, ...finding });
          }
        }
      }
    },
  }),

  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/contracts/src/chat/roster.ts": "export interface RosterMemberSpec {\n  readonly kind: string;\n}\n",
        "packages/server/src/domain/chat/contract/params.ts": "export interface RosterMemberSpec {\n  readonly kind: string;\n}\n",
      },
      expect: { count: 1, messageIncludes: "operation: contract-respell:chat." },
      why: 'ARM A: the domain contract re-declares a name @orb/contracts/chat owns — the wire shape now has two homes and they drift apart silently. The expectation pins the OPERATION rather than the arm descriptor because ARM A\'s grant identity carries the owning @orb/contracts DOMAIN, and `respells "…"` alone would not distinguish which namespace decided the collision',
    },
    {
      mode: "source",
      grant: {
        subject: "packages/server/src/domain/workloads/contract/probe-schedule.ts::WorkloadScheduleRow",
        operation: "contract-hand-row:workloadSchedules",
      },
      files: {
        "packages/db/src/schema/workloads.ts": 'export const workloadSchedules = sqliteTable("workload_schedules", {});\n',
        "packages/server/src/domain/workloads/contract/probe-schedule.ts":
          "export interface WorkloadScheduleRow {\n  readonly id: string;\n  readonly enabled: boolean;\n}\n",
      },
      expect: { count: 1, messageIncludes: 'hand-row "WorkloadScheduleRow"' },
      why: "ARM B: the founding defect — a hand-written interface listing a real table's columns (fixed on the tree in this gate's landing commit). It also carries the §6.2 grant witness the loader requires unconditionally: the finding's (subject, operation) pair is the `<file>::<Shape>` key the retired ALLOWLIST used plus the table it collides with, so this row proves the identity a central grant must name is the identity the policy actually emits",
    },
    {
      mode: "source",
      files: {
        "packages/db/src/schema/workloads.ts": 'export const workloads = sqliteTable("workloads", {});\n',
        "packages/server/src/domain/workloads/contract/x.ts": "export type WorkloadInsert = {\n  readonly id: string;\n};\n",
      },
      expect: { count: 1, messageIncludes: 'hand-row "WorkloadInsert"' },
      why: "ARM B, the INSERT half + the object-literal TYPE ALIAS spelling (not just `interface`) — the remedy names $inferInsert, not $inferSelect",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/contracts/src/assets/index.ts": "export interface ListOwnedParams {\n  readonly ownerId: string;\n}\n",
        "packages/server/src/domain/assets/contract/params.ts":
          'import type { ListOwnedParams as Wire } from "@orb/contracts/assets";\n\nexport type ListOwnedParams = Wire;\n',
      },
      why: "the SANCTIONED shape and the tree's actual state: the domain contract re-exports the contracts shape as a REFERENCE — one home, one spelling",
    },
    {
      mode: "source",
      files: {
        "packages/db/src/schema/workloads.ts": 'export const workloadSchedules = sqliteTable("workload_schedules", {});\n',
        "packages/server/src/domain/workloads/contract/probe-schedule.ts": "export type WorkloadScheduleRow = typeof workloadSchedules.$inferSelect;\n",
      },
      why: "ARM B's remedy — the derive is a type REFERENCE, not an object literal, so it is not a hand-written shape at all",
    },
    {
      mode: "source",
      files: {
        "packages/db/src/schema/stats.ts": 'export const modelStats = sqliteTable("model_stats", {});\n',
        "packages/server/src/domain/stats/contract/probe-views.ts": "export interface LeaderboardRow {\n  readonly model: string;\n}\n",
      },
      why: "the SEED-SET guard: a `*Row` that names NO table (`leaderboard`) is a read-time aggregate — eleven of these exist and none is rot; the table-name match is what keeps them out",
    },
    {
      mode: "source",
      files: {
        "packages/contracts/src/chat/roster.ts": "export interface RosterMemberSpec {\n  readonly kind: string;\n}\n",
        "packages/server/src/domain/chat/contract/params.ts": "export interface JoinChatParams {\n  readonly chatId: string;\n}\n",
      },
      why: "a domain-internal shape @orb/contracts does NOT own — the domain `contract/` is exactly where it belongs (AGENTS §0.2's fourth home)",
    },
    {
      mode: "source",
      files: {
        "packages/db/src/schema/discovery.ts": 'export const themeClusters = sqliteTable("theme_clusters", {});\n',
        "packages/server/src/domain/discovery/contract/results.ts": "export interface ThemeRow {\n  readonly id: string;\n}\n",
      },
      why: "THE GRANT'S OTHER SIDE: no `themes` table exists in this fixture, so `ThemeRow` matches no table at all and is never a finding — no grant is even reachable. The central row exists for the REAL tree, where `themes` (a different concept) is what forces it, and this arm is what keeps the table-name match, not the grant, as the thing that decides",
    },
  ],
});
