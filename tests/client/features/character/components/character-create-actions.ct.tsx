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
import { hitExtent, touchFloorPx } from "../../../../support/browser/touch-floor.ts";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { CharacterCreateBandStory } from "../../../forms/editor/_form-identity-stories.tsx";

const HANDLE_CONFLICT_COPY = "You already have a character with that name. Pick a different name and try again.";
const HANDLE_RESERVED_COPY = "That name is reserved for group rooms. Pick a different name and try again.";
/** The band's import ghost — the #842 door (its accessible name is an `aria-label`; it renders a glyph). */
const IMPORT_NAME = "Import a character card";

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

// ── #548 · WCAG 3.3.1's OTHER half: the error has to be IDENTIFIED, not only announced ───────────────
// #542 shipped the announcement (`role="alert"`) and stopped there: the Name input carried
// `aria-invalid=null` and pointed at nothing, so a screen-reader user who tabbed BACK to the field — the
// whole reason the dialog stays open — met a plain, apparently-fine text box. The pair binds the refusal to
// the control it is about, and clears with it on the next keystroke.
test("#548 the refused Name field is marked invalid and points at the refusal, in BOTH states", async ({ mount, page }) => {
  await routeTrpc(page, {
    "character.create": () => trpcError({ code: "BAD_REQUEST", message: 'a character with handle "elara-vance" already exists', reason: "handle_conflict" }),
  });
  const component = await mount(<CharacterCreateBandStory />);
  const name = page.getByLabel("Character name");

  // BEFORE: a field nobody has refused makes no claim about itself.
  await component.getByRole("button", { name: "New", exact: true }).click();
  await expect(name).not.toHaveAttribute("aria-invalid");
  await expect(name).not.toHaveAttribute("aria-errormessage");

  await page.getByLabel("Character description").fill("A wandering cartographer.");
  await name.fill("Elara Vance");
  const create = page.getByRole("button", { name: "Create", exact: true });
  await create.click();
  await expect(create).toBeEnabled();

  // AFTER: invalid, and the message it names is the rendered refusal — resolved through the DOM, so a
  // dangling id (the failure this attribute has) cannot pass.
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect
    .poll(async () =>
      name.evaluate((el: HTMLElement) => {
        const id = el.getAttribute("aria-errormessage") ?? "";
        return el.ownerDocument.getElementById(id)?.textContent ?? null;
      }),
    )
    .toBe(HANDLE_CONFLICT_COPY);

  // …and the mark is as live as the line: editing the name retires both together.
  await name.fill("Elara Vancey");
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(name).not.toHaveAttribute("aria-invalid");
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// #842 — THE IMPORT DOOR, from the 2026-08-30 side-eye delta pass. Two defects on one 40px button.

// THE DIALOG HAD NO VISIBLE EXIT. Its full contents were a heading, four paragraphs and a file input:
// `[...dialog.querySelectorAll("button")]` → `[]`, on desktop AND on the 430px coarse arm. Escape worked
// and a touch device has no Escape; backdrop dismissal was not verifiable with synthetic pointers, so it
// could not be the remaining exit either. The sibling New-character dialog ends in `Cancel | Create`.
//
// The pin is a BUTTON CENSUS plus the exit actually working — a mere `getByRole("button", {name:"Cancel"})`
// would pass on a Cancel that closes nothing.
test("#842 the import dialog has a visible exit that closes it", async ({ mount, page }) => {
  await routeTrpc(page, {});
  const component = await mount(<CharacterCreateBandStory />);
  await component.getByRole("button", { name: IMPORT_NAME }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // The census the review took, as an assertion: SOMETHING in here is pressable besides the file input.
  await expect(dialog.getByRole("button")).not.toHaveCount(0);

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

// …AND IT SAID ITS ONE FACT THREE TIMES — the description, the dropzone instruction and the dropzone hint
// each named the accepted formats, in a 250px dialog with one control (`repeated-container-text`).
test("#842 the import dialog states the accepted formats ONCE", async ({ mount, page }) => {
  await routeTrpc(page, {});
  const component = await mount(<CharacterCreateBandStory />);
  await component.getByRole("button", { name: IMPORT_NAME }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((el: HTMLElement) => (el.innerText.match(/PNG or JSON/gu) ?? []).length)).toBe(1);
});

test.describe("#842 the import button at a coarse pointer", () => {
  test.use({ hasTouch: true });

  // 40×44 — under the floor on its SHORT side, and not the phantom class: a four-cardinal
  // `elementFromPoint` lost the point at ±21px horizontally, and `getComputedStyle(el,"::after").content`
  // was `none`, so the 40px box WAS the target (an icon-only `sm` button is a control HEIGHT with
  // `px-block` of width, and the `sm` step carries no hit-area pseudo). Measured through `hitExtent`, which
  // is the instrument that can see both the box-carried and the pseudo-carried shapes.
  test("owns the touch floor on BOTH axes", async ({ mount, page }) => {
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    await routeTrpc(page, {});
    const component = await mount(<CharacterCreateBandStory />);
    const floor = await touchFloorPx(page);

    const button = component.getByRole("button", { name: IMPORT_NAME });
    await expect(button).toBeVisible();
    expect(await hitExtent(button, "x"), "the axis the 40px box was short on").toBeGreaterThanOrEqual(floor);
    expect(await hitExtent(button, "y")).toBeGreaterThanOrEqual(floor);
  });
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
