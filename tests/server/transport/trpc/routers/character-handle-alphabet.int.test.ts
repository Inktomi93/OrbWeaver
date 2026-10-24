// @subject packages/contracts/src/character/index.ts
// @subject packages/server/src/transport/trpc/routers/character.ts
import { expect, test } from "@orb/testkit/node";

/** Each one is inside the length cap and outside the slug alphabet; the library export writes a handle as a
 *  path segment, so every one of these would be a traversal, a separator or the synthetic namespace there. */
const HOSTILE_HANDLES = ["..", "a/b", "a\\b", "a\u0000b", "__group__chat", "trailing-", "line\nbreak"] as const;

test("character.create and character.update refuse a handle outside the slug alphabet, and the library keeps none", async ({ harness }) => {
  const caller = await harness.internalCallerFor(harness.ownerId);
  const kept = await caller.character.create({ input: { handle: "lantern", name: "Lantern", description: "A lamp on the outer ring." } });
  const refusals: { readonly handle: string; readonly create: unknown; readonly rename: unknown }[] = [];
  const outcome = (call: Promise<unknown>): Promise<unknown> =>
    call.then(
      () => "accepted",
      (err: unknown) => (err as { code?: unknown }).code,
    );
  for (const handle of HOSTILE_HANDLES) {
    // The rename asks for a different hostile value, so a handle one door accepted cannot make the other
    // refuse as a collision instead.
    const create = await outcome(caller.character.create({ input: { handle, name: "Hostile", description: "" } }));
    const rename = await outcome(caller.character.update({ characterId: kept.id, input: { handle: `x${handle}` } }));
    refusals.push({ handle, create, rename });
  }
  // Positive control: the same rename door accepts a handle inside the alphabet.
  const control = await outcome(caller.character.update({ characterId: kept.id, input: { handle: "lantern-lit" } }));
  const library = (await caller.character.list({})).items;

  expect({
    refusals,
    control,
    hostileRows: library.filter((item) => item.name === "Hostile").length,
    keptHandle: (await caller.character.get({ characterId: kept.id })).handle,
  }).toEqual({
    refusals: HOSTILE_HANDLES.map((handle) => ({ handle, create: "BAD_REQUEST", rename: "BAD_REQUEST" })),
    control: "accepted",
    hostileRows: 0,
    keptHandle: "lantern-lit",
  });
});
