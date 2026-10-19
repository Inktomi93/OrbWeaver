// Real-corpus liveness arms (#2149) for the leftover policies whose declared population is `@product`, `@db`,
// or `@server` + `@inference` (0042's seventh chunk). DATA, collected by the one runner
// (`./runner.ts`), which loads each isolated structure corpus once
// and runs every arm against it (docs/work/0043).
//
// EACH ARM IS ITS POLICY'S OWN `mustFlag` ROW, TRANSPLANTED ONTO THE REAL TREE: new modules import the real
// doors (`@orb/kit/ids`, `@orb/contracts/*`, `drizzle-orm/sqlite-core`, the real `chats` table) and new schema
// files sit beside the real ones in `packages/db/src/schema/`. Several schema policies judge EVERY table, so a
// schema arm's file can also draw findings from the other schema-population policies; the runner's entanglement check
// proves those arms alone.

import type { RealCorpusLivenessArm, RealCorpusOverlay } from "@orb/testkit/node/real-corpus-liveness.ts";
import { gate as assumesSingleReplica } from "../../../../../tooling/src/verify/gates/assumes-single-replica.ts";
import { gate as byteCheckCast } from "../../../../../tooling/src/verify/gates/byte-check-cast.ts";
import { gate as detachedWorkTraced } from "../../../../../tooling/src/verify/gates/detached-work-traced.ts";
import { gate as entrySyntheticRoleIsUser } from "../../../../../tooling/src/verify/gates/entry-synthetic-role-is-user.ts";
import { gate as noLooseIdCast } from "../../../../../tooling/src/verify/gates/no-loose-id-cast.ts";
import { gate as noRawEgress } from "../../../../../tooling/src/verify/gates/no-raw-egress.ts";
import { gate as noVanityAlias } from "../../../../../tooling/src/verify/gates/no-vanity-alias.ts";
import { gate as onePrincipalMintPopulation } from "../../../../../tooling/src/verify/gates/one-principal-mint-population.ts";
import { gate as ownerRoleSplit } from "../../../../../tooling/src/verify/gates/owner-role-split.ts";
import { gate as platformSpellings } from "../../../../../tooling/src/verify/gates/platform-spellings.ts";
import { gate as schemaBranding } from "../../../../../tooling/src/verify/gates/schema-branding.ts";
import { gate as scrubberHome } from "../../../../../tooling/src/verify/gates/scrubber-home.ts";
import { gate as soleEnvReader } from "../../../../../tooling/src/verify/gates/sole-env-reader.ts";
import { gate as typeidPrefixBoundary } from "../../../../../tooling/src/verify/gates/typeid-prefix-boundary.ts";
import { gate as zodErrorIssuesHome } from "../../../../../tooling/src/verify/gates/zod-error-issues-home.ts";
import { gate as zodOutputTwinParity } from "../../../../../tooling/src/verify/gates/zod-output-twin-parity.ts";

const SCHEMA = "packages/db/src/schema";
const DOMAIN = "packages/server/src/domain/character";
const CONTRACTS = "packages/contracts/src";
const SQLITE = 'import { sqliteTable, text } from "drizzle-orm/sqlite-core";\n';

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
    policy: noLooseIdCast,
    overlays: [add("packages/server/src/liveness-cast.ts", "export const livenessCast = value as never;\n")],
    messageIncludes: "bypasses branded-id type safety",
  },
  {
    policy: noRawEgress,
    overlays: [add(`${DOMAIN}/liveness-egress.ts`, 'export const livenessLoad = async (): Promise<unknown> => await fetch("https://liveness.invalid");\n')],
    messageIncludes: "raw `fetch` in server source",
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
    policy: platformSpellings,
    overlays: [
      add(
        "packages/server/src/primitives/liveness-sleep.ts",
        "export const nap = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));\n",
      ),
    ],
    messageIncludes: "superseded pre-node-26 spelling",
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
