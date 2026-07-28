// assembly/user-macros — the chat-domain per-turn user-macro registry builder (WAVE MU delivery). Pins:
// the null fast-path (no defs), the frozen∪fresh draw union (swipe replay), rejected propagation, both
// registries carrying the defs, and that only random-pick inputs contribute draw records.
import type { UserMacroDef } from "@orb/kit/macro";
import { describe } from "vitest";
import { buildTurnUserMacros } from "../../../../../packages/server/src/domain/chat/assembly/user-macros";
import type { TurnUserMacros } from "../../../../../packages/server/src/domain/chat/contract/assembly-macros";
import { expect, test } from "../../../../support/fixtures";

/** Assert-and-narrow: `buildTurnUserMacros` returns `TurnUserMacros | null`; every non-empty-defs test
 *  wants the built value, so unwrap once (fails loudly on the fast-path null instead of `?.`-guarding). */
function unwrap(result: TurnUserMacros | null): TurnUserMacros {
  if (result === null) {
    throw new Error("expected a built registry");
  }
  return result;
}

/** A minimal random-pick user macro `{{mood}}` with one input `tone` over a 4-option pool. */
function moodDef(): UserMacroDef {
  return {
    name: "mood",
    description: "the scene tone",
    args: [],
    body: "The tone is {{tone}}.",
    strict: false,
    inputs: [
      {
        kind: "random-pick",
        name: "tone",
        label: "Tone",
        options: [
          { label: "Grim", value: "grim" },
          { label: "Warm", value: "warm" },
          { label: "Tense", value: "tense" },
          { label: "Wry", value: "wry" },
        ],
        separator: ", ",
        onValue: "",
        offValue: "",
        defaultValue: "",
      },
    ],
  };
}

/** A static single-select macro (never draws) — proves only random-pick contributes a draw record. */
function greetingDef(): UserMacroDef {
  return {
    name: "greeting",
    description: "a fixed greeting",
    args: [],
    body: "Say {{style}}.",
    strict: false,
    inputs: [
      {
        kind: "single-select",
        name: "style",
        label: "Style",
        options: [{ label: "Formal", value: "formally" }],
        separator: "",
        onValue: "",
        offValue: "",
        defaultValue: "formally",
      },
    ],
  };
}

describe("assembly/user-macros — the per-turn registry builder", () => {
  test("empty defs → null (the byte-identical singleton fast path)", () => {
    expect(buildTurnUserMacros({ defs: [], sourceId: "preset-1", values: {}, prng: () => 0 })).toBeNull();
  });

  test("a random-pick draw is reported and the registry renders it", () => {
    // prng 0.5 × pool length 4 = index 2 → "tense".
    const b = unwrap(buildTurnUserMacros({ defs: [moodDef()], sourceId: "preset-1", values: {}, prng: () => 0.5 }));
    expect(b.draws).toEqual({ mood: { tone: "tense" } });
    // Both registries carry the macro (render + freeze).
    expect(b.registry.get("mood")).toBeDefined();
    expect(b.freezeRegistry.get("mood")).toBeDefined();
    expect(b.rejected).toEqual([]);
  });

  test("frozen draws REPLAY byte-exact (a swipe) — the prng is not consulted", () => {
    // A prng that would draw a DIFFERENT option (0.0 → "grim") is ignored because "warm" is frozen.
    const b = unwrap(
      buildTurnUserMacros({
        defs: [moodDef()],
        sourceId: "preset-1",
        values: {},
        frozenDraws: { mood: { tone: "warm" } },
        prng: () => 0,
      }),
    );
    expect(b.draws).toEqual({ mood: { tone: "warm" } });
  });

  test("only random-pick inputs contribute a draw record", () => {
    const b = unwrap(buildTurnUserMacros({ defs: [greetingDef()], sourceId: "preset-1", values: {}, prng: () => 0 }));
    // A single-select never draws → no record entry for it.
    expect(b.draws).toEqual({});
  });

  test("a name colliding with a builtin is REJECTED, never shadowed", () => {
    const collide: UserMacroDef = { ...moodDef(), name: "char" };
    const b = unwrap(buildTurnUserMacros({ defs: [collide], sourceId: "preset-1", values: {}, prng: () => 0 }));
    expect(b.rejected.map((r) => r.name)).toContain("char");
    // A rejected macro is not registered as a user macro → the builtin `{{char}}` keeps its own category
    // (metadata is exposed via `getMetadata`, not on the bare `MacroHandler` a `get` returns).
    expect(b.registry.getMetadata("char")?.category).not.toBe("user");
  });

  test("the effective record = frozen ∪ fresh across two macros (one replayed, one drawn)", () => {
    const moodInput = moodDef().inputs[0];
    if (moodInput === undefined) {
      throw new Error("moodDef must declare an input");
    }
    const second: UserMacroDef = { ...moodDef(), name: "weather", body: "{{sky}}.", inputs: [{ ...moodInput, name: "sky" }] };
    const b = unwrap(
      buildTurnUserMacros({
        defs: [moodDef(), second],
        sourceId: "preset-1",
        values: {},
        frozenDraws: { mood: { tone: "grim" } }, // mood replays; weather draws fresh
        prng: () => 0, // weather.sky index 0 → "grim"
      }),
    );
    expect(b.draws).toEqual({ mood: { tone: "grim" }, weather: { sky: "grim" } });
  });
});
