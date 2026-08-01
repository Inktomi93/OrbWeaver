// assembly/user-macros — the chat-domain per-turn user-macro registry builder (WAVE MU delivery). Pins:
// the null fast-path (no defs), the frozen∪fresh draw union (swipe replay), rejected propagation, both
// registries carrying the defs, and that only random-pick inputs contribute draw records.
//
// Second suite: the TWO definition homes (preset + game, owner ruling #20) and the ruled collision policy
// (2026-08-01 — the GAME shadows the preset by name): who wins, that the shadow is a decision rather than
// kit's rejection, that a shadowed def never draws, and that a stored pick keyed by NAME survives the swap.
import type { ProcessMacroOptions, UserMacroDef } from "@orb/kit/macro";
import { createMacroContext } from "@orb/kit/macro";
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
    expect(buildTurnUserMacros({ preset: { id: "preset-1", defs: [] }, values: {}, prng: () => 0 })).toBeNull();
  });

  test("a random-pick draw is reported and the registry renders it", () => {
    // prng 0.5 × pool length 4 = index 2 → "tense".
    const b = unwrap(buildTurnUserMacros({ preset: { id: "preset-1", defs: [moodDef()] }, values: {}, prng: () => 0.5 }));
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
        preset: { id: "preset-1", defs: [moodDef()] },
        values: {},
        frozenDraws: { mood: { tone: "warm" } },
        prng: () => 0,
      }),
    );
    expect(b.draws).toEqual({ mood: { tone: "warm" } });
  });

  test("only random-pick inputs contribute a draw record", () => {
    const b = unwrap(buildTurnUserMacros({ preset: { id: "preset-1", defs: [greetingDef()] }, values: {}, prng: () => 0 }));
    // A single-select never draws → no record entry for it.
    expect(b.draws).toEqual({});
  });

  test("a name colliding with a builtin is REJECTED, never shadowed", () => {
    const collide: UserMacroDef = { ...moodDef(), name: "char" };
    const b = unwrap(buildTurnUserMacros({ preset: { id: "preset-1", defs: [collide] }, values: {}, prng: () => 0 }));
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
        preset: { id: "preset-1", defs: [moodDef(), second] },
        values: {},
        frozenDraws: { mood: { tone: "grim" } }, // mood replays; weather draws fresh
        prng: () => 0, // weather.sky index 0 → "grim"
      }),
    );
    expect(b.draws).toEqual({ mood: { tone: "grim" }, weather: { sky: "grim" } });
  });
});

// ── The TWO definition homes (owner ruling #20) + the ruled collision policy (game shadows preset) ────

/** The game's own `{{mood}}` — a DIFFERENT body + a single-select input, so which def won is observable in
 *  both the rendered output and the draw record (a single-select never draws). */
function gameMoodDef(): UserMacroDef {
  return {
    name: "mood",
    description: "the game's scene tone",
    args: [],
    body: "The game tone is {{tone}}.",
    strict: false,
    inputs: [
      {
        kind: "single-select",
        name: "tone",
        label: "Tone",
        options: [
          { label: "Doomed", value: "doomed" },
          { label: "Hopeful", value: "hopeful" },
        ],
        separator: ", ",
        onValue: "",
        offValue: "",
        defaultValue: "doomed",
      },
    ],
  };
}

/** Render a registered macro the way the section walk does — through a minimal MacroContext. */
function render(built: TurnUserMacros, name: string): string {
  const handler = built.registry.get(name);
  if (handler === undefined) {
    throw new Error(`expected ${name} to be registered`);
  }
  const ctxOpts: ProcessMacroOptions = { char: "Aria", user: "Nate", persona: "", scenario: "", env: {} };
  return String(handler([], createMacroContext(ctxOpts, built.registry)));
}

describe("assembly/user-macros — preset + game defs (owner ruling #20 / the 2026-08-01 shadow ruling)", () => {
  test("a GAME-only macro registers with game source attribution and renders", () => {
    const b = unwrap(
      buildTurnUserMacros({
        preset: { id: "preset-1", defs: [] },
        game: { id: "chat_1", defs: [gameMoodDef()] },
        values: {},
        prng: () => 0,
      }),
    );
    expect(b.registry.getMetadata("mood")?.source).toEqual({ kind: "game", id: "chat_1" });
    expect(b.freezeRegistry.get("mood")).toBeDefined();
    expect(render(b, "mood")).toBe("The game tone is doomed.");
    expect(b.rejected).toEqual([]);
  });

  test("SHADOW: on a name clash the GAME def wins — the preset's is dropped, NOT rejected, and never draws", () => {
    const b = unwrap(
      buildTurnUserMacros({
        preset: { id: "preset-1", defs: [moodDef()] }, // random-pick `{{mood}}`
        game: { id: "chat_1", defs: [gameMoodDef()] }, // single-select `{{mood}}` — wins
        values: {},
        prng: () => 0,
      }),
    );
    expect(b.registry.getMetadata("mood")?.source).toEqual({ kind: "game", id: "chat_1" });
    expect(render(b, "mood")).toBe("The game tone is doomed.");
    // The shadowed preset def is a RULED override, not an authoring error…
    expect(b.rejected).toEqual([]);
    // …and it never resolved its inputs: no ghost draw record for a macro nothing can reference.
    expect(b.draws).toEqual({});
  });

  test("the shadow is case-insensitive (the registry's own lookup posture) — never a silent rejection", () => {
    const b = unwrap(
      buildTurnUserMacros({
        preset: { id: "preset-1", defs: [{ ...moodDef(), name: "Mood" }] },
        game: { id: "chat_1", defs: [gameMoodDef()] },
        values: {},
        prng: () => 0,
      }),
    );
    expect(b.rejected).toEqual([]);
    expect(render(b, "mood")).toBe("The game tone is doomed.");
  });

  test("a NON-clashing preset macro is unaffected by the game's — both register, each with its own source", () => {
    const b = unwrap(
      buildTurnUserMacros({
        preset: { id: "preset-1", defs: [moodDef()] },
        game: { id: "chat_1", defs: [{ ...gameMoodDef(), name: "stakes", body: "Stakes: {{tone}}." }] },
        values: {},
        prng: () => 0.5,
      }),
    );
    expect(b.registry.getMetadata("mood")?.source).toEqual({ kind: "preset", id: "preset-1" });
    expect(b.registry.getMetadata("stakes")?.source).toEqual({ kind: "game", id: "chat_1" });
    expect(b.draws).toEqual({ mood: { tone: "tense" } }); // only the preset's random-pick drew
  });

  test("PICKS SURVIVE THE SHADOW: values key by macro NAME, so a pick made under the preset def binds to the game's", () => {
    const b = unwrap(
      buildTurnUserMacros({
        preset: { id: "preset-1", defs: [moodDef()] },
        game: { id: "chat_1", defs: [gameMoodDef()] },
        // The room picked `mood.tone = "hopeful"` — stored while EITHER def owned the name.
        values: { mood: { tone: "hopeful" } },
        prng: () => 0,
      }),
    );
    expect(render(b, "mood")).toBe("The game tone is hopeful.");
  });
});
