// Native connection writers and routed reads own every projection; only physical vendor recipes are scripted.
import { createCharacterSchema } from "@orb/contracts/character";
import { auditLogs, connectionBindings, settings, userConnections, userCredentials } from "@orb/db";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import type { seedCorpusActors } from "./corpus-actors.ts";
import type { createCorpusConnectionWire } from "./corpus-connection-wire.ts";
import {
  CORPUS_CONNECTION_ENDPOINT,
  CORPUS_CONNECTION_FOREIGN_KEY,
  CORPUS_CONNECTION_FOREIGN_MODEL,
  CORPUS_CONNECTION_HOSTED_KEY,
  CORPUS_CONNECTION_HOSTED_MODEL,
  CORPUS_CONNECTION_KEY,
  CORPUS_CONNECTION_MODEL,
  CORPUS_CONNECTION_TURN_CUE,
} from "./corpus-connection-wire.ts";
import { seedUserConnection } from "./factories/rows/connection.ts";
import { seedUserCredential } from "./factories/rows/credentials.ts";
import { captureTurnRows } from "./factories/rows.ts";
import type { ServerTestHarness } from "./server.ts";

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
type Wire = ReturnType<typeof createCorpusConnectionWire>;
type Actors = Awaited<ReturnType<typeof seedCorpusActors>>;
type View = Awaited<ReturnType<Caller["connection"]["get"]>>;
type Listing = Awaited<ReturnType<Caller["connection"]["catalogModels"]>>;
type Credential = Awaited<ReturnType<typeof seedUserCredential>>;
interface OwnedConnection {
  readonly credential: Credential;
  readonly row: Awaited<ReturnType<typeof seedUserConnection>>;
  readonly view: View;
}
interface ConnectionEffects {
  readonly connections: readonly (typeof userConnections.$inferSelect)[];
  readonly bindings: readonly (typeof connectionBindings.$inferSelect)[];
  readonly credentials: readonly (typeof userCredentials.$inferSelect)[];
  readonly audit: readonly (typeof auditLogs.$inferSelect)[];
}
interface ConnectionCatalogs {
  readonly rawDraft: Listing;
  readonly savedDraft: Listing;
  readonly saved: Listing;
  readonly foreign: Listing;
  readonly builtin: Listing;
  readonly empty: Listing;
  readonly failed: Listing;
  readonly malformed: Listing;
  readonly snapshots: readonly (typeof settings.$inferSelect)[];
  readonly beforeRawDraft: ConnectionEffects;
  readonly afterRawDraft: ConnectionEffects;
  readonly requestsBeforeBuiltin: number;
  readonly requestsAfterBuiltin: number;
}
interface ConnectionCapabilities {
  readonly snapshots: readonly (typeof settings.$inferSelect)[];
  readonly view: Awaited<ReturnType<Caller["connection"]["capabilities"]>>;
  readonly repeated: Awaited<ReturnType<Caller["connection"]["capabilities"]>>;
  readonly summary: Awaited<ReturnType<Caller["connection"]["resolveChatCapability"]>>;
  readonly chat: Awaited<ReturnType<Caller["connection"]["resolveChatCapability"]>>;
  readonly bindings: Awaited<ReturnType<Caller["connection"]["listBindings"]>>;
  readonly set: Awaited<ReturnType<Caller["connection"]["setBinding"]>>;
  readonly everywhere: Awaited<ReturnType<Caller["connection"]["useForEverything"]>>;
  readonly updated: View;
  readonly providers: Awaited<ReturnType<Caller["connection"]["providersAvailable"]>>;
  readonly preview: Awaited<ReturnType<Caller["connection"]["embedSpaceChangePreview"]>>;
  readonly requestsBeforePreview: number;
  readonly requestsAfterPreview: number;
  readonly requestsAfterFirst: number;
  readonly requestsAfterRepeated: number;
}
interface ConnectionDiagnostics {
  readonly throttled: Awaited<ReturnType<Caller["connection"]["probe"]>>;
  readonly ok: Awaited<ReturnType<Caller["connection"]["inspectEndpoint"]>>;
  readonly failed: Awaited<ReturnType<Caller["connection"]["inspectEndpoint"]>>;
  readonly unavailable: Awaited<ReturnType<Caller["connection"]["inspectEndpoint"]>>;
  readonly probe: Awaited<ReturnType<Caller["connection"]["probe"]>>;
  readonly unreachable: Awaited<ReturnType<Caller["connection"]["probe"]>>;
  readonly tokens: Awaited<ReturnType<Caller["connection"]["tokenizeWords"]>>;
  readonly repeatedTokens: Awaited<ReturnType<Caller["connection"]["tokenizeWords"]>>;
  readonly malformedTokens: Awaited<ReturnType<Caller["connection"]["tokenizeWords"]>>;
  readonly unsupportedTokens: Awaited<ReturnType<Caller["connection"]["tokenizeWords"]>>;
  readonly requestsBeforeRepeatedTokens: number;
  readonly requestsAfterRepeatedTokens: number;
}
interface ConnectionAccount {
  readonly hosted: OwnedConnection;
  readonly catalog: Listing;
  readonly refresh: Awaited<ReturnType<Caller["connection"]["refreshCatalog"]>>;
  readonly nullRefresh: Awaited<ReturnType<Caller["connection"]["refreshCatalog"]>>;
  readonly credits: Awaited<ReturnType<Caller["connection"]["accountCredits"]>>;
  readonly turn: Awaited<ReturnType<ServerTestHarness["services"]["chat"]["send"]>>;
  readonly canon: Awaited<ReturnType<typeof captureTurnRows>>;
  readonly cost: Awaited<ReturnType<Caller["connection"]["generationCost"]>>;
  readonly malformedCredits: Error | undefined;
  readonly malformedCost: Error | undefined;
  readonly beforeMalformed: ConnectionEffects;
  readonly afterMalformed: ConnectionEffects;
}
interface ConnectionRefusals {
  readonly before: ConnectionEffects;
  readonly after: ConnectionEffects;
  readonly requestsBefore: number;
  readonly requestsAfter: number;
  readonly errors: readonly (Error | undefined)[];
  readonly removed: Awaited<ReturnType<Caller["connection"]["listBindings"]>>;
}
interface CorpusConnection {
  readonly own: OwnedConnection;
  readonly foreign: OwnedConnection;
  readonly catalogs: ConnectionCatalogs;
  readonly capabilities: ConnectionCapabilities;
  readonly diagnostics: ConnectionDiagnostics;
  readonly account: ConnectionAccount;
  readonly refusals: ConnectionRefusals;
  readonly list: Awaited<ReturnType<Caller["connection"]["list"]>>;
  readonly credentials: Awaited<ReturnType<Caller["credentials"]["list"]>>;
  readonly physical: Wire["requests"];
}
interface ConnectionParties {
  readonly caller: Caller;
  readonly other: Caller;
  readonly own: OwnedConnection;
  readonly foreign: OwnedConnection;
}
interface DraftCapture {
  readonly listing: Listing;
  readonly before: ConnectionEffects;
  readonly after: ConnectionEffects;
}

async function refused<T>(operation: Promise<T>): Promise<Error | undefined> {
  try {
    await operation;
    return undefined;
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }
    return error;
  }
}

async function effects(root: ServerTestHarness): Promise<ConnectionEffects> {
  return {
    connections: await root.db.select().from(userConnections).orderBy(userConnections.id),
    bindings: await root.db.select().from(connectionBindings).orderBy(connectionBindings.id),
    credentials: await root.db.select().from(userCredentials).orderBy(userCredentials.id),
    audit: await root.db.select().from(auditLogs).orderBy(auditLogs.id),
  };
}

async function ownedEndpoint(root: ServerTestHarness, ownerId: ServerTestHarness["ownerId"], key: string, model: string): Promise<OwnedConnection> {
  const principal = await root.principalFor(ownerId);
  const caller = await root.internalCallerFor(ownerId);
  const credential = await seedUserCredential(root, { principal, provider: "custom-openai", key });
  const row = await seedUserConnection(root, {
    principal,
    providerId: "custom-openai",
    credentialId: credential.view.id,
    baseUrl: CORPUS_CONNECTION_ENDPOINT,
    model,
    allowBackground: true,
    declared: {
      kind: "generation",
      generation: { input: ["text"], context: { window: 32_768 }, output: { structured: true } },
      features: { detectServer: false, tokenizeApi: "vllm" },
    },
  });
  return { credential, row, view: await caller.connection.get({ connectionId: row.id }) };
}

async function capabilityReads(root: ServerTestHarness, caller: Caller, own: OwnedConnection, wire: Wire): Promise<ConnectionCapabilities> {
  wire.models(CORPUS_CONNECTION_KEY);
  const view = await caller.connection.capabilities({ connectionId: own.row.id });
  const requestsAfterFirst = wire.requests.length;
  const repeated = await caller.connection.capabilities({ connectionId: own.row.id });
  const requestsAfterRepeated = wire.requests.length;
  const snapshots = await root.db.select().from(settings).orderBy(settings.key);
  const set = await caller.connection.setBinding({ task: "summarize", connectionId: own.row.id });
  const summary = await caller.connection.resolveChatCapability({ target: { kind: "role", task: "summarize" } });
  const assignEveryTask = caller.connection.useForEverything;
  const everywhere = await assignEveryTask({ connectionId: own.row.id });
  const chat = await caller.connection.resolveChatCapability({ target: { kind: "connection", connectionId: own.row.id } });
  const bindings = await caller.connection.listBindings();
  const updated = await caller.connection.update({ connectionId: own.row.id, patch: { label: "Retained native connection witness" } });
  const requestsBeforePreview = wire.requests.length;
  const preview = await caller.connection.embedSpaceChangePreview({ change: { kind: "update", connectionId: own.row.id, patch: { label: "Preview only" } } });
  const requestsAfterPreview = wire.requests.length;
  return {
    view,
    repeated,
    summary,
    chat,
    bindings,
    set,
    everywhere,
    updated,
    providers: await caller.connection.providersAvailable(),
    preview,
    requestsBeforePreview,
    requestsAfterPreview,
    requestsAfterFirst,
    requestsAfterRepeated,
    snapshots,
  };
}

async function catalogReads(root: ServerTestHarness, parties: ConnectionParties, wire: Wire, draft: DraftCapture): Promise<ConnectionCatalogs> {
  const { caller, other, own, foreign } = parties;
  wire.models(CORPUS_CONNECTION_KEY);
  const savedDraft = await caller.connection.draftCatalogModels({
    providerId: "custom-openai",
    baseUrl: CORPUS_CONNECTION_ENDPOINT,
    credentialId: own.credential.view.id,
  });
  wire.models(CORPUS_CONNECTION_KEY);
  const saved = await caller.connection.catalogModels({ connectionId: own.row.id });
  wire.models(CORPUS_CONNECTION_FOREIGN_KEY);
  const foreignList = await other.connection.catalogModels({ connectionId: foreign.row.id });
  const requestsBeforeBuiltin = wire.requests.length;
  const builtin = await caller.connection.draftCatalogModels({ providerId: "local-light" });
  const requestsAfterBuiltin = wire.requests.length;
  wire.models(CORPUS_CONNECTION_KEY, '{"data":[]}');
  const empty = await caller.connection.catalogModels({ connectionId: own.row.id });
  wire.models(CORPUS_CONNECTION_KEY, JSON.stringify({ error: { message: `physical catalog failed ${CORPUS_CONNECTION_KEY}` } }), 500);
  const failed = await caller.connection.catalogModels({ connectionId: own.row.id });
  wire.models(CORPUS_CONNECTION_KEY, '{"data":"malformed"}');
  const malformed = await caller.connection.catalogModels({ connectionId: own.row.id });
  const snapshots = await root.db.select().from(settings).orderBy(settings.key);
  return {
    rawDraft: draft.listing,
    beforeRawDraft: draft.before,
    afterRawDraft: draft.after,
    savedDraft,
    saved,
    foreign: foreignList,
    builtin,
    empty,
    failed,
    malformed,
    snapshots,
    requestsBeforeBuiltin,
    requestsAfterBuiltin,
  };
}

async function diagnosticReads(parties: ConnectionParties, wire: Wire): Promise<ConnectionDiagnostics> {
  const { caller, other, own, foreign } = parties;
  wire.inspection();
  const ok = await caller.connection.inspectEndpoint({ connectionId: own.row.id });
  wire.inspection(JSON.stringify({ error: { message: `physical inspection failed ${CORPUS_CONNECTION_KEY}` } }), 500);
  const failed = await caller.connection.inspectEndpoint({ connectionId: own.row.id });
  wire.inspection("", 200, true);
  const unavailable = await caller.connection.inspectEndpoint({ connectionId: own.row.id });
  wire.models(CORPUS_CONNECTION_KEY);
  const probe = await caller.connection.probe({ connectionId: own.row.id });
  wire.models(CORPUS_CONNECTION_KEY, JSON.stringify({ error: { message: "physical endpoint unavailable" } }), 502);
  const throttled = await caller.connection.probe({ connectionId: own.row.id });
  wire.models(CORPUS_CONNECTION_FOREIGN_KEY);
  wire.models(CORPUS_CONNECTION_FOREIGN_KEY, '{"error":{"message":"physical foreign endpoint unavailable"}}', 502);
  const unreachable = await other.connection.probe({ connectionId: foreign.row.id });
  wire.token("ledger");
  const target = { kind: "connection", connectionId: own.row.id } as const;
  const tokens = await caller.connection.tokenizeWords({ target, words: ["ledger"] });
  const requestsBeforeRepeatedTokens = wire.requests.length;
  const repeatedTokens = await caller.connection.tokenizeWords({ target, words: ["ledger"] });
  const requestsAfterRepeatedTokens = wire.requests.length;
  wire.token("malformed", true);
  const malformedTokens = await caller.connection.tokenizeWords({ target, words: ["malformed"] });
  const unsupportedTokens = await caller.connection.tokenizeWords({ target: { kind: "role", task: "embed" }, words: ["ledger"] });
  return {
    ok,
    failed,
    unavailable,
    probe,
    unreachable,
    throttled,
    tokens,
    repeatedTokens,
    malformedTokens,
    unsupportedTokens,
    requestsBeforeRepeatedTokens,
    requestsAfterRepeatedTokens,
  };
}

async function accountReads(root: ServerTestHarness, caller: Caller, wire: Wire): Promise<ConnectionAccount> {
  const principal = await root.principalFor(root.ownerId);
  const credential = await seedUserCredential(root, { principal, provider: "openrouter", key: CORPUS_CONNECTION_HOSTED_KEY });
  const row = await seedUserConnection(root, {
    principal,
    providerId: "openrouter",
    credentialId: credential.view.id,
    baseUrl: null,
    model: CORPUS_CONNECTION_HOSTED_MODEL,
    allowBackground: true,
  });
  const hosted = { credential, row, view: await caller.connection.get({ connectionId: row.id }) };
  // A saved catalog may be warm; refresh owns the physical fetch before the query reads its native cache.
  wire.hostedCatalog();
  const refresh = await caller.connection.refreshCatalog({ providerId: "openrouter" });
  const catalog = await caller.connection.catalogModels({ connectionId: row.id });
  const nullRefresh = await caller.connection.refreshCatalog({ providerId: "claude-sub" });
  wire.credits();
  const credits = await caller.connection.accountCredits({ connectionId: row.id });
  await caller.connection.setBinding({ task: "chat", connectionId: row.id });
  const preset = await caller.preset.create({ name: "Native account corpus", kind: "custom" });
  await caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
  const card = await caller.character.create({
    input: createCharacterSchema.parse({
      handle: "native-account-witness",
      name: "Native account witness",
      description: "A witness records one genuine account turn.",
    }),
  });
  const room = await caller.chat.startChat({ characterIds: [card.id], opening: "none" });
  wire.turn();
  const turn = await root.services.chat.send({ principal, chatId: room.chat.id, content: CORPUS_CONNECTION_TURN_CUE, timeZone: UTC_TIME_ZONE });
  const assistant = turn.messages.find((message) => message.role === "assistant");
  if (turn.aborted || assistant?.generationId === null || assistant?.generationId === undefined) {
    throw new Error("native hosted turn returned no actual upstream cost handle");
  }
  const canon = await captureTurnRows(root.db, turn);
  wire.cost(assistant.generationId);
  const cost = await caller.connection.generationCost({ connectionId: row.id, generationId: assistant.generationId });
  const beforeMalformed = await effects(root);
  wire.credits('{"data":{"total_credits":"malformed","total_usage":4}}');
  const malformedCredits = await refused(caller.connection.accountCredits({ connectionId: row.id }));
  wire.cost(assistant.generationId, '{"data":{"total_cost":"malformed"}}');
  const malformedCost = await refused(caller.connection.generationCost({ connectionId: row.id, generationId: assistant.generationId }));
  const afterMalformed = await effects(root);
  return { hosted, catalog, refresh, nullRefresh, credits, turn, canon, cost, malformedCredits, malformedCost, beforeMalformed, afterMalformed };
}

async function refusalReads(root: ServerTestHarness, parties: ConnectionParties, wire: Wire): Promise<ConnectionRefusals> {
  const { caller, other, own, foreign } = parties;
  const principal = await root.principalFor(root.ownerId);
  const blocked = await seedUserConnection(root, {
    principal,
    providerId: "custom-openai",
    credentialId: own.credential.view.id,
    baseUrl: CORPUS_CONNECTION_ENDPOINT,
    model: CORPUS_CONNECTION_MODEL,
    allowBackground: false,
    declared: { kind: "generation", features: { detectServer: false } },
  });
  wire.models(CORPUS_CONNECTION_KEY);
  await caller.connection.capabilities({ connectionId: own.row.id });
  const before = await effects(root);
  const requestsBefore = wire.requests.length;
  const errors = await Promise.all([
    refused(other.connection.get({ connectionId: own.row.id })),
    refused(other.connection.catalogModels({ connectionId: own.row.id })),
    refused(other.connection.capabilities({ connectionId: own.row.id })),
    refused(other.connection.resolveChatCapability({ target: { kind: "connection", connectionId: own.row.id } })),
    refused(other.connection.inspectEndpoint({ connectionId: own.row.id })),
    refused(other.connection.probe({ connectionId: own.row.id })),
    refused(other.connection.setBinding({ task: "chat", connectionId: own.row.id })),
    refused(
      caller.connection.draftCatalogModels({
        providerId: "custom-openai",
        baseUrl: CORPUS_CONNECTION_ENDPOINT,
        credentialId: foreign.credential.view.id,
        key: CORPUS_CONNECTION_KEY,
      }),
    ),
    refused(caller.connection.draftCatalogModels({ providerId: "custom-openai", baseUrl: "not-an-http-url" })),
    refused(caller.connection.draftCatalogModels({ providerId: "custom-openai" })),
    refused(caller.connection.draftCatalogModels({ providerId: "corpus-unknown-provider" })),
    refused(caller.connection.draftCatalogModels({ providerId: "openrouter", baseUrl: CORPUS_CONNECTION_ENDPOINT })),
    refused(caller.connection.verifyAuth({ connectionId: own.row.id })),
    refused(caller.connection.accountCredits({ connectionId: own.row.id })),
    refused(caller.connection.setBinding({ task: "summarize", connectionId: blocked.id })),
    refused(caller.connection.setBinding({ task: "embed", connectionId: own.row.id })),
  ]);
  const after = await effects(root);
  const requestsAfter = wire.requests.length;
  const disposable = await seedUserConnection(root, {
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_CONNECTION_ENDPOINT,
    model: CORPUS_CONNECTION_MODEL,
    allowBackground: true,
    declared: { kind: "generation", features: { detectServer: false } },
  });
  await caller.connection.setBinding({ task: "summarize", connectionId: disposable.id });
  await caller.connection.remove({ connectionId: disposable.id });
  const removed = await caller.connection.listBindings();
  await caller.connection.setBinding({ task: "summarize", connectionId: own.row.id });
  return { before, after, requestsBefore, requestsAfter, errors, removed };
}

/** Run the native catalog/capability/account cohort on the caller's graph; sealed receipts stay private Node data. */
export async function seedCorpusConnection(root: ServerTestHarness, actors: Actors, wire: Wire): Promise<CorpusConnection> {
  const caller = await root.internalCallerFor(root.ownerId);
  const other = await root.internalCallerFor(actors.secondUserId);
  const beforeDraft = await effects(root);
  wire.models(CORPUS_CONNECTION_KEY);
  const rawDraft = await caller.connection.draftCatalogModels({ providerId: "custom-openai", baseUrl: CORPUS_CONNECTION_ENDPOINT, key: CORPUS_CONNECTION_KEY });
  const draft = { listing: rawDraft, before: beforeDraft, after: await effects(root) };
  const own = await ownedEndpoint(root, root.ownerId, CORPUS_CONNECTION_KEY, CORPUS_CONNECTION_MODEL);
  const foreign = await ownedEndpoint(root, actors.secondUserId, CORPUS_CONNECTION_FOREIGN_KEY, CORPUS_CONNECTION_FOREIGN_MODEL);
  const parties = { caller, other, own, foreign };
  const capabilities = await capabilityReads(root, caller, own, wire);
  const catalogs = await catalogReads(root, parties, wire, draft);
  const diagnostics = await diagnosticReads(parties, wire);
  const account = await accountReads(root, caller, wire);
  const refusals = await refusalReads(root, parties, wire);
  await root.settleBackground();
  return {
    own,
    foreign,
    capabilities,
    catalogs,
    diagnostics,
    account,
    refusals,
    list: await caller.connection.list(),
    credentials: await caller.credentials.list(),
    physical: wire.requests,
  };
}
