// @subject packages/db/src/custom-types/index.ts
// A NUL is not text in this app: a text column removes it from a value written and from a value compared, so a lookup
// finds what a write of the same value stored, and a UNIQUE column treats two values that differ only by a NUL as one.
import { createCharacterSchema } from "@orb/contracts/character";
import { createRosterPresetSchema } from "@orb/contracts/roster-preset";
import { DomainConflictError } from "@orb/kit/errors";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import type { z } from "zod";

const NUL = "\0";
const NAME = ["Night", "Watch"] as const;

type Owner = Awaited<ReturnType<ServerTestHarness["principalFor"]>>;
type RosterMember = z.input<typeof createRosterPresetSchema>["members"][number];

async function rosterMember(harness: ServerTestHarness, owner: Owner): Promise<RosterMember> {
  const card = await harness.services.character.create({
    principal: owner,
    input: createCharacterSchema.parse({ name: "Roster actor", handle: "roster-actor", description: "Authored card." }),
  });
  return { kind: "character", characterId: card.id, position: 0 };
}

test("a second tag whose name differs only by a NUL is refused as the duplicate it is", async ({ harness }) => {
  const owner = await harness.principalFor((await harness.actor()).id);
  const first = await harness.services.tag.createTag({ principal: owner, input: { name: NAME.join(NUL) } });
  expect(first.name).toBe(NAME.join(""));

  await expect(harness.services.tag.createTag({ principal: owner, input: { name: NAME.join("") } })).rejects.toBeInstanceOf(DomainConflictError);
  expect((await harness.services.tag.listTags({ principal: owner })).map(({ name }) => name)).toEqual([NAME.join("")]);
});

test.for([
  { name: "written from the value with the NUL", stored: NAME.join(NUL) },
  { name: "written from the value without it", stored: NAME.join("") },
] as const)("a lookup on a name with a NUL finds the party $name", async ({ stored }, { harness }) => {
  const owner = await harness.principalFor((await harness.actor()).id);
  const member = await rosterMember(harness, owner);
  await harness.services.rosterPreset.create({ principal: owner, input: createRosterPresetSchema.parse({ name: stored, members: [member] }) });

  // The create verb's taken-name check filters on the caller's name: it finds the stored party, so the save is refused.
  await expect(
    harness.services.rosterPreset.create({ principal: owner, input: createRosterPresetSchema.parse({ name: NAME.join(NUL), members: [member] }) }),
  ).rejects.toBeInstanceOf(DomainConflictError);
  expect(await harness.services.rosterPreset.count({ principal: owner })).toBe(1);
});
