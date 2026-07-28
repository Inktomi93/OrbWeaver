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
  const out = resolveRowMacros("{{user}} waves", { characterId: null, personaId: MARA_ID }, ctx({ fallbackPersonaName: "Zara" }));
  expect(out).toBe("Mara waves");
});

// ── null personaId ⇒ falls to the chat ANCHOR fallback (never the row-stamp lookup) ──

test("resolveRowMacros: {{user}} falls back to fallbackPersonaName (the anchor) when personaId is null", () => {
  const out = resolveRowMacros("{{user}} waves", { characterId: null, personaId: null }, ctx({ fallbackPersonaName: "Zara" }));
  expect(out).toBe("Zara waves");
});

test('resolveRowMacros: {{user}} falls back to the literal "User" when nothing resolves', () => {
  const out = resolveRowMacros("{{user}} waves", { characterId: null, personaId: null }, ctx());
  expect(out).toBe("User waves");
});

// ── {{char}}: the ROW's own speaker wins over the turn's current speaker fallback ──

test("resolveRowMacros: {{char}} resolves to the row's own stamped character (not the current speaker)", () => {
  const out = resolveRowMacros("{{char}} nods", { characterId: ARIA_ID, personaId: null }, ctx({ speakerCharName: "Kai" }));
  // A past line stamped Aria stays Aria's even though Kai is the CURRENT turn's speaker.
  expect(out).toBe("Aria nods");
});

test("resolveRowMacros: {{char}} falls back to speakerCharName when the row carries no characterId", () => {
  const out = resolveRowMacros("{{char}} nods", { characterId: null, personaId: null }, ctx({ speakerCharName: "Kai" }));
  expect(out).toBe("Kai nods");
});

test('resolveRowMacros: {{char}} falls back to the literal "Character" when nothing resolves', () => {
  const out = resolveRowMacros("{{char}} nods", { characterId: null, personaId: null }, ctx());
  expect(out).toBe("Character nods");
});

// ── ruling B: a HUMAN-authored / narrator row (characterId === null) resolves {{char}} to the CAST ──

test("resolveRowMacros: {{char}} in a user row resolves to the JOINED cast in a multi-character room", () => {
  const out = resolveRowMacros("{{char}}, look here", { characterId: null, personaId: MARA_ID }, ctx({ cast: ["Aria", "Kai"], speakerCharName: "Aria" }));
  // A user's own {{char}} addresses the whole cast (== {{group}}), NOT the arbitrary current speaker.
  expect(out).toBe("Aria, Kai, look here");
});

test("resolveRowMacros: {{char}} in a user row resolves to the ONE character in a solo room", () => {
  const out = resolveRowMacros("{{char}}, look here", { characterId: null, personaId: MARA_ID }, ctx({ cast: ["Aria"] }));
  expect(out).toBe("Aria, look here");
});

test("resolveRowMacros: a VOICED row with a DELETED character floors to Character, never the cast join", () => {
  const out = resolveRowMacros("{{char}} nods", { characterId: castId<CharacterId>("character_gone"), personaId: null }, ctx({ cast: ["Aria", "Kai"] }));
  // A stamped-but-unresolvable character is a deleted-id FLOOR (not a user/narrator row) → "Character",
  // NOT the cast join — only a null characterId means "the cast".
  expect(out).toBe("Character nods");
});

// ── {{user}}/{{persona}} null-stamp fallback = the chat ANCHOR (name + description), never the reader ──

test("resolveRowMacros: {{persona}} for a null-stamp row falls back to the anchor description", () => {
  const out = resolveRowMacros(
    "{{user}} — {{persona}}",
    { characterId: ARIA_ID, personaId: null },
    ctx({ fallbackPersonaName: "Nyx", fallbackPersonaDescription: "the pinned host POV" }),
  );
  // A greeting / AI line (null persona) addresses the ANCHOR — same for the model and every viewer.
  expect(out).toBe("Nyx — the pinned host POV");
});

// ── passthrough / non-interference ──────────────────────────────────────────────────────────────

test("resolveRowMacros: a no-{{ string is returned byte-identical", () => {
  const plain = "just narration, no macros here at all.";
  const out = resolveRowMacros(plain, { characterId: null, personaId: null }, ctx());
  expect(out).toBe(plain);
});

test("resolveRowMacros: a <speaker> tag is left intact — the macro parser only touches {{…}}", () => {
  const out = resolveRowMacros("<speaker>Aria</speaker>{{char}} waves back", { characterId: ARIA_ID, personaId: null }, ctx());
  expect(out).toBe("<speaker>Aria</speaker>Aria waves back");
});

// ── {{persona}} resolves the persona's DESCRIPTION, distinct from {{user}}'s name ──────────────

test("resolveRowMacros: {{persona}} resolves to the row's stamped persona description", () => {
  const out = resolveRowMacros("{{persona}}", { characterId: null, personaId: MARA_ID }, ctx());
  expect(out).toBe("a wandering scholar");
});

test("resolveRowMacros: {{persona}} is empty when the persona doesn't resolve", () => {
  const out = resolveRowMacros("before-{{persona}}-after", { characterId: null, personaId: null }, ctx());
  expect(out).toBe("before--after");
});

// ── volatile macros in stored history re-emit VERBATIM (F2): a row must render byte-identically on ──
// ── every assemble/re-render regardless of the wall clock / PRNG, or the R1 prefix cache misses ────
// ── from that row forward every turn and the swipe re-fold breaks byte-identity (D46). ─────────────

test("resolveRowMacros: a stored row with {{time}} + {{roll}} renders byte-identical across calls", async () => {
  const stored = "The clock reads {{time}} and I rolled {{roll:d20}} ({{random}}).";
  const stamps = { characterId: null, personaId: null } as const;
  const render1 = resolveRowMacros(stored, stamps, ctx());
  // A seconds-resolution clock could advance and the PRNG differs regardless — a live registry would
  // have produced different bytes here.
  await new Promise((r) => setTimeout(r, 1100));
  const render2 = resolveRowMacros(stored, stamps, ctx());
  expect(render1).toBe(render2);
  // Volatile macros pass through as their literal source span (not re-derived, not stripped).
  expect(render1).toBe(stored);
});

// ── MG grammar constructs in STORED rows stay byte-stable through the ONE shared atom (§12A.0) ─────
// The names-only registry has no `if`/`setvar`/flagged handlers beyond identity — a stored row carrying
// the new universal-block / flag syntax re-emits those spans verbatim (raw bytes, closeRaw included)
// while identity still resolves, identically on server ASSEMBLE and client DISPLAY.

test("resolveRowMacros: universal blocks + reserved flags in a stored row re-emit byte-identical", () => {
  const stored = "{{if::x}}A{{/if}} {{setvar::k}}body{{/setvar}} {{~mystery}} {{/#box}}";
  const out = resolveRowMacros(stored, { characterId: null, personaId: null }, ctx());
  expect(out).toBe(stored);
});

test("resolveRowMacros: identity resolves INSIDE an unknown stored block, wrapper bytes untouched", () => {
  const out = resolveRowMacros("{{quote}}{{char}} speaks{{/quote}}", { characterId: ARIA_ID, personaId: null }, ctx());
  expect(out).toBe("{{quote}}Aria speaks{{/quote}}");
});

test("resolveRowMacros: a flagged identity macro in a stored row resolves (flags no-op, stable value)", () => {
  const out = resolveRowMacros("{{#char}} nods", { characterId: ARIA_ID, personaId: null }, ctx());
  expect(out).toBe("Aria nods");
});

test("resolveRowMacros: identity names still resolve while volatile macros pass through verbatim", () => {
  const out = resolveRowMacros("{{char}} tells {{user}} the time is {{time}} — rolled {{roll:d6}}", { characterId: ARIA_ID, personaId: MARA_ID }, ctx());
  // Names resolve from the row's stamps; {{time}}/{{roll}} re-emit verbatim (stable).
  expect(out).toBe("Aria tells Mara the time is {{time}} — rolled {{roll:d6}}");
});
