// substrate: bridge — the per-installer PluginBridge builder (P4b-CORE / P4b-tail). Pure: no db, no Principal
// minting. The security-load-bearing property proven here is the turn.trigger FUNDER — the membrane passes only
// (chatId, depth, p); the funder is closed over the INSTALLER domain-side, so a guest can never fund a foreign
// turn (requestTurn resolves the room-host box + gates the funder's membership downstream). Also pins that the
// global-vars ops close over the installer (a cross-user KV read is structurally impossible). (The per-plugin
// spend wrap was stripped 2026-07-24 — enterprise spend enforcement; loop safety rides the per-member turn RATE
// budget + the cascade guard downstream in requestTurn, the n≤4 clamp + the ≤32 host-call cap for imagery.)

import type { ChatId, PluginId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { PluginHostOps } from "../../../../../packages/server/src/domain/plugin/contract/ops.ts";
import { buildPluginBridge } from "../../../../../packages/server/src/domain/plugin/substrate/bridge.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeInertOps } from "../_support.ts";

const INSTALLER = castId<UserId>("user_installer00000000000000");
const OTHER = castId<UserId>("user_other000000000000000000");
const PLUGIN = castId<PluginId>("plugin_bridge000000000000000001");
const CHAT = castId<ChatId>("chat_bridge0000000000000000");
/** A minimal valid `GenerateImageActionArgs` (the `generateImageActionArgsSchema` required fields). */
const IMAGE_ARGS = { mode: "free", n: 1, useAvatarReference: false, reuse: "never", quiet: true } as const;

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
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN);

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
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN);

    await bridge.chat.requestTurn(CHAT, 0, {});

    const call = rec.turns.calls[0];
    expect(call).toEqual({ funderUserId: INSTALLER, chatId: CHAT, automationDepth: 0 });
    expect("speakerCharacterId" in (call ?? {})).toBe(false);
    expect("guided" in (call ?? {})).toBe(false);
  });

  test("a bridge for one installer NEVER funds another installer's turn (funder is structural)", async () => {
    const rec = recordingOps();
    const otherBridge = buildPluginBridge(rec.ops, OTHER, PLUGIN);

    await otherBridge.chat.requestTurn(CHAT, 1, {});

    // The funder is whichever installer the bridge was built FOR — the guest has no lever on it.
    expect(rec.turns.calls[0]?.funderUserId).toBe(OTHER);
  });
});

describe("buildPluginBridge — global-vars close over the installer", () => {
  test("variables.get fetches under the installer's owner id (cross-user read structurally impossible)", async () => {
    const rec = recordingOps();
    const bridge = buildPluginBridge(rec.ops, INSTALLER, PLUGIN);

    await bridge.variables.get("some-key");

    expect(rec.varGets.owners).toEqual([INSTALLER]);
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
    const bridge = buildPluginBridge(ops, INSTALLER, PLUGIN);

    const result = await bridge.imagery.generatePicture(CHAT, IMAGE_ARGS);

    expect(ran).toEqual(["generatePicture"]);
    expect(result).toEqual({ assetId: "asset_x0000000000000000000000" });
    expect("costUsd" in result).toBe(false);
  });
});
