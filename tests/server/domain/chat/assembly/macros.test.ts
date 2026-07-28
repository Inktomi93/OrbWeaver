// assembly/macros — the chat-domain macro wiring (chat.md Part II §0/§3; D46 env-by-reference + the
// determinism seam). Pins: the AssembleContext → macro mapping ({{char}}/{{user}}/{{persona}}/{{scenario}}
// room-override/{{group}}), {{original}} threading, the SHARED env (a setvar in one render is visible to the
// next), and the injected clock (nowMs) → deterministic output.
import type { AssembleContext } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { CharacterId, ChatId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RowMacroStamps } from "@orb/kit/macro";
import { describe } from "vitest";
import {
  buildTurnMacroContext,
  renderHistoryMacros,
  renderMacros,
  resolveGuidedActionText,
} from "../../../../../packages/server/src/domain/chat/assembly/macros";
import type { HistoryMacroNames } from "../../../../../packages/server/src/domain/chat/contract/results";
import { expect, test } from "../../../../support/fixtures";

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

  test("{{user}} falls back to 'User' when no persona", () => {
    expect(renderMacros("{{user}}", ctxOf(), null)).toBe("User");
  });

  test("{{scenario}} resolves room override > card", () => {
    expect(renderMacros("{{scenario}}", ctxOf(), null)).toBe("the keep");
    const withRoom = ctxOf({ roomOverrides: { scenario: "the dungeon" } });
    expect(renderMacros("{{scenario}}", withRoom, null)).toBe("the dungeon");
  });

  test("{{char}} = the joined cast under a narrator (cast) speaker", () => {
    const aria = { name: "Aria", description: "" };
    const kai = { name: "Kai", description: "" };
    const ctx = ctxOf({
      cast: [aria, kai],
      speaker: { kind: "cast", members: [aria, kai], active: aria },
    });
    expect(renderMacros("{{char}}", ctx, null)).toBe("Aria, Kai");
  });

  test("{{group}} = the full cast names", () => {
    const ctx = ctxOf({
      cast: [
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

  test("a null characterId stamp resolves {{char}} to the CAST (ruling B), not the turn's speaker default", () => {
    // Ruling B (Chat-Macro-Resolution.md §2/§4): a HUMAN-authored / narrator row (characterId === null)
    // resolves {{char}} to the CAST — the one character in solo, the joined names in a multi-character room
    // (== {{group}}) — never the arbitrary current speaker. renderHistoryMacros always feeds the cast
    // (ctx.cast ?? [ctx.character]), so it wins over any explicit speakerCharName for a narrator row.
    const solo = ctxOf({ character: { name: "Aria", description: "a bold knight" } });
    expect(
      renderHistoryMacros("{{char}} nods", NO_STAMPS, solo, {
        producer: EMPTY_PRODUCER,
        speakerCharName: "Kai",
      }),
    ).toBe("Aria nods");
    // A multi-character room: the narrator row's {{char}} is the JOINED cast.
    const multi = ctxOf({
      character: { name: "Aria", description: "" },
      cast: [
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
    // distinct from the row's own stamped author — the stamp wins over BOTH (PD-100: it is the macro subject
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

  test("{{user}} falls back to 'User' with a null personaId stamp AND no active persona", () => {
    expect(renderHistoryMacros("{{user}} speaks", NO_STAMPS, ctxOf(), { producer: EMPTY_PRODUCER })).toBe("User speaks");
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
    // verbatim for the separate speakerTagsToPlain pass. {{char}} here resolves to the solo CAST (Kai, ruling
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
