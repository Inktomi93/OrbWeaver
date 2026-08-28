// activation: activate — the resident-instance lifecycle driven through setEnabled (03 §2). The collected
// registrations are handed to the registrar ops; a registrar refusal (a tool-name collision — activation-fatal,
// 03 §5) discards the WHOLE activation atomically (partial registrations unregistered, instance disposed, row
// errored). Deactivate unregisters every handle (no ghost tools/transforms/subs). (The per-plugin spend gate +
// its composed-real serializer proof were stripped 2026-07-24 — enterprise spend enforcement.)

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PluginHandlerRef, PluginHostOps, PluginInvokeHandler, PluginRegistrationHandle } from "@orb/server/domain/plugin";
import { PluginCrashedError } from "@orb/server/domain/plugin";
import { createPluginHost } from "@orb/server/infra/plugin-host";
import { getById } from "../../../../../packages/server/src/domain/plugin/persistence/plugins.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makeInertOps, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

const HANDLER = castId<PluginHandlerRef>("handler_1");
const HANDLER2 = castId<PluginHandlerRef>("handler_2");
const INVOCATION_ENDED_RE = /invocation ended/u;

/** A recording registrar over the inert base: counts register/unregister so activation atomicity is observable. */
function recordingOps(overrides: { readonly failToolAt?: number } = {}): {
  readonly ops: PluginHostOps;
  readonly registered: string[];
  readonly unregistered: string[];
} {
  const registered: string[] = [];
  const unregistered: string[] = [];
  const base = makeInertOps();
  const handleFor = (name: string): PluginRegistrationHandle => ({
    unregister: (): void => {
      unregistered.push(name);
    },
  });
  const ops: PluginHostOps = {
    ...base,
    registrar: {
      registerTool: (reg): PluginRegistrationHandle => {
        registered.push(reg.name);
        if (overrides.failToolAt !== undefined && registered.length === overrides.failToolAt) {
          throw new Error(`tool name collision: ${reg.name}`);
        }
        return handleFor(reg.name);
      },
      registerTransform: (reg): PluginRegistrationHandle => {
        registered.push(reg.name);
        return handleFor(reg.name);
      },
      subscribeEvent: base.registrar.subscribeEvent,
    },
  };
  return { ops, registered, unregistered };
}

test("collected registrations are handed to the registrar; disable unregisters every handle", async () => {
  const db = await freshDb();
  const rec = recordingOps();
  const h = makePluginHarness(db, { ops: rec.ops });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "mood", capabilities: ["tools.register", "chat.transform"] }),
    grant: ["tools.register", "chat.transform"],
  });
  // The runtime collected two tools + one transform from main.js.
  h.port.script({
    ok: true,
    instance: {
      tools: [
        { name: "t1", description: "", parameters: {}, handler: HANDLER },
        { name: "t2", description: "", parameters: {}, handler: HANDLER2 },
      ],
      transforms: [{ name: "x1", point: "user_input", handler: HANDLER }],
      events: [],
      surfaces: [],
      commands: [],
    },
  });

  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });
  expect(rec.registered).toEqual(["t1", "t2", "x1"]);

  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: false });
  expect(rec.unregistered.toSorted((a, b) => a.localeCompare(b))).toEqual(["t1", "t2", "x1"]);
});

test("the manifest netHosts allowlist is forwarded to createInstance (net.fetch SSRF wall wiring)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "fetcher", capabilities: ["net.fetch"], netHosts: ["api.example.com", "cdn.example.com"] }),
    grant: ["net.fetch"],
  });

  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });

  // The re-validated manifest's allowlist crossed the seam verbatim (the infra host-fn pins safeFetch to it).
  expect(h.port.created.at(-1)?.netHosts).toEqual(["api.example.com", "cdn.example.com"]);
});

test("a bundle with no netHosts forwards no allowlist (fail-closed [] infra-side)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({ caller: ownerPrincipalFor(owner), bundle: makeBundle({ id: "plain" }), grant: [] });

  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });

  expect(h.port.created.at(-1)?.netHosts).toBeUndefined();
});

test("a registrar refusal discards the whole activation atomically (rollback + errored + disposed)", async () => {
  const db = await freshDb();
  const rec = recordingOps({ failToolAt: 2 }); // the SECOND tool collides
  const h = makePluginHarness(db, { ops: rec.ops });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "mood", capabilities: ["tools.register"] }),
    grant: ["tools.register"],
  });
  h.port.script({
    ok: true,
    instance: {
      tools: [
        { name: "t1", description: "", parameters: {}, handler: HANDLER },
        { name: "t2", description: "", parameters: {}, handler: HANDLER2 },
      ],
      transforms: [],
      events: [],
      surfaces: [],
      commands: [],
    },
  });

  await expect(h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true })).rejects.toBeInstanceOf(PluginCrashedError);

  // The first tool's registration was rolled back; the instance was disposed; the row is errored.
  expect(rec.unregistered).toEqual(["t1"]);
  expect(h.port.disposed.length).toBe(1);
  const row = await getById(h.ctx.db, owner, installed.id);
  expect(row?.status).toBe("errored");
});

// The crash policy's ONE trigger is `ctx.host.invoke` REJECTING. A guest handler that simply stops executing
// (`new Promise(() => {})`) used to never reject — so the most effective hostile move (hang every invocation)
// was INVISIBLE to the 3-strike auto-disable while it wedged the instance's FIFO. This drives the REAL runtime
// end-to-end: the settlement deadline must turn a hang into a counted crash. It runs for the real wall
// (cpuDeadlineMs + the grace) by design — the domain never overrides the production budgets.
test("a HUNG guest handler is a COUNTED crash (the settlement deadline feeds the 3-strike policy)", { timeout: 30_000 }, async () => {
  const db = await freshDb();
  // Capture the per-handler invoke closure the registrar is handed — that closure IS the crash-counting seam
  // (activation wraps `ctx.host.invoke` with recordCrash/recordCleanRun).
  let invoke: PluginInvokeHandler | undefined;
  let handlerRef: PluginHandlerRef | undefined;
  const base = makeInertOps();
  const ops: PluginHostOps = {
    ...base,
    registrar: {
      ...base.registrar,
      registerTool: (reg, inv): PluginRegistrationHandle => {
        invoke = inv;
        handlerRef = reg.handler;
        return { unregister: (): void => undefined };
      },
    },
  };
  const h = makePluginHarness(db, {
    ops,
    port: createPluginHost({ nowEpochMs: () => FROZEN_AT_MS, nextRandom: () => 0.5, mintId: () => "id-0" }),
  });
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const hangMain = `
    const h = orb.host(1);
    h.tools.register({ name: "hang", description: "never settles", parameters: { type: "object", properties: {} }, handler: () => new Promise(() => {}) });
    'ok';`;
  const installed = await h.service.install({
    caller: ownerPrincipalFor(owner),
    bundle: makeBundle({ id: "hanger", capabilities: ["tools.register"] }, hangMain),
    grant: ["tools.register"],
  });
  await h.service.setEnabled({ caller: ownerPrincipalFor(owner), pluginId: installed.id, enabled: true });
  expect((await getById(h.ctx.db, owner, installed.id))?.consecutiveCrashes).toBe(0);
  if (invoke === undefined || handlerRef === undefined) {
    throw new Error("the tool registrar was never reached");
  }

  // Pre-fix this promise NEVER settled: the assertion could not even be written without hanging the suite.
  await expect(invoke(handlerRef, "{}", null)).rejects.toThrow(INVOCATION_ENDED_RE);
  expect((await getById(h.ctx.db, owner, installed.id))?.consecutiveCrashes).toBe(1);
});
