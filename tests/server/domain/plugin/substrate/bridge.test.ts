// substrate: bridge — the per-installer PluginBridge builder (P4b-CORE / P4b-tail). Pure: no db, no Principal
// minting. The security-load-bearing property proven here is the turn.trigger FUNDER — the membrane passes only
// (chatId, depth, p); the funder is closed over the INSTALLER domain-side, so a guest can never fund a foreign
// turn (requestTurn resolves the room-host box + gates the funder's membership downstream). Also pins that the
// global-vars ops close over the installer (a cross-user KV read is structurally impossible). (The per-plugin
// spend wrap was stripped 2026-07-24 — enterprise spend enforcement; loop safety rides the per-member turn RATE
// budget + the cascade guard downstream in requestTurn, the n≤4 clamp + the ≤32 host-call cap for imagery.)

import { historyFloor } from "@orb/contracts/chat";
import type { PluginInvocationLiveness } from "@orb/contracts/plugin";
import type { ChatId, PluginId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { neutralizeMacros } from "@orb/kit/macro";
import { describe } from "vitest";
import type { PluginBelts, PluginHostOps } from "../../../../../packages/server/src/domain/plugin/contract/ops.ts";
import { buildPluginBridge } from "../../../../../packages/server/src/domain/plugin/substrate/bridge.ts";
import { createNotifyFloor } from "../../../../../packages/server/src/domain/plugin/substrate/notify-floor.ts";
import {
  createPluginRateFloor,
  PLUGIN_ASSET_EGRESS_PER_HOUR,
  PLUGIN_EGRESS_PER_HOUR,
  PLUGIN_QUIET_LLM_PER_HOUR,
} from "../../../../../packages/server/src/domain/plugin/substrate/rate-floor.ts";
import { createFrozenClock, FROZEN_AT_MS } from "../../../../support/clock.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeInertOps } from "../_support.ts";

const INSTALLER = castId<UserId>("user_installer00000000000000");
const OTHER = castId<UserId>("user_other000000000000000000");
const PLUGIN = castId<PluginId>("plugin_bridge000000000000000001");
/** The bridge is keyed by IDENTITY (id + the manifest display name) since posture 2 — a card has to say who
 *  is asking. Only the id participates in the KV/lore namespaces; the name reaches only `suggest`. */
const PLUGIN_REF = { id: PLUGIN, name: "Bridge Test Plugin", slug: "bridge-test-plugin" };
const CHAT = castId<ChatId>("chat_bridge0000000000000000");
const OTHER_PLUGIN = castId<PluginId>("plugin_other0000000000000000002");
const OTHER_PLUGIN_REF = { id: OTHER_PLUGIN, name: "Other Plugin", slug: "other-plugin" };
const BOOK = "wbook_bridge00000000000000000";
/** A LIVE mutating macro — `{{setvar}}` is the one that turns a lore write into durable chat state. */
const LIVE_MACRO = "tension is {{setvar::tension::99}} now";
const NOT_ATTACHED_RE = /attached to this chat/u;
const AT_CAP_RE = /already owns 64 entries/u;
const NOTICE_FLOOR_RE = /one notice per 60s per chat/u;
const QUIET_FLOOR_RE = /llm\.quiet is limited to 2 calls per hour/u;
const EGRESS_FLOOR_RE = /net\.fetch is limited to \d+ calls per hour/u;
/** A transient snippet has no plugin row — the belted capabilities are unreachable for want of an identity. */
const NEEDS_PLUGIN_RE = /requires an installed plugin/u;
const ONE_HOUR_MS = 3_600_000;
/** A minimal valid `GenerateImageActionArgs` (the `generateImageActionArgsSchema` required fields). */
const IMAGE_ARGS = { mode: "free", n: 1, useAvatarReference: false, reuse: "never", quiet: true } as const;
const LIVE_LIVENESS: PluginInvocationLiveness = { aborted: false, onAbort: () => (): void => undefined };

/** The REAL belts on a clock that never advances — inert for every test that is not ABOUT a belt (one notice
 *  per (plugin, chat) and the first few hourly calls are always admitted), and NOT permissive fakes: the belt
 *  tests below drive the SAME factories with a moving clock, so what a non-belt test runs against is what
 *  production runs. `beltsWith` swaps in a specific floor for the belt under test. */
function freeBelts(): PluginBelts {
  return beltsWith({});
}

function beltsWith(over: Partial<PluginBelts>): PluginBelts {
  return {
    notify: over.notify ?? createNotifyFloor(() => FROZEN_AT_MS),
    egress: over.egress ?? createPluginRateFloor(() => FROZEN_AT_MS, { capability: "net.fetch", limit: PLUGIN_EGRESS_PER_HOUR }),
    assetEgress: over.assetEgress ?? createPluginRateFloor(() => FROZEN_AT_MS, { capability: "net.fetchAsset", limit: PLUGIN_ASSET_EGRESS_PER_HOUR }),
    quietLlm: over.quietLlm ?? createPluginRateFloor(() => FROZEN_AT_MS, { capability: "llm.quiet", limit: PLUGIN_QUIET_LLM_PER_HOUR }),
  };
}

/** An inert ops bundle whose chat.requestTurn + variables.get RECORD their args (the seam the bridge drives). */
function recordingOps(): {
  readonly ops: PluginHostOps;
  readonly turns: { readonly calls: Parameters<PluginHostOps["chat"]["requestTurn"]>[0][] };
  readonly varGets: { readonly owners: UserId[] };
} {
  const calls: Parameters<PluginHostOps["chat"]["requestTurn"]>[0][] = [];
  const owners: UserId[] = [];
  const turns = { calls };
  const varGets = { owners };
  const base = makeInertOps();
  const ops: PluginHostOps = {
    ...base,
    chat: {
      ...base.chat,
      requestTurn: (req) => {
        turns.calls.push(req);
        return Promise.resolve();
      },
    },
    variables: {
      ...base.variables,
      get: (ownerId, _key) => {
        varGets.owners.push(ownerId);
        return Promise.resolve(null);
      },
    },
  };
  return { ops, turns, varGets };
}

describe("buildPluginBridge — turn.trigger funder is the installer (can't fund a foreign turn)", () => {
  test("requestTurn closes the funder over the installer + threads the child depth + maps speaker/guided", async () => {
    const rec = recordingOps();
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, freeBelts());

    await bridge.chat.requestTurn(CHAT, 2, { speakerCharacterId: "char_x00000000000000000000000", guided: "steer" });

    expect(rec.turns.calls).toHaveLength(1);
    const call = rec.turns.calls[0];
    // The FUNDER is the installer — NEVER a guest/infra-supplied id (the membrane never passes it).
    expect(call?.funderUserId).toBe(INSTALLER);
    expect(call?.chatId).toBe(CHAT);
    expect(call?.automationDepth).toBe(2);
    expect(call?.speakerCharacterId).toBe("char_x00000000000000000000000");
    expect(call?.guided).toBe("steer");
  });

  test("omitted speaker/guided stay ABSENT (exactOptionalPropertyTypes — no undefined keys forwarded)", async () => {
    const rec = recordingOps();
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, freeBelts());

    await bridge.chat.requestTurn(CHAT, 0, {});

    const call = rec.turns.calls[0];
    expect(call).toEqual({ funderUserId: INSTALLER, chatId: CHAT, automationDepth: 0 });
    expect("speakerCharacterId" in (call ?? {})).toBe(false);
    expect("guided" in (call ?? {})).toBe(false);
  });

  test("a bridge for one installer NEVER funds another installer's turn (funder is structural)", async () => {
    const rec = recordingOps();
    const otherBridge = buildPluginBridge(rec.ops, OTHER, PLUGIN_REF, freeBelts());

    await otherBridge.chat.requestTurn(CHAT, 1, {});

    // The funder is whichever installer the bridge was built FOR — the guest has no lever on it.
    expect(rec.turns.calls[0]?.funderUserId).toBe(OTHER);
  });
});

/** An ops bundle recording every `listMessages` call, with an injectable viewer-visibility verdict. */
function readingOps(visibility: Awaited<ReturnType<PluginHostOps["chat"]["resolveViewerVisibility"]>>): {
  readonly ops: PluginHostOps;
  readonly reads: Parameters<PluginHostOps["chat"]["listMessages"]>[1][];
  readonly viewers: UserId[];
} {
  const reads: Parameters<PluginHostOps["chat"]["listMessages"]>[1][] = [];
  const viewers: UserId[] = [];
  const base = makeInertOps();
  const ops: PluginHostOps = {
    ...base,
    chat: {
      ...base.chat,
      resolveViewerVisibility: (_chatId, userId) => {
        viewers.push(userId);
        return Promise.resolve(visibility);
      },
      listMessages: (_chatId, opts) => {
        reads.push(opts);
        return Promise.resolve([]);
      },
    },
  };
  return { ops, reads, viewers };
}

// The bridge is the ONE viewer-visibility choke for guest canon reads: every admission path upstream of the
// membrane (runSnippet's `resolveChatAuthority`, the plugin tool's PL-C `can(installer,"read",chat)`, the
// `events.on` per-delivery `loadPresentRole`) resolves MEMBERSHIP ONLY, and a `from-join`-clamped member is
// legitimately admitted to a room whose pre-join canon they may not read.
describe("buildPluginBridge — listMessages is clamped to the INSTALLER's own viewer visibility", () => {
  test("a clamped installer's read carries their D16 floor, resolved for the installer (not a guest-supplied id)", async () => {
    const rec = readingOps({ role: "member", historyFloorSeq: historyFloor(7), readsHidden: false });
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, freeBelts());

    await bridge.chat.listMessages(CHAT, 20);

    expect(rec.viewers).toEqual([INSTALLER]); // the viewer is the bridge's installer, structurally
    // §3.6 / D106: a member installer's read carries `readsHidden:false` so the read strips hidden spans.
    expect(rec.reads).toEqual([{ limit: 20, floorSeq: 7, readsHidden: false }]);
  });

  test("an unrestricted host installer reads at floor 0 verbatim — the common case is unchanged", async () => {
    const rec = readingOps({ role: "host", historyFloorSeq: historyFloor(0), readsHidden: true });
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, freeBelts());

    await bridge.chat.listMessages(CHAT, undefined);

    // no `limit` key forwarded (exactOptionalPropertyTypes); a HOST reads hidden spans verbatim (`readsHidden:true`).
    expect(rec.reads).toEqual([{ floorSeq: 0, readsHidden: true }]);
  });

  test("a NON-member installer reads NOTHING — the canon read is never even issued", async () => {
    const rec = readingOps(null);
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, freeBelts());

    // `null` = not a present member (an admission that raced a kick/leave). Fail-closed: `[]`, no partial read.
    await expect(bridge.chat.listMessages(CHAT, 20)).resolves.toEqual([]);
    expect(rec.reads).toEqual([]);
  });
});

describe("buildPluginBridge — global-vars close over the installer", () => {
  test("variables.get fetches under the installer's owner id (cross-user read structurally impossible)", async () => {
    const rec = recordingOps();
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, freeBelts());

    await bridge.variables.get("some-key");

    expect(rec.varGets.owners).toEqual([INSTALLER]);
  });
});

/** An ops bundle whose world-info trio is scriptable: the attachment verdict, the book's existing titles, and
 *  a recorder for what actually reached the SHARED writer. */
function loreOps(over: { readonly attached?: boolean; readonly titles?: readonly string[] } = {}): {
  readonly ops: PluginHostOps;
  readonly writes: Parameters<PluginHostOps["worldInfo"]["upsertEntries"]>[0][];
  readonly attachProbes: { ownerId: UserId; chatId: ChatId; bookId: string }[];
} {
  const writes: Parameters<PluginHostOps["worldInfo"]["upsertEntries"]>[0][] = [];
  const attachProbes: { ownerId: UserId; chatId: ChatId; bookId: string }[] = [];
  const base = makeInertOps();
  const ops: PluginHostOps = {
    ...base,
    worldInfo: {
      ...base.worldInfo,
      upsertEntries: (req) => {
        writes.push(req);
        return Promise.resolve({ inserted: 1, updated: 0, skippedHandEdited: 0 });
      },
      isBookAttachedToChat: (ownerId, chatId, bookId) => {
        attachProbes.push({ ownerId, chatId, bookId });
        return Promise.resolve(over.attached ?? true);
      },
      listEntryTitles: () => Promise.resolve(over.titles ?? []),
    },
  };
  return { ops, writes, attachProbes };
}

// `worldinfo.write` is specified (02 §2) as "grant + host + book-attached-to-chat + the 64-entry cap". The
// membrane holds the first two; these are the domain's half — plus the neutralization that keeps the capability
// from becoming a DELAYED `chat.variables.write`.
describe("buildPluginBridge — the lore write is gated, capped, namespaced and macro-INERT", () => {
  test("guest macros are NEUTRALIZED before the row is stored (a stored {{setvar}} is a variable write by deferral)", async () => {
    // THE CAPABILITY-BYPASS PIN. World-info content is macro-rendered at ASSEMBLY, with the full registry
    // against the assembling chat's live context — and that render MUTATES: `{{setvar}}` pushes a VarOp onto
    // the op-log, which `foldVarOps` replays into durable chat state. So a plugin holding ONLY `worldinfo.write`
    // could set chat variables in every chat the book is attached to, on the next turn, with no
    // `chat.variables.write` grant and no host authority in those rooms.
    const rec = loreOps();
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, freeBelts());

    await bridge.worldInfo.upsertEntry(CHAT, { bookId: BOOK, entryKey: "mood", keys: ["mood"], contentTemplate: LIVE_MACRO, position: "after" });

    const stored = rec.writes[0]?.entries[0]?.content ?? "";
    expect(stored).not.toContain("{{");
    expect(stored).not.toContain("}}");
    // Neutralized, not mangled: the text still reads identically to a human (a U+200B between the braces).
    expect(stored).toContain("setvar::tension::99");
    expect(stored).toBe(neutralizeMacros(LIVE_MACRO));
  });

  test("a book NOT attached to the invocation chat is REFUSED (the attachment is the room's consent)", async () => {
    // The bookId is GUEST-SUPPLIED and the shared writer only checks OWNERSHIP, so without this gate a plugin
    // invoked in chat X writes into any book its installer owns — including books attached only to chat Y.
    const rec = loreOps({ attached: false });
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, freeBelts());

    await expect(bridge.worldInfo.upsertEntry(CHAT, { bookId: BOOK, entryKey: "mood", keys: [], contentTemplate: "inert", position: "after" })).rejects.toThrow(
      NOT_ATTACHED_RE,
    );
    expect(rec.writes).toEqual([]);
    // The probe asked about the ADMITTED chat, under the installer — not a guest-supplied scope.
    expect(rec.attachProbes).toEqual([{ ownerId: INSTALLER, chatId: CHAT, bookId: BOOK }]);
  });

  test("entries are TITLE-NAMESPACED per plugin (idempotent re-upsert; a human's entry is never clobbered)", async () => {
    const rec = loreOps();
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, freeBelts());

    await bridge.worldInfo.upsertEntry(CHAT, { bookId: BOOK, entryKey: "mood", keys: ["k"], contentTemplate: "x", position: "after" });

    // Mirrors the rule path's `auto/<ruleId>:<entryKey>`: a same-named human entry is a DIFFERENT title, and a
    // re-upsert of the same entryKey updates this plugin's own row.
    expect(rec.writes[0]?.entries[0]?.title).toBe(`plugin/${PLUGIN}:mood`);
  });

  test("the per-plugin entry ceiling refuses a NEW entry at the cap but still allows UPDATING an owned one", async () => {
    const own = (n: number): string => `plugin/${PLUGIN}:e${n}`;
    const full = Array.from({ length: 64 }, (_, i) => own(i));
    const atCap = loreOps({ titles: [...full, "a human-authored entry", `plugin/${OTHER_PLUGIN}:theirs`] });
    const bridge = buildPluginBridge(atCap.ops, INSTALLER, PLUGIN_REF, freeBelts());

    // A 65th NEW entry is refused (a looping guest would otherwise fill the installer's book).
    await expect(bridge.worldInfo.upsertEntry(CHAT, { bookId: BOOK, entryKey: "new", keys: [], contentTemplate: "x", position: "after" })).rejects.toThrow(
      AT_CAP_RE,
    );
    expect(atCap.writes).toEqual([]);

    // …but re-writing one it already owns is not growth, so it passes (the rule path's own semantic).
    await bridge.worldInfo.upsertEntry(CHAT, { bookId: BOOK, entryKey: "e3", keys: [], contentTemplate: "x", position: "after" });
    expect(atCap.writes).toHaveLength(1);
  });

  test("the cap counts only THIS plugin's namespace — a full book of other people's entries is not its budget", async () => {
    const foreign = Array.from({ length: 200 }, (_, i) => (i % 2 === 0 ? `plugin/${OTHER_PLUGIN}:e${i}` : `human entry ${i}`));
    const rec = loreOps({ titles: foreign });
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, freeBelts());

    await bridge.worldInfo.upsertEntry(CHAT, { bookId: BOOK, entryKey: "mine", keys: [], contentTemplate: "x", position: "after" });

    expect(rec.writes).toHaveLength(1);
  });
});

/** An ops bundle recording every durable notice the bridge let through. */
function noticeOps(): { readonly ops: PluginHostOps; readonly posts: Parameters<PluginHostOps["notifications"]["post"]>[0][] } {
  const posts: Parameters<PluginHostOps["notifications"]["post"]>[0][] = [];
  const base = makeInertOps();
  const ops: PluginHostOps = {
    ...base,
    notifications: {
      ...base.notifications,
      post: (req) => {
        posts.push(req);
        return Promise.resolve();
      },
    },
  };
  return { ops, posts };
}

// `notify` is specified (02 §2) as "grant + host + participants-only recipients + the 60 s floor". The RULE
// path enforces that floor TWICE (authoring-time in `validate.ts`, fire-time in `budget-gate.ts`); the plugin
// path enforced it zero times, and every notice is a DURABLE row per present member.
describe("buildPluginBridge — notifications.post carries the 60 s floor", () => {
  test("a second notice inside the floor is REFUSED; the durable write never happens", async () => {
    const rec = noticeOps();
    const clock = createFrozenClock(FROZEN_AT_MS);
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, beltsWith({ notify: createNotifyFloor(() => clock.now()) }));

    await bridge.notifications.post(CHAT, "all_members", "first");
    await expect(bridge.notifications.post(CHAT, "all_members", "second")).rejects.toThrow(NOTICE_FLOOR_RE);
    clock.advance(59_999);
    await expect(bridge.notifications.post(CHAT, "all_members", "still too soon")).rejects.toThrow(NOTICE_FLOOR_RE);

    expect(rec.posts.map((p) => p.message)).toEqual(["first"]);
  });

  test("the floor RELEASES at 60 s", async () => {
    const rec = noticeOps();
    const clock = createFrozenClock(FROZEN_AT_MS);
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, beltsWith({ notify: createNotifyFloor(() => clock.now()) }));

    await bridge.notifications.post(CHAT, "host", "first");
    clock.advance(60_000);
    await bridge.notifications.post(CHAT, "host", "second");

    expect(rec.posts.map((p) => p.message)).toEqual(["first", "second"]);
  });

  test("the floor is PER (plugin, chat) — a notice in one room does not mute another", async () => {
    const rec = noticeOps();
    const clock = createFrozenClock(FROZEN_AT_MS);
    const belts = beltsWith({ notify: createNotifyFloor(() => clock.now()) });
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, belts);
    const otherPlugin = buildPluginBridge(rec.ops, INSTALLER, OTHER_PLUGIN_REF, belts);
    const otherChat = castId<ChatId>("chat_second0000000000000000");

    await bridge.notifications.post(CHAT, "host", "a");
    await bridge.notifications.post(otherChat, "host", "b"); // same plugin, different room — admitted
    await otherPlugin.notifications.post(CHAT, "host", "c"); // same room, different plugin — admitted
    await expect(bridge.notifications.post(CHAT, "host", "d")).rejects.toThrow(NOTICE_FLOOR_RE);

    expect(rec.posts.map((p) => p.message)).toEqual(["a", "b", "c"]);
  });

  test("the claim is SYNCHRONOUS — concurrent host calls cannot both slip through", async () => {
    // The membrane admits up to 32 concurrent host calls per invocation, so a check-then-await-then-record
    // floor would let a burst through the gap. `admit` checks AND records in one step before the op is awaited.
    const rec = noticeOps();
    const clock = createFrozenClock(FROZEN_AT_MS);
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, beltsWith({ notify: createNotifyFloor(() => clock.now()) }));

    const burst = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => bridge.notifications.post(CHAT, "all_members", `n${i}`)));

    expect(burst.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(rec.posts).toHaveLength(1);
  });
});

/** An ops bundle recording every `llm.quiet` call — the seam the SPEND belt guards. */
function quietOps(): { readonly ops: PluginHostOps; readonly calls: Parameters<PluginHostOps["llm"]["quiet"]>[0][] } {
  const calls: Parameters<PluginHostOps["llm"]["quiet"]>[0][] = [];
  const base = makeInertOps();
  const ops: PluginHostOps = {
    ...base,
    llm: {
      quiet: (req) => {
        calls.push(req);
        return Promise.resolve({ text: "ok" });
      },
    },
  };
  return { ops, calls };
}

// `llm.quiet` is the SPEND capability with the weakest per-call posture in the membrane: no room state, so no
// host-authority gate, and no chat scope. What keeps it from being an unbounded draw on the installer's
// credential is the HOURLY floor claimed here — before the op, not after it.
describe("buildPluginBridge — llm.quiet closes the installer over the call and claims the hourly floor", () => {
  test("the guest supplies ONLY the prompt; the installer is structural (a plugin cannot spend a foreign budget)", async () => {
    const rec = quietOps();
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, freeBelts());

    const out = await bridge.llm.quiet("summarise the scene", undefined, LIVE_LIVENESS);

    expect(out).toEqual({ text: "ok" });
    // The whole request the op receives — no connection, no model, no chat, and a funder the guest never named.
    // `opts` is ABSENT (not `undefined`) on a plain call, so a plain quiet generation stays byte-identical to
    // what it was before the U6 widening.
    expect(rec.calls).toEqual([{ installerUserId: INSTALLER, prompt: "summarise the scene", signal: expect.any(AbortSignal) }]);
  });

  test("the U6 opts bag rides the SAME op and the SAME hourly floor — never a second quiet path", async () => {
    // interaction-spec §3-S5.1's law, at the seam that would have been the place to break it: the structured
    // and vision arms are pass-through fields on the ONE declared-generic quiet op. The lift/projection (D79)
    // and the CAS resolve happen at compose — this substrate forwards the raw bag and closes the installer.
    const rec = quietOps();
    const clock = createFrozenClock(FROZEN_AT_MS);
    const bridge = buildPluginBridge(
      rec.ops,
      INSTALLER,
      PLUGIN_REF,
      beltsWith({ quietLlm: createPluginRateFloor(() => clock.now(), { capability: "llm.quiet", limit: 2 }) }),
    );
    const opts = { schema: { name: "draw", schema: { type: "object" } }, imageAssetIds: ["asset_x"] } as const;

    await bridge.llm.quiet("caption this", opts, LIVE_LIVENESS);

    expect(rec.calls).toEqual([{ installerUserId: INSTALLER, prompt: "caption this", signal: expect.any(AbortSignal), opts }]);
    // …and it consumed the SAME hourly ceiling a PLAIN call would have: one lane, one budget. The second call
    // below is a plain one, so the third's refusal proves the two arms share a counter rather than each
    // getting their own (which is exactly what a second quiet path would have produced).
    await bridge.llm.quiet("plain", undefined, LIVE_LIVENESS);
    await expect(bridge.llm.quiet("again", opts, LIVE_LIVENESS)).rejects.toThrow(QUIET_FLOOR_RE);
  });

  test("a bridge built for one installer never spends another's credential", async () => {
    const rec = quietOps();
    const bridge = buildPluginBridge(rec.ops, OTHER, PLUGIN_REF, freeBelts());
    await bridge.llm.quiet("x", undefined, LIVE_LIVENESS);
    expect(rec.calls[0]?.installerUserId).toBe(OTHER);
  });

  test("invocation liveness is re-minted as the AbortSignal the provider door consumes", async () => {
    const base = makeInertOps();
    let providerSignal: AbortSignal | undefined;
    const ops: PluginHostOps = {
      ...base,
      llm: {
        quiet: (req) =>
          new Promise((resolve) => {
            providerSignal = req.signal;
            req.signal.addEventListener("abort", () => resolve({ text: "cancelled" }), { once: true });
          }),
      },
    };
    const bridge = buildPluginBridge(ops, INSTALLER, PLUGIN_REF, freeBelts());
    let abort!: () => void;
    const liveness: PluginInvocationLiveness = {
      aborted: false,
      onAbort: (listener) => {
        abort = listener;
        return (): void => undefined;
      },
    };

    const pending = bridge.llm.quiet("x", undefined, liveness);
    expect(providerSignal?.aborted).toBe(false);
    abort();
    await expect(pending).resolves.toEqual({ text: "cancelled" });
    expect(providerSignal?.aborted).toBe(true);
  });

  test("over the hourly ceiling the PAID CALL NEVER HAPPENS (the claim precedes the op)", async () => {
    // The order is the whole point: a floor claimed after the generation would bill the installer for exactly
    // the calls it was meant to refuse.
    const clock = createFrozenClock(FROZEN_AT_MS);
    const rec = quietOps();
    const bridge = buildPluginBridge(
      rec.ops,
      INSTALLER,
      PLUGIN_REF,
      beltsWith({ quietLlm: createPluginRateFloor(() => clock.now(), { capability: "llm.quiet", limit: 2 }) }),
    );

    await bridge.llm.quiet("a", undefined, LIVE_LIVENESS);
    await bridge.llm.quiet("b", undefined, LIVE_LIVENESS);
    await expect(bridge.llm.quiet("c", undefined, LIVE_LIVENESS)).rejects.toThrow(QUIET_FLOOR_RE);

    expect(rec.calls.map((c) => c.prompt)).toEqual(["a", "b"]);
    clock.advance(ONE_HOUR_MS);
    await bridge.llm.quiet("d", undefined, LIVE_LIVENESS);
    expect(rec.calls.map((c) => c.prompt)).toEqual(["a", "b", "d"]);
  });

  test("the claim is SYNCHRONOUS — a concurrent burst cannot all slip through", async () => {
    // The membrane admits up to 32 concurrent host calls per instance; a check-then-await-then-record floor
    // would let the whole burst observe the pre-burst count. The refusal is a REJECTED promise (not a sync
    // throw) so a caller awaiting the op does not need a try/catch instead of `.catch`.
    const rec = quietOps();
    const bridge = buildPluginBridge(
      rec.ops,
      INSTALLER,
      PLUGIN_REF,
      beltsWith({ quietLlm: createPluginRateFloor(() => FROZEN_AT_MS, { capability: "llm.quiet", limit: 3 }) }),
    );

    const burst = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => bridge.llm.quiet(`p${i}`, undefined, LIVE_LIVENESS)));

    expect(burst.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    expect(rec.calls).toHaveLength(3);
  });
});

describe("buildPluginBridge — admitEgress is the net.fetch hourly claim, keyed to THIS plugin", () => {
  test("it claims per call and refuses at the ceiling", () => {
    const clock = createFrozenClock(FROZEN_AT_MS);
    const belts = beltsWith({ egress: createPluginRateFloor(() => clock.now(), { capability: "net.fetch", limit: 2 }) });
    const bridge = buildPluginBridge(makeInertOps(), INSTALLER, PLUGIN_REF, belts);

    bridge.admitEgress();
    bridge.admitEgress();
    expect(() => bridge.admitEgress()).toThrow(EGRESS_FLOOR_RE);

    clock.advance(ONE_HOUR_MS);
    expect(() => bridge.admitEgress()).not.toThrow();
  });

  test("two plugins sharing the process floor do not share a budget", () => {
    const belts = beltsWith({ egress: createPluginRateFloor(() => FROZEN_AT_MS, { capability: "net.fetch", limit: 1 }) });
    const bridge = buildPluginBridge(makeInertOps(), INSTALLER, PLUGIN_REF, belts);
    const other = buildPluginBridge(makeInertOps(), INSTALLER, OTHER_PLUGIN_REF, belts);

    bridge.admitEgress();
    expect(() => bridge.admitEgress()).toThrow(EGRESS_FLOOR_RE);
    // A different plugin row, same process floor — its own window.
    expect(() => other.admitEgress()).not.toThrow();
  });

  test("a TRANSIENT SNIPPET (pluginId null) cannot egress or spend — there is no identity to bound", () => {
    // Not merely plumbing: an hourly ceiling has to be keyed to something durable, and an anonymous one-shot
    // has none. The snippet grant profile already omits both capabilities, so the membrane refuses first;
    // this is the belt-and-braces layer under that.
    const snippet = buildPluginBridge(makeInertOps(), INSTALLER, null, freeBelts());
    expect(() => snippet.admitEgress()).toThrow(NEEDS_PLUGIN_RE);
    return expect(snippet.llm.quiet("x", undefined, LIVE_LIVENESS)).rejects.toThrow(NEEDS_PLUGIN_RE);
  });
});

describe("buildPluginBridge — imagery hands the guest ONLY the assetId (cost never crosses the realm)", () => {
  test("generatePicture forwards to the front door and returns just the assetId", async () => {
    const ran: string[] = [];
    const base = makeInertOps();
    const ops: PluginHostOps = {
      ...base,
      imagery: {
        generatePicture: () => {
          ran.push("generatePicture");
          return Promise.resolve({ assetId: "asset_x0000000000000000000000" });
        },
      },
    };
    const bridge = buildPluginBridge(ops, INSTALLER, PLUGIN_REF, freeBelts());

    const result = await bridge.imagery.generatePicture(CHAT, IMAGE_ARGS);

    expect(ran).toEqual(["generatePicture"]);
    expect(result).toEqual({ assetId: "asset_x0000000000000000000000" });
    expect("costUsd" in result).toBe(false);
  });
});

// U8 seams 15/17 — the OWNER-SCOPING proof for the two canon-write ops. The wall is structural, not a
// foreign-id lookup: the guest supplies only the CONTENT (a document / a card) and NO owner, so the ONLY owner a
// write can ever land under is the `installerUserId` the bridge was built with. A bridge built for OTHER writes
// as OTHER — a guest holding a bridge can no more write another user's library than it can fund another user's
// turn. This is the "no foreign owner is expressible" analog of the tRPC verbs' leak-free NOT_FOUND.
describe("buildPluginBridge — the U8 ingest writes close over the installer (no foreign owner is expressible)", () => {
  function ingestRecordingOps(): {
    readonly ops: PluginHostOps;
    readonly databankCalls: { installerUserId: UserId; name: string; text: string }[];
    readonly characterCalls: { installerUserId: UserId; card: Record<string, unknown>; pluginId: PluginId | null }[];
  } {
    const databankCalls: { installerUserId: UserId; name: string; text: string }[] = [];
    const characterCalls: { installerUserId: UserId; card: Record<string, unknown>; pluginId: PluginId | null }[] = [];
    const base = makeInertOps();
    const ops: PluginHostOps = {
      ...base,
      databank: {
        ingest: (req) => {
          databankCalls.push(req);
          return Promise.resolve({ documentId: "doc_recorded000000000000000" });
        },
      },
      character: {
        ...base.character,
        ingest: (req) => {
          characterCalls.push(req);
          return Promise.resolve({ characterId: "char_recorded00000000000000", created: true });
        },
      },
    };
    return { ops, databankCalls, characterCalls };
  }

  test("databank.ingest closes the owner over the INSTALLER + forwards the document; the guest names no owner", async () => {
    const rec = ingestRecordingOps();
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, freeBelts());

    const result = await bridge.databank.ingest({ name: "notes", text: "hello" });

    expect(result).toEqual({ documentId: "doc_recorded000000000000000" });
    expect(rec.databankCalls).toEqual([{ installerUserId: INSTALLER, name: "notes", text: "hello" }]);
  });

  test("a bridge built for OTHER writes the databank as OTHER — the installer is the owner, structurally", async () => {
    const rec = ingestRecordingOps();
    const bridge = buildPluginBridge(rec.ops, OTHER, PLUGIN_REF, freeBelts());

    await bridge.databank.ingest({ name: "n", text: "t" });

    expect(rec.databankCalls[0]?.installerUserId).toBe(OTHER);
  });

  test("character.ingest closes the owner over the INSTALLER + forwards the card object", async () => {
    const rec = ingestRecordingOps();
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, freeBelts());

    const result = await bridge.character.ingest({ name: "Aria", spec: "chara_card_v2" });

    expect(result).toEqual({ characterId: "char_recorded00000000000000", created: true });
    expect(rec.characterCalls).toEqual([{ installerUserId: INSTALLER, card: { name: "Aria", spec: "chara_card_v2" }, pluginId: PLUGIN }]);
  });

  // #1702 — `pluginId` rides the SAME closure `requirePluginId` reads elsewhere in this file (never a guest
  // input): the funnel's only route to a non-forgeable provenance identity. A transient snippet (no plugin
  // row) forwards `null` rather than throwing — this capability keys no per-plugin belt on it (unlike
  // `surfaceQuickReply`/`ui.setState`), so it stays reachable in shape even though the snippet's fixed grant
  // profile never actually admits `character.ingest` in practice.
  test("character.ingest forwards the CALLING plugin's own id as provenance, never a guest-suppliable value", async () => {
    const rec = ingestRecordingOps();
    const bridge = buildPluginBridge(rec.ops, INSTALLER, OTHER_PLUGIN_REF, freeBelts());

    await bridge.character.ingest({ name: "Bram" });

    expect(rec.characterCalls[0]?.pluginId).toBe(OTHER_PLUGIN);
  });

  test("character.ingest from a TRANSIENT SNIPPET (no plugin identity) forwards pluginId null", async () => {
    const rec = ingestRecordingOps();
    const bridge = buildPluginBridge(rec.ops, INSTALLER, null, freeBelts());

    await bridge.character.ingest({ name: "Bram" });

    expect(rec.characterCalls[0]?.pluginId).toBeNull();
  });
});

// D148 — the per-card state write/read close over TWO un-forgeable coordinates: the installer (the owner-scope
// predicate) and the emitter's OWN manifest SLUG (a guest supplies only the characterId + data, so it can target
// only its own `plugin_<slug>` key — the whole slug-isolation wall). A bridge for OTHER stamps OTHER's slug and
// owner; the guest holding a bridge has no lever on either, exactly as with `pubsub.emit` and the ingest funder.
describe("buildPluginBridge — the U8 D148 card-state ops stamp the plugin's own slug + close over the installer", () => {
  function cardStateRecordingOps(): {
    readonly ops: PluginHostOps;
    // @orb-waive brand-in-name-position(characterId): the recorder mirrors PluginHostOps.character.setCardData, whose characterId is a bare `string` under the same marker (the guest's untrusted wire id, owner-scope-gated at persistence).
    readonly setCalls: { installerUserId: UserId; slug: string; characterId: string; data: Record<string, unknown> }[];
    // @orb-waive brand-in-name-position(characterId): the recorder mirrors PluginHostOps.character.getCardData, whose characterId is a bare `string` under the same marker (the guest's untrusted wire id, owner-scope-gated at persistence).
    readonly getCalls: { installerUserId: UserId; slug: string; characterId: string }[];
  } {
    // @orb-waive brand-in-name-position(characterId): the recorder mirrors PluginHostOps.character.setCardData, whose characterId is a bare `string` under the same marker (the guest's untrusted wire id, owner-scope-gated at persistence).
    const setCalls: { installerUserId: UserId; slug: string; characterId: string; data: Record<string, unknown> }[] = [];
    // @orb-waive brand-in-name-position(characterId): the recorder mirrors PluginHostOps.character.getCardData, whose characterId is a bare `string` under the same marker (the guest's untrusted wire id, owner-scope-gated at persistence).
    const getCalls: { installerUserId: UserId; slug: string; characterId: string }[] = [];
    const base = makeInertOps();
    const ops: PluginHostOps = {
      ...base,
      character: {
        ...base.character,
        setCardData: (req) => {
          setCalls.push(req);
          return Promise.resolve();
        },
        getCardData: (req) => {
          getCalls.push(req);
          return Promise.resolve({ read: "back", for: req.characterId });
        },
      },
    };
    return { ops, setCalls, getCalls };
  }

  test("setCardData stamps THIS plugin's slug (guest names none) + the installer owner + forwards {characterId, data}", async () => {
    const rec = cardStateRecordingOps();
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, freeBelts());

    await bridge.character.setCardData("char_target0000000000000000", { hp: 10, note: "ok" });

    expect(rec.setCalls).toEqual([
      // The slug is the plugin's OWN manifest slug — never guest-supplied — so the write can target only
      // `plugin_bridge-test-plugin`, never another plugin's key.
      { installerUserId: INSTALLER, slug: "bridge-test-plugin", characterId: "char_target0000000000000000", data: { hp: 10, note: "ok" } },
    ]);
  });

  test("a bridge for OTHER (a different installer AND a different plugin) stamps OTHER's slug + owner — both structural", async () => {
    const rec = cardStateRecordingOps();
    const otherBridge = buildPluginBridge(rec.ops, OTHER, OTHER_PLUGIN_REF, freeBelts());

    await otherBridge.character.setCardData("char_target0000000000000000", { x: 1 });

    // The guest has NO lever on either coordinate: a bridge built for OTHER + other-plugin can write only
    // other-plugin's key on OTHER's own characters.
    expect(rec.setCalls[0]?.installerUserId).toBe(OTHER);
    expect(rec.setCalls[0]?.slug).toBe("other-plugin");
  });

  test("getCardData stamps THIS plugin's slug + the installer + returns the read blob", async () => {
    const rec = cardStateRecordingOps();
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, freeBelts());

    const result = await bridge.character.getCardData("char_target0000000000000000");

    expect(result).toEqual({ read: "back", for: "char_target0000000000000000" });
    expect(rec.getCalls).toEqual([{ installerUserId: INSTALLER, slug: "bridge-test-plugin", characterId: "char_target0000000000000000" }]);
  });
});

/** An ops bundle recording the #788 READ-gap seams, with injectable membership + attachment verdicts. The
 *  recorded owner ids are the load-bearing assertion: every read must close the INSTALLER the bridge was built
 *  for over the op, so a guest can name no other owner and a foreign read is not expressible. */
function readGapOps(over: { readonly visibility?: Awaited<ReturnType<PluginHostOps["chat"]["resolveViewerVisibility"]>>; readonly attached?: boolean }): {
  readonly ops: PluginHostOps;
  readonly rosterChats: ChatId[];
  readonly bookChats: { readonly owner: UserId; readonly chatId: ChatId }[];
  readonly entryReads: { readonly owner: UserId; readonly bookId: string }[];
  readonly attachChecks: { readonly owner: UserId; readonly bookId: string }[];
  // @orb-waive brand-in-name-position(assetId): the guest's untrusted wire string recorded verbatim — the `assets.read` op param is a bare `string` under the same marker (ops.ts); branding it here would diverge from the interface it mirrors.
  readonly assetReads: { readonly installerUserId: UserId; readonly assetId: string }[];
  readonly searchReqs: { readonly installerUserId: UserId; readonly queryText: string }[];
  readonly viewers: UserId[];
} {
  const rosterChats: ChatId[] = [];
  const bookChats: { owner: UserId; chatId: ChatId }[] = [];
  const entryReads: { owner: UserId; bookId: string }[] = [];
  const attachChecks: { owner: UserId; bookId: string }[] = [];
  // @orb-waive brand-in-name-position(assetId): the guest's untrusted wire string recorded verbatim (mirrors the bare-`string` op param in ops.ts).
  const assetReads: { installerUserId: UserId; assetId: string }[] = [];
  const searchReqs: { installerUserId: UserId; queryText: string }[] = [];
  const viewers: UserId[] = [];
  const base = makeInertOps();
  const ops: PluginHostOps = {
    ...base,
    chat: {
      ...base.chat,
      resolveViewerVisibility: (_chatId, userId) => {
        viewers.push(userId);
        return Promise.resolve(over.visibility ?? null);
      },
      listCharacters: (chatId) => {
        rosterChats.push(chatId);
        return Promise.resolve([{ id: "char_seat0000000000000000000", name: "Seat", avatarAssetId: null }]);
      },
    },
    worldInfo: {
      ...base.worldInfo,
      isBookAttachedToChat: (owner, _chatId, bookId) => {
        attachChecks.push({ owner, bookId });
        return Promise.resolve(over.attached ?? false);
      },
      listBooksForChat: (owner, chatId) => {
        bookChats.push({ owner, chatId });
        return Promise.resolve([{ id: BOOK, name: "Room Lore" }]);
      },
      listEntries: (owner, bookId) => {
        entryReads.push({ owner, bookId });
        return Promise.resolve([{ id: "wentry_000000000000000000000", keys: ["k"], content: "lore", enabled: true }]);
      },
    },
    assets: {
      read: (req) => {
        assetReads.push(req);
        return Promise.resolve({ mime: "image/png", sizeBytes: 3, dataBase64: "AAAA" });
      },
      storeFetched: () => Promise.resolve({ assetId: "asset_stored0000000000000000" }),
    },
    search: {
      documents: (req) => {
        searchReqs.push({ installerUserId: req.installerUserId, queryText: req.queryText });
        return Promise.resolve([{ documentId: "doc_hit000000000000000000000", documentName: "Notes", content: "match", score: 0.9 }]);
      },
    },
  };
  return { ops, rosterChats, bookChats, entryReads, attachChecks, assetReads, searchReqs, viewers };
}

describe("buildPluginBridge — #788 READ gaps are owner-scoped + leak-free", () => {
  test("listCharacters resolves the INSTALLER's own membership and short-circuits a NON-MEMBER to [] (the leak-free choke bites)", async () => {
    const rec = readGapOps({ visibility: null }); // not a present member
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, freeBelts());

    const roster = await bridge.chat.listCharacters(CHAT);

    expect(roster).toEqual([]);
    // The membership was resolved FOR THE INSTALLER (structural — never a guest-supplied id)…
    expect(rec.viewers).toEqual([INSTALLER]);
    // …and the roster op was NEVER reached: a non-member cannot read a room's roster (red-first — the choke, not
    // a post-filter, withholds it).
    expect(rec.rosterChats).toEqual([]);
  });

  test("listCharacters for a MEMBER reads the invocation chat's roster (member-gated, this room only)", async () => {
    const rec = readGapOps({ visibility: { role: "member", historyFloorSeq: historyFloor(0), readsHidden: false } });
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, freeBelts());

    const roster = await bridge.chat.listCharacters(CHAT);

    expect(roster).toEqual([{ id: "char_seat0000000000000000000", name: "Seat", avatarAssetId: null }]);
    expect(rec.viewers).toEqual([INSTALLER]);
    expect(rec.rosterChats).toEqual([CHAT]); // scoped to the ADMITTED invocation chat, no other
  });

  test("listCharacters's membership is resolved for whichever INSTALLER the bridge was built for (cross-owner is structural)", async () => {
    const rec = readGapOps({ visibility: null });
    const otherBridge = buildPluginBridge(rec.ops, OTHER, PLUGIN_REF, freeBelts());

    await otherBridge.chat.listCharacters(CHAT);

    expect(rec.viewers).toEqual([OTHER]); // the guest has no lever on whose membership is checked
  });

  test("listBooks closes the INSTALLER over the attachment-list read (a guest names no owner)", async () => {
    const rec = readGapOps({});
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, freeBelts());

    const books = await bridge.worldInfo.listBooks(CHAT);

    expect(books).toEqual([{ id: BOOK, name: "Room Lore" }]);
    expect(rec.bookChats).toEqual([{ owner: INSTALLER, chatId: CHAT }]);
  });

  test("listBooks for a DIFFERENT installer reads under THAT installer (owner-scope is structural)", async () => {
    const rec = readGapOps({});
    const otherBridge = buildPluginBridge(rec.ops, OTHER, PLUGIN_REF, freeBelts());

    await otherBridge.worldInfo.listBooks(CHAT);

    expect(rec.bookChats).toEqual([{ owner: OTHER, chatId: CHAT }]);
  });

  test("listEntries on a book NOT attached to this chat returns [] WITHOUT reading entries (the attachment gate bites — red-first)", async () => {
    const rec = readGapOps({ attached: false });
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, freeBelts());

    const entries = await bridge.worldInfo.listEntries(CHAT, BOOK);

    expect(entries).toEqual([]);
    // The attachment was checked under the INSTALLER…
    expect(rec.attachChecks).toEqual([{ owner: INSTALLER, bookId: BOOK }]);
    // …and the entry read was NEVER reached: a book attached only to another room (even one the installer owns)
    // leaks nothing — [] is indistinguishable from an attached-but-empty book.
    expect(rec.entryReads).toEqual([]);
  });

  test("listEntries on an ATTACHED book reads its entries, closing the installer over BOTH the gate and the read", async () => {
    const rec = readGapOps({ attached: true });
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, freeBelts());

    const entries = await bridge.worldInfo.listEntries(CHAT, BOOK);

    expect(entries).toEqual([{ id: "wentry_000000000000000000000", keys: ["k"], content: "lore", enabled: true }]);
    expect(rec.attachChecks).toEqual([{ owner: INSTALLER, bookId: BOOK }]);
    expect(rec.entryReads).toEqual([{ owner: INSTALLER, bookId: BOOK }]);
  });

  test("assets.read closes the INSTALLER over the CAS read (a guest names an id, never an owner)", async () => {
    const rec = readGapOps({});
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, freeBelts());

    const asset = await bridge.assets.read("asset_target0000000000000000");

    expect(asset).toEqual({ mime: "image/png", sizeBytes: 3, dataBase64: "AAAA" });
    expect(rec.assetReads).toEqual([{ installerUserId: INSTALLER, assetId: "asset_target0000000000000000" }]);
  });

  test("assets.read for a DIFFERENT installer reads under THAT installer (cross-owner is not expressible)", async () => {
    const rec = readGapOps({});
    const otherBridge = buildPluginBridge(rec.ops, OTHER, PLUGIN_REF, freeBelts());

    await otherBridge.assets.read("asset_target0000000000000000");

    expect(rec.assetReads).toEqual([{ installerUserId: OTHER, assetId: "asset_target0000000000000000" }]);
  });

  test("search.documents closes the INSTALLER over the search scope (a guest names only the query, never an owner)", async () => {
    const rec = readGapOps({});
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN_REF, freeBelts());

    const hits = await bridge.search.documents("dragons", 5);

    expect(hits).toEqual([{ documentId: "doc_hit000000000000000000000", documentName: "Notes", content: "match", score: 0.9 }]);
    // The op received the installer the bridge was built for — the compose scope is `{ ownerId: installerUserId }`,
    // so a cross-owner search is not expressible.
    expect(rec.searchReqs).toEqual([{ installerUserId: INSTALLER, queryText: "dragons" }]);
  });

  test("search.documents for a DIFFERENT installer searches under THAT installer (owner-scope is structural)", async () => {
    const rec = readGapOps({});
    const otherBridge = buildPluginBridge(rec.ops, OTHER, PLUGIN_REF, freeBelts());

    await otherBridge.search.documents("dragons", undefined);

    expect(rec.searchReqs).toEqual([{ installerUserId: OTHER, queryText: "dragons" }]);
  });
});
