// substrate/teaching — THE S2 COLLECTION's laws, unit tier (no db): the fold is ORDER-DATA (not edit
// history), the DOUBLE-TEACH GUARD collapses byte-identical injections across contributions, the tool-attach
// axis is a deduped union, and a broken contribution fails LOUD rather than silently assembling a prompt that
// omits what the model was told it could do. The assembled-output half of these pins is `teaching.int.test.ts`.

import type { ChatInjection } from "@orb/contracts/chat";
import type { ChatId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { TeachingContext, TeachingContribution } from "../../../../../packages/server/src/domain/chat/contract/context.ts";
import { DEFAULT_CHAT_BEHAVIOR } from "../../../../../packages/server/src/domain/chat/contract/foreign.ts";
import { collectTeaching, resolveTeachingKnobs } from "../../../../../packages/server/src/domain/chat/substrate/teaching.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const TCTX: TeachingContext = {
  chatId: castId<ChatId>("chat_teach"),
  runAsUserId: castId<UserId>("user_host"),
  knobs: { offerChoices: false, charactersCanReact: false, reactionsEnabled: true },
  prose: {},
  identity: { user: "Alex", char: "Aria" },
  rpgGather: null,
};

function injection(content: string, over: Partial<ChatInjection> = {}): ChatInjection {
  return { position: "in_chat", depth: 0, role: "system", content, ...over };
}

/** A contribution that emits exactly what it is handed. */
function contributionOf(
  id: string,
  order: number,
  out: { readonly injections?: readonly ChatInjection[]; readonly toolNames?: readonly string[] },
): TeachingContribution {
  return {
    id,
    order,
    collect: () => Promise.resolve({ injections: out.injections ?? [], toolNames: out.toolNames ?? [] }),
  };
}

describe("collectTeaching — the S2 fold", () => {
  test("an EMPTY registry collects nothing — the byte-identical floor every chat had before this seam", async () => {
    expect(await collectTeaching([], TCTX)).toEqual({ injections: [], toolNames: [] });
  });

  test("contributions fold in ASCENDING order, never registration order", async () => {
    const registry = [
      contributionOf("late", 10, { injections: [injection("LATE")] }),
      contributionOf("early", 0, { injections: [injection("EARLY")] }),
      contributionOf("mid", 5, { injections: [injection("MID")] }),
    ];

    const out = await collectTeaching(registry, TCTX);

    expect(out.injections.map((i) => i.content)).toEqual(["EARLY", "MID", "LATE"]);
  });

  test("an order TIE keeps registration order (a stable sort — the fold is deterministic either way)", async () => {
    const registry = [contributionOf("a", 3, { injections: [injection("A")] }), contributionOf("b", 3, { injections: [injection("B")] })];

    expect((await collectTeaching(registry, TCTX)).injections.map((i) => i.content)).toEqual(["A", "B"]);
  });

  test("THE DOUBLE-TEACH GUARD: two contributions emitting the byte-identical injection contribute it ONCE", async () => {
    const teach = injection("CHOICES: end every response with a set of choices for the player.");
    const registry = [contributionOf("game", 0, { injections: [injection("STATE BLOCK"), teach] }), contributionOf("chat", 1, { injections: [{ ...teach }] })];

    const out = await collectTeaching(registry, TCTX);

    expect(out.injections.map((i) => i.content)).toEqual(["STATE BLOCK", teach.content]);
  });

  test("the guard is IDENTITY-keyed, not content-keyed: the same words at a different placement both survive", async () => {
    const teach = injection("TEACH");
    const registry = [
      contributionOf("a", 0, { injections: [teach] }),
      contributionOf("b", 1, { injections: [{ ...teach, depth: 4 }] }),
      contributionOf("c", 2, { injections: [{ ...teach, role: "user" }] }),
      contributionOf("d", 3, { injections: [{ ...teach, position: "in_static" }] }),
    ];

    expect((await collectTeaching(registry, TCTX)).injections).toHaveLength(4);
  });

  test("the SURVIVOR is the first occurrence — a later contribution never displaces an earlier one's placement", async () => {
    const registry = [
      contributionOf("first", 0, { injections: [injection("T", { order: 1 })] }),
      contributionOf("second", 1, { injections: [injection("T", { order: 1 }), injection("OTHER")] }),
    ];

    const out = await collectTeaching(registry, TCTX);

    expect(out.injections).toEqual([injection("T", { order: 1 }), injection("OTHER")]);
  });

  test("toolNames union: deduped, first-occurrence order — the R2 attach axis", async () => {
    const registry = [
      contributionOf("a", 0, { toolNames: ["react", "roll"] }),
      contributionOf("b", 1, { toolNames: ["roll", "recap"] }),
      contributionOf("c", 2, { toolNames: [] }),
    ];

    expect((await collectTeaching(registry, TCTX)).toolNames).toEqual(["react", "roll", "recap"]);
  });

  test("a contribution that THROWS fails the turn — teaching is prompt content, never silently dropped", async () => {
    const registry = [
      contributionOf("ok", 0, { injections: [injection("OK")] }),
      { id: "broken", order: 1, collect: () => Promise.reject(new Error("contribution exploded")) },
    ];

    await expect(collectTeaching(registry, TCTX)).rejects.toThrow("contribution exploded");
  });

  test("every contribution reads the SAME tctx instance — one resolution per turn, never a per-contribution re-read", async () => {
    const seen: TeachingContext[] = [];
    const spy = (id: string, order: number): TeachingContribution => ({
      id,
      order,
      collect: (tctx) => {
        seen.push(tctx);
        return Promise.resolve({ injections: [], toolNames: [] });
      },
    });

    await collectTeaching([spy("a", 0), spy("b", 1)], TCTX);

    expect(seen).toHaveLength(2);
    expect(seen[0]).toBe(TCTX);
    expect(seen[1]).toBe(TCTX);
  });
});

// B1 — the knob's PRECEDENCE, pinned as its own unit because every other pin in this repo that touches it
// reads it through a turn: the ROOM value wins, an ABSENT room value inherits the frozen host's per-user
// default, and there is no third rule. The `false || true` arm is the one that matters — an `||` instead of a
// `??` would pass three of these four and silently make "off for this room" unrepresentable.
describe("resolveTeachingKnobs — room over host default", () => {
  const hostDefault = (offerChoices: boolean): typeof DEFAULT_CHAT_BEHAVIOR => ({ ...DEFAULT_CHAT_BEHAVIOR, offerChoices });

  test("an ABSENT room value inherits the host's default (both polarities)", () => {
    expect(resolveTeachingKnobs({}, hostDefault(true))).toEqual({ offerChoices: true });
    expect(resolveTeachingKnobs({}, hostDefault(false))).toEqual({ offerChoices: false });
  });

  test("an EXPLICIT room value wins over the host's default (both polarities)", () => {
    expect(resolveTeachingKnobs({ offerChoices: true }, hostDefault(false))).toEqual({ offerChoices: true });
    expect(resolveTeachingKnobs({ offerChoices: false }, hostDefault(true))).toEqual({ offerChoices: false });
  });
});
