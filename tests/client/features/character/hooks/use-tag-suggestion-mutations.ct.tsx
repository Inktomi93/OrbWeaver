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
import type { CharacterHandle, TagId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { chatListResponder } from "../../chat/fixtures.ts";
import { CharacterEditorSuggestToastStory, CharacterSuggestWarmLabelsStory } from "../_ct-stories.tsx";
import { CHARACTER_EDITOR_AMBIENT_ROUTES, makeCharacterDetail } from "../fixtures.ts";

// A NAME-ONLY card — the state under test, modelled honestly (no description, no opening line).
const CARD = makeCharacterDetail({ name: "Bare", handle: castId<CharacterHandle>("bare"), description: null, greetings: [] });
const TOAST = '[data-slot="toast-root"]';

/** Everything the editor reads, plus a scripted `suggestCharacterTags` failure. */
async function routeEditorWithSuggestFailure(page: Page, failure: ReturnType<typeof trpcError>): Promise<void> {
  await routeTrpc(page, {
    // The editor tree's ambient reads (#649) — `regex.listForCharacter` and the viewer's settings row were
    // unfed here, so the attachment and settings-driven presentation pipelines ran INERT while this file's
    // subject (the refusal toast) passed. The spread leads; the scripted failure below still wins.
    ...CHARACTER_EDITOR_AMBIENT_ROUTES,
    "character.get": () => CARD,
    "chat.listChats": chatListResponder([]),
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

test("staging suggestions refreshes the warm Labels queue and census on return", async ({ mount, page }) => {
  let staged = false;
  const tag = {
    id: castId<TagId>("tag_warm"),
    name: "Warm label",
    color: null,
    color2: null,
    folderType: "NONE" as const,
    source: "auto" as const,
    sortOrder: 0,
    isHiddenOnCard: false,
  };
  const recorder = await routeTrpc(page, {
    ...CHARACTER_EDITOR_AMBIENT_ROUTES,
    "character.get": () => CARD,
    "chat.listChats": chatListResponder([]),
    "tag.listTagsWithUsage": () => [
      { ...tag, usage: { characters: 0, chats: 0, worldBooks: 0, personas: 0, presets: 0, total: 0 }, pendingSuggestions: staged ? 1 : 0 },
    ],
    "tag.listPendingSuggestions": () => (staged ? [{ ...tag, characterId: CARD.id, characterName: CARD.name }] : []),
    "discovery.suggestCharacterTags": () => {
      staged = true;
      return { distilled: 1, failed: 0 };
    },
  });
  const component = await mount(<CharacterSuggestWarmLabelsStory />);
  await expect(component.getByText("No suggested tags awaiting review.", { exact: true })).toBeVisible();
  await expect(component.getByRole("button", { name: "Prune 1 unused" })).toBeVisible();
  await component.getByRole("button", { name: "Visit character" }).click();
  await expect(component.getByRole("textbox", { name: "Name" })).toHaveValue("Bare");
  await component.getByRole("button", { name: "Suggest tags" }).click();
  await expect.poll(() => recorder.count("discovery.suggestCharacterTags")).toBe(1);
  await expect(component.getByRole("button", { name: "Suggest tags" })).toBeEnabled();
  await component.getByRole("button", { name: "Return to Labels" }).click();
  await expect(component.getByRole("group", { name: "Suggested Warm label for Bare" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Prune 1 unused" })).toHaveCount(0);
  await expect.poll(() => recorder.count("tag.listTagsWithUsage")).toBe(2);
});
