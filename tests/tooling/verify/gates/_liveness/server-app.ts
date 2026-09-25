// Real-corpus liveness arms (#2149) for the policies whose declared population is `@server` alone, any
// `under`/`notUnder` narrowing included (0042's fourth chunk). DATA, collected by the one runner
// (`../real-corpus-liveness-family.suite.repo.int.test.ts`), which loads the structure run's own corpus once
// and runs every arm against it (docs/work/0043).
//
// EACH ARM IS ITS POLICY'S OWN `mustFlag` ROW, TRANSPLANTED ONTO THE REAL TREE: new files import the real
// homes (`@orb/db` tables, `@orb/contracts` shapes, the real chat persistence and bus modules) exactly as
// server code spells them, and each blindness tripwire loses the real subject it counts. Every add path, id
// and name is this arm's own, because the add arms share one overlaid pass.
import { gate as busChannelPrimitive } from "../../../../../tooling/src/verify/gates/bus-channel-primitive.ts";
import { gate as chatViewerPlaneCanonReads } from "../../../../../tooling/src/verify/gates/chat-viewer-plane-canon-reads.ts";
import { gate as chatViewerPlaneCanonReadsHealth } from "../../../../../tooling/src/verify/gates/chat-viewer-plane-canon-reads-health.ts";
import { gate as discoveryNoStatsRollups } from "../../../../../tooling/src/verify/gates/discovery-no-stats-rollups.ts";
import { gate as externalIdSingleWriter } from "../../../../../tooling/src/verify/gates/external-id-single-writer.ts";
import { gate as firehoseImportAllowlist } from "../../../../../tooling/src/verify/gates/firehose-import-allowlist.ts";
import { gate as firehoseImportAllowlistHealth } from "../../../../../tooling/src/verify/gates/firehose-import-allowlist-health.ts";
import { gate as handleKeyWriter } from "../../../../../tooling/src/verify/gates/handle-key-writer.ts";
import { gate as infraAuthNoUserid } from "../../../../../tooling/src/verify/gates/infra-auth-no-userid.ts";
import { gate as membershipEnforcer } from "../../../../../tooling/src/verify/gates/membership-enforcer.ts";
import { gate as membershipFanGuard } from "../../../../../tooling/src/verify/gates/membership-fan-guard.ts";
import { gate as membershipWriteFan } from "../../../../../tooling/src/verify/gates/membership-write-fan.ts";
import { gate as noDirectUsersRead } from "../../../../../tooling/src/verify/gates/no-direct-users-read.ts";
import { gate as noHardcodedSideGenSampling } from "../../../../../tooling/src/verify/gates/no-hardcoded-side-gen-sampling.ts";
import { gate as noInlineDomainInterface } from "../../../../../tooling/src/verify/gates/no-inline-domain-interface.ts";
import { gate as ownTablesOnly } from "../../../../../tooling/src/verify/gates/own-tables-only.ts";
import { gate as ownerScopedReads } from "../../../../../tooling/src/verify/gates/owner-scoped-reads.ts";
import { gate as ownerScopedUpserts } from "../../../../../tooling/src/verify/gates/owner-scoped-upserts.ts";
import { gate as ownerScopedWrites } from "../../../../../tooling/src/verify/gates/owner-scoped-writes.ts";
import { gate as pluginDumpGuard } from "../../../../../tooling/src/verify/gates/plugin-dump-guard.ts";
import { gate as publicRouteBodyCap } from "../../../../../tooling/src/verify/gates/public-route-body-cap.ts";
import { gate as publicRouteBodyCapHealth } from "../../../../../tooling/src/verify/gates/public-route-body-cap-health.ts";
import { gate as serdeCoreDefinitionUniqueness } from "../../../../../tooling/src/verify/gates/serde-core-definition-uniqueness.ts";
import { gate as serdeCoreSeal } from "../../../../../tooling/src/verify/gates/serde-core-seal.ts";
import { gate as singleStreamTransport } from "../../../../../tooling/src/verify/gates/single-stream-transport.ts";
import { gate as turnIdentity } from "../../../../../tooling/src/verify/gates/turn-identity.ts";
import { gate as twoClassRoleAuthority } from "../../../../../tooling/src/verify/gates/two-class-role-authority.ts";
import { gate as typesInContract } from "../../../../../tooling/src/verify/gates/types-in-contract.ts";
import { gate as untrustedRegexSafeExec } from "../../../../../tooling/src/verify/gates/untrusted-regex-safe-exec.ts";
import { gate as vectorScopeDerived } from "../../../../../tooling/src/verify/gates/vector-scope-derived.ts";
import { gate as verbNaming } from "../../../../../tooling/src/verify/gates/verb-naming.ts";
import type { RealCorpusLivenessArm, RealCorpusOverlay } from "../../../../support/real-corpus-liveness.ts";

const SERVER = "packages/server/src";
const CHAT_VERBS = `${SERVER}/domain/chat/verbs`;
const EMPTY = "export {};\n";

/** Every entry/http module but the anchor the health tripwire reports on. The census is blind only when NONE
 *  of them yields a mutating, body-reading route; a module added without joining this list keeps a route
 *  alive and the arm goes red. */
const HTTP_ROUTE_MODULES = [
  "auth-meta",
  "auth-routes",
  "blob",
  "card-frame",
  "export",
  "frame-handle-store",
  "healthz",
  "import-chat",
  "import-tree",
  "import",
  "join",
  "plugin-frame",
  "plugin-ui",
  "security-headers",
  "spa",
  "upload",
] as const;

function add(path: string, source: string): RealCorpusOverlay {
  return { kind: "add", path, source };
}

function neutralise(path: string, source = EMPTY): RealCorpusOverlay {
  return { kind: "neutralise", path, source };
}

export const SERVER_APP_ARMS: readonly RealCorpusLivenessArm[] = [
  {
    policy: busChannelPrimitive,
    overlays: [
      add(`${SERVER}/transport/trpc/liveness-bus.ts`, 'import { EventEmitter } from "node:events";\nexport const livenessBus = new EventEmitter();\n'),
    ],
    messageIncludes: "packages/server/src/transport/trpc/liveness-bus.ts",
  },
  {
    policy: chatViewerPlaneCanonReadsHealth,
    // The authority matrix every D161 verdict keys off, emptied of its table.
    overlays: [neutralise(`${SERVER}/domain/chat/substrate/auth/matrix.ts`, "export const NO_MATRIX = 1;\n")],
    messageIncludes: "could not be read under domain/chat",
  },
  {
    policy: chatViewerPlaneCanonReads,
    // A member-authority (viewer-plane) verb factory that reaches the floorless canon reader.
    overlays: [
      add(
        `${CHAT_VERBS}/liveness-viewer.ts`,
        'import type { ChatService } from "../contract/service.ts";\nimport { loadCanonHistory } from "../persistence/queries.ts";\nexport function createListMessages(): ChatService["listMessages"] {\n  return (async () => await loadCanonHistory()) as unknown as ChatService["listMessages"];\n}\n',
      ),
    ],
    messageIncludes: "loadCanonHistory",
  },
  {
    policy: discoveryNoStatsRollups,
    overlays: [
      add(`${SERVER}/domain/discovery/persistence/liveness-rollup.ts`, 'import { ownerStats } from "@orb/db";\nexport const livenessRollup = ownerStats;\n'),
    ],
    messageIncludes: "stats rollup tables",
  },
  {
    policy: externalIdSingleWriter,
    overlays: [
      add(
        `${SERVER}/domain/sessions/verbs/liveness-second-link.ts`,
        'import { updateUser } from "../persistence/users.ts";\nexport async function link(db: D, userId: U, externalId: E): Promise<void> {\n  await updateUser(db, userId, { externalId, updatedAt: 0 });\n}\n',
      ),
    ],
    messageIncludes: "externalId",
  },
  {
    policy: handleKeyWriter,
    // D257: a users rename that drops the key must speak on the real tree, where every real rename carries it.
    overlays: [
      add(
        `${SERVER}/domain/sessions/verbs/liveness-rename.ts`,
        'import { users } from "@orb/db";\nimport { eq } from "drizzle-orm";\nexport const rename = (db: D, id: U, handle: H, at: number) => db.update(users).set({ handle, updatedAt: at }).where(eq(users.id, id));\n',
      ),
    ],
    messageIncludes: "handleKey",
  },
  {
    policy: firehoseImportAllowlistHealth,
    overlays: [neutralise(`${SERVER}/transport/trpc/chat-events-bus.ts`)],
    messageIncludes: "no longer declared",
  },
  {
    policy: firehoseImportAllowlist,
    overlays: [
      add(
        `${SERVER}/domain/automation/liveness-observer.ts`,
        'import { subscribeAllChatEvents } from "../../transport/trpc/chat-events-bus.ts";\nexport const livenessObserver = subscribeAllChatEvents;\n',
      ),
    ],
    messageIncludes: "subscribeAllChatEvents",
  },
  {
    policy: infraAuthNoUserid,
    overlays: [add(`${SERVER}/infra/auth/modes/liveness-mode.ts`, "export function livenessMode(userId: string): string {\n  return userId;\n}\n")],
    messageIncludes: "`userId` is forbidden",
  },
  {
    policy: membershipEnforcer,
    overlays: [add(`${CHAT_VERBS}/liveness-owner.ts`, "export const bad = (x: { readonly ownerId: string }, y: string): boolean => x.ownerId === y;\n")],
    messageIncludes: "ownerId",
  },
  {
    policy: membershipFanGuard,
    overlays: [
      add(
        `${CHAT_VERBS}/liveness-fan.ts`,
        'export function leak(emitUserEvent: (u: string, e: unknown) => void): void {\n  emitUserEvent("u1", { type: "chatsChanged" });\n}\n',
      ),
    ],
    messageIncludes: "emitUserEvent",
  },
  {
    policy: membershipWriteFan,
    overlays: [
      add(
        `${SERVER}/domain/databank/verbs/attach/liveness-attach.ts`,
        'import { chatDocuments } from "@orb/db";\nexport function attach(ctx: C) {\n  return async ({ ownerId, chatId, documentId }: P) => {\n    await ctx.db.insert(chatDocuments).values({ chatId, documentId }).returning({ documentId: chatDocuments.documentId });\n    ctx.emitUserEvent(ownerId, { type: "databankChanged", documentId });\n  };\n}\n',
      ),
    ],
    messageIncludes: "MEMBERSHIP-class write",
  },
  {
    policy: noDirectUsersRead,
    overlays: [add(`${SERVER}/domain/character/liveness-users.ts`, 'import { users } from "@orb/db";\nexport const livenessUsers = users;\n')],
    messageIncludes: "packages/server/src/domain/character/liveness-users.ts",
  },
  {
    policy: noHardcodedSideGenSampling,
    overlays: [add(`${CHAT_VERBS}/liveness-sampling.ts`, "export const livenessOpts = { temperature: 0.3, maxTokens: 24 };\n")],
    messageIncludes: "hardcoded side-gen sampling",
  },
  {
    policy: noInlineDomainInterface,
    overlays: [add(`${SERVER}/domain/character/verbs/liveness-shape.ts`, "export interface LivenessShape {\n  readonly x: string;\n}\n")],
    messageIncludes: "exported interface in a server domain",
  },
  {
    policy: ownTablesOnly,
    overlays: [
      add(
        `${SERVER}/domain/persona/verbs/liveness-from-character.ts`,
        'import { characters } from "@orb/db";\nexport const livenessCharacters = characters;\n',
      ),
    ],
    messageIncludes: "characters",
  },
  {
    policy: ownerScopedReads,
    overlays: [
      add(
        `${SERVER}/domain/character/persistence/liveness-read.ts`,
        'import { characters } from "@orb/db";\nimport { eq } from "drizzle-orm";\nexport async function loadLiveness(db: Db, id: string) {\n  const rows = await db.select().from(characters).where(eq(characters.id, id)).limit(1);\n  return rows[0];\n}\n',
      ),
    ],
    messageIncludes: "cross-tenant read hole",
  },
  {
    policy: ownerScopedUpserts,
    overlays: [
      add(
        `${SERVER}/domain/character/persistence/liveness-upsert.ts`,
        'import { characters } from "@orb/db";\nexport async function putLiveness(db: Db, row: R) {\n  return db.insert(characters).values(row).onConflictDoUpdate({ target: [characters.id], set: { name: row.name } });\n}\n',
      ),
    ],
    messageIncludes: "cross-tenant UPSERT hole",
  },
  {
    policy: ownerScopedWrites,
    overlays: [
      add(
        `${SERVER}/domain/character/persistence/liveness-write.ts`,
        'import { characters } from "@orb/db";\nimport { eq } from "drizzle-orm";\nexport async function renameLiveness(db: Db, id: string, name: string) {\n  return db.update(characters).set({ name }).where(eq(characters.id, id));\n}\n',
      ),
    ],
    messageIncludes: "cross-tenant WRITE hole",
  },
  {
    policy: pluginDumpGuard,
    // The policy judges the ONE membrane module only, so the control is the membrane itself materialising a
    // guest handle with no iterative pre-walk (the founding bypass). Its `dump` is the installed
    // quickjs-emscripten-core method, read off the receiver's type.
    overlays: [
      neutralise(
        `${SERVER}/infra/plugin-host/membrane.ts`,
        'import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";\nexport function attachAsync(ctx: QuickJSContext, handle: QuickJSHandle): unknown {\n  return ctx.dump(handle);\n}\n',
      ),
    ],
    messageIncludes: "iterative handle depth/node guard",
  },
  {
    policy: publicRouteBodyCapHealth,
    overlays: [
      neutralise(`${SERVER}/entry/http/${HTTP_ROUTE_MODULES[0]}.ts`),
      ...HTTP_ROUTE_MODULES.slice(1).map((name) => neutralise(`${SERVER}/entry/http/${name}.ts`)),
    ],
    messageIncludes: "0 mutating routes",
  },
  {
    policy: publicRouteBodyCap,
    overlays: [add(`${SERVER}/entry/http/liveness-route.ts`, 'app.post("/api/liveness", async (c) => c.json(await c.req.json()));\n')],
    messageIncludes: "request-body data without a structural byte-cap",
  },
  {
    policy: serdeCoreDefinitionUniqueness,
    overlays: [add(`${SERVER}/domain/import/substrate/liveness-dup.ts`, "export function cardFromJson(raw: unknown): unknown {\n  return raw;\n}\n")],
    messageIncludes: "cardFromJson",
  },
  {
    policy: serdeCoreSeal,
    overlays: [
      add(
        `${SERVER}/domain/character/liveness-png.ts`,
        'import { readCardChunk } from "@orb/kit/png-card-chunk";\nexport const livenessRead = readCardChunk;\n',
      ),
    ],
    messageIncludes: "PNG card-chunk engine",
  },
  {
    policy: singleStreamTransport,
    overlays: [
      add(
        `${SERVER}/transport/trpc/routers/liveness.ts`,
        'import { authedProcedure, t } from "../trpc.ts";\nexport const livenessRouter = t.router({ live: authedProcedure.subscription(() => null) });\n',
      ),
    ],
    messageIncludes: "sse-subscription",
  },
  {
    policy: turnIdentity,
    overlays: [
      add(
        `${SERVER}/domain/chat/engine/liveness-principal.ts`,
        'import type { Principal } from "@orb/contracts/identity";\nexport function livenessIdentity(principal: Principal): Principal {\n  return principal;\n}\n',
      ),
    ],
    messageIncludes: "Principal",
  },
  {
    policy: twoClassRoleAuthority,
    overlays: [
      add(
        `${SERVER}/domain/rpg/verbs/liveness-role.ts`,
        'import type { ParticipantRole } from "@orb/contracts/identity";\nexport function livenessGate(role: ParticipantRole): void {\n  if (role !== "host") {\n    throw new Error("nope");\n  }\n}\n',
      ),
    ],
    messageIncludes: "packages/server/src/domain/rpg/verbs/liveness-role.ts",
  },
  {
    policy: typesInContract,
    overlays: [neutralise(`${SERVER}/domain/admin/contract/service.ts`, "export const noInterface = 1;\n")],
    messageIncludes: "must declare the exported",
  },
  {
    policy: untrustedRegexSafeExec,
    // The canonical world-info seam, composed with a bare `regex.test` instead of the deadline kit.
    overlays: [
      neutralise(
        `${SERVER}/entry/compose/chat.ts`,
        "export const chat = { testRegexKey: (regex: RegExp, haystack: string): boolean => regex.test(haystack) };\n",
      ),
    ],
    messageIncludes: "createRegexTest",
  },
  {
    policy: vectorScopeDerived,
    overlays: [add(`${SERVER}/domain/character/liveness-vector.ts`, 'import { chatDigests } from "@orb/db";\nexport const livenessDigests = chatDigests;\n')],
    messageIncludes: "vector-substrate chokepoint was bypassed",
  },
  {
    policy: verbNaming,
    overlays: [add(`${CHAT_VERBS}/liveness-start.ts`, "export const wrongName = 1;\n")],
    // Every other add arm here that lands under a `verbs/` directory also misses its `create<Name>` export, so
    // the runner's entanglement check proves this arm alone; the verdict is the policy's own message.
    messageIncludes: "does not export `create<Pascal(filename)>",
  },
];
