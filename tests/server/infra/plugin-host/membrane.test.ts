// infra/plugin-host/membrane — the capability-gated host-fn CALL surface (01 §2). `attachMembrane` is unit-
// tested directly: attach the gated namespaces onto a bare surface object in a REAL QuickJS context (no full
// Sandbox/port) and drive guest code against them. Pins the three enforcement mechanisms this file owns: the
// guest-readable grant set (feature-detection), the capability gate (an ungranted namespace call throws
// uniformly), and the opaque-handle resolution (a forged/stale chat handle fails resolution — no wrong-chat
// read). It also owns the IN-FLIGHT ACCOUNTING pin (P2-G) — the counter is only inspectable where the runtime is
// hand-built, i.e. here; the cross-invocation half of that invariant is the escape suite's (it needs a Sandbox).
// The full end-to-end runtime lives in port.test.ts; this is the module's own-seam mirror.

import type { VariableWriteResult } from "@orb/contracts/chat";
import type {
  InvocationChat,
  PluginBridge,
  PluginCapability,
  PluginCommandRegistrationMeta,
  PluginQuietOptions,
  PluginSuggestedAct,
  PluginToastLevel,
} from "@orb/contracts/plugin";
import { PLUGIN_CAPABILITIES, PLUGIN_FRAME_HTML_MAX_CHARS, PLUGIN_FRAME_SURFACES_MAX } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import { getPluginQuickJS, HOST_FN_DEADLINE_MS } from "@orb/server/infra/plugin-host";
import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten-core";
import { describe } from "vitest";
import { __setEgressResolverForTest } from "../../../../packages/server/src/infra/network/egress.ts";
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
  llm: { prompts: string[]; opts: (PluginQuietOptions | undefined)[] };
  egress: { count: number };
  // #801 — the SPLIT `net.fetchAsset` belt's own counter, so a test can pin WHICH belt a call claimed
  // (fetchAsset on the asset belt and NOT the fetch belt, and vice versa — both directions).
  assetEgress: { count: number };
  suggested: { acts: PluginSuggestedAct[] };
  performed: {
    turns: number;
    lore: number;
    pictures: number;
    chips: number;
    uiSetState: { surfaceId: string; state: Record<string, unknown>; chatId: ChatId | null }[];
    uiToasts: { level: PluginToastLevel; message: string }[];
    uiDialogs: string[];
    databankIngests: { name: string; text: string }[];
    characterIngests: Record<string, unknown>[];
    // #798 — the bytes + sniffed mime the membrane handed the CAS-write op, and the assetIds it handed
    // `character.ingestAsset`. Recorded so a test proves what crossed the infra→domain seam (never the guest).
    fetchedAssets: { bytes: Uint8Array; mime: string }[];
    ingestedAssets: string[];
    // @foreign-id-ok(characterId): the fake bridge records the guest's untrusted wire string verbatim (the PluginBridge.character.setCardData param is a bare `string` under the same marker); branding it would diverge from the interface it mirrors.
    cardDataWrites: { characterId: string; data: Record<string, unknown> }[];
    cardDataReads: string[];
    pubsubEmits: { name: string; data: Record<string, unknown> }[];
  };
} {
  const writes = { count: 0 };
  const uiSetState: { surfaceId: string; state: Record<string, unknown>; chatId: ChatId | null }[] = [];
  const uiToasts: { level: PluginToastLevel; message: string }[] = [];
  const uiDialogs: string[] = [];
  const databankIngests: { name: string; text: string }[] = [];
  const characterIngests: Record<string, unknown>[] = [];
  const fetchedAssets: { bytes: Uint8Array; mime: string }[] = [];
  const ingestedAssets: string[] = [];
  // @foreign-id-ok(characterId): the fake bridge records the guest's untrusted wire string verbatim (the PluginBridge.character.setCardData param is a bare `string` under the same marker); branding it would diverge from the interface it mirrors.
  const cardDataWrites: { characterId: string; data: Record<string, unknown> }[] = [];
  const cardDataReads: string[] = [];
  const pubsubEmits: { name: string; data: Record<string, unknown> }[] = [];
  const performed = {
    turns: 0,
    lore: 0,
    pictures: 0,
    chips: 0,
    uiSetState,
    uiToasts,
    uiDialogs,
    databankIngests,
    characterIngests,
    fetchedAssets,
    ingestedAssets,
    cardDataWrites,
    cardDataReads,
    pubsubEmits,
  };
  const llm: { prompts: string[]; opts: (PluginQuietOptions | undefined)[] } = { prompts: [], opts: [] };
  const egress = { count: 0 };
  const assetEgress = { count: 0 };
  const suggested: { acts: PluginSuggestedAct[] } = { acts: [] };
  const bridge: PluginBridge = {
    llm: {
      quiet: (prompt, quietOpts) => {
        llm.prompts.push(prompt);
        llm.opts.push(quietOpts);
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
    // #801 — the split asset belt: its own counter, sharing the scripted refusal (a floor is a floor).
    admitAssetEgress: (): void => {
      assetEgress.count += 1;
      if (opts.egressRefusal !== undefined) {
        throw new Error(opts.egressRefusal);
      }
    },
    chat: {
      listMessages: () => Promise.resolve([]),
      getVariables: () => Promise.resolve({ tension: "4" }),
      // #788 F11 — a canned roster so the gate + forward path is observable; a `null` avatar keeps it minimal.
      listCharacters: () => Promise.resolve([{ id: "char_seat0000000000000000000", name: "Seat", avatarAssetId: null }]),
      applyVariableOps: () => {
        writes.count += 1;
        return Promise.resolve({ outcome: "applied" });
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
      // #788 F12 — canned reads so the gate + forward path is observable.
      listBooks: () => Promise.resolve([{ id: "wbook_read00000000000000000", name: "Room Lore" }]),
      listEntries: () => Promise.resolve([{ id: "wentry_read0000000000000000", keys: ["k"], content: "lore", enabled: true }]),
    },
    imagery: {
      generatePicture: () => {
        performed.pictures += 1;
        return Promise.resolve({ assetId: "asset_x0000000000000000000000" });
      },
    },
    variables: { get: () => Promise.resolve(null), set: () => Promise.resolve(), delete: () => Promise.resolve() },
    // #788 seam-11 — a canned owned-asset read so the gate + forward path is observable. #798 storeFetched
    // records the bytes + sniffed mime the membrane handed down (never the guest), returning a canned assetId.
    assets: {
      read: () => Promise.resolve({ mime: "image/png", sizeBytes: 3, dataBase64: "AAAA" }),
      storeFetched: (bytes, mime) => {
        performed.fetchedAssets.push({ bytes, mime });
        return Promise.resolve({ assetId: "asset_fetched000000000000000" });
      },
    },
    // #788 F1 — a canned search hit so the gate + forward path is observable.
    search: { documents: () => Promise.resolve([{ documentId: "doc_hit000000000000000000000", documentName: "Notes", content: "match", score: 0.9 }]) },
    storage: {
      get: () => Promise.resolve(null),
      set: () => Promise.resolve(),
      compareAndSet: () => Promise.resolve({ applied: true, current: null }),
      delete: () => Promise.resolve(),
      list: () => Promise.resolve([]),
    },
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
      // The U5 host-mediated affordances (§4.5a). Recorded, not inert: the membrane's job here is the LEVEL
      // resolve (an unrecognised level degrades to the quietest arm) and the surfaceId grammar, and neither is
      // observable without capturing what crossed.
      toast: (level, message) => {
        performed.uiToasts.push({ level, message });
        return Promise.resolve();
      },
      openDialog: (surfaceId) => {
        performed.uiDialogs.push(surfaceId);
        return Promise.resolve();
      },
    },
    // U8 canon-write ops — recorded so a test can prove the membrane forwarded the validated payload (and, by
    // its absence, that an ungranted call never reaches the bridge at all).
    databank: {
      ingest: (doc) => {
        performed.databankIngests.push(doc);
        return Promise.resolve({ documentId: `doc_${performed.databankIngests.length}` });
      },
    },
    character: {
      ingest: (card) => {
        performed.characterIngests.push(card);
        return Promise.resolve({ characterId: `char_${performed.characterIngests.length}`, created: true });
      },
      // #798 — records the assetId the membrane forwarded to `ingestAsset` (and, by its absence, that an
      // ungranted call never reaches the bridge). Returns a canned freshly-created result.
      ingestAsset: (assetId) => {
        performed.ingestedAssets.push(assetId);
        return Promise.resolve({ characterId: `char_asset_${performed.ingestedAssets.length}`, created: true });
      },
      // D148 per-card state — recorded so a test can prove the membrane forwarded the validated payload (and, by
      // its absence, that an ungranted call never reaches the bridge). `getCardData` returns a canned blob so the
      // read-forward path is observable.
      setCardData: (characterId, data) => {
        performed.cardDataWrites.push({ characterId, data });
        return Promise.resolve();
      },
      getCardData: (characterId) => {
        performed.cardDataReads.push(characterId);
        return Promise.resolve({ echoed: characterId });
      },
    },
    pubsub: {
      emit: (name, data) => {
        performed.pubsubEmits.push({ name, data });
        return Promise.resolve();
      },
    },
  };
  return { bridge, writes, llm, egress, assetEgress, suggested, performed };
}

/** Optional membrane wiring the net.fetch / transforms / events seams need (default: no hosts, noop collect). */
interface RuntimeExtras {
  readonly netHosts?: readonly string[];
  readonly collectTool?: MembraneRuntime["collectTool"];
  readonly collectTransform?: MembraneRuntime["collectTransform"];
  readonly collectEvent?: MembraneRuntime["collectEvent"];
  readonly collectPubsub?: MembraneRuntime["collectPubsub"];
  readonly collectSurface?: MembraneRuntime["collectSurface"];
  readonly collectCommand?: MembraneRuntime["collectCommand"];
  readonly collectDisplayTransform?: MembraneRuntime["collectDisplayTransform"];
  readonly collectMacro?: MembraneRuntime["collectMacro"];
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
    collectPubsub: extra.collectPubsub ?? ((): void => undefined),
    collectSurface: extra.collectSurface ?? ((): void => undefined),
    collectCommand: extra.collectCommand ?? ((): void => undefined),
    collectDisplayTransform: extra.collectDisplayTransform ?? ((): void => undefined),
    collectMacro: extra.collectMacro ?? ((): void => undefined),
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

describe("attachMembrane — #788 READ gaps are gated on the CORRECT capability (a mis-wired ref would leak)", () => {
  // Grant EVERY capability except the one under test: the strongest wrong-ref proof. `requireCapability` keys the
  // gate on `HOST_FUNCTION_CAPABILITY[ref]`, so a handler wired to the WRONG (but valid) ref would gate on some
  // OTHER capability — which this all-but-target grant HOLDS — and the call would slip through. A rejection here
  // means the handler names its own capability and nothing else opens the door.
  const allBut = (cap: string): readonly PluginCapability[] => PLUGIN_CAPABILITIES.filter((c) => c !== cap);

  test("assets.read WITHOUT assets.read (but WITH every other grant) is refused — the gate keys on assets.read alone", async () => {
    const { bridge } = fakeBridge();
    await withHost(allBut("assets.read"), true, bridge, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { try { await host.assets.read('asset_x0000000000000000000000'); return 'NO-THROW' } catch (e) { return e.name } })()",
      );
      expect(out).toBe("PluginCapabilityError");
    });
  });

  test("assets.read WITH the grant reads the installer's own asset (mime forwarded from the bridge)", async () => {
    const { bridge } = fakeBridge();
    await withHost(["assets.read"], false, bridge, async (ctx) => {
      const out = await runAsync(ctx, "(async () => (await host.assets.read('asset_x0000000000000000000000')).mime)()");
      expect(out).toBe("image/png");
    });
  });

  test("chat.listCharacters WITHOUT chat.read is refused (the same grant its sibling reads ride)", async () => {
    const { bridge } = fakeBridge();
    await withHost(allBut("chat.read"), true, bridge, async (ctx) => {
      const out = await runAsync(ctx, "(async () => { try { await host.chat.listCharacters('any'); return 'NO-THROW' } catch (e) { return e.name } })()");
      expect(out).toBe("PluginCapabilityError");
    });
  });

  test("chat.listCharacters WITH chat.read returns the invocation chat's roster", async () => {
    const { bridge } = fakeBridge();
    await withHost(["chat.read"], false, bridge, async (ctx) => {
      const out = await runAsync(ctx, "(async () => String((await host.chat.listCharacters(host.chat.current())).length))()");
      expect(out).toBe("1");
    });
  });

  test("worldInfo.listBooks / listEntries WITHOUT worldinfo.read are refused — the read half is its OWN grant", async () => {
    const { bridge } = fakeBridge();
    await withHost(allBut("worldinfo.read"), true, bridge, async (ctx) => {
      const books = await runAsync(ctx, "(async () => { try { await host.worldInfo.listBooks('any'); return 'NO-THROW' } catch (e) { return e.name } })()");
      expect(books).toBe("PluginCapabilityError");
      const entries = await runAsync(
        ctx,
        "(async () => { try { await host.worldInfo.listEntries('any', 'wbook_x'); return 'NO-THROW' } catch (e) { return e.name } })()",
      );
      expect(entries).toBe("PluginCapabilityError");
    });
  });

  test("worldInfo.listBooks / listEntries WITH worldinfo.read read the room's attached lore", async () => {
    const { bridge } = fakeBridge();
    await withHost(["chat.read", "worldinfo.read"], false, bridge, async (ctx) => {
      const books = await runAsync(ctx, "(async () => String((await host.worldInfo.listBooks(host.chat.current())).length))()");
      expect(books).toBe("1");
      const entries = await runAsync(
        ctx,
        "(async () => String((await host.worldInfo.listEntries(host.chat.current(), 'wbook_read00000000000000000')).length))()",
      );
      expect(entries).toBe("1");
    });
  });

  test("search.documents WITHOUT search.query (but WITH every other grant) is refused — the gate keys on search.query alone", async () => {
    const { bridge } = fakeBridge();
    await withHost(allBut("search.query"), true, bridge, async (ctx) => {
      const out = await runAsync(ctx, "(async () => { try { await host.search.documents('dragons'); return 'NO-THROW' } catch (e) { return e.name } })()");
      expect(out).toBe("PluginCapabilityError");
    });
  });

  test("search.documents WITH the grant searches the installer's own corpus (no chat scope required)", async () => {
    const { bridge } = fakeBridge();
    await withHost(["search.query"], false, bridge, async (ctx) => {
      const out = await runAsync(ctx, "(async () => String((await host.search.documents('dragons')).length))()");
      expect(out).toBe("1");
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

// ── The variable-write COMPARE-AND-SET across the membrane (#1555) ───────────────────────────────────────
// The guard is only worth anything if the guest's preconditions reach the domain UNCHANGED and the refusal
// comes back as a VALUE. A throw would be catastrophic in the other direction: three uncaught crashes
// auto-disable a plugin, so losing a contended write — the NORMAL outcome — would eventually uninstall a
// correct plugin for behaving correctly.
describe("attachMembrane — chat.applyVariableOps preconditions", () => {
  /** A bridge whose variable write records what it was handed and answers a fixed result. */
  function casBridge(result: VariableWriteResult): { bridge: PluginBridge; seen: { expect: unknown } } {
    const fake = fakeBridge();
    const seen: { expect: unknown } = { expect: "NEVER CALLED" };
    const bridge: PluginBridge = {
      ...fake.bridge,
      chat: {
        ...fake.bridge.chat,
        applyVariableOps: (_chatId, _ops, beliefs): Promise<VariableWriteResult> => {
          seen.expect = beliefs;
          return Promise.resolve(result);
        },
      },
    };
    return { bridge, seen };
  }

  test("the guest's preconditions cross verbatim and a STALE refusal comes back as DATA, never a throw", async () => {
    const { bridge, seen } = casBridge({ outcome: "stale", actual: { "clock:x": "2/6" } });
    await withHost(["chat.read", "chat.variables.write"], true, bridge, async (ctx) => {
      const out = await runAsync(
        ctx,
        `(async () => {
           try {
             const r = await host.chat.applyVariableOps(host.chat.current(), [{op:'set',key:'clock:x',value:'2/6'}], [{key:'clock:x',expected:'1/6'}]);
             return r.outcome + ':' + r.actual['clock:x'];
           } catch (e) { return 'THREW:' + e.message }
         })()`,
      );
      // The guest BRANCHED on the refusal — it never entered a catch, which is the whole contract.
      expect(out).toBe("stale:2/6");
    });
    expect(seen.expect).toEqual([{ key: "clock:x", expected: "1/6" }]);
  });

  test("`expected: null` (the key is unset) survives the crossing — null is a value here, not an absence", async () => {
    const { bridge, seen } = casBridge({ outcome: "applied" });
    await withHost(["chat.read", "chat.variables.write"], true, bridge, async (ctx) => {
      const out = await runAsync(
        ctx,
        `(async () => (await host.chat.applyVariableOps(host.chat.current(), [{op:'set',key:'k',value:'v'}], [{key:'k',expected:null}])).outcome)()`,
      );
      expect(out).toBe("applied");
    });
    expect(seen.expect).toEqual([{ key: "k", expected: null }]);
  });

  test("an UNCONDITIONAL write passes NO preconditions through (undefined, never a silent empty guard)", async () => {
    const { bridge, seen } = casBridge({ outcome: "applied" });
    await withHost(["chat.read", "chat.variables.write"], true, bridge, async (ctx) => {
      await runAsync(ctx, `(async () => (await host.chat.applyVariableOps(host.chat.current(), [{op:'set',key:'k',value:'v'}])).outcome)()`);
    });
    expect(seen.expect).toBeUndefined();
  });

  test("a MALFORMED precondition is a loud refusal and the write NEVER reaches the bridge", async () => {
    const { bridge, seen } = casBridge({ outcome: "applied" });
    await withHost(["chat.read", "chat.variables.write"], true, bridge, async (ctx) => {
      const out = await runAsync(
        ctx,
        `(async () => {
           try { await host.chat.applyVariableOps(host.chat.current(), [{op:'set',key:'k',value:'v'}], [{key:'k',expected:7}]); return 'WROTE' }
           catch (e) { return 'caught:' + e.message }
         })()`,
      );
      expect(out).toContain("expect");
    });
    // THE POINT: a guard the host could not understand must not degrade into an unconditional write.
    expect(seen.expect).toBe("NEVER CALLED");
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

  // #1367 — the tool NAME is guest input and this is its trust boundary. `PLUGIN_TOOL_NAME_RE` was
  // enforced only on a `tool-card` surface's `toolName`, so `tools.register` took ANY string: an unbounded,
  // arbitrary-charset name was collected, held for the instance lifetime, and flattened into a
  // model-visible wire name (`pluginToolWireName`).
  test("tools.register REFUSES a name outside the tool-name grammar, and collects nothing", async () => {
    const { bridge } = fakeBridge();
    const collected: string[] = [];
    const runtime = makeRuntime(["tools.register"], false, bridge, {
      collectTool: (registration, handler): void => {
        collected.push(registration.name);
        handler.dispose();
      },
    });
    await withRuntime(runtime, (ctx) => {
      // Uppercase + spaces + punctuation; a leading digit; and a name past the 41-char bound.
      const attempt = (name: string): string =>
        `(() => { try { host.tools.register({ name: ${JSON.stringify(name)}, description: "d", parameters: {}, handler: () => {} }); return "collected"; }
                  catch (e) { return "caught:" + e.message; } })()`;
      const bad = ["Draw Card!", "9lives", "x".repeat(64), "draw-card", ""];
      for (const name of bad) {
        const result = ctx.evalCode(attempt(name));
        expect(readString(ctx, result.error ?? result.value)).toContain("caught:");
      }
      // …and the grammar's own spelling still registers.
      const ok = ctx.evalCode(attempt("draw_card"));
      expect(readString(ctx, ok.error ?? ok.value)).toBe("collected");
    });
    expect(collected).toEqual(["draw_card"]);
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

// A valid 1×1 transparent PNG — the magic-byte truth the image guard sniffs (never the served Content-Type).
const ONE_PX_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
/** The SAME PNG with a forged IHDR reporting 20000×20000 — a decompression bomb by PIXEL COUNT, tiny on the
 *  wire (safeFetch's byte cap can't see it; the image guard's dimension cap is what stops it). IHDR width is at
 *  bytes 16–19, height at 20–23 (8 sig + 4 len + 4 "IHDR"), big-endian. */
function bombPng(): Buffer {
  const bytes = Buffer.from(ONE_PX_PNG);
  bytes.writeUInt32BE(20_000, 16);
  bytes.writeUInt32BE(20_000, 20);
  return bytes;
}

/** Drive `host.net.fetchAsset(url)` with the DNS resolver stubbed to a PUBLIC address (so safeFetch's private-
 *  range denial passes) and the global fetch stubbed to serve `served`. Restores both after. `served` is the
 *  raw body bytes; `contentType` is what the server CLAIMS (the guard must ignore it and trust the magic bytes). */
async function withStubbedFetchAsset(
  served: Uint8Array,
  contentType: string,
  runtime: MembraneRuntime,
  fn: (ctx: QuickJSContext) => Promise<void>,
): Promise<void> {
  __setEgressResolverForTest(() => Promise.resolve(["93.184.216.34"])); // a public IP — clears the SSRF wall
  const realFetch = globalThis.fetch;
  globalThis.fetch = ((): Promise<Response> =>
    Promise.resolve(new Response(new Uint8Array(served), { status: 200, headers: { "content-type": contentType } }))) as typeof fetch;
  try {
    await withRuntime(runtime, fn);
  } finally {
    globalThis.fetch = realFetch;
    __setEgressResolverForTest(null);
  }
}

describe("attachMembrane — net.fetchAsset downloads a remote image into the installer's OWN CAS (#798)", () => {
  test("WITHOUT the net.fetch_asset grant it rejects (capability gate) — never fetches, never claims either belt, never stores", async () => {
    const { bridge, egress, assetEgress, performed } = fakeBridge();
    // Grant net.fetch (text) but NOT net.fetch_asset — the two are DISTINCT consent lines, so a text-fetch grant
    // must not reach the CAS-write arm.
    const runtime = makeRuntime(["net.fetch"], false, bridge, { netHosts: ["img.allowed.test"] });
    await withRuntime(runtime, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { try { const r = await host.net.fetchAsset('https://img.allowed.test/c.png'); return 'REACHED:' + JSON.stringify(r) } catch (e) { return 'caught:' + e.message } })()",
      );
      expect(out).not.toContain("REACHED");
      expect(out).toContain("net.fetch_asset");
    });
    expect(egress.count).toBe(0);
    expect(assetEgress.count).toBe(0);
    expect(performed.fetchedAssets).toHaveLength(0);
  });

  test("the SSRF wall: a host NOT in netHosts is refused at the allowlist before any network — the guest URL is not the wall", async () => {
    const { bridge, performed } = fakeBridge();
    const runtime = makeRuntime(["net.fetch_asset"], false, bridge, { netHosts: ["img.allowed.test"] });
    await withRuntime(runtime, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { try { await host.net.fetchAsset('https://evil.example/steal.png'); return 'REACHED' } catch (e) { return 'caught:' + e.message } })()",
      );
      expect(out).not.toContain("REACHED");
      expect(out).toContain("allowlist");
    });
    expect(performed.fetchedAssets).toHaveLength(0);
  });

  test("the SSRF wall: a loopback / metadata IP-literal target is refused (not in the hostname allowlist)", async () => {
    const { bridge } = fakeBridge();
    const runtime = makeRuntime(["net.fetch_asset"], false, bridge, { netHosts: ["img.allowed.test"] });
    await withRuntime(runtime, async (ctx) => {
      // The classic cloud-metadata SSRF target and a bare loopback — neither is an allowlisted hostname, so both
      // are refused before a socket opens (an IP literal is ALSO rejected on the non-owner-configured path).
      const out = await runAsync(
        ctx,
        "(async () => { const rs = await Promise.all([host.net.fetchAsset('https://169.254.169.254/latest/meta-data/').then(()=> 'REACHED-meta').catch(e=>'b:'+e.message), host.net.fetchAsset('https://127.0.0.1/x.png').then(()=>'REACHED-loop').catch(e=>'b:'+e.message)]); return rs.join('|') })()",
      );
      expect(out).not.toContain("REACHED");
    });
  });

  test("an EMPTY netHosts list fail-closes: every host is refused even WITH the grant", async () => {
    const { bridge } = fakeBridge();
    const runtime = makeRuntime(["net.fetch_asset"], false, bridge, { netHosts: [] });
    await withRuntime(runtime, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { try { await host.net.fetchAsset('https://img.allowed.test/c.png'); return 'REACHED' } catch (e) { return 'caught:' + e.message } })()",
      );
      expect(out).not.toContain("REACHED");
      expect(out).toContain("allowlist");
    });
  });

  test("the HAPPY PATH: an allowlisted PNG is fetched, guarded, stored, and only an assetId (never bytes, never a URL) crosses to the guest", async () => {
    const { bridge, egress, assetEgress, performed } = fakeBridge();
    const runtime = makeRuntime(["net.fetch_asset"], false, bridge, { netHosts: ["img.allowed.test"] });
    await withStubbedFetchAsset(ONE_PX_PNG, "image/png", runtime, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { const r = await host.net.fetchAsset('https://img.allowed.test/cover.png'); return JSON.stringify({ keys: Object.keys(r), assetId: r.assetId }) })()",
      );
      // @foreign-id-ok(assetId): the guest-returned wire DTO shape asserted verbatim — the membrane hands this back as inert text, never branded; branding it would diverge from the `PluginHostV1.net.fetchAsset` return it mirrors.
      const parsed = JSON.parse(out) as { keys: string[]; assetId: string };
      // The guest received EXACTLY one property, the asset id — no bytes, no url, no mime.
      expect(parsed.keys).toEqual(["assetId"]);
      expect(parsed.assetId).toBe("asset_fetched000000000000000");
    });
    // The ASSET belt was claimed — and NOT the `net.fetch` belt (#801's split, pinned in BOTH directions
    // beside the net.fetch tests that claim `egress` and never `assetEgress`) — and the DOMAIN got the
    // validated bytes + the SNIFFED mime (image/png), never the guest — the bytes crossed the infra→domain
    // seam only.
    expect(assetEgress.count).toBe(1);
    expect(egress.count).toBe(0);
    expect(performed.fetchedAssets).toHaveLength(1);
    expect(performed.fetchedAssets[0]?.mime).toBe("image/png");
    expect(performed.fetchedAssets[0]?.bytes.byteLength).toBe(ONE_PX_PNG.byteLength);
  });

  test("the image guard uses MAGIC BYTES, not the Content-Type: an HTML error page served as image/png is refused and NOT stored", async () => {
    const { bridge, performed } = fakeBridge();
    const runtime = makeRuntime(["net.fetch_asset"], false, bridge, { netHosts: ["img.allowed.test"] });
    const html = new TextEncoder().encode("<!doctype html><title>404</title>");
    await withStubbedFetchAsset(html, "image/png", runtime, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { try { await host.net.fetchAsset('https://img.allowed.test/notreally.png'); return 'REACHED' } catch (e) { return 'caught:' + e.message } })()",
      );
      expect(out).not.toContain("REACHED");
      expect(out).toContain("caught");
    });
    // The guard rejected before any CAS write — a lying Content-Type cannot smuggle non-image bytes into storage.
    expect(performed.fetchedAssets).toHaveLength(0);
  });

  test("the decompression-bomb dimension cap: a tiny PNG whose header declares 20000×20000 is refused and NOT stored", async () => {
    const { bridge, performed } = fakeBridge();
    const runtime = makeRuntime(["net.fetch_asset"], false, bridge, { netHosts: ["img.allowed.test"] });
    await withStubbedFetchAsset(bombPng(), "image/png", runtime, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { try { await host.net.fetchAsset('https://img.allowed.test/bomb.png'); return 'REACHED' } catch (e) { return 'caught:' + e.message } })()",
      );
      expect(out).not.toContain("REACHED");
    });
    expect(performed.fetchedAssets).toHaveLength(0);
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
    const { bridge, egress, assetEgress } = fakeBridge({ egressRefusal: "plugin host: net.fetch is limited to 120 calls per hour for this plugin" });
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
      // #801's split, the other direction: a `net.fetch` claim never touches the asset belt.
      expect(assetEgress.count).toBe(0);
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

  test("a tool-card surface carries its `toolName` through — and one WITHOUT it is the same soft refusal (#679 U3)", async () => {
    const collected: unknown[] = [];
    const warned: string[] = [];
    const { bridge } = fakeBridge();
    const runtime = makeRuntime(uiGrants, false, bridge, { collectSurface: (meta) => collected.push(meta), logWarn: (msg) => warned.push(msg) });
    await withRuntime(runtime, (ctx) => {
      const card = `anchor: "tool-card", title: "Draw", tier: "static", spec: { kind: "text", value: "drawn" }`;
      // The linkage names the plugin's OWN tool name; the host derives the model-visible one. A card with no
      // linkage is unreachable — no tool call could ever match it — so it is refused at the SAME soft tier as
      // a bad spec: absent + logged, and the tools this activation also registered survive.
      const res = ctx.evalCode(
        `host.ui.register({ id: "draw_card", ${card}, toolName: "draw" });
         let threw = false;
         try { host.ui.register({ id: "orphan_card", ${card} }); } catch { threw = true; }
         threw ? "threw" : "survived"`,
      );
      if (res.error) {
        throw new Error(readString(ctx, res.error));
      }
      expect(ctx.getString(res.value)).toBe("survived");
      res.value.dispose();
    });
    expect(collected).toEqual([
      { id: "draw_card", anchor: "tool-card", title: "Draw", tier: "static", spec: { kind: "text", value: "drawn" }, toolName: "draw" },
    ]);
    expect(warned).toHaveLength(1);
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

  // ── U5: the command collector + the two HOST-MEDIATED affordances (§4.5/§4.5a) ──────────────────────────

  test("host.ui.registerCommand collects a VALIDATED command and keeps the onRun handle", async () => {
    const { bridge } = fakeBridge();
    const collected: { name: string; describe: string }[] = [];
    const runtime = makeRuntime(uiGrants, false, bridge, {
      collectCommand: (meta, onRun): void => {
        collected.push({ name: meta.name, describe: meta.describe });
        onRun.dispose();
      },
    });
    await withRuntime(runtime, (ctx) => {
      const out = ctx.evalCode(`host.ui.registerCommand({ name: "draw", describe: "Draw a card", onRun: async () => {} }); "ok"`);
      if (out.error) {
        throw new Error(readString(ctx, out.error));
      }
      out.value.dispose();
    });
    expect(collected).toEqual([{ name: "draw", describe: "Draw a card" }]);
  });

  test("#791: host.ui.registerCommand parses the DECLARED typed args off the def", async () => {
    const { bridge } = fakeBridge();
    const collected: PluginCommandRegistrationMeta[] = [];
    const runtime = makeRuntime(uiGrants, false, bridge, {
      collectCommand: (meta, onRun): void => {
        collected.push(meta);
        onRun.dispose();
      },
    });
    await withRuntime(runtime, (ctx) => {
      const out = ctx.evalCode(
        `host.ui.registerCommand({
           name: "cast", describe: "Cast a spell",
           args: [{ name: "suit", type: "enum", required: true, enumValues: ["cups", "wands"] }, { name: "count", type: "number" }],
           onRun: () => {},
         }); "ok"`,
      );
      if (out.error) {
        throw new Error(readString(ctx, out.error));
      }
      out.value.dispose();
    });
    expect(collected).toEqual([
      {
        name: "cast",
        describe: "Cast a spell",
        args: [
          { name: "suit", type: "enum", required: true, enumValues: ["cups", "wands"] },
          { name: "count", type: "number" },
        ],
      },
    ]);
  });

  test("#791: an enum arg missing its enumValues is a SOFT refusal (the biconditional), never activation-fatal", async () => {
    const { bridge } = fakeBridge();
    const collected: string[] = [];
    const warnings: string[] = [];
    const runtime = makeRuntime(uiGrants, false, bridge, {
      collectCommand: (meta, onRun): void => {
        collected.push(meta.name);
        onRun.dispose();
      },
      logWarn: (message): void => {
        warnings.push(message);
      },
    });
    await withRuntime(runtime, (ctx) => {
      const out = ctx.evalCode(
        `host.ui.registerCommand({ name: "bad", describe: "x", args: [{ name: "suit", type: "enum" }], onRun: () => {} });
         host.ui.registerCommand({ name: "good", describe: "x", args: [{ name: "n", type: "number" }], onRun: () => {} });
         "survived"`,
      );
      if (out.error) {
        throw new Error(readString(ctx, out.error));
      }
      expect(ctx.getString(out.value)).toBe("survived");
      out.value.dispose();
    });
    expect(collected).toEqual(["good"]);
    expect(warnings).toHaveLength(1);
  });

  test("a malformed command is a SOFT refusal — logged and skipped, never activation-fatal (§4.9)", async () => {
    const { bridge } = fakeBridge();
    const collected: string[] = [];
    const warnings: string[] = [];
    const runtime = makeRuntime(uiGrants, false, bridge, {
      collectCommand: (meta, onRun): void => {
        collected.push(meta.name);
        onRun.dispose();
      },
      logWarn: (message): void => {
        warnings.push(message);
      },
    });
    await withRuntime(runtime, (ctx) => {
      // A display-name `name` (not the ident grammar), an empty `describe`, and a non-function `onRun` — three
      // separate refusals. The last is the one that MATTERS: a command with nothing to run is a dead menu row,
      // which is worse than an absent one, so it is refused rather than collected as display-only.
      const out = ctx.evalCode(
        `host.ui.registerCommand({ name: "Draw Card", describe: "x", onRun: () => {} });
         host.ui.registerCommand({ name: "ok_one", describe: "", onRun: () => {} });
         host.ui.registerCommand({ name: "ok_two", describe: "fine", onRun: "not a function" });
         host.ui.registerCommand({ name: "good", describe: "fine", onRun: () => {} });
         "survived"`,
      );
      if (out.error) {
        throw new Error(readString(ctx, out.error));
      }
      // The activation SURVIVED all three refusals — a stale command must not kill the tools beside it.
      expect(ctx.getString(out.value)).toBe("survived");
      out.value.dispose();
    });
    expect(collected).toEqual(["good"]);
    expect(warnings).toHaveLength(3);
  });

  test("host.ui.toast resolves the LEVEL against the closed house tuple — an unknown level degrades to the quietest arm", async () => {
    const { bridge, performed } = fakeBridge();
    const runtime = makeRuntime(uiGrants, false, bridge);
    await withRuntime(runtime, async (ctx) => {
      expect(await runAsync(ctx, `host.ui.toast("success", "drew The Road").then(() => "ok", (e) => e.message)`)).toBe("ok");
      // A guest cannot widen its own attention footprint by naming a string the host did not admit.
      expect(await runAsync(ctx, `host.ui.toast("CRITICAL", "look at me").then(() => "ok", (e) => e.message)`)).toBe("ok");
    });
    expect(performed.uiToasts).toEqual([
      { level: "success", message: "drew The Road" },
      { level: "info", message: "look at me" },
    ]);
  });

  test("host.ui.openDialog REFUSES an id outside the surface-id grammar — the bridge is never reached", async () => {
    const { bridge, performed } = fakeBridge();
    const runtime = makeRuntime(uiGrants, false, bridge);
    await withRuntime(runtime, async (ctx) => {
      expect(await runAsync(ctx, `host.ui.openDialog("reveal_dialog").then(() => "reached", (e) => "caught")`)).toBe("reached");
      // An unbounded id would be an unbounded outbox key — the same grammar `ui.register`/`setState` enforce.
      expect(await runAsync(ctx, `host.ui.openDialog("Bad Id!").then(() => "reached", (e) => "caught")`)).toBe("caught");
    });
    expect(performed.uiDialogs).toEqual(["reveal_dialog"]);
  });

  test("registerCommand / toast / openDialog are ALL gated by the ui.surface capability", async () => {
    const { bridge, performed } = fakeBridge();
    const runtime = makeRuntime([], false, bridge); // NO ui.surface grant
    await withRuntime(runtime, async (ctx) => {
      const registerName = ctx.evalCode(
        `let name = ""; try { host.ui.registerCommand({ name: "draw", describe: "d", onRun: () => {} }); } catch (e) { name = e.name; } name`,
      );
      if (registerName.error) {
        throw new Error(readString(ctx, registerName.error));
      }
      expect(ctx.getString(registerName.value)).toBe("PluginCapabilityError");
      registerName.value.dispose();
      expect(await runAsync(ctx, `host.ui.toast("info", "x").then(() => "ok", (e) => e.name)`)).toBe("PluginCapabilityError");
      expect(await runAsync(ctx, `host.ui.openDialog("x").then(() => "ok", (e) => e.name)`)).toBe("PluginCapabilityError");
    });
    // Nothing reached the bridge: an ungranted plugin raises no chrome at all.
    expect(performed.uiToasts).toEqual([]);
    expect(performed.uiDialogs).toEqual([]);
  });
});

describe("host.ui.registerFrame — the U7 escape hatch's door (plugin-ui-plane §6.2, seam 13)", () => {
  const frameDef = `id: "board", anchor: "chat-flank", title: "Chess", html: "<canvas></canvas><script>go()</script>"`;

  test("a granted registerFrame collects tier:'frame' meta + the body SEPARATELY — the bytes never enter the meta", async () => {
    const collected: { meta: unknown; frame: unknown; hasAction: boolean }[] = [];
    const { bridge } = fakeBridge();
    const runtime = makeRuntime(["ui.frame"], false, bridge, {
      collectSurface: (meta, onAction, frame) => {
        collected.push({ meta, frame, hasAction: onAction !== null });
        onAction?.dispose();
      },
    });
    await withRuntime(runtime, (ctx) => {
      const res = ctx.evalCode(`host.ui.registerFrame({ ${frameDef}, css: "body{margin:0}" }); "ok"`);
      if (res.error) {
        throw new Error(readString(ctx, res.error));
      }
      res.value.dispose();
    });
    // THE META carries no bytes. This is the load-bearing split: `PluginSurfaceView extends
    // PluginSurfaceRegistrationMeta`, so an `html` key here would ship every frame document to the client
    // through `listSurfaces`. The projection is not what keeps it server-side — this shape is.
    expect(collected[0]?.meta).toEqual({ id: "board", anchor: "chat-flank", title: "Chess", tier: "frame" });
    expect(collected[0]?.frame).toEqual({ html: "<canvas></canvas><script>go()</script>", css: "body{margin:0}" });
    // A frame has no declarative action round-trip; its calls ride the postMessage bridge.
    expect(collected[0]?.hasAction).toBe(false);
  });

  // THE CAPABILITY FORK, probed from BOTH sides. The membrane gates per FUNCTION, so the hatch's louder
  // consent line is only real if (a) its own door refuses a plugin without `ui.frame`, and (b) the declarative
  // door refuses the frame TIER. Either hole alone lets a plugin granted "show its own panels" open an
  // isolated frame that can beacon out — the exact laundering the two-door design exists to prevent.
  test("registerFrame is refused WITHOUT ui.frame — even when ui.surface IS granted", async () => {
    const collected: unknown[] = [];
    const { bridge } = fakeBridge();
    const runtime = makeRuntime(["ui.surface"], false, bridge, { collectSurface: (meta) => collected.push(meta) });
    await withRuntime(runtime, (ctx) => {
      const res = ctx.evalCode(`let name = ""; try { host.ui.registerFrame({ ${frameDef} }); } catch (e) { name = e.name; } name`);
      if (res.error) {
        throw new Error(readString(ctx, res.error));
      }
      expect(ctx.getString(res.value)).toBe("PluginCapabilityError");
      res.value.dispose();
    });
    expect(collected).toHaveLength(0);
  });

  test("ui.register REFUSES tier:'frame' — the hatch cannot be taken by naming its tier at the panel door", async () => {
    const collected: unknown[] = [];
    const warned: string[] = [];
    const { bridge } = fakeBridge();
    // The maximal declarative grant, deliberately: this plugin may register every panel it likes and STILL
    // cannot open a frame.
    const runtime = makeRuntime(["ui.surface"], false, bridge, { collectSurface: (meta) => collected.push(meta), logWarn: (msg) => warned.push(msg) });
    await withRuntime(runtime, (ctx) => {
      const res = ctx.evalCode(
        `let threw = false;
         try { host.ui.register({ id: "sneak", anchor: "chat-flank", title: "Sneak", tier: "frame" }); } catch { threw = true; }
         threw ? "threw" : "survived"`,
      );
      if (res.error) {
        throw new Error(readString(ctx, res.error));
      }
      // A SOFT refusal like every other bad registration (§4.9) — the plugin's tools and events survive.
      expect(ctx.getString(res.value)).toBe("survived");
      res.value.dispose();
    });
    expect(collected).toHaveLength(0);
    expect(warned).toHaveLength(1);
    expect(warned[0]).toContain("registerFrame");
  });

  test("the guest cannot name the tier OR smuggle a spec at the frame door — both are host-decided", async () => {
    const collected: { meta: unknown; frame: unknown }[] = [];
    const { bridge } = fakeBridge();
    const runtime = makeRuntime(["ui.frame"], false, bridge, { collectSurface: (meta, _onAction, frame) => collected.push({ meta, frame }) });
    await withRuntime(runtime, (ctx) => {
      // A guest passing `tier: "static"` (to dodge the anchor×tier table) and a `spec` (to get a declarative
      // surface out of a frame-only grant) gets NEITHER: `tier` is a host OVERRIDE applied after the dump, and
      // `spec` is not among the props this door reads at all.
      const res = ctx.evalCode(`host.ui.registerFrame({ ${frameDef}, tier: "static", spec: { kind: "text", value: "pwn" } }); "ok"`);
      if (res.error) {
        throw new Error(readString(ctx, res.error));
      }
      res.value.dispose();
    });
    expect(collected[0]?.meta).toEqual({ id: "board", anchor: "chat-flank", title: "Chess", tier: "frame" });
  });

  test("a frame at message-footer is REFUSED — the per-row anchor's permanent wall bites the new tier", async () => {
    const collected: unknown[] = [];
    const warned: string[] = [];
    const { bridge } = fakeBridge();
    const runtime = makeRuntime(["ui.frame"], false, bridge, { collectSurface: (meta) => collected.push(meta), logWarn: (msg) => warned.push(msg) });
    await withRuntime(runtime, (ctx) => {
      const res = ctx.evalCode(
        `host.ui.registerFrame({ id: "row_frame", anchor: "message-footer", title: "Row", html: "<b>x</b>" });
         host.ui.registerFrame({ id: "band_frame", anchor: "chat-settings-section", title: "Band", html: "<b>x</b>" });
         host.ui.registerFrame({ ${frameDef} });
         "ok"`,
      );
      if (res.error) {
        throw new Error(readString(ctx, res.error));
      }
      res.value.dispose();
    });
    // One document per transcript row is never eligible; the host-controls band is not on §6.2's anchor list.
    // Only the flank registration survives — and both refusals are soft + logged.
    expect(collected).toHaveLength(1);
    expect(warned).toHaveLength(2);
  });

  test("an over-cap body and an over-count registration are both SOFT refusals — bounded retention per instance", async () => {
    const collected: unknown[] = [];
    const warned: string[] = [];
    const { bridge } = fakeBridge();
    const runtime = makeRuntime(["ui.frame"], false, bridge, { collectSurface: (meta) => collected.push(meta), logWarn: (msg) => warned.push(msg) });
    await withRuntime(runtime, (ctx) => {
      // A frame body is held for the INSTANCE LIFETIME and multiplied by the resident-runtime ceiling, so both
      // the per-body size and the per-instance COUNT are bounded. `ui.register` needs no count cap because a
      // spec is already bounded to 32 KiB; a frame body is 5x that.
      const res = ctx.evalCode(
        `host.ui.registerFrame({ id: "huge", anchor: "chat-flank", title: "Huge", html: "x".repeat(${PLUGIN_FRAME_HTML_MAX_CHARS} + 1) });
         for (let i = 0; i < ${PLUGIN_FRAME_SURFACES_MAX} + 3; i++) {
           host.ui.registerFrame({ id: "f" + i, anchor: "chat-flank", title: "F", html: "<b>ok</b>" });
         }
         "ok"`,
      );
      if (res.error) {
        throw new Error(readString(ctx, res.error));
      }
      res.value.dispose();
    });
    expect(collected).toHaveLength(PLUGIN_FRAME_SURFACES_MAX);
    // 1 over-size + 3 over-count.
    expect(warned).toHaveLength(4);
  });
});

describe("attachMembrane — the U6 llm.quiet widening (§5.16/§5.32: ONE op, two optional arms)", () => {
  test("a structured ask crosses as the guest's RAW schema — the membrane projects nothing (the domain owns D79)", async () => {
    const { bridge, llm } = fakeBridge();
    const runtime: MembraneRuntime = { ...makeRuntime(["llm.quiet"], false, bridge), currentChat: () => null, currentToken: () => null };
    await withRuntime(runtime, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => host.llm.quiet('x', { schema: { name: 'draw', schema: { type: 'object', properties: { card: { type: 'string' } } } } }))()",
      );
      expect(out).toBe("answered:1");
    });
    expect(llm.opts).toEqual([{ schema: { name: "draw", schema: { type: "object", properties: { card: { type: "string" } } } } }]);
  });

  test("image asset ids cross as IDS and are clamped to the per-call ceiling (never an unbounded CAS read)", async () => {
    const { bridge, llm } = fakeBridge();
    const runtime: MembraneRuntime = { ...makeRuntime(["llm.quiet"], false, bridge), currentChat: () => null, currentToken: () => null };
    await withRuntime(runtime, async (ctx) => {
      await runAsync(ctx, "(async () => host.llm.quiet('x', { imageAssetIds: ['a','b','c','d','e','f'] }))()");
    });
    expect(llm.opts).toEqual([{ imageAssetIds: ["a", "b", "c", "d"] }]);
  });

  test("a MALFORMED opts bag is DROPPED, not thrown — the call proceeds as a plain quiet generation", async () => {
    // The fail-safe projection posture `buildTurnHints`/`buildQuickReplyChoices` already use: a guest typo must
    // not convert a working call into an error, and a half-understood structured ask must never reach a wire.
    const { bridge, llm } = fakeBridge();
    const runtime: MembraneRuntime = { ...makeRuntime(["llm.quiet"], false, bridge), currentChat: () => null, currentToken: () => null };
    await withRuntime(runtime, async (ctx) => {
      await runAsync(ctx, "(async () => host.llm.quiet('x', { schema: { schema: {} }, imageAssetIds: 'not-an-array' }))()");
    });
    expect(llm.opts).toEqual([undefined]);
  });
});

describe("attachMembrane — transforms.registerDisplay (U6 seam 14; the ST message-formatting-hook parity arm)", () => {
  test("a granted registerDisplay collects {name} + keeps the apply handle", async () => {
    const { bridge } = fakeBridge();
    const collected: { name: string }[] = [];
    const runtime = makeRuntime(["chat.transform"], false, bridge, {
      collectDisplayTransform: (reg, handler): void => {
        collected.push({ name: reg.name });
        handler.dispose(); // this test owns disposal (no Sandbox handlers map behind the direct attach)
      },
    });
    await withRuntime(runtime, (ctx) => {
      const result = ctx.evalCode("host.transforms.registerDisplay({ name: 'furigana', apply: async (i) => i.text + '!' })");
      if (result.error) {
        throw new Error(`guest threw: ${readString(ctx, result.error)}`);
      }
      result.value.dispose();
    });
    expect(collected).toEqual([{ name: "furigana" }]);
  });

  test("registerDisplay rides the SAME chat.transform capability — without it, the uniform refusal, nothing collected", async () => {
    // The capability REUSE is the design claim (a display transform is strictly narrower than the prompt
    // transform that grant already buys), so this pin is what makes "no new consent line" a fact.
    const { bridge } = fakeBridge();
    const collected: unknown[] = [];
    const runtime = makeRuntime([], false, bridge, { collectDisplayTransform: (reg): void => void collected.push(reg) });
    await withRuntime(runtime, (ctx) => {
      const result = ctx.evalCode(
        "try { host.transforms.registerDisplay({ name: 'x', apply: async (i) => i.text }); 'NO-THROW' } catch (e) { 'caught:' + e.message }",
      );
      expect(readString(ctx, result.error ?? result.value)).toContain("chat.transform");
    });
    expect(collected).toEqual([]);
  });

  test("a registerDisplay def with no apply FUNCTION is refused (nothing collected)", async () => {
    const { bridge } = fakeBridge();
    const collected: unknown[] = [];
    const runtime = makeRuntime(["chat.transform"], false, bridge, { collectDisplayTransform: (reg): void => void collected.push(reg) });
    await withRuntime(runtime, (ctx) => {
      const result = ctx.evalCode(
        "try { host.transforms.registerDisplay({ name: 'x', apply: 'not-a-function' }); 'NO-THROW' } catch (e) { 'caught:' + e.message }",
      );
      expect(readString(ctx, result.error ?? result.value)).toContain("name, apply");
    });
    expect(collected).toEqual([]);
  });
});

describe("attachMembrane — macros.register (U6 §5.15; plugin macros are DATA into the ONE kit engine)", () => {
  test("a granted macros.register collects {name, description} + keeps the resolve handle — un-namespaced", async () => {
    // The name that crosses is the GUEST-LOCAL one: infra holds no manifest slug and must never invent a
    // namespace, so `plugin_<slug'>_` is assigned domain-side (the `registerTool` rule).
    const { bridge } = fakeBridge();
    const collected: { name: string; description: string }[] = [];
    const runtime = makeRuntime(["chat.transform"], false, bridge, {
      collectMacro: (reg, handler): void => {
        collected.push({ name: reg.name, description: reg.description });
        handler.dispose();
      },
    });
    await withRuntime(runtime, (ctx) => {
      const result = ctx.evalCode("host.macros.register({ name: 'draw', description: 'a card', resolve: async () => 'Ace of Cups' })");
      if (result.error) {
        throw new Error(`guest threw: ${readString(ctx, result.error)}`);
      }
      result.value.dispose();
    });
    expect(collected).toEqual([{ name: "draw", description: "a card" }]);
  });

  test("macros.register WITHOUT chat.transform throws the uniform capability refusal (nothing collected)", async () => {
    const { bridge } = fakeBridge();
    const collected: unknown[] = [];
    const runtime = makeRuntime([], false, bridge, { collectMacro: (reg): void => void collected.push(reg) });
    await withRuntime(runtime, (ctx) => {
      const result = ctx.evalCode(
        "try { host.macros.register({ name: 'x', description: '', resolve: async () => '' }); 'NO-THROW' } catch (e) { 'caught:' + e.message }",
      );
      expect(readString(ctx, result.error ?? result.value)).toContain("chat.transform");
    });
    expect(collected).toEqual([]);
  });

  test("a macros.register def with no resolve FUNCTION is refused (nothing collected)", async () => {
    const { bridge } = fakeBridge();
    const collected: unknown[] = [];
    const runtime = makeRuntime(["chat.transform"], false, bridge, { collectMacro: (reg): void => void collected.push(reg) });
    await withRuntime(runtime, (ctx) => {
      const result = ctx.evalCode("try { host.macros.register({ name: 'x', description: '', resolve: 42 }); 'NO-THROW' } catch (e) { 'caught:' + e.message }");
      expect(readString(ctx, result.error ?? result.value)).toContain("name, description, resolve");
    });
    expect(collected).toEqual([]);
  });
});

// ── U8 seams 15/17: the two CANON-WRITE host fns (databank.ingest / character.ingest) ─────────────────────────
// The security shape under test: each is capability-gated (an ungranted call NEVER reaches the bridge), needs
// NO chat scope and NO host authority (a non-host installer — `canWrite:false` — ingests their OWN library), and
// forwards a VALIDATED payload (a malformed arg is a typed rejection of the CALL, not a partial write). The
// `performed.*Ingests` capture proves the "never reaches the bridge" half by ABSENCE, which is the property a
// capability wall is: the refusal happens before any owning-domain op runs.
describe("attachMembrane — U8 databank.ingest / character.ingest are grant-gated owner-writes (no chat, no host authority)", () => {
  test("databank.ingest WITHOUT the grant rejects with the TYPED capability error — the bridge is never called", async () => {
    const { bridge, performed } = fakeBridge();
    await withHost([], false, bridge, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { try { await host.databank.ingest({ name: 'x', text: 'y' }); return 'NO-THROW' } catch (e) { return e.name } })()",
      );
      expect(out).toBe("PluginCapabilityError");
    });
    expect(performed.databankIngests).toEqual([]);
  });

  test("databank.ingest WITH the grant forwards {name,text} + returns the id — canWrite:false (a library write is not room state)", async () => {
    const { bridge, performed } = fakeBridge();
    await withHost(["databank.ingest"], false, bridge, async (ctx) => {
      const out = await runAsync(ctx, "(async () => { const r = await host.databank.ingest({ name: 'notes', text: 'hello' }); return r.documentId })()");
      expect(out).toBe("doc_1");
    });
    expect(performed.databankIngests).toEqual([{ name: "notes", text: "hello" }]);
  });

  test("databank.ingest with a malformed payload (no text) is a typed rejection — nothing reaches the bridge", async () => {
    const { bridge, performed } = fakeBridge();
    await withHost(["databank.ingest"], false, bridge, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { try { await host.databank.ingest({ name: 'x' }); return 'NO-THROW' } catch (e) { return 'caught:' + e.message } })()",
      );
      expect(out).toContain("name: string, text: string");
    });
    expect(performed.databankIngests).toEqual([]);
  });

  test("character.ingest WITHOUT the grant rejects with the TYPED capability error — the bridge is never called", async () => {
    const { bridge, performed } = fakeBridge();
    await withHost([], false, bridge, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { try { await host.character.ingest({ name: 'Aria' }); return 'NO-THROW' } catch (e) { return e.name } })()",
      );
      expect(out).toBe("PluginCapabilityError");
    });
    expect(performed.characterIngests).toEqual([]);
  });

  test("character.ingest WITH the grant forwards the card object + returns the id (canWrite:false — own library)", async () => {
    const { bridge, performed } = fakeBridge();
    await withHost(["character.ingest"], false, bridge, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { const r = await host.character.ingest({ name: 'Aria', spec: 'chara_card_v2' }); return r.characterId })()",
      );
      expect(out).toBe("char_1");
    });
    expect(performed.characterIngests).toEqual([{ name: "Aria", spec: "chara_card_v2" }]);
  });

  test("character.ingest with a NON-object (an array) is a typed rejection — a card is an object, nothing reaches the bridge", async () => {
    const { bridge, performed } = fakeBridge();
    await withHost(["character.ingest"], false, bridge, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { try { await host.character.ingest(['not', 'a', 'card']); return 'NO-THROW' } catch (e) { return 'caught:' + e.message } })()",
      );
      expect(out).toContain("character-card object");
    });
    expect(performed.characterIngests).toEqual([]);
  });
});

// ── U8 D148: the per-card state host fns (character.setCardData / getCardData) ──────────────────────────────────
// The membrane's half of the D148 wall: each gates `character.card_state` (an ungranted call NEVER reaches the
// bridge — the property proven by the `performed.cardData*` ABSENCE), needs NO chat scope and NO host authority
// (`canWrite:false` — a write to your OWN character is not room state), and forwards a VALIDATED payload — the
// guest names ONLY the characterId + data, never a slug (that is stamped domain-side) and never an owner. A
// malformed arg is a typed rejection of the CALL, not a partial write. The slug-stamp + owner-scope + the
// leak-free NOT_FOUND for a foreign character are the DOMAIN's walls (bridge.test.ts + the persistence int test).
describe("attachMembrane — U8 character.setCardData / getCardData are grant-gated owner-writes (no chat, no host authority)", () => {
  test("setCardData WITHOUT the grant rejects with the TYPED capability error — the bridge is never called", async () => {
    const { bridge, performed } = fakeBridge();
    await withHost([], false, bridge, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { try { await host.character.setCardData('char_x', { k: 1 }); return 'NO-THROW' } catch (e) { return e.name } })()",
      );
      expect(out).toBe("PluginCapabilityError");
    });
    expect(performed.cardDataWrites).toEqual([]);
  });

  test("setCardData WITH the grant forwards {characterId, data} — canWrite:false (a write to your own character is not room state)", async () => {
    const { bridge, performed } = fakeBridge();
    await withHost(["character.card_state"], false, bridge, async (ctx) => {
      await runAsync(ctx, "(async () => { await host.character.setCardData('char_abc', { mood: 'calm', n: 3 }); return 'ok' })()");
    });
    expect(performed.cardDataWrites).toEqual([{ characterId: "char_abc", data: { mood: "calm", n: 3 } }]);
  });

  test("setCardData with NON-object data (an array) is a typed rejection — nothing reaches the bridge", async () => {
    const { bridge, performed } = fakeBridge();
    await withHost(["character.card_state"], false, bridge, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { try { await host.character.setCardData('char_abc', ['nope']); return 'NO-THROW' } catch (e) { return 'caught:' + e.message } })()",
      );
      expect(out).toContain("data object");
    });
    expect(performed.cardDataWrites).toEqual([]);
  });

  test("setCardData with a non-string characterId is a typed rejection — nothing reaches the bridge", async () => {
    const { bridge, performed } = fakeBridge();
    await withHost(["character.card_state"], false, bridge, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { try { await host.character.setCardData(42, { k: 1 }); return 'NO-THROW' } catch (e) { return 'caught:' + e.message } })()",
      );
      expect(out).toContain("characterId string");
    });
    expect(performed.cardDataWrites).toEqual([]);
  });

  test("getCardData WITHOUT the grant rejects with the TYPED capability error — the bridge is never called", async () => {
    const { bridge, performed } = fakeBridge();
    await withHost([], false, bridge, async (ctx) => {
      const out = await runAsync(ctx, "(async () => { try { await host.character.getCardData('char_x'); return 'NO-THROW' } catch (e) { return e.name } })()");
      expect(out).toBe("PluginCapabilityError");
    });
    expect(performed.cardDataReads).toEqual([]);
  });

  test("getCardData WITH the grant forwards the characterId + returns the stored blob (canWrite:false — own character)", async () => {
    const { bridge, performed } = fakeBridge();
    await withHost(["character.card_state"], false, bridge, async (ctx) => {
      const out = await runAsync(ctx, "(async () => { const r = await host.character.getCardData('char_read'); return r.echoed })()");
      expect(out).toBe("char_read");
    });
    expect(performed.cardDataReads).toEqual(["char_read"]);
  });
});

// ── U8 §5a: the PRIVATE plugin-event plane (pubsub.emit / pubsub.on) ───────────────────────────────────────────
// The membrane's half of the forgery wall: both gate `plugin_events`, `emit` forwards a validated `{name, data}`
// to the bridge (which stamps the emitter slug), and `on` collects a bounded subscription. A colon-carrying or
// unbounded coordinate is refused at THIS boundary (it would inject into the bus's channel key). The bus-level
// cross-user / no-domain-bus / no-TriggerFact walls are pinned in plugin-event-bus.test.ts.
describe("attachMembrane — pubsub.emit / pubsub.on are grant-gated (plugin_events) with colon-free coordinates", () => {
  test("pubsub.emit WITHOUT the grant rejects with the TYPED capability error — the bridge is never called", async () => {
    const { bridge, performed } = fakeBridge();
    await withHost([], false, bridge, async (ctx) => {
      const out = await runAsync(ctx, "(async () => { try { await host.pubsub.emit('found', { x: 1 }); return 'NO-THROW' } catch (e) { return e.name } })()");
      expect(out).toBe("PluginCapabilityError");
    });
    expect(performed.pubsubEmits).toEqual([]);
  });

  test("pubsub.emit WITH the grant forwards the validated {name, data} to the bridge (which stamps the emitter slug)", async () => {
    const { bridge, performed } = fakeBridge();
    await withHost(["plugin_events"], false, bridge, async (ctx) => {
      await runAsync(ctx, "(async () => { await host.pubsub.emit('found', { url: 'x', n: 2 }); return 'ok' })()");
    });
    expect(performed.pubsubEmits).toEqual([{ name: "found", data: { url: "x", n: 2 } }]);
  });

  test("pubsub.emit with an invalid event name is a typed refusal — nothing reaches the bridge", async () => {
    const { bridge, performed } = fakeBridge();
    await withHost(["plugin_events"], false, bridge, async (ctx) => {
      const out = await runAsync(
        ctx,
        "(async () => { try { await host.pubsub.emit('Bad Name!', {}); return 'NO-THROW' } catch (e) { return 'caught:' + e.message } })()",
      );
      expect(out).toContain("valid event name");
    });
    expect(performed.pubsubEmits).toEqual([]);
  });

  test("pubsub.on WITHOUT the grant throws the uniform capability refusal (nothing collected)", async () => {
    const { bridge } = fakeBridge();
    const collected: { emitterSlug: string; name: string }[] = [];
    const runtime = makeRuntime([], false, bridge, { collectPubsub: (reg): void => void collected.push(reg) });
    await withRuntime(runtime, (ctx) => {
      const result = ctx.evalCode("try { host.pubsub.on('scraper', 'found', () => {}); 'NO-THROW' } catch (e) { e.name }");
      expect(readString(ctx, result.error ?? result.value)).toBe("PluginCapabilityError");
    });
    expect(collected).toEqual([]);
  });

  test("a granted pubsub.on collects {emitterSlug, name} + keeps the handler handle", async () => {
    const { bridge } = fakeBridge();
    const collected: { emitterSlug: string; name: string }[] = [];
    // This test owns disposal of the dup'd handler (no real Sandbox handlers map behind the direct attach) — an
    // un-disposed guest handle aborts JS_FreeRuntime at teardown (the collectTransform/collectMacro precedent).
    const runtime = makeRuntime(["plugin_events"], false, bridge, {
      collectPubsub: (reg, handler): void => {
        collected.push(reg);
        handler.dispose();
      },
    });
    await withRuntime(runtime, (ctx) => {
      const r = ctx.evalCode("host.pubsub.on('scraper', 'found', () => {})");
      readString(ctx, r.error ?? r.value);
    });
    expect(collected).toEqual([{ emitterSlug: "scraper", name: "found" }]);
  });

  test("pubsub.on with a colon-carrying / malformed coordinate is a SOFT refusal (logged, nothing collected)", async () => {
    const { bridge } = fakeBridge();
    const collected: { emitterSlug: string; name: string }[] = [];
    const warnings: string[] = [];
    const runtime = makeRuntime(["plugin_events"], false, bridge, {
      collectPubsub: (reg): void => void collected.push(reg),
      logWarn: (m): void => void warnings.push(m),
    });
    await withRuntime(runtime, (ctx) => {
      // A colon in the emitterSlug would inject into the bus's `installer:slug:name` key — refused at the edge.
      const r1 = ctx.evalCode("host.pubsub.on('a:b', 'found', () => {})");
      readString(ctx, r1.error ?? r1.value);
      // An invalid event-name grammar is likewise refused.
      const r2 = ctx.evalCode("host.pubsub.on('scraper', 'Bad Name', () => {})");
      readString(ctx, r2.error ?? r2.value);
    });
    expect(collected).toEqual([]);
    expect(warnings.length).toBe(2);
  });
});
