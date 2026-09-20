// E2E (@live) — GUIDED GENERATIONS end-to-end through the real stack, pinning the Phase-1 improved
// semantics (commit 36d0b128: F1 rewrite fire · F2 undo/revert exposure · F3 input-restore · F5
// steer+speaker · F4 WI-scan). Guided had ZERO e2e coverage before this file; the kit resolvers +
// steer routing are exhaustively unit/int-tested server-side (kit/guided, assembly/context.int,
// read.int, turn.int) — this spec tests the OTHER half: that the composer's guided controls + the
// message ⋯ menu actually DRIVE those seams end-to-end and land the improved semantics in committed canon.
//
// THE COMPOSER ANATOMY IT DRIVES (rewritten #388). The nested `ComposerWand` menu this spec was written
// against is GONE — `composer-guided-cluster.tsx` replaced it with four ALWAYS-VISIBLE DUAL-MODE icons
// (Impersonate · Swipe · Response · Continue) plus a ✨ utility menu. There is no "Guided generations"
// trigger and no "Guided response"/"Guided continue" menu item to click; the interaction model changed,
// so this is a rewrite against the live affordances, not a label swap:
//   • DUAL MODE is the steer: an empty composer fires the plain action, a composer with TEXT fires the
//     guided one, and the icon's own accessible name flips with it ("Generate reply" → "Guided generate
//     reply"). So typing the steer IS arming the guided fire — nothing opens a menu first.
//   • Guided response = the ▶ icon. SOLO room ⇒ a plain button that fires on click. MULTI-character room
//     ⇒ the same-named MenuTrigger whose popup is "Auto (arbitrate)" + one FLAT item per member (leg 4's
//     speaker pick; it is no longer a hover-submenu under a "Guided response" parent).
//   • Guided continue = the ⏩ icon, whose guided name is "Continue the reply with this direction".
//   • Rewrite moved INTO the ✨ menu ("Message tools") as "Corrections…" — the modal it opens, and the
//     modal's own "Correction instruction" textbox and "Rewrite" submit, are unchanged.
//   • The icons stay in the tab order while REFUSING (`focusableWhenDisabled`), so a refusing control
//     carries `aria-disabled="true"` instead of the `disabled` attribute — see `armedIcon`.
//
// THE INSTRUMENT IS SERVER TRUTH, always. Every leg reads canon / the assembly preview through the
// tRPC support client (support/trpc.ts) as ground truth; the DOM is only ever the second witness, and
// nothing here pins layout or geometry (owner-banned; a facelift is coming). Crucially this spec asserts
// APP FIDELITY (the steer text reached the assembly, the correction landed as a variant, the chosen
// speaker voiced the next row), never MODEL OBEDIENCE — a small local model needn't semantically obey a
// steer for the app to have done its job (the house doctrine).
//
// SPEND: local vLLM only. The route is pinned to the stateless openai-compat wire in beforeAll (the arm
// that keeps turns bounded), restored in afterAll. Each leg fires a handful of short turns. Turns are
// free on the local stack; the @live tag keeps the routine/CI-smoke lane model-free (config grepInvert),
// and every leg records a runner-native conditional skip when the operator's stack has no local chat
// backend wired, so unavailable evidence is not recorded as a pass.
//
// SELF-SEEDING: each test mints its OWN spec-owned character(s) (unique handle + unique display name) and
// its OWN uniquely-titled chat via startGroupChat (opening:"none" ⇒ empty canon, so every assertion counts
// only rows this spec caused), opened BY TITLE — never another spec's data, never listChats()[0]. The
// swipe/continue/rewrite target (a tail assistant reply) is seeded by ONE UI-driven Guided response per
// leg. Characters (and with them their chats) are removed in a finally.

import type { CharacterHandle, ChatId, MessageId, UserConnectionId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { messageRow, openChatByTitle } from "./support/chat-room.ts";
import {
  assembledPromptText,
  canonMessage,
  characterSeats,
  deleteChat,
  firstVariantId,
  listCanon,
  mintFreshCharacter,
  pinChatToLocalEngine,
  previewAssembly,
  removeCharacter,
  restoreChatBinding,
  selectVariant,
  startChat,
  startGroupChat,
  swipeMessage,
  tailAssistant,
} from "./support/trpc.ts";

/** A greeting long enough that a CONTINUE's appended content is a legible delta. */
const SOLO = { handle: castId<CharacterHandle>("e2e-guided-solo"), name: "Guidedspec Solo", greeting: "The lantern flickered in the dark hall." } as const;

/** A two-character room for the steer+speaker leg — unique display names so the Response icon's member
 *  item and the committed row's characterId are both unambiguous. */
const DUO = [
  { handle: castId<CharacterHandle>("e2e-guided-duo-a"), name: "Guidedspec Duo Alpha", greeting: "Alpha greeting." },
  { handle: castId<CharacterHandle>("e2e-guided-duo-b"), name: "Guidedspec Duo Bravo", greeting: "Bravo greeting." },
] as const;

/** Generous — a UI-fired turn on a warm local 8B without an output ceiling can run a few seconds; a
 *  couple of chained fires per leg stays well inside this. */
const LIVE_TIMEOUT_MS = 240_000;

/** Steers whose text is DISTINCTIVE (never prose a model emits unprompted) so presence in the assembled
 *  prompt is unambiguous provenance, not a coincidental match. */
const STEER_RESPONSE = "zorptastic emphasis marker alpha";
const STEER_REWRITE = "make it terse and clinical";
const STEER_CONTINUE = "keep going with the next beat";

/** The ⋯ menu's continue-restore disabled reason names the unlock ("continue this reply first"). */
const CONTINUE_UNLOCK_REASON = /continu/iu;

/** The guided arm of the ▶ Response icon's accessible name — the composer has text, so the icon IS the
 *  guided fire (`resolveGuidedName`, composer-guided-buttons.tsx). Same name on the solo BUTTON and the
 *  multi-member MENU TRIGGER; only what the click does differs. */
const GUIDED_RESPONSE = "Guided generate reply";

/** The guided arm of the ⏩ Continue icon (its label composes the direction, it has no "Guided" prefix). */
const GUIDED_CONTINUE = "Continue the reply with this direction";

/** The ✨ utility menu and the Rewrite modal's door inside it (both moved off the top row). */
const UTILITY_MENU = "Message tools";
const CORRECTIONS_ITEM = "Corrections…";

function composer(page: Page): ReturnType<Page["getByRole"]> {
  return page.getByRole("textbox", { name: "Message" });
}

/** Type a steer into the composer. That is the whole arming step now: with text present each guided icon
 *  flips to its guided arm and fires on ONE click — no menu, no submenu, no first-click-eaten trigger. */
async function typeSteer(page: Page, steer: string): Promise<void> {
  const box = composer(page);
  await box.click();
  await box.fill(steer);
  // `fill` bypasses React onChange for a CONTROLLED textarea — verify the value stuck; if a room-settle
  // remount ate it, retype (chat-room.ts typeAndSend documents this remount hazard).
  await expect(box).toHaveValue(steer, { timeout: 10_000 });
}

/** A composer icon that is present AND willing to fire. Both assertions are load-bearing: a guided icon
 *  refuses by going `aria-disabled` while STAYING focusable (`focusableWhenDisabled`, so its reason is
 *  reachable), which `toBeEnabled()` alone reads as ready; the ✨ menu trigger and the modal's controls
 *  refuse the native way, which the aria check alone would miss. */
async function armedIcon(page: Page, name: string): Promise<ReturnType<Page["getByRole"]>> {
  const icon = page.getByRole("button", { name, exact: true });
  await expect(icon).toBeVisible({ timeout: 10_000 });
  await expect(icon).toBeEnabled({ timeout: 10_000 });
  await expect(icon).not.toHaveAttribute("aria-disabled", "true", { timeout: 10_000 });
  return icon;
}

/** Fire ONE UI-driven guided response in a SOLO room (the ▶ icon is a plain button below the roster-of-2
 *  floor) and wait for its committed assistant row — the tail-seeding helper every variant/continue leg
 *  needs (startGroupChat's opening:"none" leaves the canon empty). */
async function seedAssistantTail(page: Page, chatId: ChatId, steer: string): Promise<MessageId> {
  await typeSteer(page, steer);
  await (await armedIcon(page, GUIDED_RESPONSE)).click();
  await pollAssistantCount(chatId, 1);
  const tail = await tailAssistant(chatId);
  expect(tail).toBeDefined();
  return tail?.id ?? castId<MessageId>("");
}

/** Wait until the chat's assistant row COUNT reaches `n` server-side (a UI-fired turn commits off the bus;
 *  polling canon is the deterministic "the turn landed" gate — DB truth, not DOM paint). */
async function pollAssistantCount(chatId: ChatId, n: number): Promise<void> {
  await expect.poll(async () => (await listCanon(chatId)).filter((m) => m.role === "assistant").length, { timeout: LIVE_TIMEOUT_MS }).toBe(n);
}

test.describe("guided generations on the live local stack", () => {
  /** The `chat` Model role as it stood before this file ran (restored in afterAll — the rows are the
   *  single-user owner's and serial specs share them). */
  let priorChatBinding: { readonly connectionId: UserConnectionId } | null = null;
  /** Null ⇒ local turns work; a string ⇒ the unavailable reason every arm reports to the runner. */
  let bail: string | null = null;

  // The ENVIRONMENT probe, paid ONCE: pin the stateless route and drive one throwaway REAL turn (a swipe
  // on a greeting-seeded chat's tail — the cheapest generation). A VLLM_DISABLED server has dropped the
  // vllm backend and every local turn fail-closes — an environment verdict, not a guided regression.
  // Recording it here keeps a REAL guided failure red (the arms never swallow their own errors).
  test.beforeAll(async () => {
    test.setTimeout(LIVE_TIMEOUT_MS);
    // The stateless openai-compat local wire — the arm that keeps a UI-fired turn bounded (the group-modes
    // precedent). A guided icon fires without an output-ceiling intent, so this pin is what caps the spend.
    priorChatBinding = await pinChatToLocalEngine();
    const probeCharId = await mintFreshCharacter(castId<CharacterHandle>("e2e-guided-probe"), "Guidedspec Probe", "Probe greeting.");
    // A DEFAULT-opening solo chat seeds the greeting as the assistant tail (no model turn); swiping it is
    // the cheapest REAL generation — the faithful backend-availability probe (the group-modes precedent).
    const probeChat = await startChat([probeCharId]);
    try {
      const tail = await tailAssistant(probeChat);
      if (tail === undefined) {
        bail = "probe chat seeded no assistant greeting tail";
      } else {
        await swipeMessage(probeChat, tail.id);
      }
    } catch (err) {
      bail = err instanceof Error ? err.message : String(err);
    } finally {
      await deleteChat(probeChat).catch(() => null);
      await removeCharacter(probeCharId).catch(() => null);
    }
  });

  test.afterAll(async () => {
    await restoreChatBinding(priorChatBinding);
  });

  function skipWhenBackendUnavailable(): void {
    test.skip(bail !== null, bail === null ? "local chat backend available" : `no local chat backend on this stack: ${bail}`);
  }

  // ── LEG 1 — STEER SHAPES THE TURN ────────────────────────────────────────────────────────────────
  // The honest pre-turn instrument: previewAssembly routes the steer through the SAME gather→build a real
  // turn gets, so the steer INSTRUCTION is assertable in the assembled prompt BEFORE any generation (and a
  // plain preview must NOT carry it — the isolation proof). Then fire the same steer via the composer's
  // guided Response icon and assert a NEW assistant row commits. App fidelity (steer reached assembly + a row landed),
  // never model obedience (we do not read the reply's prose).
  test("steer shapes the turn: the instruction reaches the assembly and a guided response commits", { tag: "@live" }, async ({ page }) => {
    test.setTimeout(LIVE_TIMEOUT_MS);
    skipWhenBackendUnavailable();
    const charId = await mintFreshCharacter(SOLO.handle, SOLO.name, SOLO.greeting);
    const title = `e2e-guided-steer-${Date.now()}`;
    const chat = await startGroupChat({ characterIds: [charId], title });
    try {
      // PRE-TURN, SERVER TRUTH: the steer text lands in the assembled prompt AND the trace flags it; a
      // plain preview carries neither (the steer is the only difference between the two builds).
      const steered = await previewAssembly(chat.id, { action: "response", input: STEER_RESPONSE });
      expect(steered.trace.guidedInstructionIncluded).toBe(true);
      expect(assembledPromptText(steered)).toContain(STEER_RESPONSE);
      const plain = await previewAssembly(chat.id);
      expect(plain.trace.guidedInstructionIncluded).toBe(false);
      expect(assembledPromptText(plain)).not.toContain(STEER_RESPONSE);

      // FIRE from the composer: opening:"none" ⇒ empty canon, so the guided response commits the FIRST
      // assistant. Solo room ⇒ the ▶ icon is a plain button and the typed steer is what makes it guided.
      await openChatByTitle(page, title);
      await typeSteer(page, STEER_RESPONSE);
      await (await armedIcon(page, GUIDED_RESPONSE)).click();

      // SERVER TRUTH: an assistant row committed — the guided turn ran end-to-end.
      await pollAssistantCount(chat.id, 1);
    } finally {
      await deleteChat(chat.id).catch(() => null);
      await removeCharacter(charId).catch(() => null);
    }
  });

  // ── LEG 2 — REWRITE LANDS AS A VARIANT (F1, the correction-as-variant contract) ───────────────────
  // Fire Rewrite with a steer on the tail assistant reply; the correction lands as a NEW VARIANT of the
  // SAME slot (variantCount +1), the original variant intact (still idx 0 content), the new variant
  // SELECTED (selectedVariantIdx advances). Server truth = the slot's variant metadata + content on canon.
  test("rewrite lands as a variant: same slot, +1 variant, original intact, new one selected", { tag: "@live" }, async ({ page }) => {
    test.setTimeout(LIVE_TIMEOUT_MS);
    skipWhenBackendUnavailable();
    const charId = await mintFreshCharacter(SOLO.handle, SOLO.name, SOLO.greeting);
    const title = `e2e-guided-rewrite-${Date.now()}`;
    const chat = await startGroupChat({ characterIds: [charId], title });
    try {
      await openChatByTitle(page, title);
      const tailId = await seedAssistantTail(page, chat.id, "set the opening scene");
      const before = await canonMessage(chat.id, tailId);
      expect(before?.variantCount).toBe(1);
      expect(before?.selectedVariantIdx).toBe(0);
      const originalContent = before?.content ?? null;
      const originalVariantId = await firstVariantId(chat.id, tailId);

      // FIRE REWRITE — the out-of-character correction, landing as swipe+guided{action:"rewrite"}. Its door
      // is now the ✨ menu's "Corrections…" row (it left the top row with the wand, #388), and that row is
      // itself disabled-with-reason until a tail reply exists — which the seeded tail above supplies. It
      // OPENS the modal (owner ruling 2026-07-25: toggle options to guide it), pre-seeded from the composer
      // draft; Apply fires. No toggles selected here — the pinned contract is variant landing, not toggle
      // composition (that's CT-covered against trpc.lastInput). The composed steer is the instruction
      // terminated with a period; the app-fidelity contract (a variant landed) is unchanged.
      await typeSteer(page, STEER_REWRITE);
      await (await armedIcon(page, UTILITY_MENU)).click();
      const corrections = page.getByRole("menuitem", { name: CORRECTIONS_ITEM });
      await expect(corrections).not.toHaveAttribute("aria-disabled", "true", { timeout: 10_000 });
      await corrections.click();
      await page.getByRole("textbox", { name: "Correction instruction" }).waitFor({ state: "visible" });
      await page.getByRole("button", { name: "Rewrite" }).click();

      // SERVER TRUTH: the SAME slot grew to 2 variants, the new one is selected (idx 1), and the assistant
      // ROW count did not change (a variant is not a new row).
      await expect.poll(async () => (await canonMessage(chat.id, tailId))?.variantCount ?? 0, { timeout: LIVE_TIMEOUT_MS }).toBe(2);
      const after = await canonMessage(chat.id, tailId);
      expect(after?.selectedVariantIdx).toBe(1);
      expect((await listCanon(chat.id)).filter((m) => m.role === "assistant").length).toBe(1);

      // The ORIGINAL variant is intact — stepping the selection pointer back to idx 0 returns exactly the
      // pre-rewrite content (selectVariant is a pure pointer move, no generation).
      await selectVariant(chat.id, tailId, originalVariantId);
      const restored = await canonMessage(chat.id, tailId);
      expect(restored?.selectedVariantIdx).toBe(0);
      expect(restored?.content).toBe(originalContent);
    } finally {
      await deleteChat(chat.id).catch(() => null);
      await removeCharacter(charId).catch(() => null);
    }
  });

  // ── LEG 3 — UNDO / REVERT CONTINUE ROUND-TRIP (F2) ────────────────────────────────────────────────
  // Continue the tail reply (content grows); Undo via the ⋯ menu → content returns to pre-continue; Revert
  // → the continued content returns. Server truth = the slot's content across the round-trip. Also: the ⋯
  // items are DISABLED-WITH-REASON on a never-continued reply (owner: no hidden affordances).
  test("undo/revert continue round-trips: content grows, undo restores, revert re-applies", { tag: "@live" }, async ({ page }) => {
    test.setTimeout(LIVE_TIMEOUT_MS);
    skipWhenBackendUnavailable();
    const charId = await mintFreshCharacter(SOLO.handle, SOLO.name, SOLO.greeting);
    const title = `e2e-guided-continue-${Date.now()}`;
    const chat = await startGroupChat({ characterIds: [charId], title });
    try {
      await openChatByTitle(page, title);
      const tailId = await seedAssistantTail(page, chat.id, "open the scene");

      // DISABLED-WITH-REASON: before any continue, the ⋯ menu's continue-restore items are aria-disabled and
      // name the unlock condition (never hidden). Open the tail row's ⋯ menu and read the undo item.
      const row = messageRow(page, tailId);
      await row.hover();
      await row.getByRole("button", { name: "More message actions" }).click();
      const undoItem = page.getByRole("menuitem", { name: "Undo last continuation" });
      await expect(undoItem).toBeVisible({ timeout: 10_000 });
      await expect(undoItem).toHaveAttribute("aria-disabled", "true");
      await expect(undoItem).toHaveAttribute("title", CONTINUE_UNLOCK_REASON);
      await page.keyboard.press("Escape");

      const preContinue = (await canonMessage(chat.id, tailId))?.content ?? "";
      expect((await canonMessage(chat.id, tailId))?.hasContinuation).toBe(false);

      // CONTINUE via the ⏩ icon — content grows (continue appends onto the existing reply). Its guided name
      // names the direction the typed steer supplies, which is the whole dual-mode contract.
      await typeSteer(page, STEER_CONTINUE);
      await (await armedIcon(page, GUIDED_CONTINUE)).click();
      await expect.poll(async () => (await canonMessage(chat.id, tailId))?.hasContinuation ?? false, { timeout: LIVE_TIMEOUT_MS }).toBe(true);
      const continued = (await canonMessage(chat.id, tailId))?.content ?? "";
      expect(continued.length).toBeGreaterThan(preContinue.length);
      expect(continued.startsWith(preContinue)).toBe(true);

      // UNDO via the ⋯ menu → server truth returns to the pre-continue content.
      await row.hover();
      await row.getByRole("button", { name: "More message actions" }).click();
      await page.getByRole("menuitem", { name: "Undo last continuation" }).click();
      await expect.poll(async () => (await canonMessage(chat.id, tailId))?.content ?? "", { timeout: LIVE_TIMEOUT_MS }).toBe(preContinue);

      // REVERT via the ⋯ menu → the continued content returns (the snapshot is retained across an undo).
      await row.hover();
      await row.getByRole("button", { name: "More message actions" }).click();
      await page.getByRole("menuitem", { name: "Re-apply continuation" }).click();
      await expect.poll(async () => (await canonMessage(chat.id, tailId))?.content ?? "", { timeout: LIVE_TIMEOUT_MS }).toBe(continued);
    } finally {
      await deleteChat(chat.id).catch(() => null);
      await removeCharacter(charId).catch(() => null);
    }
  });

  // ── LEG 4 — STEER + SPEAKER (F5) ──────────────────────────────────────────────────────────────────
  // In a group room, fire the guided Response icon choosing a SPECIFIC speaker from its member menu; the
  // steer + the chosen speaker ride ONE chat.generate, and the next committed assistant row's characterId
  // IS the chosen speaker. Server truth = the committed row's characterId.
  test("steer + speaker: the guided response commits a row authored by the chosen speaker", { tag: "@live" }, async ({ page }) => {
    test.setTimeout(LIVE_TIMEOUT_MS);
    skipWhenBackendUnavailable();
    const alphaId = await mintFreshCharacter(DUO[0].handle, DUO[0].name, DUO[0].greeting);
    const bravoId = await mintFreshCharacter(DUO[1].handle, DUO[1].name, DUO[1].greeting);
    const title = `e2e-guided-speaker-${Date.now()}`;
    const chat = await startGroupChat({ characterIds: [alphaId, bravoId], title });
    try {
      // Sanity: the room really has both seats server-side (so the Response icon is above the roster-of-2
      // floor and renders its member menu rather than firing Auto directly).
      expect((await characterSeats(chat.id)).map((s) => s.characterId)).toEqual(expect.arrayContaining([alphaId, bravoId]));

      await openChatByTitle(page, title);
      await typeSteer(page, "greet the party");
      // Above the roster-of-2 floor the ▶ icon IS a menu trigger, and its popup is FLAT: "Auto (arbitrate)"
      // plus one item per member. One click opens it, one click picks BRAVO — the old hover-into-a-submenu
      // step is gone with the wand.
      await (await armedIcon(page, GUIDED_RESPONSE)).click();
      await expect(page.getByRole("menuitem", { name: "Auto (arbitrate)" })).toBeVisible({ timeout: 10_000 });
      await page.getByRole("menuitem", { name: DUO[1].name }).click();

      // SERVER TRUTH: exactly one assistant row committed and it is authored by the CHOSEN speaker (bravo),
      // not arbitration's pick.
      await pollAssistantCount(chat.id, 1);
      const assistants = (await listCanon(chat.id)).filter((m) => m.role === "assistant");
      expect(assistants[0]?.characterId).toBe(bravoId);
    } finally {
      await deleteChat(chat.id).catch(() => null);
      await removeCharacter(alphaId).catch(() => null);
      await removeCharacter(bravoId).catch(() => null);
    }
  });

  // ── LEG 5 — INPUT SURVIVES FAILURE — DEFERRED (see the report note) ────────────────────────────────
  // The restore-on-error path (F3) is CT-covered (composer-guided-cluster.tsx's `onFireError` → `onChange`
  // restores the draft; the wand that used to own that seam is gone, the seam is not). Inducing a FAILING
  // guided fire in e2e without contortion is not cheaply reachable: an icon
  // fires against the current tail with a valid steer, and the only levers to force a non-abort mutation
  // error are stack-global (drop the backend / corrupt the route), which would poison the shared route the
  // other legs and the whole suite depend on (and racing that restore back is brittle). Per the leg-5
  // rubric ("only add if the kit can induce a failing fire without contortion — otherwise SKIP and say
  // so"), this proof is DELIBERATELY DEFERRED to the CT, named here so it is never silently absent.
});
