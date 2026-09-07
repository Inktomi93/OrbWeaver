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
import { resolvedTokenColor } from "../../../../support/node/resolved-token-color.ts";
import type { TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ProseSettingsSectionStory } from "../_ct-stories.tsx";

const UPDATE_PROC = "settings.updateUserSettingsSection";
const ARBITER = "chat.arbiter.system";
// A SECOND user-home slot that ALSO carries a required token, for the "untouched rides null" + lint proofs.
// Was `chat.group.roundNudge` until the F4 re-home moved the group framings (and their `{{name}}`) to the
// preset home; the digest prompt is now the section's token-carrying subject (required TOKENS, not a macro —
// the footer lints both classes identically, `[...requiredMacros, ...requiredTokens]`).
const DIGEST = "chat.memory.digestSystem";

/** The MacroField renders a textarea playing `combobox` (ARIA); each card's label is the slot title. */
const ARBITER_FIELD = PROSE_SLOTS[ARBITER].title;
const DIGEST_FIELD = PROSE_SLOTS[DIGEST].title;

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
  expect(lastPatch(trpc)?.[DIGEST]).toBeNull();
});

test("clearing an existing override sends the leaf null (reset to the shipped wording)", async ({ mount, page }) => {
  const trpc = await stub(page, { [ARBITER]: { text: "an existing arbiter prompt", baseVersion: 1 } });
  await mount(<ProseSettingsSectionStory />);
  const arbiter = page.getByRole("textbox", { name: ARBITER_FIELD, exact: true });
  await expect(arbiter).toHaveValue("an existing arbiter prompt");
  await arbiter.fill("");
  await arbiter.blur();
  await expect.poll(() => lastPatch(trpc)?.[ARBITER], { intervals: [20, 50, 100] }).toBeNull();
});

test("the Reset-to-built-in button clears the field, and the write clears the override", async ({ mount, page }) => {
  const trpc = await stub(page, { [ARBITER]: { text: "an existing arbiter prompt", baseVersion: 1 } });
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

// ── THE GEOMETRY OF THE REFUSAL (side-eye PROSE-LIMIT P1/P2/P3) ───────────────────────────────────────
// The cap above is only half an affordance: `field-sizing: content` has no ceiling, so the very 4500-char
// value the refusal exists FOR grew the box past the fold and pushed the counter, the field error and the
// save status ~900px below it. A refusal nobody can see is a save that silently stopped working. So the box
// scrolls INSIDE a capped height, the counter goes danger-toned once it is over, and the save header stops
// reading "Saved" while the write is being withheld.
test("PROSE GEOMETRY — an over-cap value scrolls inside a capped box, and the counter + refusal stay on screen", async ({ mount, page }) => {
  await stub(page, { [ARBITER]: { text: OVERLONG, baseVersion: 1 } });
  await mount(<ProseSettingsSectionStory />);
  const arbiter = page.getByRole("textbox", { name: ARBITER_FIELD, exact: true });
  const card = page.getByRole("group", { name: ARBITER_FIELD });
  await expect(arbiter).toHaveValue(OVERLONG);

  // THE BOX IS CAPPED AND SCROLLS. Its own content is taller than it renders — which is the point: the text
  // is all still there, reachable by scrolling the FIELD rather than by scrolling the page past it.
  const readBoxAtAssertion = async (): Promise<typeof box> =>
    await arbiter.evaluate((el: HTMLTextAreaElement) => ({ client: el.clientHeight, content: el.scrollHeight }));
  const box = await arbiter.evaluate((el: HTMLTextAreaElement) => ({ client: el.clientHeight, content: el.scrollHeight }));
  await expect.poll(async () => (await readBoxAtAssertion()).content).toBeGreaterThan(box.client);
  // …and the cap is a real ceiling, not merely "shorter than the content": the box fits the viewport with
  // room left for the footer it must not push away.
  const viewportHeight = page.viewportSize()?.height ?? 0;
  await expect.poll(async () => (await readBoxAtAssertion()).client).toBeLessThan(viewportHeight / 2);

  // …AND THE ROW STRETCH GOES WITH IT (P2). These cards are grid items, so the tallest one sets its row's
  // height and its sibling gets the difference as empty card — a 2255px card dragged a neighbour to ~1850px
  // of nothing. Capping the box is what collapses that: NO card may exceed the viewport now.
  const cardHeights = await page.getByRole("group").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  expect(cardHeights.length).toBeGreaterThan(1);
  expect(Math.max(...cardHeights)).toBeLessThan(viewportHeight);

  // THE COUNTER IS ON SCREEN WITH THE FIELD. The FIELD is what gets scrolled (never the counter — that would
  // scroll the very thing under test into place), exactly as a host editing this override does.
  //
  // `block: "start"` rather than `scrollIntoViewIfNeeded()` (2026-08-23): "if needed" is a NO-OP whenever the
  // field alone already fits, so this assertion was never reading the CAP — it was reading the arbiter card's
  // ABSOLUTE page position, which no one owns. Measured on the failure: the capped 248px box sat fully
  // visible at y=407 in a 720px viewport, nothing scrolled, and the counter landed at y=725 — FIVE pixels
  // under the fold, with every structural assertion above still passing (box 248px of 4500 chars' content,
  // tallest card 415px of a 720px viewport). Any px of chrome drift anywhere above this card decided the
  // verdict. Bringing the field's own top to the top of the scrollport is what a host reading this field
  // has, and it is STRICTLY stronger than the old spelling: it always scrolls, so the pre-cap 2333px box
  // puts this counter ~2400px down and fails just as hard, while a five-pixel drift cannot flip it.
  await arbiter.evaluate((el: HTMLTextAreaElement) => {
    el.scrollIntoView({ block: "start" });
  });
  const counter = card.getByText(`${String(OVERLONG.length)}/${String(PROSE_MAX_CHARS)}`);
  await expect(counter).toBeInViewport();
  // …and it reads as the BLOCK it is (P3): a muted grey count beside a red refusal was the one number on the
  // card that had to be alarming and wasn't.
  await expect(counter).toHaveCSS("color", resolvedTokenColor("color.destructive"));

  // THE HEADER STOPS LYING (P2). One real edit puts the form in refusal; the status line is the STATE (the
  // field's own error is the REASON), so it must not keep reading "Saved · Synced across your devices." over
  // a write that is being held.
  await arbiter.press("End");
  await arbiter.press("Backspace");
  const status = page.getByRole("status");
  await expect(status).toContainText("Not saved");
  await expect(status).not.toContainText("Synced across your devices.");

  // …AND IT LIFTS with the refusal — a header stuck on "Not saved" would be the same lie inverted.
  await arbiter.fill("y".repeat(3000));
  await expect(status).toContainText("Saved");
});

test("a required token dropped from an override lints — a warn, never a block", async ({ mount, page }) => {
  const trpc = await stub(page);
  await mount(<ProseSettingsSectionStory />);
  const digest = page.getByRole("textbox", { name: DIGEST_FIELD, exact: true });
  await digest.fill("Just summarize the block.");
  const card = page.getByRole("group", { name: DIGEST_FIELD });
  // The digest slot's `requiredTokens` are the retrieval unit's parse contract; dropping one lints (the same
  // warn-never-block posture the group framings' `{{name}}` had before they re-homed to the preset editor).
  await expect(card.getByText("Missing keywords:")).toBeVisible();
  // The lint never blocks: the edit still saves.
  await expect
    .poll(() => lastPatch(trpc)?.[DIGEST], { intervals: [20, 50, 100] })
    .toEqual({ text: "Just summarize the block.", baseVersion: PROSE_SLOTS[DIGEST].version });
});
