// resolveRowMacros — the §6 parity fixture (Chat-Macro-Resolution.md): one shared atom, both server
// ASSEMBLE and client DISPLAY call it, so pinning it here pins BOTH consumers at once.

import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RowCharacterName, RowMacroNameContext, RowPersonaName } from "@orb/kit/macro";
import { resolveRowMacros } from "@orb/kit/macro";
import { expect, test } from "../../support/fixtures";

const ARIA_ID = castId<CharacterId>("character_aria");
const KAI_ID = castId<CharacterId>("character_kai");
const MARA_ID = castId<PersonaId>("persona_mara");
const ZARA_ID = castId<PersonaId>("persona_zara");

function ctx(overrides: Partial<RowMacroNameContext> = {}): RowMacroNameContext {
  const characterNamesById = new Map<CharacterId, RowCharacterName>([
    [ARIA_ID, { name: "Aria" }],
    [KAI_ID, { name: "Kai" }],
  ]);
  const personaNamesById = new Map<PersonaId, RowPersonaName>([
    [MARA_ID, { name: "Mara", description: "a wandering scholar" }],
    [ZARA_ID, { name: "Zara", description: "a stoic guard" }],
  ]);
  return { characterNamesById, personaNamesById, ...overrides };
}

// ── §6 fixture: a user row stamped personaId = Mara resolves {{user}} to Mara on both consumers ──

test("resolveRowMacros: {{user}} resolves to the row's stamped persona name (Mara)", () => {
  const out = resolveRowMacros(
    "{{user}} waves",
    { characterId: null, personaId: MARA_ID },
    ctx({ activePersonaName: "Zara" }),
  );
  expect(out).toBe("Mara waves");
});

// ── null personaId ⇒ falls to the active-persona fallback (never the row-stamp lookup) ──

test("resolveRowMacros: {{user}} falls back to activePersonaName when personaId is null", () => {
  const out = resolveRowMacros(
    "{{user}} waves",
    { characterId: null, personaId: null },
    ctx({ activePersonaName: "Zara" }),
  );
  expect(out).toBe("Zara waves");
});

test('resolveRowMacros: {{user}} falls back to the literal "User" when nothing resolves', () => {
  const out = resolveRowMacros("{{user}} waves", { characterId: null, personaId: null }, ctx());
  expect(out).toBe("User waves");
});

// ── {{char}}: the ROW's own speaker wins over the turn's current speaker fallback ──

test("resolveRowMacros: {{char}} resolves to the row's own stamped character (not the current speaker)", () => {
  const out = resolveRowMacros(
    "{{char}} nods",
    { characterId: ARIA_ID, personaId: null },
    ctx({ speakerCharName: "Kai" }),
  );
  // A past line stamped Aria stays Aria's even though Kai is the CURRENT turn's speaker.
  expect(out).toBe("Aria nods");
});

test("resolveRowMacros: {{char}} falls back to speakerCharName when the row carries no characterId", () => {
  const out = resolveRowMacros(
    "{{char}} nods",
    { characterId: null, personaId: null },
    ctx({ speakerCharName: "Kai" }),
  );
  expect(out).toBe("Kai nods");
});

test('resolveRowMacros: {{char}} falls back to the literal "Character" when nothing resolves', () => {
  const out = resolveRowMacros("{{char}} nods", { characterId: null, personaId: null }, ctx());
  expect(out).toBe("Character nods");
});

// ── passthrough / non-interference ──────────────────────────────────────────────────────────────

test("resolveRowMacros: a no-{{ string is returned byte-identical", () => {
  const plain = "just narration, no macros here at all.";
  const out = resolveRowMacros(plain, { characterId: null, personaId: null }, ctx());
  expect(out).toBe(plain);
});

test("resolveRowMacros: a <speaker> tag is left intact — the macro parser only touches {{…}}", () => {
  const out = resolveRowMacros(
    "<speaker>Aria</speaker>{{char}} waves back",
    { characterId: ARIA_ID, personaId: null },
    ctx(),
  );
  expect(out).toBe("<speaker>Aria</speaker>Aria waves back");
});

// ── {{persona}} resolves the persona's DESCRIPTION, distinct from {{user}}'s name ──────────────

test("resolveRowMacros: {{persona}} resolves to the row's stamped persona description", () => {
  const out = resolveRowMacros("{{persona}}", { characterId: null, personaId: MARA_ID }, ctx());
  expect(out).toBe("a wandering scholar");
});

test("resolveRowMacros: {{persona}} is empty when the persona doesn't resolve", () => {
  const out = resolveRowMacros(
    "before-{{persona}}-after",
    { characterId: null, personaId: null },
    ctx(),
  );
  expect(out).toBe("before--after");
});
