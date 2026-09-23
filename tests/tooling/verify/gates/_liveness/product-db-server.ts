// Real-corpus liveness arms (#2149) for the leftover policies whose declared population is `@product`, `@db`,
// or `@server` + `@inference` (0042's seventh chunk). DATA, collected by the one runner
// (`../real-corpus-liveness-family.suite.repo.int.test.ts`), which loads the structure run's own corpus once
// and runs every arm against it (docs/work/0043).
//
// EACH ARM IS ITS POLICY'S OWN `mustFlag` ROW, TRANSPLANTED ONTO THE REAL TREE: new modules import the real
// doors (`@orb/kit/ids`, `@orb/contracts/*`, `drizzle-orm/sqlite-core`, the real `chats` table) and new schema
// files sit beside the real ones in `packages/db/src/schema/`. Several schema policies judge EVERY table, so a
// schema arm's file also draws `db-structure` / `table-scoping-class` findings; the runner's entanglement check
// proves those arms alone.
import { gate as assumesSingleReplica } from "../../../../../tooling/src/verify/gates/assumes-single-replica.ts";
import { gate as byteCheckCast } from "../../../../../tooling/src/verify/gates/byte-check-cast.ts";
import { gate as contentPartSeam } from "../../../../../tooling/src/verify/gates/content-part-seam.ts";
import { gate as dCitationIntegrity } from "../../../../../tooling/src/verify/gates/d-citation-integrity.ts";
import { gate as dbEnumFromTuple } from "../../../../../tooling/src/verify/gates/db-enum-from-tuple.ts";
import { gate as dbStructure } from "../../../../../tooling/src/verify/gates/db-structure.ts";
import { gate as detachedWorkTraced } from "../../../../../tooling/src/verify/gates/detached-work-traced.ts";
import { gate as detachedWorkTracedHealth } from "../../../../../tooling/src/verify/gates/detached-work-traced-health.ts";
import { gate as entrySyntheticRoleIsUser } from "../../../../../tooling/src/verify/gates/entry-synthetic-role-is-user.ts";
import { gate as fkColumnsIndexed } from "../../../../../tooling/src/verify/gates/fk-columns-indexed.ts";
import { gate as fkOndeleteStated } from "../../../../../tooling/src/verify/gates/fk-ondelete-stated.ts";
import { gate as noLooseIdCast } from "../../../../../tooling/src/verify/gates/no-loose-id-cast.ts";
import { gate as noMintViaCast } from "../../../../../tooling/src/verify/gates/no-mint-via-cast.ts";
import { gate as noRawClock } from "../../../../../tooling/src/verify/gates/no-raw-clock.ts";
import { gate as noRawEgress } from "../../../../../tooling/src/verify/gates/no-raw-egress.ts";
import { gate as noRejectedCorsProxy } from "../../../../../tooling/src/verify/gates/no-rejected-cors-proxy.ts";
import { gate as noUntypedSoftRef } from "../../../../../tooling/src/verify/gates/no-untyped-soft-ref.ts";
import { gate as noVanityAlias } from "../../../../../tooling/src/verify/gates/no-vanity-alias.ts";
import { gate as onePrincipalMintPopulation } from "../../../../../tooling/src/verify/gates/one-principal-mint-population.ts";
import { gate as ownerRoleSplit } from "../../../../../tooling/src/verify/gates/owner-role-split.ts";
import { gate as owneridRegistry } from "../../../../../tooling/src/verify/gates/ownerid-registry.ts";
import { gate as platformSpellings } from "../../../../../tooling/src/verify/gates/platform-spellings.ts";
import { gate as schemaBannedShapes } from "../../../../../tooling/src/verify/gates/schema-banned-shapes.ts";
import { gate as schemaBranding } from "../../../../../tooling/src/verify/gates/schema-branding.ts";
import { gate as scrubberHome } from "../../../../../tooling/src/verify/gates/scrubber-home.ts";
import { gate as soleEnvReader } from "../../../../../tooling/src/verify/gates/sole-env-reader.ts";
import { gate as tableExplicitPrimaryKey } from "../../../../../tooling/src/verify/gates/table-explicit-primary-key.ts";
import { gate as tableScopingClass } from "../../../../../tooling/src/verify/gates/table-scoping-class.ts";
import { gate as typeidPrefixBoundary } from "../../../../../tooling/src/verify/gates/typeid-prefix-boundary.ts";
import { gate as zodErrorIssuesHome } from "../../../../../tooling/src/verify/gates/zod-error-issues-home.ts";
import { gate as zodExportMembership } from "../../../../../tooling/src/verify/gates/zod-export-membership.ts";
import { gate as zodModernSpellings } from "../../../../../tooling/src/verify/gates/zod-modern-spellings.ts";
import { gate as zodOutputTwinParity } from "../../../../../tooling/src/verify/gates/zod-output-twin-parity.ts";
import type { RealCorpusLivenessArm, RealCorpusOverlay } from "../../../../support/real-corpus-liveness.ts";

const SCHEMA = "packages/db/src/schema";
const DOMAIN = "packages/server/src/domain/character";
const CONTRACTS = "packages/contracts/src";
const SQLITE = 'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n';
// Assembled so the dangling decision number never appears whole in this file.
const DANGLING_DECISION = ["D", "999999"].join("");

function add(path: string, source: string): RealCorpusOverlay {
  return { kind: "add", path, source };
}

export const PRODUCT_DB_SERVER_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: assumesSingleReplica,
    overlays: [add(`${DOMAIN}/liveness-replica.ts`, "export const livenessReplica = new Map<string, number>();\n")],
    messageIncludes: "module-scope mutable per-process state",
  },
  {
    policy: contentPartSeam,
    overlays: [
      add(
        "packages/server/src/domain/chat/verbs/liveness-parts.ts",
        'import type { ChatContentPart } from "@orb/contracts/chat";\nexport type LivenessPart = ChatContentPart;\n',
      ),
    ],
    messageIncludes: "packages/server/src/domain/chat/verbs/liveness-parts.ts",
  },
  {
    policy: dCitationIntegrity,
    overlays: [add(`${CONTRACTS}/liveness-cite.ts`, `// per ${DANGLING_DECISION}, a dangling citation above the ceiling.\nexport const livenessCite = 1;\n`)],
    messageIncludes: DANGLING_DECISION,
  },
  {
    policy: dbEnumFromTuple,
    overlays: [
      add(
        `${SCHEMA}/liveness-enum.ts`,
        `${SQLITE}export const livenessEnum = sqliteTable("liveness_enum", { id: text("id").primaryKey(), k: text("k", { enum: ["a", "b"] }) });\n`,
      ),
    ],
    messageIncludes: "INLINE ARRAY LITERAL",
  },
  {
    policy: dbStructure,
    overlays: [add(`${SCHEMA}/liveness-orphan.ts`, "export const livenessOrphan = 1;\n")],
    messageIncludes: "not re-exported",
  },
  {
    policy: detachedWorkTracedHealth,
    // The tracing home keeps a span helper but no root-span opener.
    overlays: [
      {
        kind: "neutralise",
        path: "packages/server/src/foundation/observability/tracing.ts",
        source: "export function withRequestSpan(id: string, fn: () => Promise<void>): Promise<void> {\n  return t.startActiveSpan(id, {}, fn);\n}\n",
      },
    ],
    messageIncludes: "derived ZERO root-span openers",
  },
  {
    policy: detachedWorkTraced,
    overlays: [
      add(
        "packages/inference/src/liveness-detached.ts",
        "export function livenessDispose(model: { dispose(): Promise<void> }): void {\n  void model.dispose().catch(() => undefined);\n}\n",
      ),
    ],
    messageIncludes: "FAILURE IS INVISIBLE",
  },
  {
    policy: entrySyntheticRoleIsUser,
    overlays: [
      add(
        "packages/server/src/domain/chat/verbs/liveness-synthetic.ts",
        'import type { Principal } from "@orb/contracts/identity";\nconst livenessPrincipal: Principal = { userId: "x", role: "user", handle: "x", externalId: null, via: "fallback" };\nexport const livenessSynthetic = livenessPrincipal;\n',
      ),
    ],
    messageIncludes: 'hardcoded `role: "user"`',
  },
  {
    policy: fkColumnsIndexed,
    overlays: [
      add(
        `${SCHEMA}/liveness-fk-index.ts`,
        `${SQLITE}import { chats } from "./chat.ts";\nexport const livenessNotes = sqliteTable("liveness_notes", { id: text("id").primaryKey(), note: text("note"), chatId: text("chat_id").references(() => chats.id, { onDelete: "cascade" }) });\n`,
      ),
    ],
    messageIncludes: "does not LEAD any B-tree index",
  },
  {
    policy: fkOndeleteStated,
    overlays: [
      add(
        `${SCHEMA}/liveness-fk-ondelete.ts`,
        `${SQLITE}import { chats } from "./chat.ts";\nexport const livenessRefs = sqliteTable("liveness_refs", { id: text("id").primaryKey(), chatId: text("chat_id").references(() => chats.id) });\n`,
      ),
    ],
    messageIncludes: "has no `onDelete` action",
  },
  {
    policy: noLooseIdCast,
    overlays: [add("packages/server/src/liveness-cast.ts", "export const livenessCast = value as never;\n")],
    messageIncludes: "bypasses branded-id type safety",
  },
  {
    policy: noMintViaCast,
    overlays: [
      add(
        "packages/server/src/liveness-mint.ts",
        'import { randomUUID } from "node:crypto";\nimport { castId } from "@orb/kit/ids";\nexport const livenessMinted = castId(randomUUID());\n',
      ),
    ],
    messageIncludes: "castId wraps a fresh-id generator",
  },
  {
    policy: noRawClock,
    overlays: [add(`${DOMAIN}/liveness-clock.ts`, "export function livenessNow(): number {\n  return Date.now();\n}\n")],
    messageIncludes: `${DOMAIN}/liveness-clock.ts`,
  },
  {
    policy: noRawEgress,
    overlays: [add(`${DOMAIN}/liveness-egress.ts`, 'export const livenessLoad = async (): Promise<unknown> => await fetch("https://liveness.invalid");\n')],
    messageIncludes: "raw `fetch` in server source",
  },
  {
    policy: noRejectedCorsProxy,
    overlays: [add(`${DOMAIN}/liveness-proxy.ts`, 'export const livenessProxy = "https://corsproxy.io/?url=";\n')],
    messageIncludes: "corsproxy.io",
  },
  {
    policy: noUntypedSoftRef,
    overlays: [
      add(
        `${SCHEMA}/liveness-soft-ref.ts`,
        `${SQLITE}export const livenessWidgets = sqliteTable("liveness_widgets", { id: text("id").primaryKey(), widgetId: text("widget_id") });\n`,
      ),
    ],
    messageIncludes: "carries NO `.references()` FK",
  },
  {
    policy: noVanityAlias,
    overlays: [add(`${DOMAIN}/liveness-alias.ts`, 'import { castId as livenessCastId } from "@orb/kit/ids";\nexport const livenessUse = livenessCastId;\n')],
    messageIncludes: "vanity rename",
  },
  {
    policy: onePrincipalMintPopulation,
    overlays: [
      add(
        "packages/server/src/domain/chat/verbs/liveness-mint-principal.ts",
        'import type { Principal } from "@orb/contracts/identity";\nconst livenessHost = (id: string): Principal => ({ userId: id, role: "owner", handle: id, externalId: null, via: "fallback" });\nexport const livenessMint = livenessHost;\n',
      ),
    ],
    messageIncludes: "Principal mint site",
  },
  {
    policy: ownerRoleSplit,
    overlays: [
      add(
        `${DOMAIN}/liveness-role.ts`,
        'import type { UserRole } from "@orb/contracts/identity";\nexport const livenessIsOwner = (r: { role: UserRole }): boolean => r.role === "owner";\n',
      ),
    ],
    messageIncludes: `${DOMAIN}/liveness-role.ts`,
  },
  {
    policy: owneridRegistry,
    overlays: [
      add(
        `${SCHEMA}/liveness-owner.ts`,
        `${SQLITE}export const livenessOwned = sqliteTable("liveness_owned", { id: text("id").primaryKey(), ownerId: text("owner_id") });\n`,
      ),
    ],
    messageIncludes: "ownership-stamp classification",
  },
  {
    policy: platformSpellings,
    overlays: [add("packages/showcase-plugins/src/liveness-escape.ts", "export function escapeRegExp(value: string): string {\n  return value;\n}\n")],
    messageIncludes: "superseded pre-node-26 spelling",
  },
  {
    policy: schemaBannedShapes,
    // The ledger killed `chats.activePresetId` by name (D58): a table named `chats` carrying it again.
    overlays: [
      add(
        `${SCHEMA}/liveness-banned.ts`,
        `${SQLITE}export const livenessChats = sqliteTable("chats", { id: text("id").primaryKey(), activePresetId: text("active_preset_id") });\n`,
      ),
    ],
    messageIncludes: "D58",
  },
  {
    policy: schemaBranding,
    overlays: [
      add(`${SCHEMA}/liveness-unbranded.ts`, `${SQLITE}export const livenessThings = sqliteTable("liveness_things", { id: text("id").primaryKey() });\n`),
    ],
    messageIncludes: "without a canonical",
  },
  {
    policy: scrubberHome,
    overlays: [
      add(
        "packages/server/src/transport/trpc/liveness-scrub.ts",
        'import { createHiddenSpanStreamScrubber } from "@orb/kit/content";\nexport const livenessScrubber = createHiddenSpanStreamScrubber();\n',
      ),
    ],
    messageIncludes: "packages/server/src/transport/trpc/liveness-scrub.ts",
  },
  {
    policy: soleEnvReader,
    overlays: [add(`${DOMAIN}/liveness-env.ts`, "export const livenessEnv = process.env.LIVENESS_VAR;\n")],
    messageIncludes: "process-env-read:LIVENESS_VAR",
  },
  {
    policy: tableExplicitPrimaryKey,
    overlays: [
      add(
        `${SCHEMA}/liveness-no-pk.ts`,
        `${SQLITE}export const livenessLocks = sqliteTable("liveness_locks", { chatId: text("chat_id"), holder: text("holder") });\n`,
      ),
    ],
    messageIncludes: "has no PRIMARY KEY",
  },
  {
    policy: tableScopingClass,
    overlays: [
      add(`${SCHEMA}/liveness-unscoped.ts`, `${SQLITE}export const livenessUnscoped = sqliteTable("liveness_unscoped", { id: text("id").primaryKey() });\n`),
    ],
    messageIncludes: "classify it",
  },
  {
    policy: typeidPrefixBoundary,
    overlays: [
      add(`${CONTRACTS}/liveness-boundary.ts`, 'import { brandedId, type ChatId } from "@orb/kit/ids";\nexport const livenessChatId = brandedId<ChatId>();\n'),
    ],
    messageIncludes: "brandedId",
  },
  {
    policy: zodErrorIssuesHome,
    overlays: [
      add(
        `${CONTRACTS}/liveness-refuse.ts`,
        'import type { ZodError } from "zod";\nexport function livenessRefuse(parsed: { error: ZodError }): string {\n  return parsed.error.issues.map((issue) => issue.message).join("; ");\n}\n',
      ),
    ],
    messageIncludes: "hand-flattened zod `issues`",
  },
  {
    policy: zodExportMembership,
    overlays: [add("packages/inference/src/liveness/schema.ts", 'import * as z from "zod";\nexport const livenessWire = z.object({ value: z.string() });\n')],
    messageIncludes: "no semantic output owner",
  },
  {
    policy: zodModernSpellings,
    overlays: [add(`${CONTRACTS}/liveness-strict.ts`, 'import { z } from "zod";\nexport const livenessStrict = z.object({}).strict();\n')],
    messageIncludes: "superseded zod spelling",
  },
  {
    policy: zodOutputTwinParity,
    overlays: [
      add(
        `${CONTRACTS}/liveness-twin.ts`,
        'import * as z from "zod";\ntype LivenessState = { mode: "idle" | "busy" };\nexport const livenessStateSchema = z.object({ mode: z.literal("idle") }) satisfies z.ZodType<LivenessState>;\n',
      ),
    ],
    messageIncludes: "authored type is not assignable to schema output",
  },
  {
    policy: byteCheckCast,
    // `byte-check-cast`'s own mustFlag row (the founding shape), planted verbatim: a `*_MAX_BYTES` cap over
    // a bare `length(value)` with no cast — SQLite `length()` on TEXT counts code points, not bytes.
    overlays: [
      add(
        "packages/db/src/schema/liveness-byte-row.ts",
        'import { sql } from "drizzle-orm";\n' +
          'import { check, sqliteTable, text } from "drizzle-orm/sqlite-core";\n' +
          "const KV_VALUE_MAX_BYTES = 65536;\n" +
          'export const t = sqliteTable("t", { value: text("value") }, () => [\n' +
          '  check("t_value_check", sql.raw(`length(value) <= ${KV_VALUE_MAX_BYTES}`)),\n' +
          "]);\n",
      ),
    ],
    messageIncludes: "SQLite `length()` on TEXT counts CODE POINTS, not bytes",
  },
];
