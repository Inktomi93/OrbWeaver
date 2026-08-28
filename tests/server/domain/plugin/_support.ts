// Shared test harness for the domain/plugin slice (NOT a test file — no `.test` suffix). Builds a real-db
// `PluginContext` with fakes at the edges per "fake at the edges, inject at the root". There is no `can()`
// seam to inject: plugin authority is the OWNER-SCOPED ROW LOAD against the real db (D147), so the authority
// decision is exercised for real by every test here rather than mocked. Also: a real assets fake that writes an `assets` row so the
// `plugins.bundle_asset_id` FK resolves + a reference-aware `reapOrphans` (mirrors `reapIfOrphan` — never reaps
// a still-referenced bundle), the frozen clock + seeded ids, and a scriptable `PluginHostPort` fake. A separate
// `makeSandboxPort` wires the REAL P1 `infra/plugin-host` `Sandbox` for the determinism-floor round-trip.

import type { Principal } from "@orb/contracts/identity";
import type { PluginCapability, PluginInstance } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { assets, plugins } from "@orb/db";
import type { AssetId, Handle, PluginId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { can } from "@orb/server/domain/admin";
import type { HostSeams } from "@orb/server/infra/plugin-host";
import { Sandbox } from "@orb/server/infra/plugin-host";
import { and, eq, inArray } from "drizzle-orm";
import { zipSync } from "fflate";
import type { PluginHostOps } from "../../../../packages/server/src/domain/plugin/contract/ops.ts";
import type { PluginLogView as DomainPluginLogView } from "../../../../packages/server/src/domain/plugin/contract/results.ts";
import type {
  CreateInstanceInput,
  CreateInstanceOutcome,
  PluginContext,
  PluginDistributionDeps,
  PluginHostPort,
  PluginService,
} from "../../../../packages/server/src/domain/plugin/contract/service.ts";
import {
  createNotifyFloor,
  createPluginRateFloor,
  createPluginService,
  createPluginSurfaceStateStore,
  createPluginUiOutbox,
  createSnippetGate,
  createUiHostCallGate,
  PLUGIN_EGRESS_PER_HOUR,
  PLUGIN_QUIET_LLM_PER_HOUR,
} from "../../../../packages/server/src/domain/plugin/index.ts";
import { createFrozenClock, FROZEN_AT_MS } from "../../../support/clock.ts";
import { createSeededIds } from "../../../support/ids.ts";

export { seedUser } from "../embeddings/_support.ts";

/** Parse a `[level] message` host.log line back into a structured `PluginLogView`. */
const LOG_LINE_RE = /^\[(info|warn|error)\]\s(.*)$/su;

/** A resolved `Principal` for `userId` — role `user`. Under D147 this is the COMMON plugin caller: a plain
 *  user installs for themselves and manages their own rows exactly like anyone else. (It used to be the
 *  refused case — every management verb was admin-gated; that gate is gone.) */
export function principalFor(userId: UserId): Principal {
  return { userId, role: "user", handle: castId<Handle>(userId), externalId: null, via: "fallback" };
}

/** The box-owner `Principal` for `userId` — the APEX global role. It buys nothing extra on the plugin
 *  surface (D147: authority is the owner-scoped row load, not a role), which is exactly why the cross-user
 *  refusal tests aim it at ANOTHER user's row: the apex role must be refused there too. */
export function ownerPrincipalFor(userId: UserId): Principal {
  return { userId, role: "owner", handle: castId<Handle>(userId), externalId: null, via: "fallback" };
}

/** A scriptable `PluginHostPort` fake: records every createInstance/invoke/dispose/readLog + serves scripted
 *  outcomes so the activation registrar/rollback logic is testable without the real runtime (P4). Module-
 *  private: consumed via `makePluginHarness`'s default port (knip liveness — nothing imports it by name). */
interface FakePort extends PluginHostPort {
  /** The createInstance inputs seen, in order (assert grants/ops/mainJs cross the seam). */
  readonly created: CreateInstanceInput[];
  /** Instances disposed, in order (assert deactivate/uninstall tear down). */
  readonly disposed: PluginInstance[];
  /** Script the NEXT createInstance outcome (default: ok with zero registrations). */
  script: (outcome: CreateInstanceOutcome) => void;
}

function makeFakePort(): FakePort {
  const created: CreateInstanceInput[] = [];
  const disposed: PluginInstance[] = [];
  const queue: CreateInstanceOutcome[] = [];
  const logs = new Map<PluginInstance, readonly DomainPluginLogView[]>();
  return {
    created,
    disposed,
    script: (outcome: CreateInstanceOutcome): void => {
      queue.push(outcome);
    },
    createInstance: (input: CreateInstanceInput): Promise<CreateInstanceOutcome> => {
      created.push(input);
      const scripted = queue.shift();
      const outcome: CreateInstanceOutcome = scripted ?? {
        ok: true,
        instance: { tools: [], transforms: [], events: [], surfaces: [], commands: [], displayTransforms: [], macros: [] },
      };
      if (outcome.ok) {
        logs.set(outcome.instance, []);
      }
      return Promise.resolve(outcome);
    },
    // TRUTH-REPAIR 2026-08-24: this is a statement about THIS FAKE, not about the tree. The real invoke path
    // is live (`infra/plugin-host/port.ts:200-241`), and `tests/server/entry/boot/seed-example-plugins.int.test.ts`
    // drives real registrations through it. A reader who took this line as a tree fact concluded, wrongly,
    // that plugin tools and event handlers cannot run.
    invoke: (): Promise<string> => Promise.reject(new Error("plugin invoke is not exercised by the fake port (see the composed-real int test)")),
    runSnippet: (): Promise<{ logLines: readonly string[] }> => Promise.resolve({ logLines: [] }),
    readLog: (instance: PluginInstance): readonly DomainPluginLogView[] => logs.get(instance) ?? [],
    dispose: (instance: PluginInstance): void => {
      disposed.push(instance);
    },
  };
}

/** A `PluginHostPort` over the REAL P1 `Sandbox` — createInstance runs `main.js` through `evalGuest` under the
 *  injected determinism seams (the round-trip's determinism-floor depth). This port builds the sandbox WITHOUT
 *  a membrane, so the guest sees only the determinism floor and `tools/transforms/events` are necessarily
 *  empty; the activation-run log lines are captured for `readLog`.
 *
 *  TRUTH-REPAIR 2026-08-24: that emptiness is a property of THIS PORT's own wiring, not of the tree. The
 *  earlier spelling ("the gated namespaces are P4", "`invoke` is P4") read as a statement about the product
 *  and cost at least one reader a wrong conclusion. The gated namespaces are live (`membrane.ts:557-645`
 *  attaches `tools.register`, `transforms.register` and `events.on`; `port.ts:186-193` collects what they
 *  registered) — a port built with `createPluginHost` gets all of it, which is what
 *  `tests/server/entry/boot/seed-example-plugins.int.test.ts` uses. */
export function makeSandboxPort(seams: HostSeams): PluginHostPort {
  const logs = new Map<PluginInstance, readonly DomainPluginLogView[]>();
  const sandboxes = new Map<PluginInstance, Sandbox>();
  const stampAt = seams.nowEpochMs();
  const toLog = (lines: readonly string[]): DomainPluginLogView[] =>
    lines.map((line) => {
      const match = LOG_LINE_RE.exec(line);
      const level = (match?.[1] ?? "info") as DomainPluginLogView["level"];
      return { level, message: match?.[2] ?? line, at: stampAt };
    });
  return {
    createInstance: async (input: CreateInstanceInput): Promise<CreateInstanceOutcome> => {
      const sandbox = await Sandbox.create(seams);
      const outcome = await sandbox.evalGuest(input.mainJs);
      if (!outcome.ok) {
        sandbox.dispose();
        return { ok: false, error: outcome.error?.message ?? "activation failed", log: toLog(outcome.logs) };
      }
      const instance: PluginInstance = { tools: [], transforms: [], events: [], surfaces: [], commands: [], displayTransforms: [], macros: [] };
      sandboxes.set(instance, sandbox);
      logs.set(instance, toLog(outcome.logs));
      return { ok: true, instance };
    },
    // Same repair as the fake port above: this port mints no handlers (no membrane ⇒ nothing to invoke), which
    // is a fact about this wiring, never about the product's invoke path.
    invoke: (): Promise<string> => Promise.reject(new Error("plugin invoke is not exercised by the sandbox-floor port")),
    runSnippet: (): Promise<{ logLines: readonly string[] }> => Promise.resolve({ logLines: [] }),
    readLog: (instance: PluginInstance): readonly DomainPluginLogView[] => logs.get(instance) ?? [],
    dispose: (instance: PluginInstance): void => {
      sandboxes.get(instance)?.dispose();
      sandboxes.delete(instance);
    },
  };
}

export interface PluginHarness {
  readonly ctx: PluginContext;
  readonly service: PluginService;
  readonly port: FakePort;
  /** Bytes the assets fake stored, keyed by minted assetId (the activation `readBytes` source). */
  readonly storedBytes: Map<AssetId, Uint8Array>;
  readonly advance: (ms: number) => void;
}

/** Build a plugin harness over `db`. Pass a custom `port` (e.g. `makeSandboxPort`) or `ops` to exercise the
 *  registrar seams; both default to inert fakes. */
export function makePluginHarness(
  db: Db,
  overrides: {
    readonly port?: PluginHostPort;
    readonly ops?: PluginHostOps;
    readonly resolveChatAuthority?: PluginContext["resolveChatAuthority"];
    /** The URL-install bundle fetch (U8 seam 15). Default REJECTS — a URL-install/upgrade suite injects its own
     *  (returning a bundle, or throwing to simulate an SSRF block), and every other suite never reaches it. */
    readonly fetchBundle?: PluginContext["fetchBundle"];
    /** Narrow the per-user concurrent-snippet ceiling (default: the production constant). */
    readonly snippetConcurrency?: number;
    /** Narrow the two HOURLY per-plugin ceilings (default: the production constants) so a suite can reach one
     *  in a couple of calls. The floors themselves stay REAL — only the limit moves. */
    readonly rateLimits?: { readonly egress?: number; readonly quietLlm?: number };
    /** The fan-out's recipient list (D147 clause (d)). Default EMPTY — a distribution suite states its own
     *  cast, and every other suite is unaffected by a fan-out it never calls. */
    readonly listRecipients?: PluginDistributionDeps["listRecipients"];
  } = {},
): PluginHarness {
  const clock = createFrozenClock(FROZEN_AT_MS);
  const ids = createSeededIds();
  const storedBytes = new Map<AssetId, Uint8Array>();
  const fakePort = makeFakePort();

  const store: PluginContext["assets"]["store"] = async (caller, bytes, mime) => {
    const assetId = castId<AssetId>(ids.next("asset"));
    const hash = `hash-${assetId}`;
    storedBytes.set(assetId, new Uint8Array(bytes));
    await db.insert(assets).values({ id: assetId, ownerId: caller.userId, kind: "plugin", mime, size: bytes.length, hash, uploadedAt: clock.now() });
    return { assetId, hash, size: bytes.length, created: true };
  };
  const readBytes: PluginContext["assets"]["readBytes"] = (_caller, assetId) => {
    const bytes = storedBytes.get(assetId);
    if (bytes === undefined) {
      return Promise.reject(new Error(`asset ${assetId} not found`));
    }
    return Promise.resolve({ bytes, mime: "application/zip" });
  };
  // Reference-aware reap (mirrors reapIfOrphan): only delete an asset row still unreferenced by any plugins row.
  const reapOrphans: PluginContext["assets"]["reapOrphans"] = async (assetIds) => {
    for (const assetId of assetIds) {
      const refs = await db.select({ id: plugins.id }).from(plugins).where(eq(plugins.bundleAssetId, assetId)).limit(1);
      if (refs.length === 0) {
        storedBytes.delete(assetId);
      }
    }
    const unreferenced = [...assetIds].filter((id) => !storedBytes.has(id));
    if (unreferenced.length > 0) {
      await db.delete(assets).where(and(inArray(assets.id, unreferenced)));
    }
  };

  const ctx: PluginContext = {
    db,
    now: () => clock.now(),
    newPluginId: () => castId<PluginId>(ids.next("plugin")),
    assets: { store, readBytes, reapOrphans },
    // The URL-install bundle fetch (U8 seam 15). Default REJECTS: a suite exercising previewFromUrl/installFromUrl/
    // upgradeFromUrl injects its own (a bundle, or a throw simulating an SSRF block), and no other suite reaches it.
    fetchBundle: overrides.fetchBundle ?? (() => Promise.reject(new Error("test: fetchBundle not wired"))),
    host: overrides.port ?? fakePort,
    ops: overrides.ops ?? makeInertOps(),
    // The REAL surface-state store — the write op + the read verb + the deactivate sweep share ONE instance, so
    // a `getSurfaceState`/deactivate test observes exactly what `ui.setState` wrote (a permissive fake would let
    // a test prove state semantics the shared store does not have).
    surfaceState: createPluginSurfaceStateStore(),
    // …and the REAL UI outbox over the harness's frozen clock, for the SAME reason: the toast rate floor lives
    // inside it, and a permissive fake would let a test prove a flood the production outbox refuses.
    uiOutbox: createPluginUiOutbox(() => clock.now()),
    // The snippet AUTHORITY seam — full authority by default (the harness caller is the owner); a test needing a
    // read-only or no-access chat overrides it. The composed-real int test drives the REAL loadPresentRole gate.
    resolveChatAuthority: overrides.resolveChatAuthority ?? (() => Promise.resolve({ canRead: true, canWrite: true })),
    // The REAL belts over the harness's frozen clock (so `advance()` drives them) — never permissive fakes: a
    // lifecycle test must not be able to flood notices, egress or paid generations in a way production would
    // refuse, and a belt only a test can dodge is a belt nobody proved. `rateLimits` narrows the two hourly
    // ceilings so a suite can reach one in a couple of calls instead of thirty.
    belts: {
      notify: createNotifyFloor(() => clock.now()),
      egress: createPluginRateFloor(() => clock.now(), { capability: "net.fetch", limit: overrides.rateLimits?.egress ?? PLUGIN_EGRESS_PER_HOUR }),
      quietLlm: createPluginRateFloor(() => clock.now(), {
        capability: "llm.quiet",
        limit: overrides.rateLimits?.quietLlm ?? PLUGIN_QUIET_LLM_PER_HOUR,
      }),
    },
    // The REAL snippet concurrency gate, same reason: a permissive fake would let a test prove a bound
    // production does not have. `snippetConcurrency` narrows the ceiling so a test can reach it in two calls
    // instead of five.
    snippetGate: createSnippetGate(overrides.snippetConcurrency),
    // The REAL Tier-C in-flight gate, for the same reason as the two above: a permissive fake would let a
    // `uiHostCall` test prove a concurrency posture production does not have.
    uiHostCallGate: createUiHostCallGate(),
  };

  // The SERVER-WIDE DISTRIBUTION deps (D147 clause (d)) — REAL, not permissive. `requireAdmin` is the
  // production kernel call, so a non-admin caller in a test is refused by exactly what refuses one in
  // production; the recipient list and the published-bundle read are the two genuine EDGES (a user table read
  // and a CAS read), faked here over the harness's own db + byte map like `store`/`readBytes` above. A test
  // that needs a specific recipient set overrides `recipients`.
  const distribution: PluginDistributionDeps = {
    requireAdmin: (caller): void => {
      can(caller, "admin", { kind: "global" });
    },
    listRecipients: overrides.listRecipients ?? ((): Promise<readonly Principal[]> => Promise.resolve([])),
    readPublishedBundle: (assetId): Promise<Uint8Array> => {
      const bytes = storedBytes.get(assetId);
      if (bytes === undefined) {
        return Promise.reject(new Error(`published bundle asset ${assetId} not found`));
      }
      return Promise.resolve(bytes);
    },
  };

  return { ctx, service: createPluginService(ctx, distribution), port: fakePort, storedBytes, advance: (ms) => clock.advance(ms) };
}

/** An inert `PluginHostOps`: every op rejects/no-ops (the host functions are P4). The registrar seams record
 *  nothing here — activation-registrar tests inject a recording ops bundle instead. */
export function makeInertOps(): PluginHostOps {
  const registrationHandle = { unregister: (): void => undefined };
  return {
    chat: {
      listMessages: () => Promise.resolve([]),
      // Fail-closed default: the inert bundle reports NO membership, so a bridge test that forgets to wire a
      // visibility verdict sees an empty read rather than a silently-unclamped one.
      resolveViewerVisibility: () => Promise.resolve(null),
      getVariables: () => Promise.resolve({}),
      applyVariableOps: () => Promise.resolve(),
      requestTurn: () => Promise.resolve(),
    },
    worldInfo: {
      upsertEntries: () => Promise.resolve({ inserted: 0, updated: 0, skippedHandEdited: 0 }),
      // Fail-CLOSED defaults, matching `resolveViewerVisibility` above: a lore-write test that forgets to wire
      // the attachment verdict sees a REFUSAL, never a silently-ungated write.
      isBookAttachedToChat: () => Promise.resolve(false),
      listEntryTitles: () => Promise.resolve([]),
    },
    storage: {
      get: () => Promise.resolve(null),
      set: () => Promise.resolve(),
      delete: () => Promise.resolve(),
      list: () => Promise.resolve([]),
    },
    notifications: { emit: () => Promise.resolve(), post: () => Promise.resolve() },
    llm: { quiet: () => Promise.resolve({ text: "" }) },
    // The S4 posture-2 inbox, inert here. Not a fail-closed default like the two above, because a raise that
    // silently does nothing is the honest inert shape: the SECURITY property under test elsewhere is that a
    // non-host act does not EXECUTE, and the tests that care about the ask being stored inject a recorder.
    suggestions: { raise: () => undefined, voidForPlugin: () => undefined },
    quickReply: { surface: () => Promise.resolve() },
    // The U5 host-mediated ops are INERT here for the same reason `setState` is: a verb test asserts what the
    // verb does with the outbox (`ctx.uiOutbox` is the real one), not what a compose-side op wired to it does.
    // A test that wants to observe a queued toast pushes through the real outbox directly.
    ui: { setState: () => Promise.resolve(), toast: () => Promise.resolve(), openDialog: () => Promise.resolve() },
    // U8 canon writes — inert here (a bridge test that cares about ownership scoping injects a recording op).
    databank: { ingest: () => Promise.resolve({ documentId: "doc_inert0000000000000000000" }) },
    character: { ingest: () => Promise.resolve({ characterId: "char_inert000000000000000000", created: false }) },
    imagery: { generatePicture: () => Promise.resolve({ assetId: "asset_inert00000000000000000" }) },
    variables: { get: () => Promise.resolve(null), set: () => Promise.resolve(), delete: () => Promise.resolve() },
    registrar: {
      registerTool: () => registrationHandle,
      registerTransform: () => registrationHandle,
      registerMacros: () => registrationHandle,
      subscribeEvent: () => registrationHandle,
    },
  };
}

export type { HostSeams } from "@orb/server/infra/plugin-host";

/** The fields a test manifest overrides — merged onto a minimal valid default. */
export interface BundleManifestOverrides {
  readonly id?: string;
  readonly name?: string;
  readonly version?: string;
  readonly description?: string;
  readonly capabilities?: readonly PluginCapability[];
  readonly netHosts?: readonly string[];
  readonly builtAgainst?: { readonly engineVersion: string; readonly engineCommit?: string };
  /** DECLARE `uiEntry` in the manifest (plugin-ui-plane #679 U4). Independent of {@link makeBundle}'s `uiJs`
   *  argument ON PURPOSE: the funnel's biconditional refuses a declaration with no file AND a file with no
   *  declaration, and a fixture that could not express either half could not test either half. */
  readonly uiEntry?: boolean;
}

/** Build a plugin bundle (a zip of `manifest.json` + `main.js`, plus `ui.js` when `uiJs` is given) for
 *  install/upgrade tests. Defaults to a capability-free `hostVersion:1` manifest + a hello `main.js`; override
 *  any field. Deliberately capable of building an INVALID bundle (declaration without file, or the reverse) —
 *  the funnel's job is to refuse those, so the fixture must be able to hand it one. */
export function makeBundle(overrides: BundleManifestOverrides = {}, mainJs = "orb.host(1).log.info('hello');", uiJs?: string): Uint8Array {
  const manifest = {
    id: overrides.id ?? "test-plugin",
    name: overrides.name ?? "Test Plugin",
    version: overrides.version ?? "1.0.0",
    hostVersion: 1,
    entry: "main.js",
    description: overrides.description ?? "a test plugin",
    capabilities: overrides.capabilities ?? [],
    ...(overrides.netHosts !== undefined ? { netHosts: overrides.netHosts } : {}),
    ...(overrides.builtAgainst !== undefined ? { builtAgainst: overrides.builtAgainst } : {}),
    ...(overrides.uiEntry === true ? { uiEntry: "ui.js" } : {}),
  };
  const encoder = new TextEncoder();
  const entries: Record<string, Uint8Array> = {
    "manifest.json": encoder.encode(JSON.stringify(manifest)),
    "main.js": encoder.encode(mainJs),
  };
  if (uiJs !== undefined) {
    entries["ui.js"] = encoder.encode(uiJs);
  }
  return zipSync(entries);
}
