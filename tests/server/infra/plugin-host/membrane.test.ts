// infra/plugin-host/membrane — the capability-gated host-fn CALL surface (01 §2). `attachMembrane` is unit-
// tested directly: attach the gated namespaces onto a bare surface object in a REAL QuickJS context (no full
// Sandbox/port) and drive guest code against them. Pins the three enforcement mechanisms this file owns: the
// guest-readable grant set (feature-detection), the capability gate (an ungranted namespace call throws
// uniformly), and the opaque-handle resolution (a forged/stale chat handle fails resolution — no wrong-chat
// read). It also owns the IN-FLIGHT ACCOUNTING pin (P2-G) — the counter is only inspectable where the runtime is
// hand-built, i.e. here; the cross-invocation half of that invariant is the escape suite's (it needs a Sandbox).
// The full end-to-end runtime lives in port.test.ts; this is the module's own-seam mirror.

import type { InvocationChat, PluginBridge, PluginCapability, PluginSuggestedAct } from "@orb/contracts/plugin";
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
  suggested: { acts: PluginSuggestedAct[] };
  performed: {
    turns: number;
    lore: number;
    pictures: number;
    chips: number;
    uiSetState: { surfaceId: string; state: Record<string, unknown>; chatId: ChatId | null }[];
  };
} {
  const writes = { count: 0 };
  const uiSetState: { surfaceId: string; state: Record<string, unknown>; chatId: ChatId | null }[] = [];
  const performed = { turns: 0, lore: 0, pictures: 0, chips: 0, uiSetState };
  const llm: { prompts: string[] } = { prompts: [] };
  const egress = { count: 0 };
  const suggested: { acts: PluginSuggestedAct[] } = { acts: [] };
  const bridge: PluginBridge = {
    llm: {
      quiet: (prompt) => {
        llm.prompts.push(prompt);
        return Promise.resolve({ text: `answered:${prompt.length}` });
      },
    },
    // POSTURE 2 — records the act the membrane stashed, so a test can tell "asked" from "refused" from "did it".
    suggest: (_chatId, act) => {
      suggested.acts.push(act);
      return Promise.resolve();
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
      requestTurn: () => {
        performed.turns += 1;
        return Promise.resolve();
      },
    },
    worldInfo: {
      upsertEntry: () => {
        performed.lore += 1;
        return Promise.resolve();
      },
    },
    imagery: {
      generatePicture: () => {
        performed.pictures += 1;
        return Promise.resolve({ assetId: "asset_x0000000000000000000000" });
      },
    },
    variables: { get: () => Promise.resolve(null), set: () => Promise.resolve(), delete: () => Promise.resolve() },
    storage: { get: () => Promise.resolve(null), set: () => Promise.resolve(), delete: () => Promise.resolve(), list: () => Promise.resolve([]) },
    notifications: { post: () => Promise.resolve() },
    surfaceQuickReply: () => {
      performed.chips += 1;
      return Promise.resolve();
    },
    ui: {
      // Capture the THIRD arg (the room). The membrane resolves it from the opaque handle before it reaches the
      // bridge; recording it here is what lets a test prove an admitted handle actually carried its chat through.
      setState: (surfaceId, state, chatId) => {
        performed.uiSetState.push({ surfaceId, state, chatId });
        return Promise.resolve();
      },
    },
  };
  return { bridge, writes, llm, egress, suggested, performed };
}

/** Optional membrane wiring the net.fetch / transforms / events seams need (default: no hosts, noop collect). */
interface RuntimeExtras {
  readonly netHosts?: readonly string[];
  readonly collectTool?: MembraneRuntime["collectTool"];
  readonly collectTransform?: MembraneRuntime["collectTransform"];
  readonly collectEvent?: MembraneRuntime["collectEvent"];
  readonly collectSurface?: MembraneRuntime["collectSurface"];
  readonly logWarn?: MembraneRuntime["logWarn"];
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
    collectTool: extra.collectTool ?? ((): void => undefined),
    collectTransform: extra.collectTransform ?? ((): void => undefined),
    collectEvent: extra.collectEvent ?? ((): void => undefined),
    collectSurface: extra.collectSurface ?? ((): void => undefined),
    logWarn: extra.logWarn ?? ((): void => undefined),
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

describe("attachMembrane — a deeply-nested ARG is refused BEFORE ctx.dump (the shared-runtime DoS, #707 Finding C)", () => {
  test("a ~12000-deep arg to an async host fn is a contained rejection — the runtime stays disposable", async () => {
    // RED-FIRST (2026-08-25, against the post-Finding-A source): every async host fn `ctx.dump`-s its args in
    // `attachAsync` BEFORE the arg-budget cap. A deeply-nested guest arg overflows `ctx.dump` HOST-side and
    // CORRUPTS the shared WASM runtime — the dispose-time `list_empty(&rt->gc_obj_list)` abort, a crash of EVERY
    // co-resident plugin, not a contained refusal. Reachable with ANY async grant (here just `chat.read`). A's
    // spec pre-walk does NOT cover this path. The fix pre-walks each arg handle with the SAME depth guard and
    // rejects an over-deep arg as guest errors-as-data before the dump. On unmodified source this test failed
    // with a `RuntimeError: Aborted(... list_empty ...)` at the `withHost` teardown dispose.
    const { bridge } = fakeBridge();
    await withHost(["chat.read"], false, bridge, async (ctx) => {
      const out = await runAsync(
        ctx,
        `(async () => {
           let deep = {};
           for (let i = 0; i < 12000; i++) { deep = { n: deep }; }
           try { await host.chat.listMessages(${JSON.stringify(TOKEN)}, deep); return "reached"; }
           catch (e) { return "caught:" + (e && e.name); }
         })()`,
      );
      expect(out).not.toContain("reached"); // the over-deep arg never reached the bridge
      expect(out).toContain("caught"); // a CONTAINED rejection
    });
    // THE LOAD-BEARING HALF: a SIBLING plugin still invokes a host fn to completion on a FRESH context of the
    // SAME shared WASM module. On unmodified source the deep-arg block above tore the shared runtime down with the
    // `list_empty` abort, so this second invocation could never run.
    const sibling = fakeBridge();
    await withHost(["chat.read"], false, sibling.bridge, async (ctx) => {
      const out = await runAsync(ctx, `host.chat.getVariables(${JSON.stringify(TOKEN)}).then((v) => JSON.stringify(v), (e) => "err:" + e.name)`);
      expect(out).toContain("tension"); // the fake bridge answered — the runtime is intact
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

describe("attachMembrane — sync registration metadata is guarded before ctx.dump", () => {
  test("a deeply nested tools.register parameter schema is refused before collection", async () => {
    const { bridge } = fakeBridge();
    const collected: unknown[] = [];
    const runtime = makeRuntime(["tools.register"], false, bridge, {
      collectTool: (registration, handler): void => {
        collected.push(registration);
        handler.dispose();
      },
    });
    await withRuntime(runtime, (ctx) => {
      const result = ctx.evalCode(
        `let parameters = { type: "object" };
         for (let i = 0; i < 96; i++) { parameters = { child: parameters }; }
         let outcome = "collected";
         try { host.tools.register({ name: "deep", description: "d", parameters, handler: () => {} }); }
         catch (e) { outcome = "caught:" + e.message; }
         outcome`,
      );
      expect(readString(ctx, result.error ?? result.value)).toContain("too deeply nested");
    });
    expect(collected).toEqual([]);
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

// THE #14 THREE-POSTURE LAW, plugins joining (interaction spec §3-S4): standing authority ⇒ act; NO standing
// authority ⇒ a SUGGESTION the host confirms; the fourth posture — direct execution without standing
// authority — never exists. Before this, every `canWrite:false` arm was a flat refusal, i.e. posture 3
// wearing posture 2's clothes: safe, but "ask" was unexpressible and authors were pushed toward installing
// under a host account. Each pin below asserts BOTH halves, because either alone would be a lie: the act did
// NOT happen, and an ask WAS stored.
describe("attachMembrane — posture 2: a non-host installer's act becomes an ASK, never a write", () => {
  test("requestTurn stashes the ask with the CHILD depth and does not take a turn", async () => {
    const { bridge, suggested, performed } = fakeBridge();
    // canWrite:false IS the scenario — the grant is held, the standing authority is not.
    await withHost(["turn.trigger"], false, bridge, async (ctx) => {
      const out = await runAsync(
        ctx,
        `(async () => { try { await host.chat.requestTurn(${JSON.stringify(TOKEN)}, { guided: 'push the scene' }); return 'REACHED' } catch (e) { return e.name } })()`,
      );
      // The guest is TOLD, typed — not resolved (which would claim the turn ran) and not the flat
      // `PluginCapabilityError` (which would claim the grant is missing).
      expect(out).toBe("PluginSuggestedError");
    });
    expect(performed.turns).toBe(0);
    // The stashed depth is the CHILD depth (invocation 0 + 1), frozen at ask time so a delay cannot re-base
    // the cascade ceiling.
    expect(suggested.acts).toEqual([{ kind: "requestTurn", automationDepth: 1, guided: "push the scene" }]);
  });

  test("worldInfo.upsertEntry stashes the guest entry VERBATIM and writes no lore", async () => {
    const { bridge, suggested, performed } = fakeBridge();
    const entry = { bookId: "wbook_x", entryKey: "mood", keys: ["mood"], contentTemplate: "tense", position: "before_char" };
    await withHost(["worldinfo.write"], false, bridge, async (ctx) => {
      const out = await runAsync(
        ctx,
        `(async () => { try { await host.worldInfo.upsertEntry(${JSON.stringify(TOKEN)}, ${JSON.stringify(entry)}); return 'REACHED' } catch (e) { return e.name } })()`,
      );
      expect(out).toBe("PluginSuggestedError");
    });
    expect(performed.lore).toBe(0);
    expect(suggested.acts).toEqual([{ kind: "worldInfoUpsert", entry }]);
  });

  test("imagery.generatePicture stashes the ask and spends nothing (the SPEND class RULED F4 most wants asked)", async () => {
    const { bridge, suggested, performed } = fakeBridge();
    await withHost(["imagery.generate"], false, bridge, async (ctx) => {
      const out = await runAsync(
        ctx,
        `(async () => { try { await host.imagery.generatePicture(${JSON.stringify(TOKEN)}, { mode: 'free' }); return 'REACHED' } catch (e) { return e.name } })()`,
      );
      expect(out).toBe("PluginSuggestedError");
    });
    expect(performed.pictures).toBe(0);
    expect(suggested.acts.map((a) => a.kind)).toEqual(["generatePicture"]);
  });

  test("the two DELIBERATE non-suggestible arms stay flat refusals and raise NOTHING", async () => {
    // `chat.variables.write` — a variable delta is not a human-weighable act ("set tension to 5?") and is the
    // highest-frequency write in the set, so posture 2 there is an attention flood, not a consent surface.
    // `chat.quick_reply` — chips are TRANSIENT and their whole value is immediacy; a card the host reads and
    // then approves so the text can appear as a chip has already shown them the text.
    // Both refuse, both raise no ask — and the ABSENCE is the assertion (a half-migration here would look
    // like a feature).
    const { bridge, suggested, writes, performed } = fakeBridge();
    await withHost(["chat.variables.write", "chat.quick_reply"], false, bridge, async (ctx) => {
      const vars = await runAsync(
        ctx,
        `(async () => { try { await host.chat.applyVariableOps(${JSON.stringify(TOKEN)}, []); return 'REACHED' } catch (e) { return e.name + ':' + e.message } })()`,
      );
      expect(vars).toContain("requires host authority");
      expect(vars).not.toContain("PluginSuggestedError");
      const chips = await runAsync(
        ctx,
        `(async () => { try { await host.chat.surfaceQuickReply(${JSON.stringify(TOKEN)}, []); return 'REACHED' } catch (e) { return e.name + ':' + e.message } })()`,
      );
      expect(chips).toContain("requires host authority");
    });
    expect(suggested.acts).toEqual([]);
    expect(writes.count).toBe(0);
    expect(performed.chips).toBe(0);
  });

  test("WITH standing authority nothing is stashed — the act just happens (posture 1 is untouched)", async () => {
    const { bridge, suggested, performed } = fakeBridge();
    await withHost(["turn.trigger"], true, bridge, async (ctx) => {
      const out = await runAsync(ctx, `(async () => { await host.chat.requestTurn(${JSON.stringify(TOKEN)}); return 'ok' })()`);
      expect(out).toBe("ok");
    });
    expect(performed.turns).toBe(1);
    expect(suggested.acts).toEqual([]);
  });

  test("WITHOUT the grant it is still the capability refusal — posture 2 never substitutes for a missing grant", async () => {
    // The order matters and is the point: an ungranted call must not become an ask. Otherwise a plugin could
    // put a card in front of a host for a permission its owner explicitly declined to give it.
    const { bridge, suggested } = fakeBridge();
    await withHost([], false, bridge, async (ctx) => {
      const out = await runAsync(
        ctx,
        `(async () => { try { await host.chat.requestTurn(${JSON.stringify(TOKEN)}); return 'REACHED' } catch (e) { return e.name } })()`,
      );
      expect(out).toBe("PluginCapabilityError");
    });
    expect(suggested.acts).toEqual([]);
  });

  test("a FORGED handle is still a handle refusal — an ask is never raised for a chat the guest is not in", async () => {
    const { bridge, suggested } = fakeBridge();
    await withHost(["turn.trigger"], false, bridge, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { try { await host.chat.requestTurn('forged-token'); return 'REACHED' } catch (e) { return 'caught:' + e.message } })()",
      );
      expect(out).toContain("invalid chat handle");
    });
    expect(suggested.acts).toEqual([]);
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

describe("host.ui — declarative surface registration + state publish (plugin-ui-plane #679 U1)", () => {
  const uiGrants: readonly PluginCapability[] = ["ui.surface"];

  test("host.ui.register collects a VALIDATED surface (id/anchor/title/tier/spec) + keeps the onAction handle", async () => {
    const collected: { meta: unknown; hasAction: boolean }[] = [];
    const { bridge } = fakeBridge();
    const runtime = makeRuntime(uiGrants, false, bridge, {
      collectSurface: (meta, onAction) => {
        collected.push({ meta, hasAction: onAction !== null });
        // Ownership of the guest handle TRANSFERS to collectSurface (the real Sandbox keeps it in `handlers`
        // for the action round-trip + disposes at teardown). This test keeps no resident, so it disposes here —
        // an un-disposed guest handle at `ctx.dispose()` aborts the shared WASM runtime (`list_empty`).
        onAction?.dispose();
      },
    });
    await withRuntime(runtime, (ctx) => {
      const res = ctx.evalCode(
        `host.ui.register({ id: "affinity_panel", anchor: "settings", title: "Affinity", tier: "static", spec: { kind: "stack", children: [{ kind: "text", value: "hi" }] }, onAction: () => {} }); "ok"`,
      );
      if (res.error) {
        throw new Error(readString(ctx, res.error));
      }
      res.value.dispose();
    });
    expect(collected).toHaveLength(1);
    expect(collected[0]?.meta).toEqual({
      id: "affinity_panel",
      anchor: "settings",
      title: "Affinity",
      tier: "static",
      spec: { kind: "stack", children: [{ kind: "text", value: "hi" }] },
    });
    // The guest function handle transferred to the Sandbox (kept for the action round-trip).
    expect(collected[0]?.hasAction).toBe(true);
  });

  test("an INVALID surface spec is a SOFT refusal — logged + skipped, NEVER activation-fatal (§4.9)", async () => {
    const collected: unknown[] = [];
    const warned: string[] = [];
    const { bridge } = fakeBridge();
    const runtime = makeRuntime(uiGrants, false, bridge, { collectSurface: (meta) => collected.push(meta), logWarn: (msg) => warned.push(msg) });
    await withRuntime(runtime, (ctx) => {
      // `iframe` is not a node kind — the spec fails zod. `register` must return WITHOUT throwing so the
      // activation that also registered this plugin's tools/events survives (a stale panel is not fatal).
      const res = ctx.evalCode(
        `let threw = false; try { host.ui.register({ id: "bad", anchor: "settings", title: "Bad", tier: "static", spec: { kind: "iframe" } }); } catch { threw = true; } threw ? "threw" : "survived"`,
      );
      if (res.error) {
        throw new Error(readString(ctx, res.error));
      }
      expect(ctx.getString(res.value)).toBe("survived");
      res.value.dispose();
    });
    expect(collected).toHaveLength(0); // surface absent
    expect(warned).toHaveLength(1); // logged
  });

  test("host.ui.setState publishes the whole state through the bridge (the domain writes + emits)", async () => {
    const { bridge, performed } = fakeBridge();
    const runtime = makeRuntime(uiGrants, false, bridge);
    await withRuntime(runtime, async (ctx) => {
      const out = await runAsync(ctx, `(async () => { await host.ui.setState("affinity_panel", { affinity: 7, mood: "warm" }); return "done"; })()`);
      expect(out).toBe("done");
    });
    // No room arg ⇒ the plugin-wide row every room shares (`chatId: null`), the U1 shape unchanged.
    expect(performed.uiSetState).toEqual([{ surfaceId: "affinity_panel", state: { affinity: 7, mood: "warm" }, chatId: null }]);
  });

  test("host.ui.setState WITH the ADMITTED chat handle resolves the room and carries it to the bridge", async () => {
    // The room dimension (row 777): a PRESENT handle must be the admitted invocation's opaque token, resolved by
    // the SAME `resolveChat` every room-scoped host fn uses. Passing the live token routes the write to that
    // chat's row — proving an admitted handle reaches the bridge with its `chatId`, not a silent plugin-wide write.
    const { bridge, performed } = fakeBridge();
    const runtime = makeRuntime(uiGrants, false, bridge);
    await withRuntime(runtime, async (ctx) => {
      const out = await runAsync(ctx, `host.ui.setState("affinity_panel", { affinity: 3 }, "${TOKEN}").then(() => "done", (e) => "caught:" + e.message)`);
      expect(out).toBe("done");
    });
    expect(performed.uiSetState).toEqual([{ surfaceId: "affinity_panel", state: { affinity: 3 }, chatId: CHAT }]);
  });

  test("host.ui.setState with a FORGED chat handle is refused at resolution — the bridge is never reached", async () => {
    // A forged/stale/out-of-scope token throws at `resolveChat` (→ guest promise reject) BEFORE the bridge op, so
    // a guest cannot publish into a room this invocation was never admitted to. The deliberate NON-coercion of a
    // bad handle to "no chat" is what stops a typo'd handle becoming a silent cross-room write to the shared row.
    const { bridge, performed } = fakeBridge();
    const runtime = makeRuntime(uiGrants, false, bridge);
    await withRuntime(runtime, async (ctx) => {
      const out = await runAsync(
        ctx,
        `host.ui.setState("affinity_panel", { affinity: 3 }, "forged-handle").then(() => "reached", (e) => "caught:" + e.message)`,
      );
      expect(out).not.toContain("reached");
      expect(out).toContain("invalid chat handle");
    });
    expect(performed.uiSetState).toEqual([]); // nothing crossed to the bridge
  });

  test("a DEEP surface spec is a SOFT refusal — activation SURVIVES, surface skipped, a sibling tool still registers (§4.9)", async () => {
    // RED-FIRST (2026-08-25, #707 Finding A, against unmodified source): the spec schema is a `z.lazy`
    // discriminated union that recurses to FULL input depth; the depth/node/byte caps run in a `superRefine`
    // AFTER that base parse. A ~2000+-deep tree (built iteratively in the guest, well within the 32 MiB heap)
    // makes `pluginSurfaceRegistrationMetaSchema.safeParse` THROW a `RangeError` — which `safeParse` does NOT
    // catch (it only wraps `ZodError`). The throw escapes `ui.register`, so the guest's `main` dies and the
    // whole activation goes `ok:false`, defeating the §4.9 SOFT refusal (skip the panel, keep tools/events
    // alive). The `ctx.dump` that materializes the tree also recurses host-side before zod runs. The fix: an
    // iterative pre-walk enforces the caps before the recursive parse, and a try/catch belt turns ANY throw
    // into the soft refusal.
    const collected: unknown[] = [];
    const tools: string[] = [];
    const warned: string[] = [];
    const { bridge } = fakeBridge();
    const runtime: MembraneRuntime = {
      ...makeRuntime([...uiGrants, "tools.register"], false, bridge, {
        collectSurface: (meta) => collected.push(meta),
        logWarn: (msg) => warned.push(msg),
      }),
      collectTool: (reg, handler): void => {
        tools.push(reg.name);
        handler.dispose(); // this test keeps no resident
      },
    };
    await withRuntime(runtime, (ctx) => {
      const res = ctx.evalCode(
        `let spec = { kind: "text", value: "leaf" };
         for (let i = 0; i < 3000; i++) { spec = { kind: "stack", children: [spec] }; }
         host.tools.register({ name: "sibling", description: "d", parameters: {}, handler: () => {} });
         let outcome = "survived";
         try { host.ui.register({ id: "deep", anchor: "settings", title: "Deep", tier: "static", spec }); }
         catch (e) { outcome = "threw:" + (e && e.name); }
         outcome`,
      );
      if (res.error) {
        // A HOST-side throw (RangeError from dump/zod) that escaped the guest function surfaces as an eval error.
        throw new Error(`register escaped as a host throw: ${readString(ctx, res.error)}`);
      }
      expect(ctx.getString(res.value)).toBe("survived");
      res.value.dispose();
    });
    expect(tools).toEqual(["sibling"]); // the sibling tool registered — activation is intact
    expect(collected).toHaveLength(0); // the deep surface was skipped
    expect(warned).toHaveLength(1); // and logged
  });

  test("host.ui.setState REFUSES a surfaceId that is not a valid surface id — the bridge is never reached (#707 Finding B)", async () => {
    // RED-FIRST (2026-08-25, against unmodified source): the membrane checked only `typeof surfaceId === "string"`,
    // so an arbitrary string (uppercase, spaces, unbounded length) reached the domain op and became a fresh
    // state-plane key — the raw material of the unbounded-key DoS. The surfaceId is a bounded programmatic id
    // (`PLUGIN_SURFACE_ID_RE`, the same grammar `ui.register` validates); the membrane is the trust boundary.
    const { bridge, performed } = fakeBridge();
    const runtime = makeRuntime(uiGrants, false, bridge);
    await withRuntime(runtime, async (ctx) => {
      const out = await runAsync(ctx, `host.ui.setState("Bad Id!", { a: 1 }).then(() => "reached", (e) => "caught:" + e.message)`);
      expect(out).not.toContain("reached");
      expect(out).toContain("surfaceId");
    });
    expect(performed.uiSetState).toEqual([]); // nothing reached the bridge → no state-plane key was minted
  });

  test("host.ui.register / host.ui.setState are gated by the ui.surface capability", async () => {
    const { bridge, performed } = fakeBridge();
    const runtime = makeRuntime([], false, bridge); // NO ui.surface grant
    await withRuntime(runtime, async (ctx) => {
      const registerName = ctx.evalCode(
        `let name = ""; try { host.ui.register({ id: "x", anchor: "settings", title: "X", tier: "static" }); } catch (e) { name = e.name; } name`,
      );
      if (registerName.error) {
        throw new Error(readString(ctx, registerName.error));
      }
      expect(ctx.getString(registerName.value)).toBe("PluginCapabilityError");
      registerName.value.dispose();
      // setState too — the async arm rejects with the same typed error, and nothing reaches the bridge.
      const setStateName = await runAsync(ctx, `host.ui.setState("x", {}).then(() => "ok", (e) => e.name)`);
      expect(setStateName).toBe("PluginCapabilityError");
    });
    expect(performed.uiSetState).toEqual([]);
  });
});
