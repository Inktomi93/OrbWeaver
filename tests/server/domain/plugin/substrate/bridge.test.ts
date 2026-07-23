// substrate: bridge — the per-installer PluginBridge builder (P4b-CORE / P4b-tail). Pure: no db, no Principal
// minting. The security-load-bearing property proven here is the turn.trigger FUNDER — the membrane passes only
// (chatId, depth, p); the funder is closed over the INSTALLER domain-side, so a guest can never fund a foreign
// budget (requestTurn resolves the room-host box + gates the funder's membership downstream). Also pins that the
// global-vars ops close over the installer (a cross-user KV read is structurally impossible).

import type { ChatId, PluginId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { PluginHostOps, PluginSpendGate } from "../../../../../packages/server/src/domain/plugin/contract/ops.ts";
import { buildPluginBridge, PluginBudgetExhaustedError } from "../../../../../packages/server/src/domain/plugin/substrate/bridge.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeInertOps } from "../_support.ts";

const INSTALLER = castId<UserId>("user_installer00000000000000");
const OTHER = castId<UserId>("user_other000000000000000000");
const PLUGIN = castId<PluginId>("plugin_bridge000000000000000001");
const CHAT = castId<ChatId>("chat_bridge0000000000000000");
const ACTIONS_DAILY_RE = /actions_daily/u;
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
        return Promise.resolve({ costUsd: null });
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

describe("buildPluginBridge — turn.trigger funder is the installer (can't fund a foreign budget)", () => {
  test("requestTurn closes the funder over the installer + threads the child depth + maps speaker/guided", async () => {
    const rec = recordingOps();
    const bridge = buildPluginBridge(rec.ops, INSTALLER, null, PLUGIN);

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
    const bridge = buildPluginBridge(rec.ops, INSTALLER, null, PLUGIN);

    await bridge.chat.requestTurn(CHAT, 0, {});

    const call = rec.turns.calls[0];
    expect(call).toEqual({ funderUserId: INSTALLER, chatId: CHAT, automationDepth: 0 });
    expect("speakerCharacterId" in (call ?? {})).toBe(false);
    expect("guided" in (call ?? {})).toBe(false);
  });

  test("a bridge for one installer NEVER funds another installer's turn (funder is structural)", async () => {
    const rec = recordingOps();
    const otherBridge = buildPluginBridge(rec.ops, OTHER, null, PLUGIN);

    await otherBridge.chat.requestTurn(CHAT, 1, {});

    // The funder is whichever installer the bridge was built FOR — the guest has no lever on it.
    expect(rec.turns.calls[0]?.funderUserId).toBe(OTHER);
  });
});

describe("buildPluginBridge — global-vars close over the installer", () => {
  test("variables.get fetches under the installer's owner id (cross-user read structurally impossible)", async () => {
    const rec = recordingOps();
    const bridge = buildPluginBridge(rec.ops, INSTALLER, null, PLUGIN);

    await bridge.variables.get("some-key");

    expect(rec.varGets.owners).toEqual([INSTALLER]);
  });
});

// PLUGIN-SPEND — the domain-side spend wrap on the two spendy closures. A scriptable gate fake records the
// check/accumulate call order + args; the ops fake meters a cost the wrap must forward to `accumulate`.
function scriptedSpend(verdict: { readonly ok: true } | { readonly ok: false; readonly detail: string }): {
  readonly gate: PluginSpendGate;
  readonly order: string[];
  readonly accumulated: number[];
} {
  const order: string[] = [];
  const accumulated: number[] = [];
  let tail: Promise<unknown> = Promise.resolve();
  const gate: PluginSpendGate = {
    check: () => {
      order.push("check");
      return Promise.resolve(verdict);
    },
    accumulate: (costUsd) => {
      order.push("accumulate");
      accumulated.push(costUsd);
      return Promise.resolve();
    },
    // The real per-instance tail-promise serializer (the intra-invocation TOCTOU belt — activate.ts's shape).
    runExclusive: <T>(fn: () => Promise<T>): Promise<T> => {
      const run = tail.then(fn);
      tail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
  return { gate, order, accumulated };
}

/** An ops bundle whose spendy ops METER a fixed cost + record whether they ran (the after-op accumulate reads
 *  the metered cost; a refused op must NEVER run). */
function meteredOps(turnCost: number | null, imageCost: number | null): { readonly ops: PluginHostOps; readonly ran: string[] } {
  const ran: string[] = [];
  const base = makeInertOps();
  const ops: PluginHostOps = {
    ...base,
    chat: {
      ...base.chat,
      requestTurn: () => {
        ran.push("requestTurn");
        return Promise.resolve({ costUsd: turnCost });
      },
    },
    imagery: {
      generatePicture: () => {
        ran.push("generatePicture");
        return Promise.resolve({ assetId: "asset_x0000000000000000000000", costUsd: imageCost });
      },
    },
  };
  return { ops, ran };
}

describe("buildPluginBridge — PLUGIN-SPEND wrap (check BEFORE, accumulate AFTER, typed refusal)", () => {
  test("requestTurn: gate ok ⇒ check→op→accumulate the summed turn cost (order + metered $ forwarded)", async () => {
    const spend = scriptedSpend({ ok: true });
    const metered = meteredOps(0.42, null);
    const bridge = buildPluginBridge(metered.ops, INSTALLER, spend.gate, PLUGIN);

    await bridge.chat.requestTurn(CHAT, 0, {});

    expect(spend.order).toEqual(["check", "accumulate"]);
    expect(metered.ran).toEqual(["requestTurn"]);
    expect(spend.accumulated).toEqual([0.42]);
  });

  test("imagery: gate ok ⇒ check→op→accumulate the metered image cost, guest sees ONLY the assetId", async () => {
    const spend = scriptedSpend({ ok: true });
    const metered = meteredOps(null, 0.09);
    const bridge = buildPluginBridge(metered.ops, INSTALLER, spend.gate, PLUGIN);

    const result = await bridge.imagery.generatePicture(CHAT, IMAGE_ARGS);

    expect(spend.order).toEqual(["check", "accumulate"]);
    expect(spend.accumulated).toEqual([0.09]);
    // The cost is consumed host-side — it never crosses to the guest.
    expect(result).toEqual({ assetId: "asset_x0000000000000000000000" });
    expect("costUsd" in result).toBe(false);
  });

  test("a $0 local turn still accumulates (the action-count belt bumps regardless of cost)", async () => {
    const spend = scriptedSpend({ ok: true });
    const metered = meteredOps(null, null); // a local turn meters no $ (costUsd null → 0)
    const bridge = buildPluginBridge(metered.ops, INSTALLER, spend.gate, PLUGIN);

    await bridge.chat.requestTurn(CHAT, 0, {});

    // accumulate is CALLED (→ the persisted +1 action) even at $0 — the local-hardware belt.
    expect(spend.order).toEqual(["check", "accumulate"]);
    expect(spend.accumulated).toEqual([0]);
  });

  test("budget exhausted ⇒ the op NEVER runs, a typed PluginBudgetExhaustedError is thrown (never accumulate)", async () => {
    const spend = scriptedSpend({ ok: false, detail: "actions_daily" });
    const metered = meteredOps(1, 1);
    const bridge = buildPluginBridge(metered.ops, INSTALLER, spend.gate, PLUGIN);

    await expect(bridge.chat.requestTurn(CHAT, 0, {})).rejects.toBeInstanceOf(PluginBudgetExhaustedError);
    await expect(bridge.imagery.generatePicture(CHAT, IMAGE_ARGS)).rejects.toThrow(ACTIONS_DAILY_RE);

    // The spendy op never fired and nothing accumulated — a refusal debits nothing.
    expect(metered.ran).toEqual([]);
    expect(spend.order).toEqual(["check", "check"]);
    expect(spend.accumulated).toEqual([]);
  });

  test("null gate (snippet path) ⇒ the spendy closures run ungated (no check, no accumulate)", async () => {
    const metered = meteredOps(5, 5);
    const bridge = buildPluginBridge(metered.ops, INSTALLER, null, PLUGIN);

    await bridge.chat.requestTurn(CHAT, 0, {});

    expect(metered.ran).toEqual(["requestTurn"]);
  });
});
