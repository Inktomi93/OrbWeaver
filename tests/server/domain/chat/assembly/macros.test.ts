// assembly/macros — the chat-domain macro wiring (chat.md Part II §0/§3; D46 env-by-reference + the
// determinism seam). Pins: the AssembleContext → macro mapping ({{char}}/{{user}}/{{persona}}/{{scenario}}
// room-override/{{group}}), {{original}} threading, the SHARED env (a setvar in one render is visible to the
// next), and the injected clock (nowMs) → deterministic output.
import type { AssembleContext } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import {
  buildTurnMacroContext,
  renderMacros,
} from "../../../../../packages/server/src/domain/chat/assembly/macros";
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
    expect(renderMacros("CARD {{original}}", ctxOf(), null, "PRESET")).toBe("CARD PRESET");
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
