// Shared harness for the connection domain (NOT a test file — no `.test` suffix, so test-layout ignores it).
// Builds a real-db `ConnectionContext` over the REAL `@orb/inference` runtime: the domain's own
// `createConnectionPorts(db)` are the runtime's four persistence ports, so a verb's write is the row the
// resolver later reads — the seam a hand-stubbed runtime would hide. Faked at the EDGES only
// (core/Spine-Testing.md §3): `fetch` (the one true external I/O), the credential resolve (the credentials
// domain owns the secret), and the three cross-domain ownership reads the composition root injects.
//
// Determinism: a frozen clock + counter-minted ids (no `Date.now()`, no unseeded typeid — `test-determinism`).

import type { Principal } from "@orb/contracts/identity";
import type { ProviderId } from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import { automationRules, users } from "@orb/db";
import type { InferenceDeps, InferenceRuntime } from "@orb/inference";
import { createInferenceRuntime } from "@orb/inference";
import type { AutomationRuleId, ConnectionBindingId, Handle, UserConnectionId, UserCredentialId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ConnectionContext, ConnectionService, EndpointAdmission } from "@orb/server/domain/connection";
import { createConnectionPorts, createConnectionService } from "@orb/server/domain/connection";
import type { AuditEntry } from "@orb/server/foundation/observability";
import { createFrozenClock, FROZEN_AT_MS } from "../../../support/clock.ts";
import { principal } from "../../../support/factories/principal.ts";
import { makeResolvedSecret } from "../../../support/factories/resolved-connection.ts";

/** A recorded `audit` op call — every connection mutation owes a durable row. */
interface AuditCall {
  readonly entry: AuditEntry;
  readonly at: number;
}

/** One `fetch` the runtime made, as the harness saw it (the wire assertions read this). */
interface RecordedRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body: string | null;
}

/** A canned response keyed by a substring of the URL; the first match wins. */
interface FakeRoute {
  readonly match: string;
  readonly status?: number | undefined;
  readonly json?: unknown;
}

export interface HarnessOptions {
  /** The F12 write-time admission read. Default: `invalid` for a non-http(s) URL, `admitted` otherwise. */
  readonly admission?: ((baseUrl: string) => EndpointAdmission) | undefined;
  /** Which credential ids the caller holds. Default: every id is the caller's. */
  readonly credentialOwned?: ((ownerId: UserId, credentialId: UserCredentialId) => boolean) | undefined;
  readonly ruleOwned?: boolean | undefined;
  readonly pluginOwned?: boolean | undefined;
  /** Canned HTTP. An unmatched request answers 404 and is still recorded. */
  readonly routes?: readonly FakeRoute[] | undefined;
  /** The bundled `claude` runtime — absent ⇒ the agent-sdk wire is NOT built (the shipped default). */
  readonly claudeExecutable?: string | undefined;
}

export interface ConnectionHarness {
  readonly ctx: ConnectionContext;
  readonly svc: ConnectionService;
  readonly runtime: InferenceRuntime;
  readonly audits: AuditCall[];
  /** Every `onEmbedSpaceChanged(ownerId)` the verbs raised (the PD-139a purge+reindex trigger). */
  readonly embedSpaceChanges: UserId[];
  /** Every `recordProbeOutcome` the probe verb handed the credentials domain. */
  readonly probeRecords: Parameters<ConnectionContext["recordProbeOutcome"]>[0][];
  readonly requests: RecordedRequest[];
  readonly advance: (ms: number) => void;
}

/** Insert a `users` row (the FK target for `user_connections.ownerId`); returns its branded id. */
export async function seedUser(db: Db, id = "user_o"): Promise<UserId> {
  const userId = castId<UserId>(id);
  await db.insert(users).values({
    id: userId,
    handle: castId<Handle>(id),
    role: "user",
    enabled: true,
    passwordHash: null,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
  });
  return userId;
}

/** The FK target a `plugin-grant`/`automation-rule` binding needs: one minimal owner-global rule. The
 *  connection domain never reads this table — the row exists only so the binding's actor FK resolves. */
export async function seedAutomationRule(db: Db, ownerId: UserId, id = "automation_rule_000001"): Promise<AutomationRuleId> {
  const ruleId = castId<AutomationRuleId>(id);
  await db.insert(automationRules).values({
    id: ruleId,
    ownerId,
    chatId: null,
    name: "test rule",
    position: 0,
    triggerBus: "chat",
    triggerType: "messageCommitted",
    actions: [],
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
  });
  return ruleId;
}

/** A seeded owner + its `Principal` (the pair every scenario opens with). */
export async function seedOwner(db: Db, id = "user_o"): Promise<{ readonly userId: UserId; readonly principal: Principal }> {
  const userId = await seedUser(db, id);
  return { userId, principal: principal(userId) };
}

function defaultAdmission(baseUrl: string): EndpointAdmission {
  const parsed = URL.parse(baseUrl);
  if (parsed === null) {
    return "invalid";
  }
  return parsed.protocol === "http:" || parsed.protocol === "https:" ? "admitted" : "invalid";
}

function headersOf(init: RequestInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  new Headers(init?.headers).forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function urlOf(input: Parameters<typeof fetch>[0]): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.toString() : input.url;
}

function fakeFetch(routes: readonly FakeRoute[], log: RecordedRequest[]): typeof fetch {
  return (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
    const url = urlOf(input);
    log.push({ url, method: init?.method ?? "GET", headers: headersOf(init), body: typeof init?.body === "string" ? init.body : null });
    const route = routes.find((candidate) => url.includes(candidate.match));
    if (route === undefined) {
      return Promise.resolve(new Response(JSON.stringify({ error: "no route" }), { status: 404, headers: { "content-type": "application/json" } }));
    }
    return Promise.resolve(new Response(JSON.stringify(route.json ?? {}), { status: route.status ?? 200, headers: { "content-type": "application/json" } }));
  };
}

function seededMinter<T extends string>(prefix: string): () => T {
  let n = 0;
  return (): T => {
    n += 1;
    return castId<T>(`${prefix}_${String(n).padStart(6, "0")}`);
  };
}

/** The `ConnectionContext` over a real db + the real inference runtime. */
export async function makeHarness(db: Db, options: HarnessOptions = {}): Promise<ConnectionHarness> {
  const clock = createFrozenClock();
  const audits: AuditCall[] = [];
  const embedSpaceChanges: UserId[] = [];
  const probeRecords: Parameters<ConnectionContext["recordProbeOutcome"]>[0][] = [];
  const requests: RecordedRequest[] = [];
  const now = (): number => clock.now();
  const ports = createConnectionPorts({ db, now });

  const deps: InferenceDeps = {
    now,
    log: { debug: (): void => undefined, info: (): void => undefined, warn: (): void => undefined, error: (): void => undefined },
    span: (_name, fn) => Promise.resolve(fn()),
    env: {
      ...(options.claudeExecutable === undefined ? {} : { claudeExecutable: options.claudeExecutable }),
      hostEnvAllowlist: (): Readonly<Record<string, string>> => ({}),
    },
    app: { name: "orbweaver-test", url: "http://localhost:0" },
    snapshotStore: ports.snapshotStore,
    // The secret is the credentials domain's to mint; here a row WITH a credential resolves to a keyed
    // secret (so an auth header is spellable) and a keyless row keeps the domain's `none` kind.
    resolveCredential: ({ credentialId }) =>
      Promise.resolve(credentialId === null ? makeResolvedSecret() : makeResolvedSecret("apiKey", "sk-test", credentialId)),
    structuredOutputVehicle: (): "auto" => "auto",
    connections: ports.connections,
    bindings: ports.bindings,
    providerStore: ports.providerStore,
    agentSdk: { summarizeConcurrency: (): number => 1 },
    userRuntimeDir: (ownerId): string => `/tmp/orb-test/${ownerId}/claude`,
    embedSpace: { dims: 1024 },
    sdkFetch: fakeFetch(options.routes ?? [], requests),
  };
  const runtime = await createInferenceRuntime(deps);

  const ctx: ConnectionContext = {
    db,
    now,
    newConnectionId: seededMinter<UserConnectionId>("user_connection"),
    newBindingId: seededMinter<ConnectionBindingId>("connection_binding"),
    runtime,
    audit: (entry, at): Promise<void> => {
      audits.push({ entry, at });
      return Promise.resolve();
    },
    credentialOwned: (ownerId, credentialId) => Promise.resolve(options.credentialOwned?.(ownerId, credentialId) ?? true),
    ruleOwnedBy: () => Promise.resolve(options.ruleOwned ?? true),
    pluginOwnedBy: () => Promise.resolve(options.pluginOwned ?? true),
    endpointAdmission: options.admission ?? defaultAdmission,
    recordProbeOutcome: (args) => {
      probeRecords.push(args);
      return Promise.resolve(args.result);
    },
    onEmbedSpaceChanged: (ownerId): void => {
      embedSpaceChanges.push(ownerId);
    },
  };

  return {
    ctx,
    svc: createConnectionService(ctx),
    runtime,
    audits,
    embedSpaceChanges,
    probeRecords,
    requests,
    advance: (ms: number): void => {
      clock.advance(ms);
    },
  };
}

/** The keyless BYO endpoint row every non-hosted scenario uses. */
export const BYO_PROVIDER = castId<ProviderId>("custom-openai");
export const BYO_BASE_URL = "http://127.0.0.1:18703/v1";
