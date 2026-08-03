// Unit: the draft→commit bridge (features/chat/lib/draft-commit) — specifically the anchor-persona
// PREDICTION the draft transcript renders `{{user}}`/`{{persona}}` against. It mirrors the server's seed
// chain (`domain/chat/verbs/start-chat.ts`: explicit anchor > the connected persona of a SOLO founding >
// the starter's current > their default), so the tests below pin the rung ORDER and the two ways a rung
// legitimately declines: a group founding never consults connections, and a lenient `seeds.*` pointer at
// a deleted/foreign persona degrades to the next rung instead of naming a persona the commit won't use.

import type { PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { DraftAnchorPersonaInput } from "../../../../../packages/client/src/features/chat/lib/draft-commit.ts";
import { resolveDraftAnchorPersona, resolveDraftCommit } from "../../../../../packages/client/src/features/chat/lib/draft-commit.ts";
import { landingChat } from "../../../../../packages/client/src/state/chat-handle.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const PINNED = castId<PersonaId>("persona_pinned");
const CONNECTED = castId<PersonaId>("persona_connected");
const CURRENT = castId<PersonaId>("persona_current");
const DEFAULT = castId<PersonaId>("persona_default");
const OWNED: readonly PersonaId[] = [CONNECTED, CURRENT, DEFAULT];

const NO_SEEDS: DraftAnchorPersonaInput = {
  seedAnchorPersonaId: null,
  ownedPersonaIds: OWNED,
  connectedPersonaIds: [],
  currentPersonaId: null,
  defaultPersonaId: null,
};

test("an explicit seed anchor wins every other rung", () => {
  expect(
    resolveDraftAnchorPersona({
      ...NO_SEEDS,
      seedAnchorPersonaId: PINNED,
      connectedPersonaIds: [CONNECTED],
      currentPersonaId: CURRENT,
      defaultPersonaId: DEFAULT,
    }),
  ).toBe(PINNED);
});

test("a SOLE connected persona wins over the current/default seeds", () => {
  expect(
    resolveDraftAnchorPersona({
      ...NO_SEEDS,
      connectedPersonaIds: [CONNECTED],
      currentPersonaId: CURRENT,
      defaultPersonaId: DEFAULT,
    }),
  ).toBe(CONNECTED);
});

test("AMBIGUOUS connections (2+) decline the rung — the current seed answers", () => {
  expect(
    resolveDraftAnchorPersona({
      ...NO_SEEDS,
      connectedPersonaIds: [CONNECTED, DEFAULT],
      currentPersonaId: CURRENT,
    }),
  ).toBe(CURRENT);
});

test("the current seed beats the default seed", () => {
  expect(resolveDraftAnchorPersona({ ...NO_SEEDS, currentPersonaId: CURRENT, defaultPersonaId: DEFAULT })).toBe(CURRENT);
});

test("a stale/foreign current pointer degrades to the default seed, never to itself", () => {
  expect(resolveDraftAnchorPersona({ ...NO_SEEDS, currentPersonaId: "persona_deleted", defaultPersonaId: DEFAULT })).toBe(DEFAULT);
});

test("no rung resolves ⇒ null (the macro atom's own 'User' floor, not a fabricated name)", () => {
  expect(resolveDraftAnchorPersona({ ...NO_SEEDS, currentPersonaId: "persona_deleted", defaultPersonaId: "persona_also_gone" })).toBeNull();
});

// ── The temp-chat carry (home-section-spec §5) ────────────────────────────────────────────────────
// The `temporary` flag rides the SEED, not the draft-config store: it is a creation intent the launcher
// stamps, and `startChat` is the column's only writer. What matters is that it is SPARSE — an untouched
// draft must commit a byte-identical payload to today's plain new chat, or every existing send changes
// shape the moment this field exists.

test("a temp-chat seed carries `temporary: true` to startChat", () => {
  const { carry } = resolveDraftCommit(landingChat(), { temporary: true });
  expect(carry.temporary).toBe(true);
});

test("an ordinary draft carries NO `temporary` key at all — sparse, byte-identical to today", () => {
  const plain = resolveDraftCommit(landingChat(), { characterIds: [] });
  expect(Object.hasOwn(plain.carry, "temporary")).toBe(false);
  // …and an absent seed behaves the same as an explicit non-temporary one.
  expect(resolveDraftCommit(landingChat(), undefined).carry).toEqual(plain.carry);
});

test("`temporary: false` is NOT carried — only the affirmative intent crosses the wire", () => {
  const { carry } = resolveDraftCommit(landingChat(), { temporary: false });
  expect(Object.hasOwn(carry, "temporary")).toBe(false);
});
