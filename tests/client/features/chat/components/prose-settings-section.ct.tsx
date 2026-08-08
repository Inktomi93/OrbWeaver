// CT: the Prose settings SECTION (PROSE-1 S2 — prose-settings-section.tsx), a settings-section CONTRIBUTION
// into the chat-behavior pane. Drives the production autosave path: getUserSettings seeds one field per
// editable prose slot (empty ⇒ the shipped default ghosts as the placeholder), a typed value debounces then
// fires updateUserSettingsSection("prose") with the slot-id-keyed patch stamped at the slot's CURRENT
// version, and clearing an override sends the leaf `null` (reset to the shipped wording). Asserts the fired
// patch, never the UI reaction (assert-the-mutation-fired).

import { PROSE_COUNTER_AT, PROSE_MAX_CHARS, PROSE_SLOTS } from "@orb/contracts/prose";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc.ts";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ProseSettingsSectionStory } from "../_ct-stories.tsx";

const UPDATE_PROC = "settings.updateUserSettingsSection";
const ARBITER = "chat.arbiter.system";
const NUDGE = "chat.group.roundNudge";

/** The MacroField renders a textarea playing `combobox` (ARIA); each card's label is the slot title. */
const ARBITER_FIELD = PROSE_SLOTS[ARBITER].title;
const NUDGE_FIELD = PROSE_SLOTS[NUDGE].title;

function settingsView(prose: Record<string, unknown> = {}): Record<string, unknown> {
  return { userId: "user_ct_prose", schemaVersion: 7, config: { ...DEFAULT_USER_SETTINGS, prose }, updatedAt: 0 };
}

function stub(page: Page, prose?: Record<string, unknown>): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.getUserSettings": () => settingsView(prose),
    [UPDATE_PROC]: () => ({}),
  });
}

/** The most recent prose-section patch body. */
function lastPatch(trpc: TrpcRecorder): Record<string, unknown> | undefined {
  const input = trpc.lastInput(UPDATE_PROC) as { section?: string; patch?: Record<string, unknown> } | undefined;
  return input?.section === "prose" ? input.patch : undefined;
}

test("a virgin section ghosts each shipped default as the field placeholder (empty ⇒ use the built-in)", async ({ mount, page }) => {
  await stub(page);
  await mount(<ProseSettingsSectionStory />);
  const arbiter = page.getByRole("textbox", { name: ARBITER_FIELD, exact: true });
  await expect(arbiter).toHaveValue(""); // no override
  await expect(arbiter).toHaveAttribute("placeholder", PROSE_SLOTS[ARBITER].text);
  // The honest "not customized" read — the state line, not a guess from the empty box.
  await expect(page.getByRole("group", { name: ARBITER_FIELD }).getByText("Using the built-in wording")).toBeVisible();
});

test("typing an override fires updateUserSettingsSection('prose') stamped at the slot's current version", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ProseSettingsSectionStory />);
  const arbiter = page.getByRole("textbox", { name: ARBITER_FIELD, exact: true });
  await arbiter.fill("Pick whoever has been quiet longest.");
  await arbiter.blur();
  await expect
    .poll(() => lastPatch(trpc)?.[ARBITER], { intervals: [20, 50, 100] })
    .toEqual({ text: "Pick whoever has been quiet longest.", baseVersion: PROSE_SLOTS[ARBITER].version });
  // An untouched slot rides as null (it has no override to preserve) — the patch spells every slot.
  expect(lastPatch(trpc)?.[NUDGE]).toBeNull();
});

test("clearing an existing override sends the leaf null (reset to the shipped wording)", async ({ mount, page }) => {
  const trpc = await stub(page, { [ARBITER]: { text: "an existing director prompt", baseVersion: 1 } });
  await mount(<ProseSettingsSectionStory />);
  const arbiter = page.getByRole("textbox", { name: ARBITER_FIELD, exact: true });
  await expect(arbiter).toHaveValue("an existing director prompt");
  await arbiter.fill("");
  await arbiter.blur();
  await expect.poll(() => lastPatch(trpc)?.[ARBITER], { intervals: [20, 50, 100] }).toBeNull();
});

test("the Reset-to-built-in button clears the field, and the write clears the override", async ({ mount, page }) => {
  const trpc = await stub(page, { [ARBITER]: { text: "an existing director prompt", baseVersion: 1 } });
  await mount(<ProseSettingsSectionStory />);
  const card = page.getByRole("group", { name: ARBITER_FIELD });
  await card.getByRole("button", { name: "Reset to built-in" }).click();
  await expect(page.getByRole("textbox", { name: ARBITER_FIELD, exact: true })).toHaveValue("");
  await expect.poll(() => lastPatch(trpc)?.[ARBITER], { intervals: [20, 50, 100] }).toBeNull();
});

// ── THE PROSE CAP (the same verifier finding, on this editor's half of the class) ─────────────────────
// `proseOverridesSchema` heals an over-cap override to ABSENT, so a save at that length is not an error the
// host can see — it is their wording deleted with the shipped default riding in its place. The preset
// Templates drill-in is the twin surface; the cap, the counter threshold and the refusal are ONE derivation
// in `@orb/contracts/prose`, so the two editors cannot drift into disagreeing about the same number.
/** The `hint-editor` grammar: quiet until 80% of the cap, then a live count. */
const COUNTER_FROM = PROSE_MAX_CHARS * PROSE_COUNTER_AT;
/** A field one character short of the cap, plus the ONE keystroke the cap still admits. */
const AT_CAP = `${"x".repeat(PROSE_MAX_CHARS - 1)}a`;
/** Longer than the cap can ever be TYPED — the shape only pre-existing data can have. */
const OVERLONG = "y".repeat(PROSE_MAX_CHARS + 500);

test("PROSE CAP — the counter is quiet until 80% of the cap, then typing HARD-STOPS at it", async ({ mount, page }) => {
  await stub(page);
  await mount(<ProseSettingsSectionStory />);
  const arbiter = page.getByRole("textbox", { name: ARBITER_FIELD, exact: true });
  const card = page.getByRole("group", { name: ARBITER_FIELD });

  // One character under the threshold: silent. Asserted from both sides so an off-by-one cannot pass by
  // simply showing the counter earlier.
  await arbiter.fill("x".repeat(COUNTER_FROM - 1));
  await expect(card.getByText(`${String(COUNTER_FROM - 1)}/${String(PROSE_MAX_CHARS)}`)).toHaveCount(0);
  await arbiter.fill("x".repeat(PROSE_MAX_CHARS - 1));
  await expect(card.getByText(`${String(PROSE_MAX_CHARS - 1)}/${String(PROSE_MAX_CHARS)}`)).toBeVisible();

  // THE PIN: real keystrokes (`pressSequentially`, not `fill` — `fill` assigns the value and would sail past
  // a native cap). Two characters offered, exactly one allowed to land, and no lag after.
  await arbiter.pressSequentially("ab");
  await expect(arbiter).toHaveValue(AT_CAP);
  await arbiter.pressSequentially("cd");
  await expect(arbiter).toHaveValue(AT_CAP);
});

test("PROSE CAP — an ALREADY-over-cap stored override shows its real text and REFUSES to save until trimmed", async ({ mount, page }) => {
  const trpc = await stub(page, { [ARBITER]: { text: OVERLONG, baseVersion: 1 } });
  await mount(<ProseSettingsSectionStory />);
  const arbiter = page.getByRole("textbox", { name: ARBITER_FIELD, exact: true });

  // The host's bytes are ON SCREEN, all 4500 — truncating them here would be the same silent data loss the
  // schema's self-heal commits, just with a friendlier name.
  await expect(arbiter).toHaveValue(OVERLONG);

  // A real edit — the host starts deleting. Under the old code this debounced into a patch the server would
  // heal away, leaving the section reading "Saved" over wording that no longer existed.
  await arbiter.press("End");
  await arbiter.press("Backspace");
  await expect(arbiter).toHaveValue("y".repeat(PROSE_MAX_CHARS + 499));

  // THE PIN: no write. The debounce plus a full round-trip have had their chance.
  await page.evaluate(() => new Promise<void>((resolve) => setTimeout(resolve, 900)));
  // ONESHOT-OK: settled — the preceding 900ms real-timer wait IS the negative-assertion window.
  expect(trpc.count(UPDATE_PROC)).toBe(0);
  // The block is legible: this surface's cards are bound `<Field>`s, so the refusal renders as the field's
  // own error (with the aria-invalid wiring), not as a hand-rolled badge.
  await expect(arbiter).toHaveAttribute("aria-invalid", "true");
  // 499, not 500 — the count tracks the live field, so the host watching it delete sees the target approach
  // rather than a frozen number that only tells them they are stuck.
  await expect(page.getByText("499 characters over the limit — trim it to save")).toBeVisible();

  // …AND IT LIFTS. A form that stayed invalid forever would be worse than the bug being fixed.
  await arbiter.fill("y".repeat(3000));
  await expect.poll(() => (lastPatch(trpc)?.[ARBITER] as { text?: string } | null | undefined)?.text?.length, { intervals: [100, 200, 300, 500] }).toBe(3000);
});

test("a required pre-substitution token dropped from an override lints — a warn, never a block", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ProseSettingsSectionStory />);
  const nudge = page.getByRole("textbox", { name: NUDGE_FIELD, exact: true });
  await nudge.fill("Write the next reply.");
  const card = page.getByRole("group", { name: NUDGE_FIELD });
  await expect(card.getByText("Missing {{name}}")).toBeVisible();
  // The lint never blocks: the edit still saves.
  await expect
    .poll(() => lastPatch(trpc)?.[NUDGE], { intervals: [20, 50, 100] })
    .toEqual({ text: "Write the next reply.", baseVersion: PROSE_SLOTS[NUDGE].version });
});
