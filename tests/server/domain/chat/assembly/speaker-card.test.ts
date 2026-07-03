// assembly/speaker-card — the per-speaker CARD-SECTION shape (chat.md §5/§7 two-axis). Pins: the active
// speaker's card becomes `ctx.character`/`speaker`; merged ⇒ the OTHER cast are co-speakers, scoped ⇒ none;
// an AGENT ref selects its soul-filled card-shaped slot like a character (D60); a member-less ctx is unchanged
// (byte-identical, D16); an off-cast speaker keeps the primary (never crashes).

import type { AssembleCharacter, AssembleContext, SpeakerRef } from "@orb/contracts/chat";
import type { CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { shapeContextForSpeaker } from "../../../../../packages/server/src/domain/chat/assembly/speaker-card";
import { expect, test } from "../../../../support/fixtures";

const cid = (k: string): CharacterId => castId<CharacterId>(`character_${k}`);
const uid = (k: string): UserId => castId<UserId>(`user_${k}`);
const charRef = (k: string): SpeakerRef => ({ kind: "character", characterId: cid(k) });
const agentRef = (k: string): SpeakerRef => ({ kind: "agent", userId: uid(k) });
const card = (name: string): AssembleCharacter => ({ name, description: `${name}-desc` });

/** A group ctx: cast [Aria, Bran] as characters + Buddy as an agent, index-aligned castMembers. */
function ctx(): AssembleContext {
  const cast = [card("Aria"), card("Bran"), card("Buddy")];
  return {
    character: cast[0] as AssembleCharacter, // primary (pre-shape)
    promptConfig: {} as AssembleContext["promptConfig"],
    cast,
    castMembers: [charRef("aria"), charRef("bran"), agentRef("buddy")],
    recentMessages: [],
  };
}

describe("shapeContextForSpeaker — per-speaker card selection", () => {
  test("merged: the speaker's card is active; the OTHER cast are co-speakers", () => {
    const out = shapeContextForSpeaker(ctx(), { ref: charRef("bran"), cardScope: "merged" });
    expect(out.character.name).toBe("Bran");
    expect(out.speaker).toEqual({ kind: "single", character: card("Bran") });
    expect(out.coSpeakers?.map((c) => c.name)).toEqual(["Aria", "Buddy"]);
  });

  test("scoped: the speaker's card is active; NO co-speakers (own-card isolation)", () => {
    const out = shapeContextForSpeaker(ctx(), { ref: charRef("aria"), cardScope: "scoped" });
    expect(out.character.name).toBe("Aria");
    expect(out.coSpeakers).toEqual([]);
  });

  test("an AGENT speaker selects its soul (in the card-shaped slot) like a character (D60)", () => {
    const out = shapeContextForSpeaker(ctx(), { ref: agentRef("buddy"), cardScope: "merged" });
    expect(out.character.name).toBe("Buddy"); // the agent's resolved soul (no card — the soul fills the slot)
    expect(out.coSpeakers?.map((c) => c.name)).toEqual(["Aria", "Bran"]); // the characters are co-present
  });

  test("a ctx with no castMembers (solo / hand-built) is returned UNCHANGED — byte-identical", () => {
    const solo: AssembleContext = {
      character: card("Solo"),
      promptConfig: {} as AssembleContext["promptConfig"],
      recentMessages: [],
    };
    const out = shapeContextForSpeaker(solo, { ref: charRef("solo"), cardScope: "merged" });
    expect(out).toBe(solo); // same reference — no shaping happened
  });

  test("an off-cast speaker keeps the primary (never crashes)", () => {
    const base = ctx();
    const out = shapeContextForSpeaker(base, { ref: charRef("ghost"), cardScope: "merged" });
    expect(out).toBe(base); // unchanged
  });
});
