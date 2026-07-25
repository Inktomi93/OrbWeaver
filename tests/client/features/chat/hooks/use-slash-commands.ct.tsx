// CT: the composer's SLASH-COMMAND dispatch end-to-end (client-architecture-lockdown.md §6c). Drives the
// PRODUCTION path — a real registry at a Provider, the real mounts publishing real runners, the real
// Composer submit — with `chat.send` stubbed at the network so "did it post?" is a hard count, not a guess.
//
// The four behaviours pinned here are the whole contract: a KNOWN command runs (and does not post), an
// UNKNOWN one is REFUSED with a visible reason (never silently posted), the `//` escape restores the
// ability to send a message that legitimately starts with a slash, and an UNAVAILABLE command is offered
// but refused with the reason naming its unlock. The zero-registrant baseline is here too, because
// "byte-identical with no contributions" is the property the whole seam is allowed to exist under.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { COMPOSER_CHAT_ID, SLASH_LOCKED_REASON } from "../fixtures";
import { SlashComposerStory } from "./_slash-command-stories";

const UNKNOWN_NOTICE = /Unknown command \/nope/u;
const ESCAPE_HINT = /\/\/nope to send it as a message/u;
const LOCKED_OFFER = /\/locked/u;
const SPY_OFFER = /\/spy/u;

test("a registered /command dispatches to its runner with the args after the token, and posts nothing", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.send": () => ({ ok: true }) });
  const component = await mount(<SlashComposerStory />);

  await component.getByLabel("Message", { exact: true }).fill("/spy hello world");
  await component.getByRole("button", { name: "Send message" }).click();

  // The runner FIRED, with the projection's chatId and the raw remainder.
  await expect(component.getByTestId("ct-slash-fired")).toHaveText(`${COMPOSER_CHAT_ID}:hello world`);
  // ONESHOT-OK: the barrier above already awaited the completed dispatch path, so this 'never posted' count is settled.
  expect(trpc.count("chat.send")).toBe(0);
});

test("an UNKNOWN /command is refused with a visible reason and is NOT posted as a message", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.send": () => ({ ok: true }) });
  const component = await mount(<SlashComposerStory />);
  const textarea = component.getByLabel("Message", { exact: true });

  await textarea.fill("/nope thing");
  await component.getByRole("button", { name: "Send message" }).click();

  // The refusal is surfaced, not swallowed — and it names the `//` escape.
  await expect(component.getByText(UNKNOWN_NOTICE)).toBeVisible();
  await expect(component.getByText(ESCAPE_HINT)).toBeVisible();
  // The draft is kept (nothing was destroyed) and nothing was posted.
  await expect(textarea).toHaveValue("/nope thing");
  // ONESHOT-OK: the barriers above already awaited the completed submit path, so this count is settled.
  expect(trpc.count("chat.send")).toBe(0);
});

test("the // escape sends a message that legitimately starts with a slash", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.send": () => ({ ok: true }) });
  const component = await mount(<SlashComposerStory />);

  await component.getByLabel("Message", { exact: true }).fill("//nope thing");
  await component.getByRole("button", { name: "Send message" }).click();

  await expect.poll(() => trpc.count("chat.send"), { intervals: [20, 50, 100] }).toBe(1);
  // One slash is eaten: the posted content is the literal message the user meant.
  await expect.poll(() => trpc.lastInput("chat.send")).toMatchObject({ chatId: COMPOSER_CHAT_ID, content: "/nope thing" });
});

test("an UNAVAILABLE command is still offered (disabled, with its reason) and is refused on send", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.send": () => ({ ok: true }) });
  const component = await mount(<SlashComposerStory />);
  const textarea = component.getByLabel("Message", { exact: true });

  // A bare "/" offers every registered command — including the one that cannot run (never omitted). The
  // offers are combobox `option`s now (the strip is a listbox the textarea drives), not bare buttons.
  await textarea.fill("/");
  const lockedOffer = component.getByRole("option", { name: LOCKED_OFFER });
  await expect(lockedOffer).toBeVisible();
  await expect(lockedOffer).toBeDisabled();
  await expect(lockedOffer).toHaveAttribute("title", SLASH_LOCKED_REASON);

  await textarea.fill("/locked");
  await component.getByRole("button", { name: "Send message" }).click();

  await expect(component.getByText(SLASH_LOCKED_REASON)).toBeVisible();
  await expect(component.getByTestId("ct-slash-fired")).toHaveText("");
  // ONESHOT-OK: the barriers above already awaited the completed submit path, so this count is settled.
  expect(trpc.count("chat.send")).toBe(0);
});

test("picking an offer completes the draft to that command's token", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.send": () => ({ ok: true }) });
  const component = await mount(<SlashComposerStory />);
  const textarea = component.getByLabel("Message", { exact: true });

  await textarea.fill("/sp");
  await component.getByRole("option", { name: SPY_OFFER }).click();

  await expect(textarea).toHaveValue("/spy ");
});

// ── keyboard navigation of the completion strip (P2 a11y, side-eye 2026-07-25) ─────────────────────────
// The strip is an editable-combobox: arrows move a highlight the textarea DRIVES via aria-activedescendant,
// Enter picks the highlighted offer, and focus NEVER leaves the textarea (the whole point of the shape).

const SPY_OPTION_ID = "composer-slash-option-spy";
const LOCKED_OPTION_ID = "composer-slash-option-locked";
const SLASH_LISTBOX_ID = "composer-slash-listbox";
// Matches any NON-empty attribute value — used to assert aria-activedescendant is ABSENT (the passive-open
// state has no highlighted option, so the attribute must not be present).
const ANY_NONEMPTY = /.+/u;

test("ArrowDown/Up cycle the highlight over the offers while focus STAYS in the textarea", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.send": () => ({ ok: true }) });
  const component = await mount(<SlashComposerStory />);
  const textarea = component.getByLabel("Message", { exact: true });

  // A bare "/" offers every command in registry order: [spy, locked]. Focus the textarea for real.
  await textarea.click();
  await textarea.fill("/");
  // Open combobox: the textarea advertises expansion + the listbox it controls, and (until an arrow) no
  // active descendant — the passive-open state.
  await expect(textarea).toHaveAttribute("aria-expanded", "true");
  await expect(textarea).toHaveAttribute("aria-controls", SLASH_LISTBOX_ID);
  await expect(textarea).not.toHaveAttribute("aria-activedescendant", ANY_NONEMPTY);
  await expect(component.getByRole("listbox", { name: "Slash commands" })).toBeVisible();

  // ArrowDown → first offer (spy) highlighted; the textarea's active descendant points at it and the row is
  // aria-selected. Focus has NOT moved — the composer keeps its one tab stop.
  await textarea.press("ArrowDown");
  await expect(textarea).toHaveAttribute("aria-activedescendant", SPY_OPTION_ID);
  await expect(component.getByRole("option", { name: SPY_OFFER })).toHaveAttribute("aria-selected", "true");
  await expect(textarea).toBeFocused();

  // ArrowDown → second offer (locked).
  await textarea.press("ArrowDown");
  await expect(textarea).toHaveAttribute("aria-activedescendant", LOCKED_OPTION_ID);

  // ArrowDown wraps back to the first (cycle).
  await textarea.press("ArrowDown");
  await expect(textarea).toHaveAttribute("aria-activedescendant", SPY_OPTION_ID);

  // ArrowUp wraps to the last.
  await textarea.press("ArrowUp");
  await expect(textarea).toHaveAttribute("aria-activedescendant", LOCKED_OPTION_ID);

  // Focus is STILL on the textarea after all the arrow cycling (it never moved to a row) — the web-first
  // toBeFocused() retries against the live active element, so it is the settled assertion the gate wants.
  await expect(textarea).toBeFocused();
});

test("Enter picks the HIGHLIGHTED offer (completing the draft), not the first-typed command", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.send": () => ({ ok: true }) });
  const component = await mount(<SlashComposerStory />);
  const textarea = component.getByLabel("Message", { exact: true });

  await textarea.click();
  await textarea.fill("/");
  // Highlight the SECOND offer (locked would refuse — pick spy is available, so highlight it: ArrowDown once).
  await textarea.press("ArrowDown");
  await expect(textarea).toHaveAttribute("aria-activedescendant", SPY_OPTION_ID);

  // Enter completes the draft to the highlighted command's token (recognition-over-recall) — it does NOT send.
  await textarea.press("Enter");
  await expect(textarea).toHaveValue("/spy ");
  await expect(textarea).toBeFocused();
});

test("with NO row highlighted, Enter still sends the full-typed command (the typed path is not regressed)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.send": () => ({ ok: true }) });
  const component = await mount(<SlashComposerStory />);
  const textarea = component.getByLabel("Message", { exact: true });

  // A complete, available command typed in full — the strip is open (it still matches) but nothing is
  // highlighted, so Enter must fall through to the dispatch path and run the command (posting nothing).
  await textarea.click();
  await textarea.fill("/spy hi");
  await textarea.press("Enter");

  await expect(component.getByTestId("ct-slash-fired")).toHaveText(`${COMPOSER_CHAT_ID}:hi`);
  // ONESHOT-OK: the fired barrier above awaited the completed dispatch path — a run never posts.
  expect(trpc.count("chat.send")).toBe(0);
});

test("Enter on a HIGHLIGHTED unavailable offer refuses it with its reason (never completes) — the disabled law holds for the keyboard too", async ({
  mount,
  page,
}) => {
  await routeTrpc(page, { "chat.send": () => ({ ok: true }) });
  const component = await mount(<SlashComposerStory />);
  const textarea = component.getByLabel("Message", { exact: true });

  // Offers are [spy, locked]; ArrowUp from -1 wraps to the LAST (locked, the unavailable one).
  await textarea.click();
  await textarea.fill("/");
  await textarea.press("ArrowUp");
  await expect(textarea).toHaveAttribute("aria-activedescendant", LOCKED_OPTION_ID);

  // Enter must NOT complete the draft to /locked — it surfaces the reason instead (activation prevented),
  // exactly as a click on the disabled row is prevented.
  await textarea.press("Enter");
  await expect(component.getByText(SLASH_LOCKED_REASON)).toBeVisible();
  await expect(textarea).toHaveValue("/");
});

test("when the strip is CLOSED, ArrowUp/Down are NOT hijacked (multiline caret movement is sacred)", async ({ mount, page }) => {
  await routeTrpc(page, { "chat.send": () => ({ ok: true }) });
  const component = await mount(<SlashComposerStory />);
  const textarea = component.getByLabel("Message", { exact: true });

  // A plain multi-line message — no completion strip is open (the draft is not a command-in-progress).
  await textarea.click();
  await textarea.fill("line one\nline two");
  await expect(textarea).not.toHaveAttribute("aria-expanded", "true");

  // Put the caret at the very end, then ArrowUp: the composer must NOT preventDefault, so the browser moves
  // the caret up a line. We assert the native move happened by reading selectionStart before/after.
  await textarea.evaluate((el: HTMLTextAreaElement) => {
    el.selectionStart = el.value.length;
    el.selectionEnd = el.value.length;
  });
  const endPos = await textarea.evaluate((el: HTMLTextAreaElement) => el.selectionStart);
  await textarea.press("ArrowUp");
  const afterPos = await textarea.evaluate((el: HTMLTextAreaElement) => el.selectionStart);
  // The caret moved up (native behavior preserved) — a hijacked ArrowUp would have left it pinned at the end.
  expect(afterPos).toBeLessThan(endPos);
});

// ── the zero-registrant baseline ────────────────────────────────────────────────────────────────────

test("with ZERO registrations a normal message still sends normally", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.send": () => ({ ok: true }) });
  const component = await mount(<SlashComposerStory registered={false} />);

  await component.getByLabel("Message", { exact: true }).fill("Hello there");
  await component.getByRole("button", { name: "Send message" }).click();

  await expect.poll(() => trpc.count("chat.send"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.lastInput("chat.send")).toMatchObject({ content: "Hello there" });
});

test("with ZERO registrations /nope is still refused, never silently posted", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { "chat.send": () => ({ ok: true }) });
  const component = await mount(<SlashComposerStory registered={false} />);

  await component.getByLabel("Message", { exact: true }).fill("/nope thing");
  await component.getByRole("button", { name: "Send message" }).click();

  await expect(component.getByText(UNKNOWN_NOTICE)).toBeVisible();
  // ONESHOT-OK: the barrier above already awaited the completed submit path, so this count is settled.
  expect(trpc.count("chat.send")).toBe(0);
});
