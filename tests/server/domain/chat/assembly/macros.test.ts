// assembly/macros — the chat-domain macro wiring (the chat design doc Part II §0/§3; D46 env-by-reference + the
// determinism seam). Pins: the AssembleContext → macro mapping ({{char}}/{{user}}/{{persona}}/{{scenario}}
// room-override/{{group}}), {{original}} threading, the SHARED env (a setvar in one render is visible to the
// next), and the injected clock (nowMs) → deterministic output.
import type { AssembleContext } from "@orb/contracts/chat";
import { DEFAULT_FORMAT_STRINGS, DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { CharacterId, ChatId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RowMacroStamps } from "@orb/kit/macro";
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import { describe } from "vitest";
import {
  buildTurnMacroContext,
  renderHistoryMacros,
  renderMacros,
  resolveGuidedActionText,
  resolveNudgeText,
} from "../../../../../packages/server/src/domain/chat/assembly/macros.ts";
import type { HistoryMacroNames } from "../../../../../packages/server/src/domain/chat/contract/results.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/u;

function ctxOf(over: Partial<AssembleContext> = {}): AssembleContext {
  return {
    character: { name: "Aria", description: "a bold knight", scenario: "the keep" },
    promptConfig: DEFAULT_PROMPT_CONFIG,
    recentMessages: [],
    ...over,
  };
}

/** Build the {@link HistoryMacroNames} producer from plain id/name(+description) entries — the test-local
 *  stand-in for `persistence/macro-names.ts`'s `loadChatMacroNameProducer` + `buildCharacterNameMap`/
 *  `buildPersonaNameMap` (Chat-Macro-Resolution.md §1). */
function producerOf(
  chars: readonly { id: CharacterId; name: string }[] = [],
  personas: readonly { id: PersonaId; name: string; description?: string }[] = [],
): HistoryMacroNames {
  return {
    characterNamesById: new Map(chars.map((c) => [c.id, { name: c.name }])),
    personaNamesById: new Map(personas.map((p) => [p.id, { name: p.name, description: p.description ?? "" }])),
  };
}

const EMPTY_PRODUCER = producerOf();
const NO_STAMPS: RowMacroStamps = { characterId: null, personaId: null };

describe("renderMacros", () => {
  test("resolves {{char}}, {{user}}, {{persona}} against the section persona", () => {
    const ctx = ctxOf();
    const persona = { name: "Nyx", description: "a wandering scholar" };
    expect(renderMacros("{{char}} meets {{user}}", ctx, persona)).toBe("Aria meets Nyx");
    expect(renderMacros("{{persona}}", ctx, persona)).toBe("a wandering scholar");
  });

  // ONE spelling of the unresolved-persona floor across the macro layer, the SHAPE name-stamp and the
  // client's row attribution (`DEFAULT_PERSONA_NAME`) — it was four literals, two of them disagreeing.
  test("{{user}} falls back to the ONE unresolved-persona name when no persona", () => {
    expect(renderMacros("{{user}}", ctxOf(), null)).toBe(DEFAULT_PERSONA_NAME);
  });

  test("{{scenario}} resolves room override > card", () => {
    expect(renderMacros("{{scenario}}", ctxOf(), null)).toBe("the keep");
    const withRoom = ctxOf({ roomOverrides: { scenario: "the dungeon" } });
    expect(renderMacros("{{scenario}}", withRoom, null)).toBe("the dungeon");
  });

  test("{{char}} = the joined character names under a narrator (`multi-voice`) speaker", () => {
    const aria = { name: "Aria", description: "" };
    const kai = { name: "Kai", description: "" };
    const ctx = ctxOf({
      characters: [aria, kai],
      speaker: { kind: "multi-voice", members: [aria, kai], active: aria },
    });
    expect(renderMacros("{{char}}", ctx, null)).toBe("Aria, Kai");
  });

  test("{{group}} = the full character names", () => {
    const ctx = ctxOf({
      characters: [
        { name: "Aria", description: "" },
        { name: "Kai", description: "" },
      ],
    });
    expect(renderMacros("{{group}}", ctx, null)).toBe("Aria, Kai");
  });

  test("{{original}} threads the preset text into the overridable render", () => {
    expect(renderMacros("CARD {{original}}", ctxOf(), null, { original: "PRESET" })).toBe("CARD PRESET");
    expect(renderMacros("X {{original}} Y", ctxOf(), null)).toBe("X  Y");
  });

  test("D46 env-by-reference: a setvar is visible to a later render sharing variableValues", () => {
    const variableValues: Record<string, string> = {};
    const ctx = ctxOf({ variableValues });
    expect(renderMacros("{{setvar::pov::first}}", ctx, null)).toBe("");
    // Second render, SAME ctx.variableValues reference → the var persists.
    expect(renderMacros("{{getvar::pov}}", ctx, null)).toBe("first");
    expect(variableValues["pov"]).toBe("first");
  });

  test("ChoiceBlock variables resolve via {{getvar}} / bare {{name}}", () => {
    const ctx = ctxOf({ variableValues: { tense: "past" } });
    expect(renderMacros("{{getvar::tense}}", ctx, null)).toBe("past");
    expect(renderMacros("{{tense}}", ctx, null)).toBe("past");
  });

  test("determinism: a pinned nowMs makes {{date}} stable + format-correct", () => {
    const ctx = ctxOf({ nowMs: 1_750_000_000_000, timezone: "UTC" });
    const a = renderMacros("{{date}}", ctx, null);
    const b = renderMacros("{{date}}", ctx, null);
    expect(a).toBe(b);
    expect(a).toMatch(ISO_DATE_RE);
  });
});

// The parity-plus P6 macro × rpg channel (§12): the celBindings + idleDuration + rpgMacros fields on an
// AssembleContext reach the kit MacroContext through `macroOptionsFor`, so `{{expr::rpg.…}}` / `{{idle_duration}}`
// / `{{rpgSceneState}}` resolve on a game turn and DEGRADE (byte-identically "") off a game.
describe("P6 macro × rpg channel — celBindings / idle_duration / rpg macros reach the render", () => {
  test("{{expr::rpg.…}} evaluates against the staged rpg CEL binding on a game turn", () => {
    const ctx = ctxOf({
      celBindings: {
        rpg: {
          scene: { location: "Dunmoor", weather: "storm", day: 3 },
          characters: [
            { name: "Mari", mood: "wary", relationship: "enemy" },
            { name: "Kael", mood: "calm", relationship: "ally" },
          ],
          quests: [{ name: "The Key", status: "active", objectivesOpen: 1, objectivesTotal: 3 }],
          delta: { text: "kael HP 12→16 (+4)" },
        },
      },
    });
    expect(renderMacros("{{expr::rpg.scene.location}}", ctx, null)).toBe("Dunmoor");
    expect(renderMacros('{{expr::rpg.characters.exists(c, c.relationship == "enemy")}}', ctx, null)).toBe("true");
    expect(renderMacros('{{expr::rpg.quests.filter(q, q.status == "active").size()}}', ctx, null)).toBe("1");
  });

  test('{{expr::rpg.…}} errors-to-"" off a game (no rpg binding staged — the built CEL degrade)', () => {
    // A non-game chat stages no celBindings ⇒ the field reference errors → "" (byte-identical to no expr).
    expect(renderMacros("{{expr::rpg.scene.location}}", ctxOf(), null)).toBe("");
    expect(renderMacros('{{expr::rpg.characters.exists(c, c.relationship == "enemy")}}', ctxOf(), null)).toBe("");
  });

  test('{{idle_duration}} renders the staged human text on a turn, "" when absent', () => {
    expect(renderMacros("{{idle_duration}}", ctxOf({ idleDuration: "8 minutes" }), null)).toBe("8 minutes");
    expect(renderMacros("{{idle_duration}}", ctxOf(), null)).toBe("");
  });

  test('{{rpgSceneState}} renders the staged value on a game, "" off a game (READ mirror)', () => {
    expect(renderMacros("{{rpgSceneState}}", ctxOf({ rpgMacros: { rpgSceneState: "Scene: Dunmoor" } }), null)).toBe("Scene: Dunmoor");
    // Off-game (no rpgMacros) AND an unstaged full-mode key both resolve "" — the honest empty.
    expect(renderMacros("{{rpgSceneState}}", ctxOf(), null)).toBe("");
    expect(renderMacros("{{rpgMap}}", ctxOf({ rpgMacros: { rpgSceneState: "x" } }), null)).toBe("");
  });
});

const ARIA = castId<CharacterId>("char_aria");
const NYX = castId<PersonaId>("persona_nyx");
const ZARA = castId<PersonaId>("persona_zara");
const MARA = castId<PersonaId>("persona_mara");

describe("renderHistoryMacros", () => {
  test("{{char}} binds to the ROW'S OWN speaker via the producer, not the ctx primary", () => {
    // Active speaker is Kai (the ctx default); a past row stamped `characterId: ARIA` must still resolve
    // {{char}} to the producer's Aria — the row's OWN stamp, never the ctx's current speaker.
    const ctx = ctxOf({ character: { name: "Kai", description: "the rogue" } });
    const producer = producerOf([{ id: ARIA, name: "Aria" }]);
    const stamps: RowMacroStamps = { characterId: ARIA, personaId: null };
    expect(renderHistoryMacros("{{char}} waves", stamps, ctx, { producer })).toBe("Aria waves");
  });

  test("a null characterId stamp resolves {{char}} to the CHARACTERS (ruling B), not the turn's speaker default", () => {
    // Ruling B (Chat-Macro-Resolution.md §2/§4): a HUMAN-authored / narrator row (characterId === null)
    // resolves {{char}} to the CHARACTERS — the one character in solo, the joined names in a multi-character room
    // (== {{group}}) — never the arbitrary current speaker. renderHistoryMacros always feeds the characters
    // (ctx.characters ?? [ctx.character]), so it wins over any explicit speakerCharName for a narrator row.
    const solo = ctxOf({ character: { name: "Aria", description: "a bold knight" } });
    expect(
      renderHistoryMacros("{{char}} nods", NO_STAMPS, solo, {
        producer: EMPTY_PRODUCER,
        speakerCharName: "Kai",
      }),
    ).toBe("Aria nods");
    // A multi-character room: the narrator row's {{char}} is the JOINED character names.
    const multi = ctxOf({
      character: { name: "Aria", description: "" },
      characters: [
        { name: "Aria", description: "" },
        { name: "Kai", description: "" },
      ],
    });
    expect(renderHistoryMacros("{{char}} nods", NO_STAMPS, multi, { producer: EMPTY_PRODUCER })).toBe("Aria, Kai nods");
  });

  test("two rows with DIFFERENT personaId stamps each resolve {{user}} to their OWN persona", () => {
    const ctx = ctxOf();
    const producer = producerOf(
      [],
      [
        { id: ZARA, name: "Zara", description: "the active one" },
        { id: MARA, name: "Mara", description: "an older persona" },
      ],
    );
    const rowZara: RowMacroStamps = { characterId: null, personaId: ZARA };
    const rowMara: RowMacroStamps = { characterId: null, personaId: MARA };
    expect(renderHistoryMacros("{{user}} nods", rowZara, ctx, { producer })).toBe("Zara nods");
    expect(renderHistoryMacros("{{user}} nods", rowMara, ctx, { producer })).toBe("Mara nods");
  });

  test("the 3-way-distinct fixture: anchor=Nyx, active=Zara, a row stamped personaId=Mara → {{user}} resolves to Mara", () => {
    // Chat-Macro-Resolution.md §6's regression fixture: the PINNED anchor and the ACTIVE persona are both
    // distinct from the row's own stamped author — the stamp wins over BOTH (it is the macro subject
    // now, not just attribution chrome).
    const ctx = ctxOf({
      pinnedPersona: { name: "Nyx", description: "the frozen anchor" },
      activePersona: { name: "Zara", description: "the live active persona" },
    });
    const producer = producerOf([], [{ id: MARA, name: "Mara", description: "an older persona" }]);
    const stamps: RowMacroStamps = { characterId: null, personaId: MARA };
    expect(renderHistoryMacros("{{user}} waves", stamps, ctx, { producer })).toBe("Mara waves");
  });

  test("a null personaId stamp falls back to the chat ANCHOR (pinnedPersona), never the active persona", () => {
    // Ruling A (Chat-Macro-Resolution.md §2/§4): a null-stamp history row's {{user}} resolves to the chat
    // ANCHOR (pinnedPersona = anchor ?? active), a chat invariant — never the per-viewer active persona — so
    // a greeting / AI / legacy line addresses the SAME persona for the model and every human.
    const ctx = ctxOf({
      pinnedPersona: { name: "Nyx", description: "the frozen anchor" },
      activePersona: { name: "Zara", description: "the live active persona" },
    });
    expect(renderHistoryMacros("{{user}} nods", NO_STAMPS, ctx, { producer: EMPTY_PRODUCER })).toBe("Nyx nods");
  });

  test("{{user}} falls back to the unresolved-persona name with a null personaId stamp AND no active persona", () => {
    expect(renderHistoryMacros("{{user}} speaks", NO_STAMPS, ctxOf(), { producer: EMPTY_PRODUCER })).toBe(`${DEFAULT_PERSONA_NAME} speaks`);
  });

  test("{{persona}} resolves the row's own persona's DESCRIPTION (distinct from {{user}}'s name)", () => {
    const producer = producerOf([], [{ id: NYX, name: "Nyx", description: "a wandering scholar" }]);
    const stamps: RowMacroStamps = { characterId: null, personaId: NYX };
    expect(renderHistoryMacros("{{persona}}", stamps, ctxOf(), { producer })).toBe("a wandering scholar");
  });

  test("plain text (no macros) passes through byte-identical — inert for the common case", () => {
    const plain = "just an ordinary line, no braces here";
    expect(
      renderHistoryMacros(plain, NO_STAMPS, ctxOf(), {
        producer: EMPTY_PRODUCER,
        speakerCharName: "Aria",
      }),
    ).toBe(plain);
  });

  test("<speaker> narrator tags are left intact (the parser only touches {{…}})", () => {
    // The <speaker>…</speaker> marker is opaque to the macro parser (disjoint token set) — it passes through
    // verbatim for the separate speakerTagsToPlain pass. {{char}} here resolves to the solo CHARACTER (Kai, ruling
    // B), independent of the tag's literal content — which proves the tag drives nothing in this pass.
    const ctx = ctxOf({ character: { name: "Kai", description: "" } });
    expect(
      renderHistoryMacros("<speaker>Aria</speaker>{{char}} smiles", NO_STAMPS, ctx, {
        producer: EMPTY_PRODUCER,
        speakerCharName: "Aria",
      }),
    ).toBe("<speaker>Aria</speaker>Kai smiles");
  });
});

describe("resolveGuidedActionText — the blank-steer per-action guard (F2)", () => {
  const ctx = ctxOf({ activePersona: { name: "Nyx", description: "scholar" } });

  test("a scaffold-only action (response) with a BLANK steer injects NOTHING", () => {
    // The default `response` template is a pure `{{input}}` scaffold — a blank steer must render "" (inject
    // nothing) rather than the dangling `[Take the following into special consideration…: ]`.
    expect(resolveGuidedActionText(ctx, { action: "response", input: "" })).toBe("");
    expect(resolveGuidedActionText(ctx, { action: "response", input: "   " })).toBe("");
  });

  test("scaffold-only siblings (swipe/continue/rewrite) with a blank steer also inject nothing", () => {
    for (const action of ["swipe", "continue", "rewrite"] as const) {
      expect(resolveGuidedActionText(ctx, { action, input: "" })).toBe("");
    }
  });

  test("a scaffold-only action WITH a steer still fires", () => {
    expect(resolveGuidedActionText(ctx, { action: "response", input: "make it tense" })).toContain("make it tense");
  });

  test("a standalone action (opening) STILL fires unsteered (its template carries a real instruction)", () => {
    const out = resolveGuidedActionText(ctx, { action: "opening", input: "" });
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain("Open the scene");
  });

  test("a standalone action (impersonate) STILL fires unsteered", () => {
    const out = resolveGuidedActionText(ctx, { action: "impersonate", input: "" });
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain("Nyx"); // {{user}} resolves to the active persona
  });
});

// The UNSTEERED nudge render seam (the impersonate-writes-as-the-character fix): the default impersonate
// nudge (`DEFAULT_FORMAT_STRINGS.impersonateNudge`) rides the `nudgeOf` → `resolveNudgeText` path, which MUST
// substitute `{{user}}`→persona, `{{char}}`→character, `{{person}}`→the pick — NEVER ship literal braces (the
// bug that let the weak-8B drift back into the character's voice). This is the load-bearing substitution.
describe("resolveNudgeText — the unsteered nudge macro render (impersonate voice-lock)", () => {
  const ctx = ctxOf({ activePersona: { name: "Nyx", description: "scholar" } }); // character.name = "Aria"
  const nudge = DEFAULT_FORMAT_STRINGS.impersonateNudge;

  test("substitutes {{user}}→persona, {{char}}→character, {{person}}→the pick (no literal braces)", () => {
    const out = resolveNudgeText(ctx, nudge, { person: "third" });
    expect(out).toContain("Nyx"); // {{user}}
    expect(out).toContain("Aria"); // {{char}}
    expect(out).toContain("third-person"); // {{person}}
    expect(out).not.toContain("{{user}}");
    expect(out).not.toContain("{{char}}");
    expect(out).not.toContain("{{person}}");
  });

  test("an OMITTED person defaults {{person}}→first (the kit resolver floor)", () => {
    const out = resolveNudgeText(ctx, nudge, {});
    expect(out).toContain("first-person");
    expect(out).not.toContain("{{person}}");
  });

  test("the continue/response nudges (no {{person}}) render as a safe no-op — no literal braces, text intact", () => {
    for (const key of ["continueNudge", "responseNudge"] as const) {
      const out = resolveNudgeText(ctx, DEFAULT_FORMAT_STRINGS[key], {});
      expect(out).toBe(DEFAULT_FORMAT_STRINGS[key]); // no macros in the defaults ⇒ byte-identical
    }
  });
});

describe("turn-stage macro context", () => {
  test("shares the env reference with the assemble ctx (D46) + resolves {{model}}", () => {
    const variableValues: Record<string, string> = { flag: "on" };
    const ctx = ctxOf({ variableValues, activePersona: { name: "Nyx", description: "scholar" } });
    const macroCtx = buildTurnMacroContext({
      assembleCtx: ctx,
      model: "test-model",
      chatId: castId<ChatId>("chat_t"),
    });
    expect(macroCtx.env).toBe(variableValues);
    expect(macroCtx.evaluateString("{{model}}")).toBe("test-model");
    expect(macroCtx.evaluateString("{{getvar::flag}}")).toBe("on");
    // {{user}} binds to the ACTIVE persona on the turn-stage ctx.
    expect(macroCtx.evaluateString("{{user}}")).toBe("Nyx");
  });
});
