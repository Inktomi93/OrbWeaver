// CT: the Characters band's create dialog (character-create-actions.tsx) — #542, the typed refusal the
// client used to discard.
//
// THE DEFECT: `character.create` refuses a duplicate name with a fully structured answer —
// `{"message":"a character with handle … already exists","reason":"handle_conflict"}` — and the client threw
// the discriminator away, printing the flat "Couldn't create the character." So the ONE create failure a
// user can act on (the handle is derived from the name; a different name fixes it) read exactly like a dead
// server. The mapper itself is unit-proved (`tests/client/features/character/lib/character-refusal-notice`)
// because a CT cannot observe `meta.errorToast` copy — the CT QueryClient has no MutationCache seam. What a
// CT CAN see, and what this file owns, is the other half: the dialog stays open and says the reason AT the
// field the user has to change.
//
// Mounts the landed `CharacterCreateBandStory` (tests/client/forms/_form-identity-stories.tsx) rather than a
// second story of the same component — it already wires the real mutation under `CtDataProviders`, and the
// dialog portals, so its own controls are reached through the PAGE locator.
//
// THE COPY IS SPELLED LITERALLY, not imported from the mapper (the `ENGINE_OFF_REASON` precedent in
// composer.ct.tsx). Two reasons, and the first is the load-bearing one: a pin that imports the module it is
// proving cannot be run against the OLD source, so its "red" would be a build error rather than a proof of
// the defect — these were run green-after / red-before by restoring `character-create-actions.tsx` +
// `use-character-mutations.ts` from HEAD, which only compiles because nothing here reaches into the new
// module. Second: a reword of user-facing copy SHOULD red a test that claims to know what the user reads.
// The constant↔behaviour binding is the unit's job, and it holds it.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc.ts";
import { CharacterCreateBandStory } from "../../../forms/_form-identity-stories.tsx";

const HANDLE_CONFLICT_COPY = "You already have a character with that name. Pick a different name and try again.";
const HANDLE_RESERVED_COPY = "That name is reserved for group rooms. Pick a different name and try again.";

/** Open the New dialog, fill both required fields, submit — then SETTLE on the attempt being over (the
 *  Create button re-enables when `isPending` drops), so every assertion below reads a resting dialog rather
 *  than a frame between the click and the refusal. */
async function attemptCreate(page: Page, component: Locator): Promise<void> {
  await component.getByRole("button", { name: "New", exact: true }).click();
  await page.getByLabel("Character name").fill("Elara Vance");
  await page.getByLabel("Character description").fill("A wandering cartographer.");
  const create = page.getByRole("button", { name: "Create", exact: true });
  await create.click();
  await expect(create).toBeEnabled();
}

test("a duplicate name is named AT the field, and the dialog stays open to fix it", async ({ mount, page }) => {
  await routeTrpc(page, {
    "character.create": () => trpcError({ code: "BAD_REQUEST", message: 'a character with handle "elara-vance" already exists', reason: "handle_conflict" }),
  });
  const component = await mount(<CharacterCreateBandStory />);
  await attemptCreate(page, component);

  await expect(page.getByRole("alert")).toHaveText(HANDLE_CONFLICT_COPY);
  // The generic copy is what this replaces — it must not ALSO be on screen.
  await expect(page.getByText("Couldn't create the character.")).toHaveCount(0);
  // Not a dead end: the dialog is still open with the typed values intact, which is the whole point of
  // saying it here rather than only in a toast that can be dismissed or time out.
  await expect(page.getByLabel("Character name")).toHaveValue("Elara Vance");

  // …and the claim is LIVE: editing the name retires the accusation against the name that produced it.
  await page.getByLabel("Character name").fill("Elara Vancey");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("the reserved group namespace gets its own reason, not the conflict copy", async ({ mount, page }) => {
  await routeTrpc(page, { "character.create": () => trpcError({ code: "BAD_REQUEST", message: "reserved", reason: "handle_reserved" }) });
  const component = await mount(<CharacterCreateBandStory />);
  await attemptCreate(page, component);

  await expect(page.getByRole("alert")).toHaveText(HANDLE_RESERVED_COPY);
});

test("a genuine FAULT shows no field line — the toast owns a failure the user cannot fix", async ({ mount, page }) => {
  // The two-sided control: a mapper that returned copy for everything would satisfy the tests above for
  // free, and would tell a user to rename their character when the server fell over.
  await routeTrpc(page, { "character.create": () => trpcError({ code: "INTERNAL_SERVER_ERROR", message: "boom" }) });
  const component = await mount(<CharacterCreateBandStory />);
  await attemptCreate(page, component);

  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("Character name")).toHaveValue("Elara Vance");
});
