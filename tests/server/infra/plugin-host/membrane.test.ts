// infra/plugin-host/membrane — the capability-gated host-fn CALL surface (01 §2). `attachMembrane` is unit-
// tested directly: attach the gated namespaces onto a bare surface object in a REAL QuickJS context (no full
// Sandbox/port) and drive guest code against them. Pins the three enforcement mechanisms this file owns: the
// guest-readable grant set (feature-detection), the capability gate (an ungranted namespace call throws
// uniformly), and the opaque-handle resolution (a forged/stale chat handle fails resolution — no wrong-chat
// read). The full end-to-end runtime lives in port.test.ts; this is the module's own-seam mirror.

import type { InvocationChat, PluginBridge, PluginCapability } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import { getPluginQuickJS } from "@orb/server/infra/plugin-host";
import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";
import { describe } from "vitest";
import type { MembraneRuntime } from "../../../../packages/server/src/infra/plugin-host/membrane.ts";
import { attachMembrane } from "../../../../packages/server/src/infra/plugin-host/membrane.ts";
import { expect, test } from "../../../support/fixtures";

const CHAT = "chat_test0000000000000000000" as ChatId;
const TOKEN = "opaque-token-abc";

/** A minimal fake bridge — the chat var fold is fixed; a write counter proves the gate is reached (or not). */
function fakeBridge(): { bridge: PluginBridge; writes: { count: number } } {
  const writes = { count: 0 };
  const bridge: PluginBridge = {
    chat: {
      listMessages: () => Promise.resolve([]),
      getVariables: () => Promise.resolve({ tension: "4" }),
      applyVariableOps: () => {
        writes.count += 1;
        return Promise.resolve();
      },
      requestTurn: () => Promise.resolve(),
    },
    worldInfo: { upsertEntry: () => Promise.resolve() },
    imagery: { generatePicture: () => Promise.resolve({ assetId: "asset_x0000000000000000000000" }) },
    variables: { get: () => Promise.resolve(null), set: () => Promise.resolve(), delete: () => Promise.resolve() },
    storage: { get: () => Promise.resolve(null), set: () => Promise.resolve(), delete: () => Promise.resolve(), list: () => Promise.resolve([]) },
    notifications: { post: () => Promise.resolve() },
    surfaceQuickReply: () => Promise.resolve(),
  };
  return { bridge, writes };
}

/** Optional membrane wiring the net.fetch / transforms / events seams need (default: no hosts, noop collect). */
interface RuntimeExtras {
  readonly netHosts?: readonly string[];
  readonly collectTransform?: MembraneRuntime["collectTransform"];
  readonly collectEvent?: MembraneRuntime["collectEvent"];
}

function makeRuntime(grants: readonly PluginCapability[], canWrite: boolean, bridge: PluginBridge, extra: RuntimeExtras = {}): MembraneRuntime {
  const chat: InvocationChat = { chatId: CHAT, canWrite, automationDepth: 0 };
  return {
    grants: new Set(grants),
    bridge,
    netHosts: extra.netHosts ?? [],
    currentChat: () => chat,
    currentToken: () => TOKEN,
    inFlight: { count: 0 },
    pending: new Set(),
    collectTool: () => undefined,
    collectTransform: extra.collectTransform ?? ((): void => undefined),
    collectEvent: extra.collectEvent ?? ((): void => undefined),
  };
}

/** Attach a prebuilt runtime onto a fresh `host` global, run `fn`, then dispose everything. */
async function withRuntime(runtime: MembraneRuntime, fn: (ctx: QuickJSContext) => Promise<void> | void): Promise<void> {
  const mod = await getPluginQuickJS();
  const ctx = mod.newContext();
  const surface = ctx.newObject();
  try {
    attachMembrane(ctx, surface, runtime);
    ctx.setProp(ctx.global, "host", surface);
    await fn(ctx);
  } finally {
    surface.dispose();
    ctx.dispose();
  }
}

/** Attach the membrane onto a fresh `host` global, run `fn` with the context, then dispose everything. */
async function withHost(
  grants: readonly PluginCapability[],
  canWrite: boolean,
  bridge: PluginBridge,
  fn: (ctx: QuickJSContext) => Promise<void> | void,
): Promise<void> {
  await withRuntime(makeRuntime(grants, canWrite, bridge), fn);
}

/** Read a settled promise handle (or a sync eval result) into a string, disposing the handle. */
function readString(ctx: QuickJSContext, handle: QuickJSHandle): string {
  const out = ctx.getString(handle);
  handle.dispose();
  return out;
}

/** Drive a guest async IIFE to settlement and return its string result (the membrane pumps pending jobs on
 *  settle; `resolvePromise` + one `executePendingJobs` mirrors the runtime's continuation). */
async function runAsync(ctx: QuickJSContext, code: string): Promise<string> {
  const result = ctx.evalCode(code);
  if (result.error) {
    throw new Error(`guest failed to start: ${readString(ctx, result.error)}`);
  }
  const native = ctx.resolvePromise(result.value);
  ctx.runtime.executePendingJobs();
  const settled = await native;
  result.value.dispose();
  const handle = "error" in settled && settled.error ? settled.error : settled.value;
  return readString(ctx, handle);
}

describe("attachMembrane — grant set is guest-readable (feature-detection)", () => {
  test("host.grants reflects exactly the granted capabilities", async () => {
    const { bridge } = fakeBridge();
    await withHost(["chat.read", "global_vars"], false, bridge, (ctx) => {
      const result = ctx.evalCode("JSON.stringify(host.grants)");
      const grants = JSON.parse(readString(ctx, result.error ?? result.value)) as string[];
      expect(new Set(grants)).toEqual(new Set(["chat.read", "global_vars"]));
    });
  });
});

describe("attachMembrane — capability gate", () => {
  test("chat.current() returns the opaque token when chat.read is granted + a chat is in scope", async () => {
    const { bridge } = fakeBridge();
    await withHost(["chat.read"], false, bridge, (ctx) => {
      const result = ctx.evalCode("host.chat.current()");
      expect(readString(ctx, result.error ?? result.value)).toBe(TOKEN);
    });
  });

  test("chat.current() WITHOUT the chat.read grant throws the capability refusal (uniform gate)", async () => {
    const { bridge } = fakeBridge();
    await withHost([], false, bridge, (ctx) => {
      const result = ctx.evalCode("try { host.chat.current(); 'NO-THROW' } catch (e) { 'caught:' + e.message }");
      expect(readString(ctx, result.error ?? result.value)).toContain("chat.read");
    });
  });
});

describe("attachMembrane — the capability refusal crosses the boundary as a TYPED error (01 §1.3)", () => {
  // The doc MANDATES that a guest feature-detect the refusal by TYPE: `catch (e) { e.name === "PluginCapabilityError" }`.
  // The class NAME must survive the QuickJS boundary (it crosses as `{name, message}`) — asserting the message
  // substring (as the older gate tests do) does NOT bite this: a plain `new Error(...)` would carry the same message
  // but the default name `"Error"`. These pin BOTH throw paths — sync `newFunction` and the async-bridge reject arm.
  test("SYNC path (chat.current): the guest sees e.name === 'PluginCapabilityError'", async () => {
    const { bridge } = fakeBridge();
    await withHost([], false, bridge, (ctx) => {
      const result = ctx.evalCode("try { host.chat.current(); 'NO-THROW' } catch (e) { e.name }");
      expect(readString(ctx, result.error ?? result.value)).toBe("PluginCapabilityError");
    });
  });

  test("ASYNC path (chat.getVariables): the rejection reaches the guest as e.name === 'PluginCapabilityError'", async () => {
    const { bridge } = fakeBridge();
    await withHost([], false, bridge, async (ctx) => {
      const out = await runAsync(ctx, "(async () => { try { await host.chat.getVariables('any'); return 'NO-THROW' } catch (e) { return e.name } })()");
      expect(out).toBe("PluginCapabilityError");
    });
  });
});

describe("attachMembrane — opaque handle + host-authority ceiling", () => {
  test("a FORGED chat handle fails resolution — no read reaches the bridge", async () => {
    const { bridge } = fakeBridge();
    await withHost(["chat.read"], false, bridge, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { try { await host.chat.getVariables('forged-handle'); return 'NO-THROW' } catch (e) { return 'caught:' + e.message } })()",
      );
      expect(out).toContain("invalid chat handle");
    });
  });

  test("a NON-HOST caller's variable write is refused by the host-authority ceiling (bridge never called)", async () => {
    const fake = fakeBridge();
    await withHost(["chat.read", "chat.variables.write"], false, fake.bridge, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { try { await host.chat.applyVariableOps(host.chat.current(), [{op:'set',key:'x',value:'1'}]); return 'wrote' } catch (e) { return 'caught:' + e.message } })()",
      );
      expect(out).toContain("host authority");
      expect(fake.writes.count).toBe(0);
    });
  });
});

describe("attachMembrane — transforms.register (SYNC collect; domain wires the band/apply/unregister)", () => {
  test("a granted transforms.register calls collectTransform with {name, point} + keeps the apply handle", async () => {
    const { bridge } = fakeBridge();
    const collected: { name: string; point: string }[] = [];
    const runtime = makeRuntime(["chat.transform"], false, bridge, {
      collectTransform: (reg, handler): void => {
        collected.push({ name: reg.name, point: reg.point });
        handler.dispose(); // this test owns disposal (no Sandbox handlers map behind the direct attach)
      },
    });
    await withRuntime(runtime, (ctx) => {
      const result = ctx.evalCode("host.transforms.register({ name: 'shout', point: 'assembled_dynamic', apply: async (d) => d.toUpperCase() })");
      if (result.error) {
        throw new Error(`guest threw: ${readString(ctx, result.error)}`);
      }
      result.value.dispose();
    });
    expect(collected).toEqual([{ name: "shout", point: "assembled_dynamic" }]);
  });

  test("transforms.register WITHOUT chat.transform throws the uniform capability refusal (nothing collected)", async () => {
    const { bridge } = fakeBridge();
    const collected: unknown[] = [];
    const runtime = makeRuntime([], false, bridge, { collectTransform: (reg): void => void collected.push(reg) });
    await withRuntime(runtime, (ctx) => {
      const result = ctx.evalCode(
        "try { host.transforms.register({ name: 'x', point: 'user_input', apply: async (d) => d }); 'NO-THROW' } catch (e) { 'caught:' + e.message }",
      );
      expect(readString(ctx, result.error ?? result.value)).toContain("chat.transform");
    });
    expect(collected).toEqual([]);
  });

  test("transforms.register with an out-of-band point throws (only user_input | assembled_dynamic; nothing collected)", async () => {
    const { bridge } = fakeBridge();
    const collected: unknown[] = [];
    const runtime = makeRuntime(["chat.transform"], false, bridge, { collectTransform: (reg): void => void collected.push(reg) });
    await withRuntime(runtime, (ctx) => {
      const result = ctx.evalCode(
        "try { host.transforms.register({ name: 'x', point: 'nope', apply: async (d) => d }); 'NO-THROW' } catch (e) { 'caught:' + e.message }",
      );
      expect(readString(ctx, result.error ?? result.value)).toContain("user_input");
    });
    expect(collected).toEqual([]);
  });
});

describe("attachMembrane — events.on (SYNC collect; domain wires the fan-out delivery/unregister)", () => {
  test("a granted events.on calls collectEvent with the validated type + keeps the handler handle", async () => {
    const { bridge } = fakeBridge();
    const collected: { type: string }[] = [];
    const runtime = makeRuntime(["events.subscribe"], false, bridge, {
      collectEvent: (reg, handler): void => {
        collected.push({ type: reg.type });
        handler.dispose(); // this test owns disposal (no Sandbox handlers map behind the direct attach)
      },
    });
    await withRuntime(runtime, (ctx) => {
      const result = ctx.evalCode("host.events.on('messageCommitted', async (fact) => {})");
      if (result.error) {
        throw new Error(`guest threw: ${readString(ctx, result.error)}`);
      }
      result.value.dispose();
    });
    expect(collected).toEqual([{ type: "messageCommitted" }]);
  });

  test("events.on WITHOUT events.subscribe throws the uniform capability refusal (nothing collected)", async () => {
    const { bridge } = fakeBridge();
    const collected: unknown[] = [];
    const runtime = makeRuntime([], false, bridge, { collectEvent: (reg): void => void collected.push(reg) });
    await withRuntime(runtime, (ctx) => {
      const result = ctx.evalCode("try { host.events.on('messageCommitted', async () => {}); 'NO-THROW' } catch (e) { 'caught:' + e.message }");
      expect(readString(ctx, result.error ?? result.value)).toContain("events.subscribe");
    });
    expect(collected).toEqual([]);
  });

  test("events.on with a type OUTSIDE the Tier-1 taxonomy throws (plugins get no private event vocabulary)", async () => {
    const { bridge } = fakeBridge();
    const collected: unknown[] = [];
    const runtime = makeRuntime(["events.subscribe"], false, bridge, { collectEvent: (reg): void => void collected.push(reg) });
    await withRuntime(runtime, (ctx) => {
      const result = ctx.evalCode("try { host.events.on('made_up_event', async () => {}); 'NO-THROW' } catch (e) { 'caught:' + e.message }");
      expect(readString(ctx, result.error ?? result.value)).toContain("Tier-1 trigger type");
    });
    expect(collected).toEqual([]);
  });
});

describe("attachMembrane — net.fetch is gated + walled to the manifest netHosts (SSRF)", () => {
  test("net.fetch WITHOUT the grant rejects (capability gate) — never consults the host list", async () => {
    const { bridge } = fakeBridge();
    const runtime = makeRuntime([], false, bridge, { netHosts: ["api.example.com"] });
    await withRuntime(runtime, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { try { await host.net.fetch('https://api.example.com/x'); return 'REACHED' } catch (e) { return 'caught:' + e.message } })()",
      );
      expect(out).toContain("net.fetch");
      expect(out).not.toContain("REACHED");
    });
  });

  test("a host NOT in netHosts is blocked at the allowlist before any network (guest URL is not the wall)", async () => {
    const { bridge } = fakeBridge();
    const runtime = makeRuntime(["net.fetch"], false, bridge, { netHosts: ["api.example.com"] });
    await withRuntime(runtime, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { try { await host.net.fetch('https://evil.example/steal'); return 'REACHED' } catch (e) { return 'caught:' + e.message } })()",
      );
      expect(out).not.toContain("REACHED");
      expect(out).toContain("allowlist");
    });
  });

  test("an EMPTY netHosts list fail-closes: every host is refused even with the grant", async () => {
    const { bridge } = fakeBridge();
    const runtime = makeRuntime(["net.fetch"], false, bridge, { netHosts: [] });
    await withRuntime(runtime, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { try { await host.net.fetch('https://api.example.com/x'); return 'REACHED' } catch (e) { return 'caught:' + e.message } })()",
      );
      expect(out).not.toContain("REACHED");
      expect(out).toContain("allowlist");
    });
  });

  test("a declared host over http:// is refused by the https scheme pin (no downgrade)", async () => {
    const { bridge } = fakeBridge();
    const runtime = makeRuntime(["net.fetch"], false, bridge, { netHosts: ["api.example.com"] });
    await withRuntime(runtime, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { try { await host.net.fetch('http://api.example.com/x'); return 'REACHED' } catch (e) { return 'caught:' + e.message } })()",
      );
      expect(out).not.toContain("REACHED");
      expect(out).toContain("https");
    });
  });
});
