// CT SUITE: FORM IDENTITY — every rendered form control carries an `id` or a `name` (LANE NAVFORM).
//
// WHY THIS SHAPE AND NOT THE OBVIOUS ONE. The symptom the owner reports is Chromium's
// "A form field element has neither an id nor a name attribute. This might prevent the browser from
// correctly autofilling the form." The obvious pin — capture console messages, assert none match — is
// VACUOUSLY GREEN and would stay green forever. Four measured probes (2026-08-07, this lane):
//
//   1. The warning is NOT a console message. It is a CDP `Audits.issueAdded` GenericIssue with
//      `errorType: "FormEmptyIdAndNameAttributesForInputError"`. `page.on("console")` captures ZERO of
//      them on a page that provably issues four.
//   2. Playwright's BUNDLED chromium never emits it AT ALL — it has no autofill agent. The identical
//      page under `chromium.launch({ channel: "chrome" })` issues 4; under the bundled build, 0. The CT
//      browser is therefore structurally incapable of observing this warning, by console OR by CDP.
//   3. `aria-label` does NOT satisfy Chrome. `<input aria-label="Search">` still issues. Only a
//      non-empty `id` or `name` clears it. Do NOT "fix" a site by adding an aria-label and tick this off.
//   4. It fires OUTSIDE a `<form>` too — the population is every rendered `input`/`textarea`/`select`,
//      not just the ones inside a form element.
//
// So this suite pins the PREDICATE Chrome evaluates, in the browser we have. The equivalence is measured,
// not assumed: a control page with every field `id`+`name`ed produced ZERO issues in real Chrome, and the
// same page with them stripped produced the issue per field. If this suite is green, real Chrome is quiet.
//
// The other half of the identity story is INHERITANCE, not attributes: `@orb/ui`'s `<Input>` IS Base UI's
// `Input`, which is `Field.Control`, which mints an id through `useLabelableId` whether or not a
// `<Field.Root>` is above it; `<Field name="x">` additionally provisions the control's `name` from field
// context. That is why almost nothing here needs a hardcoded id — and why a NEW control that bypasses the
// primitives (a raw `<input>`/`<textarea>`/`<select>`) is exactly what this suite catches.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { routeTrpc } from "../../support/ct/route-trpc.ts";
import { AppearanceEffectsSectionStory } from "../features/app-shell/_ct-stories.tsx";
import { ComposerStory } from "../features/chat/_ct-stories.tsx";
import { CharacterCreateBandStory, PresetRenameDialogStory } from "./_form-identity-stories.tsx";

const USER_SETTINGS_VIEW = { userId: "user_ct_form_identity", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 };

/** One unidentified control, as the failure message prints it. */
interface UnidentifiedControl {
  readonly tag: string;
  readonly type: string;
  readonly label: string;
  readonly markup: string;
}

/**
 * Every `input`/`textarea`/`select` in `root` whose `id` AND `name` are both empty — the exact predicate
 * Chrome's `FormEmptyIdAndNameAttributesForInputError` evaluates (probe #3/#4 in the header: aria-label
 * does not count, and being outside a `<form>` does not exempt).
 */
async function unidentifiedControls(root: Locator): Promise<readonly UnidentifiedControl[]> {
  return await root.evaluate((el: Element) => {
    const controls = el.querySelectorAll("input, textarea, select");
    const out: { tag: string; type: string; label: string; markup: string }[] = [];
    for (const control of controls) {
      const id = control.getAttribute("id") ?? "";
      const name = control.getAttribute("name") ?? "";
      if (id !== "" || name !== "") {
        continue;
      }
      out.push({
        tag: control.tagName.toLowerCase(),
        type: control.getAttribute("type") ?? "",
        label: control.getAttribute("aria-label") ?? control.getAttribute("placeholder") ?? "",
        markup: control.outerHTML.slice(0, 200),
      });
    }
    return out;
  });
}

/**
 * Asserts the WHOLE PAGE is clean, printing every offender's markup so the fix site is obvious. Page-wide,
 * not mount-scoped: Base UI portals every dialog/popup to `document.body`, so a mount-rooted query would
 * silently skip exactly the dialog surfaces this suite exists to cover.
 */
async function expectEveryControlIdentified(page: Page, surface: string): Promise<void> {
  const bare = await unidentifiedControls(page.locator("body"));
  expect(bare, `${surface}: every input/textarea/select must carry a non-empty id or name (Chrome autofill).\n${JSON.stringify(bare, null, 2)}`).toEqual([]);
}

// ── The control: the assertion actually BITES ────────────────────────────────────────────────────
// Without this, a helper that silently returned [] (a bad selector, a detached root) would make every
// surface below pass. A planted raw <input> must be caught.

test("the predicate BITES — a planted raw <input> with neither id nor name is reported", async ({ mount }) => {
  const planted = await mount(
    <div>
      {/* Deliberately unlabelled AND unidentified — this is the suite's own NEGATIVE control. */}
      <input placeholder="planted-negative-control" />
    </div>,
  );
  const bare = await unidentifiedControls(planted);
  expect(bare, "the detector must find the planted control").toHaveLength(1);
  expect(bare[0]?.label).toBe("planted-negative-control");
});

test("the predicate PASSES an identified control (a name alone is enough — no id required)", async ({ mount }) => {
  const ok = await mount(
    <div>
      <input aria-label="named" name="named" />
    </div>,
  );
  expect(await unidentifiedControls(ok)).toEqual([]);
});

// ── The four worst surfaces (the crunch named these) ─────────────────────────────────────────────

test("the preset rename dialog renders no unidentified control", async ({ mount, page }) => {
  const dialog = await mount(<PresetRenameDialogStory />);
  await expect(dialog.page().getByRole("textbox", { name: "Preset name" })).toBeVisible();
  await expectEveryControlIdentified(page, "preset rename dialog");
});

test("the character create dialog renders no unidentified control", async ({ mount, page }) => {
  await routeTrpc(page, {});
  const band = await mount(<CharacterCreateBandStory />);
  await band.getByRole("button", { name: "New" }).click();
  await expect(page.getByRole("textbox", { name: "Character name" })).toBeVisible();
  await expectEveryControlIdentified(page, "character create dialog");
});

test("the chat composer renders no unidentified control", async ({ mount, page }) => {
  await routeTrpc(page, {});
  const composer = await mount(<ComposerStory />);
  await expect(composer.getByLabel("Message", { exact: true })).toBeVisible();
  await expectEveryControlIdentified(page, "chat composer");
});

test("a settings pane's SettingSwitchRows render no unidentified control", async ({ mount, page }) => {
  await routeTrpc(page, { "settings.getUserSettings": () => USER_SETTINGS_VIEW });
  const pane = await mount(<AppearanceEffectsSectionStory />);
  await expect(pane.getByRole("switch").first()).toBeVisible();
  await expectEveryControlIdentified(page, "appearance effects section");
});
