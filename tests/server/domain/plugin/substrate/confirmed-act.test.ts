// substrate: confirmed-act — THE ENFORCEMENT-SET PIN for S4 posture 2.
//
// The rule these rows exist to hold: **the enforcement set follows the ORIGIN, not the executor.** Two of the
// three suggestible plugin acts have an automation ARM that looks identical, and automation already owns a
// dispatcher that could run them — so the wrong wiring COMPILES and DEMOS CORRECTLY while quietly swapping
// which belts apply. The only way to catch that is to assert the PLUGIN's own gates fire on the confirmed
// path: the book-attached-to-chat gate, the per-plugin entry ceiling, `neutralizeMacros`, and the installer
// being closed over as the funder. Each row below fails if a future "simplification" routes a confirmed act
// through automation's arms instead.

import type { PluginSuggestedAct } from "@orb/contracts/plugin";
import type { ChatId, PluginId, UserId, WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { PluginBelts, PluginHostOps } from "../../../../../packages/server/src/domain/plugin/contract/ops.ts";
import { buildConfirmedActRunner } from "../../../../../packages/server/src/domain/plugin/substrate/confirmed-act.ts";
import { createNotifyFloor } from "../../../../../packages/server/src/domain/plugin/substrate/notify-floor.ts";
import {
  createPluginRateFloor,
  PLUGIN_ASSET_EGRESS_PER_HOUR,
  PLUGIN_EGRESS_PER_HOUR,
  PLUGIN_QUIET_LLM_PER_HOUR,
} from "../../../../../packages/server/src/domain/plugin/substrate/rate-floor.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeInertOps } from "../_support.ts";

const PLUGIN_ID = castId<PluginId>("plugin_confirmed000000000001");
const INSTALLER = castId<UserId>("user_installer00000000000000");
const CHAT = castId<ChatId>("chat_confirmed00000000000000");
const BOOK = castId<WorldBookId>("wbook_confirmed0000000000000");
const NOT_ATTACHED_RE = /attached to this chat/u;
const AT_CAP_RE = /already owns 64 entries/u;
/** A LIVE mutating macro — `{{setvar}}` is the one that turns a lore write into durable chat state. */
const LIVE_MACRO = "the storm is {{setvar::tension::99}} bad";

function belts(): PluginBelts {
  return {
    notify: createNotifyFloor(() => FROZEN_AT_MS),
    egress: createPluginRateFloor(() => FROZEN_AT_MS, { capability: "net.fetch", limit: PLUGIN_EGRESS_PER_HOUR }),
    assetEgress: createPluginRateFloor(() => FROZEN_AT_MS, { capability: "net.fetchAsset", limit: PLUGIN_ASSET_EGRESS_PER_HOUR }),
    quietLlm: createPluginRateFloor(() => FROZEN_AT_MS, { capability: "llm.quiet", limit: PLUGIN_QUIET_LLM_PER_HOUR }),
  };
}

/** An ops bundle recording every write the confirmed act reaches, with injectable lore gates. */
function recordingOps(over: { readonly attached?: boolean; readonly titles?: readonly string[] } = {}): {
  readonly ops: PluginHostOps;
  readonly lore: Parameters<PluginHostOps["worldInfo"]["upsertEntries"]>[0][];
  readonly turns: Parameters<PluginHostOps["chat"]["requestTurn"]>[0][];
  readonly pictures: Parameters<PluginHostOps["imagery"]["generatePicture"]>[0][];
} {
  const lore: Parameters<PluginHostOps["worldInfo"]["upsertEntries"]>[0][] = [];
  const turns: Parameters<PluginHostOps["chat"]["requestTurn"]>[0][] = [];
  const pictures: Parameters<PluginHostOps["imagery"]["generatePicture"]>[0][] = [];
  const base = makeInertOps();
  return {
    lore,
    turns,
    pictures,
    ops: {
      ...base,
      chat: {
        ...base.chat,
        requestTurn: (req): Promise<void> => {
          turns.push(req);
          return Promise.resolve();
        },
      },
      worldInfo: {
        ...base.worldInfo,
        upsertEntries: (req): Promise<{ inserted: number; updated: number; skippedHandEdited: number }> => {
          lore.push(req);
          return Promise.resolve({ inserted: 1, updated: 0, skippedHandEdited: 0 });
        },
        isBookAttachedToChat: () => Promise.resolve(over.attached ?? true),
        listEntryTitles: () => Promise.resolve([...(over.titles ?? [])]),
      },
      imagery: {
        // The return type is DERIVED from the op, never re-spelled: the real shape carries its own
        // foreign-id exemption (the sandbox wire DTO is unbranded by design), and re-declaring
        // `{ assetId: string }` here would be a second, UNexempted home for that same decision.
        generatePicture: (req): ReturnType<PluginHostOps["imagery"]["generatePicture"]> => {
          pictures.push(req);
          return Promise.resolve({ assetId: "asset_x0000000000000000000000" });
        },
      },
    },
  };
}

function run(ops: PluginHostOps, act: PluginSuggestedAct): Promise<void> {
  return buildConfirmedActRunner(ops, belts())({ pluginId: PLUGIN_ID, installerUserId: INSTALLER, chatId: CHAT, act });
}

describe("buildConfirmedActRunner — a confirmed act meets the PLUGIN's gates, not automation's", () => {
  test("the lore write goes through the plugin bridge: namespaced title + macros NEUTRALIZED", async () => {
    // If a confirmed act were routed through automation's `insert_world_info_entry` arm it would render its
    // template at write time under AUTOMATION's rules and land under `auto/<ruleId>:` — neither of which is
    // this plugin's namespace or this plugin's neutralization. The title prefix is the tell.
    const rec = recordingOps();
    await run(rec.ops, {
      kind: "worldInfoUpsert",
      entry: { bookId: BOOK, entryKey: "storm", keys: ["storm"], contentTemplate: LIVE_MACRO, position: "before" },
    });

    expect(rec.lore).toHaveLength(1);
    expect(rec.lore[0]?.authorUserId).toBe(INSTALLER);
    expect(rec.lore[0]?.entries[0]?.title).toBe(`plugin/${PLUGIN_ID}:storm`);
    // The braces are inert — a `worldinfo.write` grant must not become a DELAYED `chat.variables.write` at
    // assembly time, and a host saying "yes" to a lore entry did not say yes to that.
    expect(rec.lore[0]?.entries[0]?.content).not.toContain("{{setvar");
  });

  test("an UNATTACHED book refuses at confirm time — the room can withdraw consent between ask and answer", async () => {
    const rec = recordingOps({ attached: false });
    await expect(
      run(rec.ops, { kind: "worldInfoUpsert", entry: { bookId: BOOK, entryKey: "storm", keys: [], contentTemplate: "x", position: "before" } }),
    ).rejects.toThrow(NOT_ATTACHED_RE);
    expect(rec.lore).toEqual([]);
  });

  test("the per-plugin ENTRY CEILING still applies to a confirmed act (a host yes is not a budget top-up)", async () => {
    const full = Array.from({ length: 64 }, (_, i) => `plugin/${PLUGIN_ID}:e${i}`);
    const rec = recordingOps({ titles: full });
    await expect(
      run(rec.ops, { kind: "worldInfoUpsert", entry: { bookId: BOOK, entryKey: "one-more", keys: [], contentTemplate: "x", position: "before" } }),
    ).rejects.toThrow(AT_CAP_RE);
    expect(rec.lore).toEqual([]);
  });

  test("the confirmed turn is FUNDED BY THE INSTALLER and replays the stashed CHILD depth verbatim", async () => {
    // Funding: the confirmer authorizes, they do not pay — §3-S4's identity law in the plugin's spelling.
    // Depth: replayed, never re-derived, so a delay between ask and answer cannot re-base the cascade ceiling.
    const rec = recordingOps();
    await run(rec.ops, { kind: "requestTurn", automationDepth: 3, guided: "push the scene" });

    expect(rec.turns).toEqual([{ triggeredBy: INSTALLER, chatId: CHAT, automationDepth: 3, guided: "push the scene" }]);
  });

  test("omitted turn hints stay ABSENT, not undefined (exactOptionalPropertyTypes, as on the direct path)", async () => {
    const rec = recordingOps();
    await run(rec.ops, { kind: "requestTurn", automationDepth: 1 });
    const call = rec.turns[0];
    expect("speakerCharacterId" in (call ?? {})).toBe(false);
    expect("guided" in (call ?? {})).toBe(false);
  });

  test("the confirmed picture is attributed to the INSTALLER and returns nothing to the caller", async () => {
    const rec = recordingOps();
    await run(rec.ops, { kind: "generatePicture", args: { mode: "free", n: 1, useAvatarReference: false, reuse: "never", quiet: true } });

    expect(rec.pictures).toHaveLength(1);
    expect(rec.pictures[0]?.authorUserId).toBe(INSTALLER);
    expect(rec.pictures[0]?.chatId).toBe(CHAT);
  });
});
