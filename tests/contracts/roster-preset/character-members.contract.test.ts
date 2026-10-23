import { createRosterPresetSchema } from "@orb/contracts/roster-preset";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

test("saved character members round-trip absent knobs and inclusive talkativeness boundaries", ({ ids }) => {
  const member = { kind: "character", characterId: mintTypeId(ID_PREFIX.character, ids.next), position: 0 };
  for (const knobs of [{}, { talkativeness: 0, disabled: false }, { talkativeness: 1, disabled: true }, { talkativeness: 0.7, disabled: true }]) {
    const input = { name: "Character roster", members: [{ ...member, ...knobs }] };
    const parsed = createRosterPresetSchema.parse(input);
    expect(parsed.members).toEqual(input.members);
    expect(createRosterPresetSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  }
});

test("saved rosters refuse human, observer and agent kinds on otherwise valid members", ({ ids }) => {
  const member = { kind: "character", characterId: mintTypeId(ID_PREFIX.character, ids.next), position: 0 };
  const input = { name: "Character-only roster", members: [member] };
  expect(createRosterPresetSchema.parse(input).members).toEqual([member]);
  for (const kind of ["human", "observer", "agent"]) {
    expect(createRosterPresetSchema.safeParse({ ...input, members: [{ ...member, kind }] }).success).toBe(false);
  }
});

test("saved rosters refuse talkativeness outside the character seat range", ({ ids }) => {
  const member = { kind: "character", characterId: mintTypeId(ID_PREFIX.character, ids.next), position: 0, talkativeness: 0.5 };
  const input = { name: "Bounded character roster", members: [member] };
  expect(createRosterPresetSchema.parse(input).members).toEqual([member]);
  for (const talkativeness of [-0.1, 1.5]) {
    expect(createRosterPresetSchema.safeParse({ ...input, members: [{ ...member, talkativeness }] }).success).toBe(false);
  }
});
