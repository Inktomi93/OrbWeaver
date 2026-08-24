// substrate: bridge — the per-installer PluginBridge builder (P4b-CORE / P4b-tail). Pure: no db, no Principal
// minting. The security-load-bearing property proven here is the turn.trigger FUNDER — the membrane passes only
// (chatId, depth, p); the funder is closed over the INSTALLER domain-side, so a guest can never fund a foreign
// turn (requestTurn resolves the room-host box + gates the funder's membership downstream). Also pins that the
// global-vars ops close over the installer (a cross-user KV read is structurally impossible). (The per-plugin
// spend wrap was stripped 2026-07-24 — enterprise spend enforcement; loop safety rides the per-member turn RATE
// budget + the cascade guard downstream in requestTurn, the n≤4 clamp + the ≤32 host-call cap for imagery.)

import { historyFloor } from "@orb/contracts/chat";
import type { ChatId, PluginId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { neutralizeMacros } from "@orb/kit/macro";
import { describe } from "vitest";
import type { NotifyFloor, PluginHostOps } from "../../../../../packages/server/src/domain/plugin/contract/ops.ts";
import { buildPluginBridge } from "../../../../../packages/server/src/domain/plugin/substrate/bridge.ts";
import { createNotifyFloor } from "../../../../../packages/server/src/domain/plugin/substrate/notify-floor.ts";
import { createFrozenClock, FROZEN_AT_MS } from "../../../../support/clock.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeInertOps } from "../_support.ts";

const INSTALLER = castId<UserId>("user_installer00000000000000");
const OTHER = castId<UserId>("user_other000000000000000000");
const PLUGIN = castId<PluginId>("plugin_bridge000000000000000001");
const CHAT = castId<ChatId>("chat_bridge0000000000000000");
const OTHER_PLUGIN = castId<PluginId>("plugin_other0000000000000000002");
const BOOK = "wbook_bridge00000000000000000";
/** A LIVE mutating macro — `{{setvar}}` is the one that turns a lore write into durable chat state. */
const LIVE_MACRO = "tension is {{setvar::tension::99}} now";
const NOT_ATTACHED_RE = /attached to this chat/u;
const AT_CAP_RE = /already owns 64 entries/u;
const NOTICE_FLOOR_RE = /one notice per 60s per chat/u;
/** A minimal valid `GenerateImageActionArgs` (the `generateImageActionArgsSchema` required fields). */
const IMAGE_ARGS = { mode: "free", n: 1, useAvatarReference: false, reuse: "never", quiet: true } as const;

/** A REAL notice floor whose clock never advances — inert for every non-notify test (one post per (plugin,
 *  chat) is always admitted), and NOT a permissive fake: the `notify` tests below drive the same factory with a
 *  moving clock, so the floor under test is the one production runs. */
function freeFloor(): NotifyFloor {
  return createNotifyFloor(() => FROZEN_AT_MS);
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
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN, freeFloor());

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
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN, freeFloor());

    await bridge.chat.requestTurn(CHAT, 0, {});

    const call = rec.turns.calls[0];
    expect(call).toEqual({ funderUserId: INSTALLER, chatId: CHAT, automationDepth: 0 });
    expect("speakerCharacterId" in (call ?? {})).toBe(false);
    expect("guided" in (call ?? {})).toBe(false);
  });

  test("a bridge for one installer NEVER funds another installer's turn (funder is structural)", async () => {
    const rec = recordingOps();
    const otherBridge = buildPluginBridge(rec.ops, OTHER, PLUGIN, freeFloor());

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
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN, freeFloor());

    await bridge.chat.listMessages(CHAT, 20);

    expect(rec.viewers).toEqual([INSTALLER]); // the viewer is the bridge's installer, structurally
    // §3.6 / D106: a member installer's read carries `readsHidden:false` so the read strips hidden spans.
    expect(rec.reads).toEqual([{ limit: 20, floorSeq: 7, readsHidden: false }]);
  });

  test("an unrestricted host installer reads at floor 0 verbatim — the common case is unchanged", async () => {
    const rec = readingOps({ role: "host", historyFloorSeq: historyFloor(0), readsHidden: true });
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN, freeFloor());

    await bridge.chat.listMessages(CHAT, undefined);

    // no `limit` key forwarded (exactOptionalPropertyTypes); a HOST reads hidden spans verbatim (`readsHidden:true`).
    expect(rec.reads).toEqual([{ floorSeq: 0, readsHidden: true }]);
  });

  test("a NON-member installer reads NOTHING — the canon read is never even issued", async () => {
    const rec = readingOps(null);
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN, freeFloor());

    // `null` = not a present member (an admission that raced a kick/leave). Fail-closed: `[]`, no partial read.
    await expect(bridge.chat.listMessages(CHAT, 20)).resolves.toEqual([]);
    expect(rec.reads).toEqual([]);
  });
});

describe("buildPluginBridge — global-vars close over the installer", () => {
  test("variables.get fetches under the installer's owner id (cross-user read structurally impossible)", async () => {
    const rec = recordingOps();
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN, freeFloor());

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
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN, freeFloor());

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
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN, freeFloor());

    await expect(bridge.worldInfo.upsertEntry(CHAT, { bookId: BOOK, entryKey: "mood", keys: [], contentTemplate: "inert", position: "after" })).rejects.toThrow(
      NOT_ATTACHED_RE,
    );
    expect(rec.writes).toEqual([]);
    // The probe asked about the ADMITTED chat, under the installer — not a guest-supplied scope.
    expect(rec.attachProbes).toEqual([{ ownerId: INSTALLER, chatId: CHAT, bookId: BOOK }]);
  });

  test("entries are TITLE-NAMESPACED per plugin (idempotent re-upsert; a human's entry is never clobbered)", async () => {
    const rec = loreOps();
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN, freeFloor());

    await bridge.worldInfo.upsertEntry(CHAT, { bookId: BOOK, entryKey: "mood", keys: ["k"], contentTemplate: "x", position: "after" });

    // Mirrors the rule path's `auto/<ruleId>:<entryKey>`: a same-named human entry is a DIFFERENT title, and a
    // re-upsert of the same entryKey updates this plugin's own row.
    expect(rec.writes[0]?.entries[0]?.title).toBe(`plugin/${PLUGIN}:mood`);
  });

  test("the per-plugin entry ceiling refuses a NEW entry at the cap but still allows UPDATING an owned one", async () => {
    const own = (n: number): string => `plugin/${PLUGIN}:e${n}`;
    const full = Array.from({ length: 64 }, (_, i) => own(i));
    const atCap = loreOps({ titles: [...full, "a human-authored entry", `plugin/${OTHER_PLUGIN}:theirs`] });
    const bridge = buildPluginBridge(atCap.ops, INSTALLER, PLUGIN, freeFloor());

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
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN, freeFloor());

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
    const bridge = buildPluginBridge(
      rec.ops,
      INSTALLER,
      PLUGIN,
      createNotifyFloor(() => clock.now()),
    );

    await bridge.notifications.post(CHAT, "all_members", "first");
    await expect(bridge.notifications.post(CHAT, "all_members", "second")).rejects.toThrow(NOTICE_FLOOR_RE);
    clock.advance(59_999);
    await expect(bridge.notifications.post(CHAT, "all_members", "still too soon")).rejects.toThrow(NOTICE_FLOOR_RE);

    expect(rec.posts.map((p) => p.message)).toEqual(["first"]);
  });

  test("the floor RELEASES at 60 s", async () => {
    const rec = noticeOps();
    const clock = createFrozenClock(FROZEN_AT_MS);
    const bridge = buildPluginBridge(
      rec.ops,
      INSTALLER,
      PLUGIN,
      createNotifyFloor(() => clock.now()),
    );

    await bridge.notifications.post(CHAT, "host", "first");
    clock.advance(60_000);
    await bridge.notifications.post(CHAT, "host", "second");

    expect(rec.posts.map((p) => p.message)).toEqual(["first", "second"]);
  });

  test("the floor is PER (plugin, chat) — a notice in one room does not mute another", async () => {
    const rec = noticeOps();
    const clock = createFrozenClock(FROZEN_AT_MS);
    const floor = createNotifyFloor(() => clock.now());
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN, floor);
    const otherPlugin = buildPluginBridge(rec.ops, INSTALLER, OTHER_PLUGIN, floor);
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
    const bridge = buildPluginBridge(
      rec.ops,
      INSTALLER,
      PLUGIN,
      createNotifyFloor(() => clock.now()),
    );

    const burst = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => bridge.notifications.post(CHAT, "all_members", `n${i}`)));

    expect(burst.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(rec.posts).toHaveLength(1);
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
    const bridge = buildPluginBridge(ops, INSTALLER, PLUGIN, freeFloor());

    const result = await bridge.imagery.generatePicture(CHAT, IMAGE_ARGS);

    expect(ran).toEqual(["generatePicture"]);
    expect(result).toEqual({ assetId: "asset_x0000000000000000000000" });
    expect("costUsd" in result).toBe(false);
  });
});
