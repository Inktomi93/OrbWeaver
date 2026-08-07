// assembly/speaker-card — the per-turn CARD-SECTION shape (chat.md §5/§7, three-axis). Pins: the active
// speaker's card becomes `ctx.character`/`speaker`; merged ⇒ the OTHER cast are co-speakers, scoped ⇒ none;
// NARRATOR ⇒ the whole cast is the speaker and every non-primary member is a co-speaker; a member-less ctx is
// unchanged (byte-identical, D16); an off-cast PER-SPEAKER ref keeps the primary (never crashes).

import type { AssembleCharacter, AssembleContext, SpeakerRef } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { CharacterId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { shapeContextForSpeaker } from "../../../../../packages/server/src/domain/chat/assembly/speaker-card.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const cid = (k: string): CharacterId => castId<CharacterId>(`character_${k}`);
const charRef = (k: string): SpeakerRef => ({ kind: "character", characterId: cid(k) });
const card = (name: string): AssembleCharacter => ({ name, description: `${name}-desc` });

/** A group ctx: cast [Aria, Bran] as characters, index-aligned castMembers. */
function ctx(): AssembleContext {
  const cast = [card("Aria"), card("Bran")];
  return {
    character: cast[0] as AssembleCharacter, // primary (pre-shape)
    promptConfig: DEFAULT_PROMPT_CONFIG,
    cast,
    castMembers: [charRef("aria"), charRef("bran")],
    recentMessages: [],
  };
}

describe("shapeContextForSpeaker — per-speaker card selection", () => {
  test("merged: the speaker's card is active; the OTHER cast are co-speakers", () => {
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

  test("a ctx with no castMembers (solo / hand-built) is returned UNCHANGED — byte-identical", () => {
    const solo: AssembleContext = {
      character: card("Solo"),
      promptConfig: DEFAULT_PROMPT_CONFIG,
      recentMessages: [],
    };
    const out = shapeContextForSpeaker(solo, { ref: charRef("solo"), output: "per-speaker", cardScope: "merged" });
    expect(out).toBe(solo); // same reference — no shaping happened
  });

  test("an off-cast PER-SPEAKER speaker keeps the primary (never crashes)", () => {
    const base = ctx();
    const out = shapeContextForSpeaker(base, { ref: charRef("ghost"), output: "per-speaker", cardScope: "merged" });
    expect(out).toBe(base); // unchanged
  });
});

// NARRATOR — one call voices the whole cast. Its ref is the SYNTHETIC group character, which is deliberately
// NOT in `castMembers`: before this arm existed the round fell through the off-cast guard above and assembled
// as a solo turn for the primary, so the co-speakers' cards never reached the model at all.
describe("shapeContextForSpeaker — narrator (the whole cast voices one turn)", () => {
  test("the `cast` speaker arm is produced, with EVERY present member as a cast member", () => {
    const out = shapeContextForSpeaker(ctx(), { ref: charRef("group_synthetic"), output: "narrator", cardScope: "merged" });
    expect(out.speaker).toEqual({ kind: "cast", members: [card("Aria"), card("Bran")], active: card("Aria") });
  });

  test("the primary is the character section and every OTHER member is a co-speaker", () => {
    const out = shapeContextForSpeaker(ctx(), { ref: charRef("group_synthetic"), output: "narrator", cardScope: "merged" });
    expect(out.character.name).toBe("Aria");
    expect(out.coSpeakers?.map((c) => c.name)).toEqual(["Bran"]);
  });

  test("the synthetic group ref is IGNORED — narrator never keys on the speaker's cast membership", () => {
    // The whole defect: a narrator ref is by construction off-cast. Any ref (even a real member's) shapes the
    // same cast turn, because what a narrator round voices is decided by `output`, not by who authors the row.
    const byGhost = shapeContextForSpeaker(ctx(), { ref: charRef("ghost"), output: "narrator", cardScope: "merged" });
    const byMember = shapeContextForSpeaker(ctx(), { ref: charRef("bran"), output: "narrator", cardScope: "merged" });
    expect(byGhost).toEqual(byMember);
  });

  test("a SOLO ctx narrator round is still byte-identical (the trivial cast, D16)", () => {
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
