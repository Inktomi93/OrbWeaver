// CT: the seeded-greeting swipe strip (R3, chat-creation-draft-mode-replacement.md §4.8 / fork F6).
//
// RESTORED, NOT RESURRECTED. This path existed before R1 over a client draft store and was deleted with it
// (the deletion was ledgered in the test-baseline manifest, which was itself deleted with `monotonic-tests`
// in #2217 — test presence is DERIVED now, so a returning path is judged by `test-presence`/`test-layout`,
// never by a ledger entry). The
// CHROME is the same — that is deliberate, a greeting should page like any other row — but the subject is
// new: the strip now drives a host-gated server verb by INDEX, and its position is derived from the row's
// current text rather than from a store it also writes.
//
// The derivation is what needs pinning. `variants.indexOf(current)` is the whole state model: no local
// index, so a server-side change (a step that landed, a card edited under it, a hand edit through the
// message-edit verb) always re-reads correctly on the next render. Its -1 arm — a hand-edited greeting
// matching NO alternate — is the one a naive `useState(0)` gets wrong, and it is the one that turns the
// control dead if the ends are clamped without thinking.
//
// The room-level composition (which rows get the strip, and the window that gates them) is pinned in
// chat-room-surface.ct.tsx; this file is the component's own contract.

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { GreetingSwipeStripStory } from "../_ct-stories.tsx";
import { makeMessageView } from "../fixtures.ts";

const ALT_0 = "The night market hums.";
const ALT_1 = "She looks up from the ledger.";
const ALT_2 = "Rain, again.";
/** The card's openings, in card order — the strip's `n / m` domain and the verb's index space. */
const ALTERNATES = [ALT_0, ALT_1, ALT_2];
const GREETING_RESULT = makeMessageView({ content: ALT_1 });

/** The fired index, polled — a recorder read is mutable async state (`ct-no-oneshot-live-read-assert`). */
const STEP = "chat.setSeededGreeting";

test("the counter reads the CURRENT text's position, and Next steps to the following alternate", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { [STEP]: GREETING_RESULT });

  const component = await mount(<GreetingSwipeStripStory variants={ALTERNATES} current={ALT_1} />);

  await expect(component.getByText("2 / 3")).toBeVisible();

  await component.getByRole("button", { name: "Next greeting" }).click();

  await expect.poll(() => (trpc.lastInput(STEP) as { readonly greetingIndex?: number } | undefined)?.greetingIndex, { intervals: [20, 50, 100] }).toBe(2);
});

test("Previous steps back", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { [STEP]: GREETING_RESULT });

  const component = await mount(<GreetingSwipeStripStory variants={ALTERNATES} current={ALT_1} />);
  await component.getByRole("button", { name: "Previous greeting" }).click();

  await expect.poll(() => (trpc.lastInput(STEP) as { readonly greetingIndex?: number } | undefined)?.greetingIndex, { intervals: [20, 50, 100] }).toBe(0);
});

test("at the FIRST alternate there is nowhere back to go — Previous is disabled, Next is live", async ({ mount, page }) => {
  await routeTrpc(page, { [STEP]: GREETING_RESULT });

  const component = await mount(<GreetingSwipeStripStory variants={ALTERNATES} current={ALT_0} />);

  await expect(component.getByText("1 / 3")).toBeVisible();
  await expect(component.getByRole("button", { name: "Previous greeting" })).toBeDisabled();
  await expect(component.getByRole("button", { name: "Next greeting" })).toBeEnabled();
});

test("at the LAST alternate Next is disabled — unlike the variant strip, there is nothing to GENERATE here", async ({ mount, page }) => {
  // The one place the two strips' shared chrome means different things: the variant strip's right chevron
  // at the tip fires a fresh generation, so it is never disabled. A card has a fixed set of openings — there
  // is no "make me another one" — so this end really is an end.
  await routeTrpc(page, { [STEP]: GREETING_RESULT });

  const component = await mount(<GreetingSwipeStripStory variants={ALTERNATES} current={ALT_2} />);

  await expect(component.getByText("3 / 3")).toBeVisible();
  await expect(component.getByRole("button", { name: "Next greeting" })).toBeDisabled();
  await expect(component.getByRole("button", { name: "Previous greeting" })).toBeEnabled();
});

test("a HAND-EDITED greeting (matching no alternate) reads “— / m” and still steps — never a dead strip", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { [STEP]: GREETING_RESULT });

  // The row was edited through the message-edit verb, so its text is nobody's alternate. A strip that
  // clamped on a -1 index would render two disabled chevrons over a meaningless counter — a control that
  // says "there is nothing here" about a card with three openings.
  const component = await mount(<GreetingSwipeStripStory variants={ALTERNATES} current="a hand-typed opening that matches no alternate" />);

  await expect(component.getByText("— / 3")).toBeVisible();
  await expect(component.getByRole("button", { name: "Previous greeting" })).toBeEnabled();
  await expect(component.getByRole("button", { name: "Next greeting" })).toBeEnabled();

  // Next from "custom" enters at the FIRST alternate…
  await component.getByRole("button", { name: "Next greeting" }).click();
  await expect.poll(() => (trpc.lastInput(STEP) as { readonly greetingIndex?: number } | undefined)?.greetingIndex, { intervals: [20, 50, 100] }).toBe(0);
});

test("Previous from a hand-edited greeting enters at the LAST alternate", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { [STEP]: GREETING_RESULT });

  const component = await mount(<GreetingSwipeStripStory variants={ALTERNATES} current="still nobody's alternate" />);
  await component.getByRole("button", { name: "Previous greeting" }).click();

  await expect.poll(() => (trpc.lastInput(STEP) as { readonly greetingIndex?: number } | undefined)?.greetingIndex, { intervals: [20, 50, 100] }).toBe(2);
});
