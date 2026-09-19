// assembly/speaker-card — the per-turn CARD-SECTION shape (the chat design doc §5/§7, three-axis). Pins: the active
// speaker's card becomes `ctx.character`/`speaker`; merged ⇒ the OTHER characters are co-speakers, scoped ⇒ none;
// NARRATOR ⇒ every seated character is the speaker and every non-primary member is a co-speaker; a member-less ctx is
// unchanged (byte-identical, D16); an off-roster PER-SPEAKER ref is REFUSED (#1462 — keeping the primary
// shipped the wrong character's card under the asked-for speaker's name).

import type { AssembleCharacter, AssembleContext, SpeakerRef } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { shapeContextForSpeaker } from "../../../../../packages/server/src/domain/chat/assembly/speaker-card.ts";
import { CHAT_OP_CODES } from "../../../../../packages/server/src/domain/chat/contract/errors.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const cid = (k: string): CharacterId => castId<CharacterId>(`character_${k}`);
const charRef = (k: string): SpeakerRef => ({ kind: "character", characterId: cid(k) });
const card = (name: string): AssembleCharacter => ({ name, description: `${name}-desc` });

/** A group ctx: characters [Aria, Bran], index-aligned speakerRefs. */
function ctx(): AssembleContext {
  const characters = [card("Aria"), card("Bran")];
  return {
    character: characters[0] as AssembleCharacter, // primary (pre-shape)
    promptConfig: DEFAULT_PROMPT_CONFIG,
    characters,
    speakerRefs: [charRef("aria"), charRef("bran")],
    recentMessages: [],
  };
}

describe("shapeContextForSpeaker — per-speaker card selection", () => {
  test("merged: the speaker's card is active; the OTHER characters ride as co-speakers", () => {
    const out = shapeContextForSpeaker(ctx(), { ref: charRef("bran"), output: "per-speaker", cardScope: "merged" });
    expect(out.character.name).toBe("Bran");
    expect(out.speaker).toEqual({ kind: "single", character: card("Bran") });
    expect(out.coSpeakers?.map((c) => c.name)).toEqual(["Aria"]);
  });

  test("scoped: the speaker's card is active; NO co-speakers (own-card isolation)", () => {
    const out = shapeContextForSpeaker(ctx(), { ref: charRef("aria"), output: "per-speaker", cardScope: "scoped" });
    expect(out.character.name).toBe("Aria");
    expect(out.coSpeakers).toEqual([]);
  });

  test("a ctx with no speakerRefs (solo / hand-built) is returned UNCHANGED — byte-identical", () => {
    const solo: AssembleContext = {
      character: card("Solo"),
      promptConfig: DEFAULT_PROMPT_CONFIG,
      recentMessages: [],
    };
    const out = shapeContextForSpeaker(solo, { ref: charRef("solo"), output: "per-speaker", cardScope: "merged" });
    expect(out).toBe(solo); // same reference — no shaping happened
  });

  // #1462 — this used to return the ctx UNCHANGED ("keep the primary, never crash"). That is not a degrade:
  // the round still runs, the model is handed the PRIMARY's card and the primary's `{{char}}`, and the reply
  // is attributed to the speaker that was asked for — one character's prose under another character's name.
  // A seat whose card read came back empty is dropped from `speakerRefs` by `assembly/context`, so the path
  // is reachable, not theoretical. It refuses now (D41 no-silent-degrade).
  test("an off-roster PER-SPEAKER speaker is REFUSED, never absorbed into the primary", () => {
    const base = ctx();
    expect(() => shapeContextForSpeaker(base, { ref: charRef("ghost"), output: "per-speaker", cardScope: "merged" })).toThrow(
      /not among this turn's resolved speakers/,
    );
  });

  test("the refusal is the coded chat operation error, so a caller can tell it from a crash", () => {
    let code: unknown;
    try {
      shapeContextForSpeaker(ctx(), { ref: charRef("ghost"), output: "per-speaker", cardScope: "merged" });
    } catch (err) {
      code = (err as { code?: unknown }).code;
    }
    expect(code).toBe(CHAT_OP_CODES.speakerOffRoster);
  });
});

// NARRATOR — one call voices every seated character. Its ref is the SYNTHETIC group character, which is deliberately
// NOT in `speakerRefs`: before this arm existed the round fell through the off-roster guard above and assembled
// as a solo turn for the primary, so the co-speakers' cards never reached the model at all.
describe("shapeContextForSpeaker — narrator (one turn voices every present character)", () => {
  test("the `multi-voice` speaker arm is produced, with EVERY present member on it", () => {
    const out = shapeContextForSpeaker(ctx(), { ref: charRef("group_synthetic"), output: "narrator", cardScope: "merged" });
    expect(out.speaker).toEqual({ kind: "multi-voice", members: [card("Aria"), card("Bran")], active: card("Aria") });
  });

  test("the primary is the character section and every OTHER member is a co-speaker", () => {
    const out = shapeContextForSpeaker(ctx(), { ref: charRef("group_synthetic"), output: "narrator", cardScope: "merged" });
    expect(out.character.name).toBe("Aria");
    expect(out.coSpeakers?.map((c) => c.name)).toEqual(["Bran"]);
  });

  test("the synthetic group ref is IGNORED — narrator never keys on the speaker's membership", () => {
    // The whole defect: a narrator ref is by construction off-roster. Any ref (even a real member's) shapes the
    // same narrator turn, because what a narrator round voices is decided by `output`, not by who authors the row.
    const byGhost = shapeContextForSpeaker(ctx(), { ref: charRef("ghost"), output: "narrator", cardScope: "merged" });
    const byMember = shapeContextForSpeaker(ctx(), { ref: charRef("bran"), output: "narrator", cardScope: "merged" });
    expect(byGhost).toEqual(byMember);
  });

  test("a SOLO ctx narrator round is still byte-identical (the trivial one-character case, D16)", () => {
    const solo: AssembleContext = {
      character: card("Solo"),
      promptConfig: DEFAULT_PROMPT_CONFIG,
      recentMessages: [],
    };
    const out = shapeContextForSpeaker(solo, { ref: charRef("group_synthetic"), output: "narrator", cardScope: "merged" });
    expect(out).toBe(solo);
  });

  test("PURE — the input ctx is never mutated (§5)", () => {
    const base = ctx();
    shapeContextForSpeaker(base, { ref: charRef("group_synthetic"), output: "narrator", cardScope: "merged" });
    expect(base.speaker).toBeUndefined();
    expect(base.coSpeakers).toBeUndefined();
  });
});
