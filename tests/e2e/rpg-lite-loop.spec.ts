// E2E (W4): the FULL rpg-lite loop, end-to-end against the real running stack + a REAL model turn — the proof
// that seeding a lite game and narrating a state change drives the whole loop
// (turn → extraction/tool write → staging → flush → snapshot → bus emit → client invalidation → CP-4 re-render)
// AND that every hop's RESULT is observable from the instruments that already exist. Lite mode has no internal
// resolution machinery (no dice/checks/clocks/encounters), so there is no hop-level "flight recorder" to read —
// and none is needed: the flush/snapshot RESULT is `rpg.getTrackerView`, the turn's wire is
// /api/_debug/wire/captures, and the message landing is chat.listMessages. That is "observe every part" for lite.
//
// OPT-IN (`@live`): this fires a real local vLLM chat turn (up to ~120s of live generation) PLUS a second
// reliable-extraction structured-output call, so it is SKIPPED by default (playwright.config.ts `grepInvert:
// /@live/` UNLESS E2E_LIVE=1) — routine `pnpm e2e` + the CI smoke gate never spend live model credits. Run with:
//   E2E_LIVE=1 pnpm e2e rpg-lite-loop.spec.ts
//
// SEED (owner rule): NEVER seed the "Mara" character — she destabilizes the model. This spec mints its OWN
// spec-owned character (a stable, chatless probe card) and seeds the lite game on a fresh chat with it, so the
// run never inherits a foreign roster or a resumed room.
//
// THE FLOW OBSERVED, hop by hop (each with its RESULT instrument):
//   1. createGame        → `rpg.createGame` mints the game + writes the `chats.metadata.rpg` pointer.
//                          RESULT: the client's CP-4 takeover renders (the game context tabs appear).
//   2. character turn    → `chat.send` fires ONE real chat-completions × vllm turn on the game chat.
//                          RESULT: a durable assistant row lands (chat.listMessages) + a well-formed wire body
//                          (/api/_debug/wire/captures — the turn's prompt was assembled + sent).
//   3. extraction/write  → the reliable-mode structured-output extraction folds the beat into an RpgStateDelta.
//   4. staging → flush → snapshot → bus emit
//                          RESULT: `rpg.getTrackerView` (the persisted-snapshot projection) MOVES — the empty
//                          turnless default becomes populated state matching what the model narrated.
//   5. client invalidation → CP-4 re-render
//                          RESULT: the Scene tab DOM reflects the same populated state (server truth ↔ pixels).

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { openContextTab, openNewestChat, typeAndSend } from "./support/chat-room";
import type { TrackerView } from "./support/trpc";
import { createLiteGame, fetchWireCaptures, getTrackerView, listCanon, mintFreshCharacter, removeCharacter, startChat } from "./support/trpc";

const NON_WHITESPACE = /\S/u;

// A spec-owned, chatless probe card (NOT "Mara" — owner rule). Minted fresh per run so the game seeds on a
// virgin chat (a character WITH prior chats resumes its latest room instead of opening a fresh draft — the
// `mintFreshCharacter` contract). The greeting keeps the room model-free until the spec's own `chat.send`.
const GM_HANDLE = "e2e-rpg-gm";
const GM_NAME = "Thornwick";
const GM_GREETING = "The lantern gutters as you step into the Rusted Gate tavern.";

// A narration message engineered to force an UNAMBIGUOUS, model-independent state write: an explicit LOCATION
// move + a named CONDITION on the player. Freeform lite starts with an EMPTY snapshot (no born row), so the
// cleanest observable is state appearing where there was none — `update_scene.location`/`recentEvent` need no
// pre-existing sheet/pool (a plain string set), and a condition is a first-class add. We assert the RESULT
// MOVED (empty → populated) + a fresh beat, never exact prose (the turn is real + variable — the precedent's
// "assert the landing, not the content" posture).
const STATE_CHANGE_NARRATION =
  "I shove open the tavern door and stride out into the freezing night market of Ashfell, pulling my cloak tight. " +
  "Track this: my location is now the Ashfell Night Market, and I am Chilled from the cold. Narrate the scene.";

/** Open the CONTEXT panel on a GAME chat and land on its takeover. A game chat's panel is NOT the shared
 *  "Detail" tablist (`openDetailPanel` waits for that and can never succeed here) — the CP-4 bracket renders
 *  TWO tablists, "Game" (Status/Sheet/Inventory/Scene) and "Chat" (meta), and `rpg.status` is the `defaultTab`
 *  so the Status body lands WITHOUT a click. Idempotent: click the toggle only when the panel is collapsed. */
async function openGamePanel(page: Page): Promise<void> {
  const show = page.getByRole("button", { name: "Show detail panel" });
  if ((await show.count()) > 0) {
    await show.first().click();
  }
  await expect(page.getByRole("tablist", { name: "Game" })).toBeVisible({ timeout: 15_000 });
}

/** True once the tracker view has moved OFF the turnless-empty default: a location, a condition, or a beat
 *  landed. The flush/snapshot RESULT — read straight from `rpg.getTrackerView` (server truth). */
function trackerHasState(view: TrackerView): boolean {
  const hasLocation = view.ambient !== null && view.ambient.location.length > 0;
  const hasBeat = view.recentBeats.length > 0;
  const hasCondition = view.actors.some((a) => a.volatile !== null && a.volatile.conditions.length > 0);
  return hasLocation || hasBeat || hasCondition;
}

// `@live` — the opt-in real-model-turn gate (see the header + playwright.config.ts `e2eLive`).
test("rpg-lite: seed a game, narrate a state change, and observe every hop's result (DOM + server truth)", {
  tag: "@live",
}, async ({ page }) => {
  // A real local vLLM chat turn (cold spin-up + stream) PLUS the reliable-extraction structured-output call — give the
  // whole loop room well beyond Playwright's 30s default (the precedent uses 180s for one turn; this drives two
  // model calls back-to-back at commit, so budget generously).
  test.setTimeout(300_000);

  // ── SEED (over the API — faster + deterministic than the UI, the globalSetup posture). A spec-owned chatless
  // character, a fresh chat, the lite game. `chat.startChat` seeds the greeting model-free (no turn yet). ──
  const gmId = await mintFreshCharacter(GM_HANDLE, GM_NAME, GM_GREETING);
  try {
    const chatId = await startChat([gmId]);
    await createLiteGame(chatId);

    // Baseline: the game is turnless, so the snapshot is the synthesized empty default — nothing tracked yet.
    // This is the BEFORE the state-change turn must move (the RESULT assertion is a transition, not a snapshot).
    const before = await getTrackerView(chatId);
    expect(trackerHasState(before)).toBe(false);

    // ── HOP 1 RESULT: the CP-4 takeover renders. Open the newest chat (the one just seeded) → open the detail
    // panel → the game context tabs are present (the `chats.metadata.rpg` pointer flipped `isGameChat`). ──
    await openNewestChat(page);
    await openGamePanel(page);

    // The Status tab is the always-present game tab (`rpg.status`, `strip:"game"`, `defaultTab`) — the CP-4
    // bracket lands on it by default, so its body renders WITHOUT a click. Its presence IS the takeover (a
    // non-game chat contributes no game tabs / no "Game" tablist).
    await expect(page.locator('[data-slot="rpg-status-tab"], [data-slot="rpg-takeover-header"]').first()).toBeVisible({ timeout: 15_000 });

    // ── HOP 2: narrate the state-changing beat — ONE real chat-completions × vllm turn on the game chat. `typeAndSend` drives
    // React's onChange + retries past the composer re-mount (the shared helper). ──
    const composer = page.getByRole("textbox", { name: "Message" });
    await expect(composer).toBeVisible();
    await typeAndSend(composer, STATE_CHANGE_NARRATION);

    // HOP 2 RESULT (the turn generated): the assistant reply streams back as a real canonical row with non-empty
    // content — the robust, deterministic proof the turn actually ran (the precedent's money-shot assertion).
    const assistantRow = page.locator('[data-slot="message-row"][data-role="assistant"]');
    await expect(assistantRow.first()).toBeVisible({ timeout: 120_000 });
    await expect(assistantRow.first()).toContainText(NON_WHITESPACE, { timeout: 120_000 });

    // ── HOPS 3-4 SERVER TRUTH (extraction → staging → flush → snapshot): the persisted-snapshot projection MOVES
    // off the empty default. `getTrackerView` is the flush/snapshot RESULT — poll it (the extraction is a SECOND
    // model call that lands after the reply commits, so it settles slightly after the streamed row appears). ──
    let after: TrackerView | undefined;
    await expect
      .poll(
        async (): Promise<boolean> => {
          after = await getTrackerView(chatId);
          return trackerHasState(after);
        },
        { timeout: 60_000, intervals: [1000] },
      )
      .toBe(true);

    // ── HOP 5 RESULT (client invalidation → CP-4 re-render): the DOM reflects the SAME server-truth state. The
    // Scene tab is lite's centerpiece (ambient + beats). It re-renders on the rpg-bus invalidation the flush's
    // emit drives. Assert the Scene body shows the landed state — a beat line OR the ambient strip. ──
    await openContextTab(page, "Scene");
    await expect(page.locator('[data-slot="rpg-scene-tab"]')).toBeVisible({ timeout: 15_000 });
    // A beat line (the "Just now" log) OR the ambient strip (location) — whichever the model's write produced.
    // Either is proof the CP-4 panel re-rendered the flushed snapshot (DOM ↔ getTrackerView parity below).
    await expect(page.locator('[data-slot="beat-line"], [data-slot="ambient-strip"]').first()).toBeVisible({ timeout: 30_000 });

    // DOM ↔ SERVER-TRUTH parity: the panel must render the EXACT server-truth state (never a stale frame). The
    // strongest available comparand: the persisted location when the model's write chose the location arm, else
    // the freshest persisted beat (the model-independent floor). Either way this is ONE unconditional assertion
    // that the Scene DOM contains what `getTrackerView` persisted — the CP-4 re-render is proven against server
    // truth, not merely against "some state appeared".
    const afterView = after as TrackerView;
    const persistedLocation = afterView.ambient !== null && afterView.ambient.location.length > 0 ? afterView.ambient.location : null;
    const expectedDomText = persistedLocation ?? afterView.recentBeats.at(-1) ?? "";
    expect(expectedDomText.length).toBeGreaterThan(0);
    await expect(page.locator('[data-slot="rpg-scene-tab"]')).toContainText(expectedDomText, { timeout: 15_000 });

    // ── HOP 2 wire RESULT (the turn's provider body was well-formed): read the captured vLLM request back off
    // /api/_debug/wire/captures (WIRE_CAPTURE=on, set in the e2e stackEnv). Since D109 the local chat wire is
    // chat-completions × vllm (the agent-sdk × vllm loopback skin is retired) — the capture is the LITERAL
    // openai-compat /v1/chat/completions body: `api`/`backend` = "chat-completions"/"vllm", a non-empty
    // `messages` array. Its presence, chatId-correlated, proves the turn's prompt assembled + shipped. ──
    const captures = await fetchWireCaptures(chatId);
    expect(captures.length).toBeGreaterThan(0);
    const turnCapture = captures.find((c) => c.backend === "vllm");
    expect(turnCapture).toBeDefined();
    expect(turnCapture?.api).toBe("chat-completions");
    expect(Array.isArray(turnCapture?.body["messages"])).toBe(true);
    expect((turnCapture?.body["messages"] as unknown[]).length).toBeGreaterThan(0);

    // ── The message landing (chat.listMessages = DB canon): the user narration + the assistant reply both
    // committed as durable rows. The turn hop's persistence RESULT, independent of the rendered DOM. ──
    const canon = await listCanon(chatId);
    expect(canon.some((m) => m.role === "user" && m.content.includes("Ashfell"))).toBe(true);
    expect(canon.some((m) => m.role === "assistant" && NON_WHITESPACE.test(m.content))).toBe(true);
  } finally {
    // The spec-owned character (its chats/game cascade with it) — leave the shared dev DB as we found it.
    await removeCharacter(gmId);
  }
});
