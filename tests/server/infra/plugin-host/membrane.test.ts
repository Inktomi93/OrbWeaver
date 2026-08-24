// infra/plugin-host/membrane — the capability-gated host-fn CALL surface (01 §2). `attachMembrane` is unit-
// tested directly: attach the gated namespaces onto a bare surface object in a REAL QuickJS context (no full
// Sandbox/port) and drive guest code against them. Pins the three enforcement mechanisms this file owns: the
// guest-readable grant set (feature-detection), the capability gate (an ungranted namespace call throws
// uniformly), and the opaque-handle resolution (a forged/stale chat handle fails resolution — no wrong-chat
// read). It also owns the IN-FLIGHT ACCOUNTING pin (P2-G) — the counter is only inspectable where the runtime is
// hand-built, i.e. here; the cross-invocation half of that invariant is the escape suite's (it needs a Sandbox).
// The full end-to-end runtime lives in port.test.ts; this is the module's own-seam mirror.

import type { InvocationChat, PluginBridge, PluginCapability } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import { getPluginQuickJS, HOST_FN_DEADLINE_MS } from "@orb/server/infra/plugin-host";
import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";
import { describe } from "vitest";
import type { MembraneRuntime } from "../../../../packages/server/src/infra/plugin-host/membrane.ts";
import { attachMembrane } from "../../../../packages/server/src/infra/plugin-host/membrane.ts";
import { expect, test } from "../../../support/fixtures.ts";

const CHAT = "chat_test0000000000000000000" as ChatId;
const TOKEN = "opaque-token-abc";

/** A minimal fake bridge — the chat var fold is fixed; a write counter proves the gate is reached (or not).
 *  `llm.prompts` and `egress.count` are the same instrument for the two BELTED capabilities: they record what
 *  actually crossed the seam, so a test can tell "the membrane refused" from "the bridge was reached".
 *  `egressRefusal` scripts the domain floor throwing (the belt is domain state; infra only calls the closure). */
function fakeBridge(opts: { readonly egressRefusal?: string } = {}): {
  bridge: PluginBridge;
  writes: { count: number };
  llm: { prompts: string[] };
  egress: { count: number };
} {
  const writes = { count: 0 };
  const llm: { prompts: string[] } = { prompts: [] };
  const egress = { count: 0 };
  const bridge: PluginBridge = {
    llm: {
      quiet: (prompt) => {
        llm.prompts.push(prompt);
        return Promise.resolve({ text: `answered:${prompt.length}` });
      },
    },
    admitEgress: (): void => {
      egress.count += 1;
      if (opts.egressRefusal !== undefined) {
        throw new Error(opts.egressRefusal);
      }
    },
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
  return { bridge, writes, llm, egress };
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

describe("attachMembrane — the in-flight slot is charged to the IMPL, not to the deadline race (P2-G)", () => {
  // RED-FIRST RECEIPT (2026-08-24, against unmodified source): this test read 0 after the deadline. The host-fn
  // deadline BOUNDS a call without CANCELLING it — nothing here can abort a bridge op — so releasing the slot
  // when the RACE settles made the "≤32 concurrent host calls" cap count not-yet-timed-out PROMISES. A guest
  // could then start 32 fresh installer-funded calls (imagery.generatePicture = GPU/$, chat.requestTurn) every
  // HOST_FN_DEADLINE_MS while the previous ones were still executing, i.e. unbounded concurrent host work under
  // a cap that read "32". The cap is a bound on WORK or it is decoration.
  test("a host call whose impl outlives the deadline KEEPS its slot (the guest promise rejects; the work does not)", { timeout: 30_000 }, async () => {
    const inFlight = { count: 0 };
    // The impl never settles — it stands in for host work that outlives the 5 s bound (a real image generation).
    const neverSettles = new Promise<Record<string, string>>(() => undefined);
    const { bridge } = fakeBridge();
    const runtime: MembraneRuntime = {
      ...makeRuntime(["chat.read"], false, { ...bridge, chat: { ...bridge.chat, getVariables: () => neverSettles } }),
      inFlight,
    };
    await withRuntime(runtime, async (ctx) => {
      const started = ctx.evalCode(`host.chat.getVariables(${JSON.stringify(TOKEN)}).catch(() => {}); 'ok'`);
      readString(ctx, started.error ?? started.value);
      expect(inFlight.count).toBe(1);

      await new Promise((resolve) => setTimeout(resolve, HOST_FN_DEADLINE_MS + 400));

      // The GUEST promise has settled (rejected at the bound) and deregistered from `pending` — that is the
      // race's business. The SLOT is still held, because the host work is still running.
      expect(runtime.pending.size).toBe(0);
      expect(inFlight.count).toBe(1);
    });
  });
});

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

describe("attachMembrane — the hourly EGRESS floor is claimed before the fetch", () => {
  // WHAT THIS CLOSES (D46 review §8, tracked): `safeFetch` bounds each REQUEST and the manifest bounds the
  // DESTINATIONS, but nothing bounded the RATE — a plugin subscribed to `messageCommitted` egressed once per
  // committed message, forever. `HOST_CALLS_IN_FLIGHT_MAX` is a CONCURRENCY bound and is not a rate: 32 at a
  // time, as fast as they settle, is legal under every other cap in the sandbox.
  test("the floor is claimed and its refusal reaches the guest — with NO network attempt", async () => {
    // The ORDER is the assertion. `netHosts` names the host being fetched, so an allowlist refusal is not
    // available as an excuse: if the message is the rate refusal, the claim ran BEFORE `safeFetch`. If the
    // claim ran after, this guest would see the network/allowlist path instead.
    const { bridge, egress } = fakeBridge({ egressRefusal: "plugin host: net.fetch is limited to 120 calls per hour for this plugin" });
    const runtime = makeRuntime(["net.fetch"], false, bridge, { netHosts: ["api.example.com"] });
    await withRuntime(runtime, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { try { await host.net.fetch('https://api.example.com/x'); return 'REACHED' } catch (e) { return 'caught:' + e.message } })()",
      );
      expect(out).not.toContain("REACHED");
      expect(out).toContain("limited to 120 calls per hour");
      expect(out).not.toContain("allowlist");
      expect(egress.count).toBe(1);
    });
  });

  test("a call WITHOUT the net.fetch grant never reaches the floor (the capability gate is first)", async () => {
    // Ordering the other way round matters too: an ungranted call must not consume a budget slot, or a
    // capability-less plugin could exhaust a granted sibling's… and more importantly, could probe the belt.
    const { bridge, egress } = fakeBridge();
    const runtime = makeRuntime([], false, bridge, { netHosts: ["api.example.com"] });
    await withRuntime(runtime, async (ctx) => {
      await runAsync(ctx, "(async () => { try { await host.net.fetch('https://api.example.com/x'); return 'x' } catch (e) { return 'caught' } })()");
      expect(egress.count).toBe(0);
    });
  });
});

describe("attachMembrane — llm.quiet (SPEND, class 1: writes nothing)", () => {
  test("WITHOUT the grant it rejects uniformly and the bridge is never reached", async () => {
    const { bridge, llm } = fakeBridge();
    await withHost([], false, bridge, async (ctx) => {
      const out = await runAsync(ctx, "(async () => { try { await host.llm.quiet('hi'); return 'REACHED' } catch (e) { return 'caught:' + e.name } })()");
      expect(out).toBe("caught:PluginCapabilityError");
      expect(llm.prompts).toEqual([]);
    });
  });

  test("WITH the grant it returns raw text — and needs NO chat scope and NO host authority", async () => {
    // Both absences are deliberate and are the reason this capability is addable at all: the call carries no
    // room context (so an admitted handle would describe nothing) and writes no room state (so `canWrite`,
    // which is the ROOM-STATE write ceiling, would be a claim of a protection this call does not need).
    // `canWrite:false` here IS the assertion — a non-host installer can still make this call.
    const { bridge, llm } = fakeBridge();
    const runtime: MembraneRuntime = { ...makeRuntime(["llm.quiet"], false, bridge), currentChat: () => null, currentToken: () => null };
    await withRuntime(runtime, async (ctx) => {
      const out = await runAsync(ctx, "(async () => { return await host.llm.quiet('summarise this') })()");
      expect(out).toBe("answered:14"); // the fake echoes the prompt LENGTH — proof the exact string crossed
      expect(llm.prompts).toEqual(["summarise this"]);
    });
  });

  test("an over-cap prompt is REFUSED, not truncated, and never reaches the paid call", async () => {
    // Refusing rather than slicing is the money-shaped choice: a silently shortened prompt returns a wrong
    // answer the guest cannot detect, and it costs the installer real tokens to produce it.
    const { bridge, llm } = fakeBridge();
    await withHost(["llm.quiet"], false, bridge, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { try { await host.llm.quiet('x'.repeat(8193)); return 'REACHED' } catch (e) { return 'caught:' + e.message } })()",
      );
      expect(out).not.toContain("REACHED");
      expect(out).toContain("8192-character cap");
      expect(llm.prompts).toEqual([]);
    });
  });

  test("a non-string prompt is refused before the bridge", async () => {
    const { bridge, llm } = fakeBridge();
    await withHost(["llm.quiet"], false, bridge, async (ctx) => {
      const out = await runAsync(ctx, "(async () => { try { await host.llm.quiet({}); return 'REACHED' } catch (e) { return 'caught' } })()");
      expect(out).toBe("caught");
      expect(llm.prompts).toEqual([]);
    });
  });
});
