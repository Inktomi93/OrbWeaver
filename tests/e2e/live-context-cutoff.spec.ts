// E2E (@live): the context-cutoff DIVIDER is PRESENT-TENSE and server-computed (workboard #7). Since
// previewContextFit landed, the divider answers "what will the NEXT send include under CURRENT settings"
// — the client consumes the preview (message-list-surface.tsx), and the per-generation canon stamps
// (`contextBoundaryMessageId`) remain PROVENANCE, not the line's source. Two pins, in one flow:
//
//   P1 — a STALE canon stamp must NOT resurrect a divider (the #6 bug class, present-tense edition):
//        a turn driven with a tiny per-send `intent.maxContextTokens` stamps a real mid-transcript
//        boundary onto canon, but the NEXT send carries no such override — the preview (current preset,
//        full window) says "everything fits", so the API boundary is null and NO divider renders.
//   P2 — moving the PRESET knob moves the line WITHOUT any model turn (the whole point of previewFit):
//        a throwaway preset with params.maxContextTokens=200 becomes the user's default → the preview
//        recomputes (settingsChanged/presetsChanged invalidation) → the API reports a mid-transcript
//        boundary and the DOM divider renders on exactly that row.
//
// MUTATES + RESTORES: P2 sets `settings.seeds.defaultPresetId` to the throwaway preset (the host's
// promptConfig home — entry/compose/chat.ts resolvePromptConfigWithOverride) and restores the prior
// value + removes the preset in `finally`, so no state leaks into other specs.
//
// @live: seeds via three real API turns (~10-18s warm). Skipped unless E2E_LIVE=1. Fully self-seeding.

import type { CharacterId, ChatId, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/test";
import { gotoChatsList, messageRow } from "./support/chat-room.ts";
import { deleteChat, getUserSettings, listCanon, listCharacters, sendTurn, startChat, trpcMutation, trpcQuery } from "./support/trpc.ts";

interface ContextFitPreview {
  readonly boundaryMessageId: string | null;
  readonly usedTokens: number;
  readonly ceilingTokens: number;
  readonly reserveOutputTokens: number;
  readonly droppedCount: number;
}

const TINY_CEILING = 200; // maxContextTokens small enough that only the newest turn survives the fit
// This spec exercises the FIT divider (a stale canon stamp must not resurrect it). Under the #9 owner ruling the
// RESOLVED default compaction mode is "managed", which would compact a tiny-ceiling turn into a MEMORY marker and
// change the divider's meaning — so these turns pin `mode:"auto"` (the SDK's own compaction: no stored marker, no
// memory-fact), isolating the fit-divider behavior this spec is about. (The managed-marker divider is #9's own
// live-managed-compaction spec.)
const AUTO = { mode: "auto" as const };

const previewFit = (chatId: ChatId): Promise<ContextFitPreview> => trpcQuery<ContextFitPreview>("chat.previewContextFit", { chatId });

test("the context-boundary divider is present-tense: preview-driven, knob-responsive, stale-stamp-proof", {
  tag: "@live",
}, async ({ page }) => {
  test.setTimeout(180_000);

  // ── Seed a throwaway chat with history; the FINAL turn's tiny per-send ceiling stamps a canon boundary. ──
  const characterId = (await listCharacters())[0]?.id ?? castId<CharacterId>("");
  expect(characterId).not.toBe("");
  const chatId = await startChat([characterId]);
  try {
    // `mode:"auto"` on every turn ⇒ no managed marker ⇒ the divider is purely fit-driven (this spec's subject).
    await sendTurn(chatId, "Count to three.", undefined, AUTO);
    await sendTurn(chatId, "Name a color.", undefined, AUTO);
    await sendTurn(chatId, "Say ok.", TINY_CEILING, AUTO);

    // The canon PROVENANCE recorded the tiny-ceiling cut (a real mid-transcript boundary)…
    const canon = await listCanon(chatId);
    const stampedId = canon.filter((c) => c.role === "assistant" && c.contextBoundaryMessageId !== null).at(-1)?.contextBoundaryMessageId;
    expect(stampedId).toBeTruthy();
    expect(canon.findIndex((c) => c.id === stampedId)).toBeGreaterThan(0);

    // ── P1: …but the PRESENT-TENSE preview (current preset, full window) says everything fits — null
    // boundary, and the UI renders NO divider despite the stale stamp sitting in canon. ──
    const restingPreview = await previewFit(chatId);
    expect(restingPreview.boundaryMessageId).toBeNull();

    await gotoChatsList(page);
    await page.getByRole("list", { name: "Chats list" }).getByRole("button").first().click();
    await expect(page.getByRole("textbox", { name: "Message" })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-slot="message-row"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('[data-slot="context-boundary-divider"]')).toHaveCount(0);

    // ── P2: point the user's default preset at a tiny ceiling → the line appears WITH NO MODEL TURN. ──
    const priorDefaultPresetId = (await getUserSettings()).config.seeds.defaultPresetId;
    const tinyPreset = await trpcMutation<{ readonly id: string }>("preset.create", {
      name: "e2e-tiny-context",
      kind: "chat",
    });
    try {
      // preset.update takes the FULL config (promptConfigSchema) — a `patch` key is silently stripped by
      // the input schema (integration find, 2026-07-24). Read the created preset's config, merge the knob.
      const created = await trpcQuery<{ readonly config: { readonly params?: Record<string, unknown> } }>("preset.get", { id: tinyPreset.id });
      await trpcMutation("preset.update", {
        id: tinyPreset.id,
        config: { ...created.config, params: { ...created.config.params, maxContextTokens: TINY_CEILING } },
      });
      await trpcMutation("settings.updateUserSettingsSection", {
        section: "seeds",
        patch: { defaultPresetId: tinyPreset.id },
      });

      // The API preview now reports a REAL mid-transcript boundary under the preset ceiling…
      await expect.poll(async () => (await previewFit(chatId)).boundaryMessageId, { timeout: 15_000, intervals: [200, 500, 1000] }).not.toBeNull();
      const knobbed = await previewFit(chatId);
      const apiBoundary = knobbed.boundaryMessageId;
      expect(canon.findIndex((c) => c.id === apiBoundary)).toBeGreaterThan(0);
      expect(knobbed.ceilingTokens).toBe(TINY_CEILING);

      // …and the DOM divider appears on exactly that row (settingsChanged invalidation refetches the preview —
      // no reload, no turn). The boundary row is addressed by its KNOWN id via the identity-scoped `messageRow()`
      // locator (#10 — the intended debut over the prior manual `data-message-id` read); the divider is its
      // immediately-preceding sibling.
      await expect(page.locator('[data-slot="context-boundary-divider"]')).toHaveCount(1, { timeout: 15_000 });
      expect(apiBoundary).not.toBeNull();
      const boundaryRow = messageRow(page, castId<MessageId>(apiBoundary ?? ""));
      await expect(boundaryRow).toHaveCount(1);
      const dividerIsPrecedingSibling = await boundaryRow.evaluate(
        (row) => row.previousElementSibling?.getAttribute("data-slot") === "context-boundary-divider",
      );
      expect(dividerIsPrecedingSibling).toBe(true);
    } finally {
      // Restore the prior default preset (null = clear back to the system default) + remove the throwaway.
      await trpcMutation("settings.updateUserSettingsSection", {
        section: "seeds",
        patch: { defaultPresetId: priorDefaultPresetId ?? null },
      });
      await trpcMutation("preset.remove", { id: tinyPreset.id });
    }
  } finally {
    await deleteChat(chatId);
  }
});
