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

  // A bare "/" offers every registered command — including the one that cannot run (never omitted).
  await textarea.fill("/");
  const lockedOffer = component.getByRole("button", { name: LOCKED_OFFER });
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
  await component.getByRole("button", { name: SPY_OFFER }).click();

  await expect(textarea).toHaveValue("/spy ");
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
