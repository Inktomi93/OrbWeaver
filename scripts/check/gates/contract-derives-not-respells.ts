// Gate: contract-derives-not-respells — a server domain's `contract/` DERIVES its shapes; it never
// re-spells one a lower package already owns (AGENTS §0.2 "a type/shape has exactly ONE home, by who needs
// it": DB row → `db` via `$inferSelect`; cross-boundary wire → `contracts`; domain-internal → that domain's
// `contract/`). A re-spelled shape is not a duplicate that merely costs bytes: it is a shape that goes
// SILENTLY STALE the day the owner grows a field, and tsc cannot tell you (two structurally-identical types
// are assignable, so the drift only surfaces as a missing column at runtime).
//
// TWO SYNTACTIC ARMS (both commit-tier — pure AST over the shared project, no type graph):
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
// ALLOWLIST rows below. That is the whole discipline: scope the gate with the evidence, never ship an
// allowlist that lies about what it is exempting.
//
// DECLARED BLIND SPOTS: a shape re-spelled under a DIFFERENT name (only a mutual-assignability probe finds
// that — `pnpm ast respell <domain>`, the push-tier candidate lens, deliberately NOT a gate: assignability
// alone cannot tell a re-spell from two shapes that merely agree today); a re-spell of a shape owned by
// `kit` (no per-domain name space to key on); and a `contracts` shape re-spelled in a domain dir whose name
// differs from the contracts dir name (the domain map has no such pair today).
import type { Node, SourceFile } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

const DOMAIN_CONTRACT_RE = /\/packages\/server\/src\/domain\/(?<domain>[^/]+)\/contract\//u;
const CONTRACTS_DIR_RE = /\/packages\/contracts\/src\/(?<domain>[^/]+)\//u;
const DB_SCHEMA_DIR = "/packages/db/src/schema/";
const ROW_SUFFIX_RE = /(?<suffix>Row|Insert)$/u;
const SQLITE_TABLE = "sqliteTable";
/** The tell that a run's fileset IS the real tree (the `verify-registry-parity` real-manifest idiom): a
 *  synthetic conformance mini-project also reports `scope.kind === "project"`, so the ALLOWLIST's
 *  file-vanished stale arm would otherwise fire on every self-proof example. Chat's roster contract is the
 *  anchor because no example may plausibly need that exact path (and the self-proofs deliberately use
 *  `probe-`-prefixed filenames for the same reason). */
const REAL_TREE_ANCHOR = "packages/server/src/domain/chat/contract/service.ts";

/** ARM B survivors: a `*Row` whose prefix collides with a table NAME but which is not that table's row. Each
 *  row states WHY (a homonym or an aggregate), and the ratchet works both ways — a row whose file no longer
 *  carries the shape is RED, so a cleaned-up exemption cannot linger. */
const ALLOWLIST: Record<string, string> = {
  "packages/server/src/domain/discovery/contract/results.ts::ThemeRow":
    "HOMONYM: discovery's `ThemeRow` is an emergent THEME CLUSTER (k-means over digest embeddings — id/level/clusterIdx/size/model), while the `themes` table is the UI palette/token-override row (owner-scoped `override` blob). Same word, unrelated concepts; the cluster's own table is `themeClusters`.",
  "packages/server/src/domain/stats/contract/views.ts::ModelStatRow":
    "AGGREGATE: a read-time GROUP BY projection over `model_stats` carrying computed fields that are never columns (`charactersUsedWith` — model_stats is character-less, plus the p50/p90 percentiles the file header says are computed on read, invariant #6). Deriving it from `$inferSelect` would be a lie about what the read returns.",
};

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
  "with computed fields), rename it so the collision stops lying — or take an ALLOWLIST row WITH that reason in " +
  "scripts/check/gates/contract-derives-not-respells.ts.";

const RESPELL_MESSAGE = (name: string, domain: string): string =>
  `\`${name}\` is re-declared here with a hand-written body, but @orb/contracts/${domain} already exports that ` +
  `name — derive it (\`export type ${name} = …\` referencing the contracts export) instead of re-spelling it ` +
  "(packages/contracts/src/" +
  `${domain}/).`;

const HANDROW_MESSAGE = (name: string, table: string, suffix: string): string =>
  `\`${name}\` hand-spells the \`${table}\` row shape — derive it: \`export type ${name} = typeof ${table}.$infer` +
  `${suffix === "Row" ? "Select" : "Insert"}\` (import the table from @orb/db). A hand copy silently rots when the ` +
  "table grows a column (packages/db/src/schema/).";

const STALE_ALLOW = (key: string): string =>
  `ALLOWLIST entry \`${key}\` no longer names a hand-spelled table-row shape (renamed, derived, or deleted) — ` +
  "delete the stale row (ratchet down): scripts/check/gates/contract-derives-not-respells.ts";

/** Every export NAME declared under `packages/contracts/src/<domain>/`, keyed by domain. Syntactic: the
 *  declarations' own names plus named export specifiers — no module resolution, no type graph. */
function contractsExportsByDomain(files: readonly SourceFile[]): Map<string, Set<string>> {
  const byDomain = new Map<string, Set<string>>();
  for (const sf of files) {
    const domain = CONTRACTS_DIR_RE.exec(sf.getFilePath())?.groups?.["domain"];
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

/** Every drizzle table's EXPORT name (`export const workloadSchedules = sqliteTable(…)`). */
function tableNames(files: readonly SourceFile[]): Set<string> {
  const names = new Set<string>();
  for (const sf of files) {
    if (!sf.getFilePath().includes(DB_SCHEMA_DIR)) {
      continue;
    }
    for (const v of sf.getVariableDeclarations()) {
      const init = v.getInitializer();
      if (init !== undefined && N.isCallExpression(init) && init.getExpression().getText() === SQLITE_TABLE) {
        names.add(v.getName());
      }
    }
  }
  return names;
}

type Shape = { readonly name: string; readonly node: Node };

/** The HAND-WRITTEN exported shapes of one file: every exported interface, and every exported type alias whose
 *  right-hand side is an object literal type. A type alias that REFERENCES another type (the derive) is
 *  deliberately absent — that is the shape this gate wants. */
function handWrittenShapes(sf: SourceFile): Shape[] {
  const out: Shape[] = [];
  for (const i of sf.getInterfaces()) {
    if (i.isExported()) {
      out.push({ name: i.getName(), node: i });
    }
  }
  for (const t of sf.getTypeAliases()) {
    if (t.isExported() && t.getTypeNode()?.getKind() === SyntaxKind.TypeLiteral) {
      out.push({ name: t.getName(), node: t });
    }
  }
  return out;
}

/** The table this `*Row`/`*Insert` name claims, if any: `WorkloadScheduleRow` → `workloadSchedules`. */
function matchedTable(name: string, tables: ReadonlySet<string>): { table: string; suffix: string } | undefined {
  const suffix = ROW_SUFFIX_RE.exec(name)?.groups?.["suffix"];
  if (suffix === undefined) {
    return;
  }
  const bare = name.slice(0, -suffix.length);
  const camel = bare.charAt(0).toLowerCase() + bare.slice(1);
  const table = [camel, `${camel}s`, `${camel}es`].find((candidate) => tables.has(candidate));
  return table === undefined ? undefined : { table, suffix };
}

function repoRel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

function run(ctx: GateRunCtx): void {
  const files = ctx.project.getSourceFiles();
  const contractsExports = contractsExportsByDomain(files);
  const tables = tableNames(files);
  const seenAllowed = new Set<string>();
  for (const sf of ctx.files) {
    const domain = DOMAIN_CONTRACT_RE.exec(sf.getFilePath())?.groups?.["domain"];
    if (domain === undefined) {
      continue;
    }
    const siblings = contractsExports.get(domain) ?? new Set<string>();
    const rel = repoRel(sf.getFilePath());
    for (const shape of handWrittenShapes(sf)) {
      if (siblings.has(shape.name)) {
        ctx.report({ file: rel, line: shape.node.getStartLineNumber(), column: 0, message: RESPELL_MESSAGE(shape.name, domain) });
        continue;
      }
      const match = matchedTable(shape.name, tables);
      if (match === undefined) {
        continue;
      }
      const key = `${rel}::${shape.name}`;
      if (key in ALLOWLIST) {
        seenAllowed.add(key);
        continue;
      }
      ctx.report({ file: rel, line: shape.node.getStartLineNumber(), column: 0, message: HANDROW_MESSAGE(shape.name, match.table, match.suffix) });
    }
  }
  reportStaleAllowlist(ctx, seenAllowed);
}

/** Both-ways ratchet on the ARM-B allowlist. Fires for a row whose FILE was scanned and no longer carries the
 *  shape; the file-vanished case additionally needs the real-tree anchor, so a synthetic mini-project (which
 *  contains none of these paths) never claims every exemption went stale. */
function reportStaleAllowlist(ctx: GateRunCtx, seen: ReadonlySet<string>): void {
  if (ctx.scope.kind !== "project") {
    return;
  }
  const scanned = new Set(ctx.files.map((sf) => repoRel(sf.getFilePath())));
  const realTree = scanned.has(REAL_TREE_ANCHOR);
  for (const key of Object.keys(ALLOWLIST)) {
    if (seen.has(key)) {
      continue;
    }
    const file = key.split("::")[0] ?? "";
    if (scanned.has(file) || realTree) {
      ctx.report({ file: "scripts/check/gates/contract-derives-not-respells.ts", line: 1, column: 0, message: STALE_ALLOW(key) });
    }
  }
}

export const gate: GateDescriptor = {
  name: "contract-derives-not-respells",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  // Cross-file by nature: the verdict needs the sibling @orb/contracts export names and the db table names.
  scopeSafety: "whole-project",
  message: MESSAGE,
  fix: FIX,
  scanRoot: (p) => p.includes("packages/server/src/domain/") || p.includes("packages/contracts/src/") || p.includes("packages/db/src/schema/"),
  run,

  mustFlag: [
    {
      files: {
        "packages/contracts/src/chat/roster.ts": "export interface RosterMemberSpec {\n  readonly kind: string;\n}\n",
        "packages/server/src/domain/chat/contract/params.ts": "export interface RosterMemberSpec {\n  readonly kind: string;\n}\n",
      },
      expect: { messageIncludes: "already exports that name" },
      why: "ARM A: the domain contract re-declares a name @orb/contracts/chat owns — the wire shape now has two homes and they drift apart silently",
    },
    {
      files: {
        "packages/db/src/schema/workloads.ts": 'export const workloadSchedules = sqliteTable("workload_schedules", {});\n',
        "packages/server/src/domain/workloads/contract/probe-schedule.ts":
          "export interface WorkloadScheduleRow {\n  readonly id: string;\n  readonly enabled: boolean;\n}\n",
      },
      expect: { messageIncludes: "$inferSelect" },
      why: "ARM B: the founding defect — a hand-written interface listing a real table's columns (fixed on the tree in this gate's landing commit)",
    },
    {
      files: {
        "packages/db/src/schema/workloads.ts": 'export const workloads = sqliteTable("workloads", {});\n',
        "packages/server/src/domain/workloads/contract/x.ts": "export type WorkloadInsert = {\n  readonly id: string;\n};\n",
      },
      expect: { messageIncludes: "$inferInsert" },
      why: "ARM B, the INSERT half + the object-literal TYPE ALIAS spelling (not just `interface`) — the remedy names $inferInsert, not $inferSelect",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/contracts/src/assets/index.ts": "export interface ListOwnedParams {\n  readonly ownerId: string;\n}\n",
        "packages/server/src/domain/assets/contract/params.ts":
          'import type { ListOwnedParams as Wire } from "@orb/contracts/assets";\n\nexport type ListOwnedParams = Wire;\n',
      },
      why: "the SANCTIONED shape and the tree's actual state: the domain contract re-exports the contracts shape as a REFERENCE — one home, one spelling",
    },
    {
      files: {
        "packages/db/src/schema/workloads.ts": 'export const workloadSchedules = sqliteTable("workload_schedules", {});\n',
        "packages/server/src/domain/workloads/contract/probe-schedule.ts": "export type WorkloadScheduleRow = typeof workloadSchedules.$inferSelect;\n",
      },
      why: "ARM B's remedy — the derive is a type REFERENCE, not an object literal, so it is not a hand-written shape at all",
    },
    {
      files: {
        "packages/db/src/schema/stats.ts": 'export const modelStats = sqliteTable("model_stats", {});\n',
        "packages/server/src/domain/stats/contract/probe-views.ts": "export interface LeaderboardRow {\n  readonly model: string;\n}\n",
      },
      why: "the SEED-SET guard: a `*Row` that names NO table (`leaderboard`) is a read-time aggregate — eleven of these exist and none is rot; the table-name match is what keeps them out",
    },
    {
      files: {
        "packages/contracts/src/chat/roster.ts": "export interface RosterMemberSpec {\n  readonly kind: string;\n}\n",
        "packages/server/src/domain/chat/contract/params.ts": "export interface JoinChatParams {\n  readonly chatId: string;\n}\n",
      },
      why: "a domain-internal shape @orb/contracts does NOT own — the domain `contract/` is exactly where it belongs (AGENTS §0.2's fourth home)",
    },
  ],
};
