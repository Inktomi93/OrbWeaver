// The narrator policy's own arithmetic over a resolved roster: every seat at the lowest step binds, in roster order, and
// the reported source is the narrowest among them; external media closes when any seat closes it even when another
// seat binds the step; and a seat with no resolved policy leaves nothing to bound.
// @subject packages/contracts/src/chat/roster.ts
import type { ParticipantView, RenderPolicy, RenderPolicySource } from "@orb/contracts/chat";
import { resolveNarratorRenderPolicy } from "@orb/contracts/chat";
import { ID_PREFIX } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";

type Seat = Pick<ParticipantView, "kind" | "characterId" | "renderPolicy" | "renderSource">;

const ids = createSeededIds();

function characterSeat(htmlTrust: RenderPolicy["htmlTrust"], forbidExternalMedia: boolean, renderSource: RenderPolicySource = "own"): Seat {
  return { kind: "character", characterId: ids.typeId(ID_PREFIX.character), renderPolicy: { htmlTrust, forbidExternalMedia }, renderSource };
}

const HUMAN: Seat = { kind: "human", characterId: null, renderPolicy: { htmlTrust: "untrusted", forbidExternalMedia: true }, renderSource: "no-card" };

test("every seat at the lowest step binds in roster order, and a human seat's floor never binds a narrator row", () => {
  const first = characterSeat("trusted", false, "inherited");
  const second = characterSeat("trusted", false);
  const third = characterSeat("trusted", false, "inherited");
  expect(resolveNarratorRenderPolicy([HUMAN, characterSeat("interactive", false), first, second, third])).toEqual({
    renderPolicy: { htmlTrust: "trusted", forbidExternalMedia: false },
    // A character's own step outranks the install default it ties with: raising the default would not lift it.
    renderSource: "own",
    characterIds: [first.characterId, second.characterId, third.characterId],
  });
});

test("a lower step replaces the seats that bound before it", () => {
  const lower = characterSeat("untrusted", false, "inherited");
  expect(resolveNarratorRenderPolicy([characterSeat("trusted", false), characterSeat("trusted", false), lower])).toEqual({
    renderPolicy: { htmlTrust: "untrusted", forbidExternalMedia: false },
    renderSource: "inherited",
    characterIds: [lower.characterId],
  });
});

test("one seat that forbids external media closes it for the narrator row, though another seat binds the step", () => {
  const binding = characterSeat("untrusted", false);
  expect(resolveNarratorRenderPolicy([characterSeat("interactive", true), binding])).toEqual({
    renderPolicy: { htmlTrust: "untrusted", forbidExternalMedia: true },
    renderSource: "own",
    characterIds: [binding.characterId],
  });
});

test("a character seat with no resolved policy leaves no narrator policy, as an empty cast does", () => {
  const unresolved: Seat = { kind: "character", characterId: ids.typeId(ID_PREFIX.character) };
  // Positive control: the resolved seat alone does produce a policy.
  expect(resolveNarratorRenderPolicy([characterSeat("trusted", false)])).toBeDefined();
  expect(resolveNarratorRenderPolicy([characterSeat("trusted", false), unresolved])).toBeUndefined();
  expect(resolveNarratorRenderPolicy([HUMAN])).toBeUndefined();
});
