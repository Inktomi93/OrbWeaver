// CT: the "Suggest tags" REFUSAL copy — the user-facing half of the 2026-08-03 tag-fabrication fix. The
// on-demand distill now refuses a name-only card (`CardNotDistillableError` → BAD_REQUEST +
// `data.reason: card_not_distillable`) instead of staging facets invented from the name, and this proves the
// refusal reaches PIXELS with copy the user can ACT on — not the generic "try again", which for a card with
// nothing written on it is a lie (retrying produces the same refusal forever).
//
// Drives the production path end to end: the real editor surface → the real `useSuggestCharacterTags`
// mutation → the REAL app QueryClient's MutationCache `meta.errorToast` channel (`CtAppDataProviders` — the
// plain CT client has no such channel) → `notify.error` → the bound toast manager → the Toaster. The reason
// code is scripted at the NETWORK (routeTrpc's `reason`), exactly as the tRPC error formatter emits it.

import { CARD_NOT_DISTILLABLE_REASON } from "@orb/contracts/discovery";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc, trpcError } from "../../../../support/ct/route-trpc.ts";
import { chatListResponder } from "../../chat/fixtures.ts";
import { CharacterEditorSuggestToastStory } from "../_ct-stories.tsx";
import { makeCharacterDetail } from "../fixtures.ts";

// A NAME-ONLY card — the state under test, modelled honestly (no description, no opening line).
const CARD = makeCharacterDetail({ name: "Bare", handle: castId<CharacterHandle>("bare"), description: null, greetings: [] });
const TOAST = '[data-slot="toast-root"]';

/** Everything the editor reads, plus a scripted `suggestCharacterTags` failure. */
async function routeEditorWithSuggestFailure(page: Page, failure: ReturnType<typeof trpcError>): Promise<void> {
  await routeTrpc(page, {
    "character.get": () => CARD,
    "chat.listChats": chatListResponder([]),
    "tag.listPendingSuggestions": () => [],
    "discovery.suggestCharacterTags": () => failure,
  });
}

test("a name-only card's refusal toasts the FIX (add a description), never 'try again'", async ({ mount, page }) => {
  await routeEditorWithSuggestFailure(
    page,
    trpcError({ code: "BAD_REQUEST", message: "That card has nothing to summarize yet — add a description first.", reason: CARD_NOT_DISTILLABLE_REASON }),
  );
  const component = await mount(<CharacterEditorSuggestToastStory />);

  // Barrier on the SETTLED editor (the hero resolved) before driving the button.
  await expect(component.getByRole("textbox", { name: "Name" })).toHaveValue("Bare");
  const suggest = component.getByRole("button", { name: "Suggest tags" });
  await expect(suggest).toBeEnabled();

  await suggest.click();

  const toast = page.locator(TOAST);
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText("Nothing to summarize yet — add a description to this card, then suggest tags.");
  await expect(toast).toHaveAttribute("data-type", "error");
  // The button settles back to its resting label — the refusal is terminal, not a stuck "Suggesting…".
  await expect(component.getByRole("button", { name: "Suggest tags" })).toBeEnabled();
});

test("a transient summarizer failure keeps the RETRY copy (the reason branch is narrow)", async ({ mount, page }) => {
  // No `reason` — a `DistillFailedError` maps to SERVICE_UNAVAILABLE and the formatter emits no reason code
  // (only a DomainOperationError carries one). "Try again" is the honest copy for that arm.
  await routeEditorWithSuggestFailure(page, trpcError({ code: "SERVICE_UNAVAILABLE", message: "The summarizer returned nothing usable for that card." }));
  const component = await mount(<CharacterEditorSuggestToastStory />);

  await expect(component.getByRole("textbox", { name: "Name" })).toHaveValue("Bare");
  await component.getByRole("button", { name: "Suggest tags" }).click();

  const toast = page.locator(TOAST);
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText("Couldn't generate tag suggestions — try again.");
});
