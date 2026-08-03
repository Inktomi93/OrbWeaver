// E2E (@live) — GUIDED GENERATIONS end-to-end through the real stack, pinning the Phase-1 improved
// semantics (commit 36d0b128: F1 rewrite fire · F2 undo/revert exposure · F3 input-restore · F5
// steer+speaker · F4 WI-scan). Guided had ZERO e2e coverage before this file; the kit resolvers +
// steer routing are exhaustively unit/int-tested server-side (kit/guided, assembly/context.int,
// read.int, turn.int) — this spec tests the OTHER half: that the composer wand + message ⋯ menu
// actually DRIVE those seams end-to-end and land the improved semantics in committed canon.
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
// and every leg honest-bails (early return + annotation, NEVER test.skip(cond) — the structure gate reads
// that as a stub) when the operator's stack has no local chat backend wired, so a run is never a FALSE PASS.
//
// SELF-SEEDING: each test mints its OWN spec-owned character(s) (unique handle + unique display name) and
// its OWN uniquely-titled chat via startGroupChat (opening:"none" ⇒ empty canon, so every assertion counts
// only rows this spec caused), opened BY TITLE — never another spec's data, never listChats()[0]. The
// swipe/continue/rewrite target (a tail assistant reply) is seeded by ONE UI-driven Guided response per
// leg. Characters (and with them their chats) are removed in a finally.

import type { ChatId } from "@orb/kit/ids";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { messageRow, openChatByTitle } from "./support/chat-room";
import type { ChatRoute } from "./support/trpc";
import {
  assembledPromptText,
  canonMessage,
  characterSeats,
  deleteChat,
  firstVariantId,
  getChatRoute,
  listCanon,
  mintFreshCharacter,
  previewAssembly,
  removeCharacter,
  selectVariant,
  setChatRoute,
  startChat,
  startGroupChat,
  swipeMessage,
  tailAssistant,
} from "./support/trpc";

/** The stateless openai-compat local wire — the arm that keeps a UI-fired turn bounded (the group-modes
 *  precedent). The wand fires without an output-ceiling intent, so this pin is what caps the spend. */
const STATELESS_ROUTE: ChatRoute = { api: "chat-completions", source: "vllm" };

/** A greeting long enough that a CONTINUE's appended content is a legible delta. */
const SOLO = { handle: "e2e-guided-solo", name: "Guidedspec Solo", greeting: "The lantern flickered in the dark hall." } as const;

/** A two-character room for the steer+speaker leg — unique display names so the wand's speaker submenu
 *  item and the committed row's characterId are both unambiguous. */
const DUO = [
  { handle: "e2e-guided-duo-a", name: "Guidedspec Duo Alpha", greeting: "Alpha greeting." },
  { handle: "e2e-guided-duo-b", name: "Guidedspec Duo Bravo", greeting: "Bravo greeting." },
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

function composer(page: Page): ReturnType<Page["getByRole"]> {
  return page.getByRole("textbox", { name: "Message" });
}

/** Type a steer into the composer and OPEN the wand menu (the trigger unlocks only with non-empty,
 *  non-busy text). Returns with the menu open, ready to click an item. */
async function typeSteerAndOpenWand(page: Page, steer: string): Promise<void> {
  const box = composer(page);
  await box.click();
  await box.fill(steer);
  // `fill` bypasses React onChange for a CONTROLLED textarea — verify the value stuck; if a room-settle
  // remount ate it, retype (chat-room.ts typeAndSend documents this remount hazard).
  await expect(box).toHaveValue(steer, { timeout: 10_000 });
  const wand = page.getByRole("button", { name: "Guided generations" });
  await expect(wand).toBeEnabled({ timeout: 10_000 });
  await wand.click();
}

/** Fire ONE UI-driven Guided response and wait for its committed assistant row — the tail-seeding helper
 *  every variant/continue leg needs (startGroupChat's opening:"none" leaves the canon empty). */
async function seedAssistantTail(page: Page, chatId: ChatId, steer: string): Promise<string> {
  await typeSteerAndOpenWand(page, steer);
  await page.getByRole("menuitem", { name: "Guided response" }).click();
  await pollAssistantCount(chatId, 1);
  const tail = await tailAssistant(chatId);
  expect(tail).toBeDefined();
  return tail?.id ?? "";
}

/** Wait until the chat's assistant row COUNT reaches `n` server-side (a UI-fired turn commits off the bus;
 *  polling canon is the deterministic "the turn landed" gate — DB truth, not DOM paint). */
async function pollAssistantCount(chatId: ChatId, n: number): Promise<void> {
  await expect.poll(async () => (await listCanon(chatId)).filter((m) => m.role === "assistant").length, { timeout: LIVE_TIMEOUT_MS }).toBe(n);
}

test.describe("guided generations on the live local stack", () => {
  let originalRoute: ChatRoute | undefined;
  /** Null ⇒ local turns work; a string ⇒ the honest bail reason every arm annotates with. */
  let bail: string | null = null;

  // The ENVIRONMENT probe, paid ONCE: pin the stateless route and drive one throwaway REAL turn (a swipe
  // on a greeting-seeded chat's tail — the cheapest generation). A VLLM_DISABLED server has dropped the
  // vllm backend and every local turn fail-closes — an environment verdict, not a guided regression.
  // Recording it here keeps a REAL guided failure red (the arms never swallow their own errors).
  test.beforeAll(async () => {
    test.setTimeout(LIVE_TIMEOUT_MS);
    originalRoute = await getChatRoute();
    await setChatRoute(STATELESS_ROUTE);
    const probeCharId = await mintFreshCharacter("e2e-guided-probe", "Guidedspec Probe", "Probe greeting.");
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
    if (originalRoute !== undefined) {
      await setChatRoute(originalRoute).catch(() => null);
    }
  });

  // ── LEG 1 — STEER SHAPES THE TURN ────────────────────────────────────────────────────────────────
  // The honest pre-turn instrument: previewAssembly routes the steer through the SAME gather→build a real
  // turn gets, so the steer INSTRUCTION is assertable in the assembled prompt BEFORE any generation (and a
  // plain preview must NOT carry it — the isolation proof). Then fire the same steer via the wand's Guided
  // response and assert a NEW assistant row commits. App fidelity (steer reached assembly + a row landed),
  // never model obedience (we do not read the reply's prose).
  test("steer shapes the turn: the instruction reaches the assembly and a guided response commits", { tag: "@live" }, async ({ page }) => {
    test.setTimeout(LIVE_TIMEOUT_MS);
    if (bail !== null) {
      test.info().annotations.push({ type: "skipped", description: `no local chat backend on this stack: ${bail}` });
      return;
    }
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

      // FIRE via the wand: opening:"none" ⇒ empty canon, so the guided response commits the FIRST assistant.
      await openChatByTitle(page, title);
      await typeSteerAndOpenWand(page, STEER_RESPONSE);
      await page.getByRole("menuitem", { name: "Guided response" }).click();

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
    if (bail !== null) {
      test.info().annotations.push({ type: "skipped", description: `no local chat backend on this stack: ${bail}` });
      return;
    }
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

      // FIRE REWRITE — the out-of-character correction, landing as swipe+guided{action:"rewrite"}. The
      // Rewrite item OPENS the modal (owner ruling 2026-07-25: toggle options to guide it), pre-seeded from
      // the composer draft; Apply fires. No toggles selected here — the pinned contract is variant landing,
      // not toggle composition (that's CT-covered against trpc.lastInput). The composed steer is the
      // instruction terminated with a period; the app-fidelity contract (a variant landed) is unchanged.
      await typeSteerAndOpenWand(page, STEER_REWRITE);
      await page.getByRole("menuitem", { name: "Rewrite" }).click();
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
    if (bail !== null) {
      test.info().annotations.push({ type: "skipped", description: `no local chat backend on this stack: ${bail}` });
      return;
    }
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

      // CONTINUE via the wand — content grows (continue appends onto the existing reply).
      await typeSteerAndOpenWand(page, STEER_CONTINUE);
      await page.getByRole("menuitem", { name: "Guided continue" }).click();
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
  // In a group room, fire Guided response choosing a SPECIFIC speaker via the wand's speaker submenu; the
  // steer + the chosen speaker ride ONE chat.generate, and the next committed assistant row's characterId
  // IS the chosen speaker. Server truth = the committed row's characterId.
  test("steer + speaker: the guided response commits a row authored by the chosen speaker", { tag: "@live" }, async ({ page }) => {
    test.setTimeout(LIVE_TIMEOUT_MS);
    if (bail !== null) {
      test.info().annotations.push({ type: "skipped", description: `no local chat backend on this stack: ${bail}` });
      return;
    }
    const alphaId = await mintFreshCharacter(DUO[0].handle, DUO[0].name, DUO[0].greeting);
    const bravoId = await mintFreshCharacter(DUO[1].handle, DUO[1].name, DUO[1].greeting);
    const title = `e2e-guided-speaker-${Date.now()}`;
    const chat = await startGroupChat({ characterIds: [alphaId, bravoId], title });
    try {
      // Sanity: the room really has both seats server-side (so the wand renders a 2-member submenu).
      expect((await characterSeats(chat.id)).map((s) => s.characterId)).toEqual(expect.arrayContaining([alphaId, bravoId]));

      await openChatByTitle(page, title);
      await typeSteerAndOpenWand(page, "greet the party");
      // In a multi-room "Guided response" is a submenu (Auto + one item per member). Choose BRAVO.
      await page.getByRole("menuitem", { name: "Guided response" }).hover();
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
  // The restore-on-error path (F3) is CT-covered (composer-wand.tsx onFireError → onChange restores the
  // draft). Inducing a FAILING guided fire in e2e without contortion is not cheaply reachable: the wand
  // fires against the current tail with a valid steer, and the only levers to force a non-abort mutation
  // error are stack-global (drop the backend / corrupt the route), which would poison the shared route the
  // other legs and the whole suite depend on (and racing that restore back is brittle). Per the leg-5
  // rubric ("only add if the kit can induce a failing fire without contortion — otherwise SKIP and say
  // so"), this proof is DELIBERATELY DEFERRED to the CT, named here so it is never silently absent.
});
