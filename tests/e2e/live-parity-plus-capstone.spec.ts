// E2E (#26 CAPSTONE): the exhaustive full-system proof for the parity-plus FEATURE WAVES P3–P6 (D110) —
// deception/omniscience, immersive HTML cards, CYOA + plot + the wand, each proven FE = BE = DB against the
// real running stack. The rpg-lite DATA planes + the hand-plane backbone are proven in rpg-lite-loop.spec.ts
// (SPEC 1–8); THIS file owns the four NEW dramatic capabilities that landed with D110.
//
// THE DETERMINISM POSTURE (why these don't fire a live 8B for the content): the P3/P4/P5 grammars (`<lie …/>`,
// `:::card`, `:::choices`) are model-EMITTED in production, but an 8B emits them unreliably (honest-arms
// ceiling, plan-for-small-hardware) — so proving the RENDER + REVEAL + STRIP + STEER SEAMS on a flaky emission
// would be a flaky test of the wrong thing. Instead each capstone plants the exact grammar in a REAL canon row
// via `chat.editMessage` (a genuine durable body the reveal/render/tokenize seams read the same as a model's),
// OR seeds the snapshot plane via the hand door (`editSnapshot`) — the seam under test is the SERVER STRIP /
// HOST REVEAL / CLIENT TOKENIZE / STEER RESOLVE, not the 8B's grammar compliance. The wand steer proves LIVE
// state reached the prompt via `previewAssembly` (the real gather→build, no generation). Where a live model
// turn IS the point (the loop), that lives in rpg-lite-loop.spec.ts.
//
// OPT-IN (`@live`): these ride the same @live gate as the loop (they share the seed harness + the coherent-route
// pin + the WIRE_CAPTURE stack). Run with:  E2E_LIVE=1 pnpm e2e live-parity-plus-capstone.spec.ts
//
// SECURITY NOTE (P3 member-strip): the SERVER-STRIP of hidden bytes from a MEMBER's payload is the security-
// critical invariant (§3.6). It cannot be driven at THIS layer — the e2e stack runs single-user AUTH_MODE, so
// the only principal is the HOST, and there is no member view to read a stripped payload from. The member-strip
// is exhaustively unit/domain-tested (member-visibility.ts + read.int + content-classes.contract). The capstone
// proves the HOST side end-to-end (the lie is in host canon + the reveal eye parses it) and the reasoning-strip
// WIRING (deception-active flips the game verdict) — see the report for the precise boundary.

import type { CharacterHandle, CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { openContextTab, openNewestChat } from "./support/chat-room";
import type { ChatRoute } from "./support/trpc";
import {
  createLiteGame,
  editMessage,
  editSnapshot,
  fetchDebugErrors,
  fetchWireCaptures,
  getChatRoute,
  getConfigView,
  getTrackerView,
  listCanon,
  mintFreshCharacter,
  removeCharacter,
  revealHidden,
  sendGameSteerTurn,
  setChatRoute,
  setFeatureKnobs,
  startChat,
  wireMessagesText,
} from "./support/trpc";

const GM_NAME = "Thornwick";
const GM_GREETING = "The lantern gutters as you step into the Rusted Gate tavern.";

// The coherent local-vLLM chat route (chat-completions × vllm, D109) — the write-capable connection the
// lite loop needs (the boot-seeded default already pins this since global-setup; seedGame re-pins + restores
// to stay isolated on the shared single-user settings row).
const COHERENT_VLLM_ROUTE: ChatRoute = { api: "chat-completions", source: "vllm" };

/** Seed a fresh lite game on a virgin chat with a spec-owned character, on the write-capable route. Returns the
 *  ids + a cleanup handle (removes the character — chats/game cascade — AND restores the prior route). A UNIQUE
 *  card handle per spec keeps serial specs from colliding on the shared dev DB. */
async function seedGame(
  handle: CharacterHandle,
): Promise<{ readonly chatId: ChatId; readonly characterId: CharacterId; readonly cleanup: () => Promise<void> }> {
  const priorRoute = await getChatRoute();
  await setChatRoute(COHERENT_VLLM_ROUTE);
  const characterId = await mintFreshCharacter(handle, GM_NAME, GM_GREETING);
  const chatId = await startChat([characterId]);
  await createLiteGame(chatId);
  const cleanup = async (): Promise<void> => {
    await removeCharacter(characterId);
    if (priorRoute !== undefined) {
      await setChatRoute(priorRoute);
    }
  };
  return { chatId, characterId, cleanup };
}

/** Open the CONTEXT panel on a GAME chat and land on its takeover (a game chat renders a "Game" tablist, not the
 *  shared "Detail" one; `rpg.status` is the defaultTab so the Status body lands without a click). Idempotent. */
async function openGamePanel(page: Page): Promise<void> {
  const show = page.getByRole("button", { name: "Show detail panel" });
  if ((await show.count()) > 0) {
    await show.first().click();
  }
  await expect(page.getByRole("tablist", { name: "Game" })).toBeVisible({ timeout: 15_000 });
}

/** The greeting assistant row id (the durable row `startChat` seeded) — the deterministic edit target for the
 *  planted P3/P4/P5 content. A lite game's greeting is the first + only assistant row until a live turn runs. */
async function greetingRowId(chatId: ChatId): Promise<string> {
  const canon = await listCanon(chatId);
  const assistant = canon.find((m) => m.role === "assistant");
  if (assistant === undefined) {
    throw new Error(`e2e: chat ${chatId} has no greeting assistant row to edit`);
  }
  return assistant.id;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// P3 — DECEPTION / OMNISCIENCE: a `<lie …/>` planted in a real assistant body is (a) parsed by the HOST reveal
// eye (`rpg.revealHidden` — the truth the host sees + the standing-lie inventory), (b) surfaced on the FE Veiled
// ledger, and (c) enabling deception flips the game DECEPTION-ACTIVE (the config verdict that drives the member
// reasoning-strip). The member-payload strip is a single-user-unreachable wire layer (see the file header +
// report) — proven at the unit/domain layer; here we prove the whole HOST plane + the deception-active gate.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const LIE_TAG = '<lie character="Thornwick" type="identity" truth="he is the smuggler the guards seek" reason="to keep the party from turning him in"/>';

test("P3 deception: a planted lie is host-revealed (eye + standing-lie inventory) and enabling deception is BE-active", {
  tag: "@live",
}, async ({ page }) => {
  test.setTimeout(120_000);
  const { chatId, cleanup } = await seedGame(castId<CharacterHandle>("e2e-pp-p3"));
  try {
    // ── BE: enabling deception makes the game DECEPTION-ACTIVE. `getConfigView` is the host-truth read the
    // teaching + the reasoning-strip both derive from — off by default, on after the toggle. ──
    expect((await getConfigView(chatId)).deception).toBe(false);
    await setFeatureKnobs(chatId, { deception: true, hiddenContentReveal: true });
    expect((await getConfigView(chatId)).deception).toBe(true);

    // ── DB/BE: plant the lie in the greeting assistant row (a real durable canon body — the reveal derives
    // from stored bodies, so an edited body reads exactly as a model-emitted one would). The host reveal eye
    // parses the span + builds the standing-lie inventory. ──
    const greeting = await greetingRowId(chatId);
    await editMessage(chatId, greeting, `The old man smiles warmly. "Just a traveller, friends." ${LIE_TAG}`);

    const reveal = await revealHidden(chatId);
    // The per-message eye: the lie span parsed with its labelled fields (character/type/truth/reason).
    const revealedForRow = reveal.messages.find((m) => m.messageId === greeting);
    expect(revealedForRow).toBeDefined();
    const lieSpan = revealedForRow?.spans.find((s) => s.tag === "lie");
    expect(lieSpan).toBeDefined();
    const truthField = lieSpan?.fields.find((f) => f.key === "truth");
    expect(truthField?.value).toBe("he is the smuggler the guards seek");
    // The standing-lie inventory groups it under the lying character.
    const thornwickLies = reveal.standingLies.find((g) => g.character === "Thornwick");
    expect(thornwickLies?.lies.some((l) => l.truth === "he is the smuggler the guards seek")).toBe(true);

    // ── FE: the Status tab's Veiled ledger (rpg-veiled-section, wired to rpg.revealHidden, host-only) renders
    // the same server-truth — the host CAN see the deception on the panel. The truth string is the comparand. ──
    await openNewestChat(page);
    await openGamePanel(page);
    await openContextTab(page, "Status");
    const veiled = page.locator('[data-slot="rpg-veiled-section"]');
    await expect(veiled).toBeVisible({ timeout: 15_000 });
    await expect(veiled).toContainText("he is the smuggler the guards seek", { timeout: 15_000 });

    // ── The trust-boundary floor (host side): the lie bytes ride the HOST's own canon read verbatim (the host
    // reads hidden — a member never would). The RENDER filter hides the raw tag from the host transcript prose,
    // but the reveal eye above is the host's window. No error ring from any of the above. ──
    const canon = await listCanon(chatId);
    expect(canon.find((m) => m.id === greeting)?.content).toContain("truth=");
    expect(await fetchDebugErrors()).toEqual([]);
  } finally {
    await cleanup();
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// P4 — IMMERSIVE HTML: a `:::card` fence planted in a real assistant body renders as the sandboxed ImmersiveCard
// (scripts-off iframe), the lifecycle chrome works (collapsed → expand → view-raw shows the exact source), the
// Scene tab's card archive lists it, and the raw HTML never leaks into the main transcript DOM (it lives inside
// the sandbox frame's srcdoc). Render is toggle-independent; we also flip `immersiveHtml` to prove the knob.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const CARD_TITLE = "Zandik's letter";
const CARD_MARKER = "MEET·ME·AT·THE·DOCKS·CAPSTONE";
const CARD_FENCE = `:::card title="${CARD_TITLE}"\n<p>${CARD_MARKER}</p>\n:::`;

test("P4 immersive HTML: a planted :::card renders sandboxed, view-raw shows source, archive lists it, no DOM leak", {
  tag: "@live",
}, async ({ page }) => {
  test.setTimeout(120_000);
  const { chatId, cleanup } = await seedGame(castId<CharacterHandle>("e2e-pp-p4"));
  try {
    // BE: the card teaching knob is on by default (getConfigView truth); the render is toggle-independent, so
    // we assert the default and move on (a stored card renders regardless of a later toggle-off).
    expect((await getConfigView(chatId)).immersiveHtml).toBe(true);

    // DB/BE: plant the card fence in the greeting row. The client tokenizes stored bodies into content blocks,
    // so an `html-card` block lands from this edit exactly as from a model emission.
    const greeting = await greetingRowId(chatId);
    await editMessage(chatId, greeting, `The old man slides a folded paper across the table.\n${CARD_FENCE}`);

    await openNewestChat(page);

    // ── FE: the ImmersiveCard chrome renders (the tierB lifecycle) — title band present, sandboxed body. ──
    const card = page.locator('[data-slot="immersive-card"]').first();
    await expect(card).toBeVisible({ timeout: 20_000 });
    await expect(card.locator('[data-slot="immersive-card-title"]')).toContainText(CARD_TITLE);

    // The body is a SANDBOXED iframe (scripts-off): `sandbox=""` — the null-origin, no-scripts wall (§4.2). The
    // card content lives in the iframe srcdoc, NOT the main DOM — so the transcript's own text nodes never carry
    // the raw HTML marker (the no-leak invariant). We assert the frame exists + the marker is absent from the
    // card's OUTER text (the srcdoc is a separate document, unreadable as text content here).
    const frame = card.locator('[data-slot="sandbox-frame"]');
    await expect(frame).toBeVisible();
    expect(await frame.getAttribute("sandbox")).toBe("");
    // The raw fence/HTML never leaked into the card chrome's own text content (it's inside the iframe document).
    await expect(card).not.toContainText(":::card");
    await expect(card).not.toContainText("<p>");

    // ── LIFECYCLE: view-raw toggles the exact stored source into a code echo (the "read the code" arm). ──
    await card.getByRole("button", { name: "View raw source" }).click();
    const raw = card.locator('[data-slot="immersive-card-raw"]');
    await expect(raw).toBeVisible({ timeout: 5000 });
    await expect(raw).toContainText(CARD_MARKER);
    // Toggle back to rendered (the button label flips to "Show rendered card").
    await card.getByRole("button", { name: "Show rendered card" }).click();
    await expect(raw).toBeHidden({ timeout: 5000 });

    // EXPAND: the lightbox opens at full size, labelled by the card title (§4.7).
    await card.getByRole("button", { name: "Expand card" }).click();
    await expect(page.locator('[data-slot="immersive-card-lightbox-body"]')).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Escape");

    // ── FE (Scene archive): the Scene tab lists the card by title (rpg-card-archive — the visible-transcript
    // card list, newest first). The card is discoverable from the game panel, not just inline. ──
    await openGamePanel(page);
    await openContextTab(page, "Scene");
    const archive = page.locator('[data-slot="rpg-card-archive"]');
    await expect(archive).toBeVisible({ timeout: 15_000 });
    await expect(archive).toContainText(CARD_TITLE);

    expect(await fetchDebugErrors()).toEqual([]);
  } finally {
    await cleanup();
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// P5 — CYOA + PLOT + WAND: (a) a `:::choices` fence renders clickable buttons and clicking one SENDS that text as
// the user's turn (a reply starts); (b) the snapshot-resident plot plane advances + is swipe-consistent (a
// second read is byte-identical — clone-forward, no base mutation) + the act rail renders it; (c) the wand Plot
// submenu steer resolves LIVE off `{{rpgSceneState}}` (previewAssembly with `gameSteer` carries the seeded state
// into the assembled prompt). Config: cyoa default OFF (we flip it), plot default ON.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const CHOICE_OPTION = "Draw your blade and demand answers";
const CHOICES_FENCE = `The tension breaks.\n:::choices\n1. ${CHOICE_OPTION}\n2. Slip quietly out the back\n3. Buy the stranger a drink\n:::`;

test("P5 CYOA: a planted :::choices renders clickable buttons and clicking one sends it as the user's turn", {
  tag: "@live",
}, async ({ page }) => {
  test.setTimeout(300_000);
  const { chatId, cleanup } = await seedGame(castId<CharacterHandle>("e2e-pp-p5-cyoa"));
  try {
    // BE: cyoa defaults OFF; flip it on (the standing-mode knob). The render is toggle-independent — a stored
    // choices fence renders regardless — but the flip proves the knob is real (config truth).
    expect((await getConfigView(chatId)).cyoa).toBe(false);
    await setFeatureKnobs(chatId, { cyoa: true });
    expect((await getConfigView(chatId)).cyoa).toBe(true);

    const greeting = await greetingRowId(chatId);
    await editMessage(chatId, greeting, CHOICES_FENCE);

    await openNewestChat(page);
    await openGamePanel(page);

    // ── FE: the choices block renders numbered clickable buttons (message-choices). ──
    const choices = page.locator('[data-slot="message-choices"]').first();
    await expect(choices).toBeVisible({ timeout: 20_000 });
    const optionButton = choices.getByRole("button", { name: new RegExp(CHOICE_OPTION.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")) });
    await expect(optionButton).toBeVisible();

    // The greeting is the ONLY assistant row before the click — the "a fresh reply landed" comparand.
    const assistantRows = page.locator('[data-slot="message-row"][data-role="assistant"]');
    await expect(assistantRows).toHaveCount(1, { timeout: 15_000 });

    // ── CLICK → SEND: clicking the option sends its TEXT as the user's next turn (a choice IS a user turn).
    // The proof it fired the send: a user row carrying the option text lands in canon (DB) AND renders (FE),
    // independent of the live reply's content — the send is the seam under test, not the model's answer. ──
    await optionButton.click();
    await expect
      .poll(async () => (await listCanon(chatId)).some((m) => m.role === "user" && m.content.includes(CHOICE_OPTION)), {
        timeout: 120_000,
        intervals: [1000],
      })
      .toBe(true);
    // FE: the sent choice renders as a user row in the transcript (DOM ↔ canon parity for the send).
    await expect(page.locator('[data-slot="message-row"][data-role="user"]').filter({ hasText: CHOICE_OPTION })).toBeVisible({ timeout: 15_000 });

    // The reply STARTED — a SECOND assistant row (beyond the greeting) streams back. The choice drove a real
    // turn end-to-end (a fresh generation, not the pre-existing greeting row satisfying the assertion).
    await expect(assistantRows).toHaveCount(2, { timeout: 120_000 });
  } finally {
    await cleanup();
  }
});

test("P5 plot: the snapshot plot plane renders on the act rail, advances, and a re-read is swipe-consistent", {
  tag: "@live",
}, async ({ page }) => {
  test.setTimeout(90_000);
  const { chatId, cleanup } = await seedGame(castId<CharacterHandle>("e2e-pp-p5-plot"));
  try {
    // BE: plot progression defaults ON (config truth).
    expect((await getConfigView(chatId)).plotProgression).toBe(true);
    // A game with no plot authored has a null plot plane (the rail renders nothing — no invented acts).
    expect((await getTrackerView(chatId)).plot).toBeNull();

    // ── DB/BE: hand-seed the plot plane (`plot` is a hand-editable snapshot key — the deterministic door; a
    // live 8B authors it via update_scene.plot in prod). Act 1 of a 3-act spine. ──
    await editSnapshot(chatId, {
      plot: {
        act: 1,
        title: "The Rusted Gate",
        acts: [
          { title: "Arrival", summary: "The party reaches Ashfell" },
          { title: "The Hunt", summary: "" },
          { title: "Reckoning", summary: "" },
        ],
      },
    });
    const seeded = await getTrackerView(chatId);
    expect(seeded.plot?.act).toBe(1);
    expect(seeded.plot?.title).toBe("The Rusted Gate");
    expect(seeded.plot?.acts.map((a) => a.title)).toEqual(["Arrival", "The Hunt", "Reckoning"]);

    // SWIPE-CONSISTENCY: every plane resolves from ONE current snapshot, so a back-to-back re-read is byte-
    // identical — a read never mutates the base (clone-forward). This is the swipe-consistency contract the
    // panel relies on to re-resolve the whole view as one.
    const reread = await getTrackerView(chatId);
    expect(JSON.stringify(reread.plot)).toBe(JSON.stringify(seeded.plot));

    // ADVANCE: move to act 2 (a hand edit — the applier keeps acts.length >= act). The base's earlier read is
    // untouched (the object we already hold), and the new read reflects the advance.
    await editSnapshot(chatId, { plot: { act: 2, title: "The Rusted Gate", acts: seeded.plot?.acts ?? [] } });
    const advanced = await getTrackerView(chatId);
    expect(advanced.plot?.act).toBe(2);
    expect(seeded.plot?.act).toBe(1); // the earlier read we hold is unmutated — swipe/clone-forward, no base write

    // ── FE: the Quests tab's act rail (rpg-act-rail) renders the plot — the current act embered. ──
    await openNewestChat(page);
    await openGamePanel(page);
    await openContextTab(page, "Quests");
    // The rail is a COMPACT design: the story title + the CURRENT (embered) act's title + a dot rail
    // (● I ◉ II ○ III) — it does NOT render every act's title as text. Assert the current act title + the
    // story title (the embered-act witness — act 2's "The Hunt", not act 1's "Arrival").
    const rail = page.locator('[data-slot="rpg-act-rail"]');
    await expect(rail).toBeVisible({ timeout: 15_000 });
    await expect(rail).toContainText("The Hunt"); // act 2's title, the embered current act
    await expect(rail).toContainText("The Rusted Gate"); // the story title

    expect(await fetchDebugErrors()).toEqual([]);
  } finally {
    await cleanup();
  }
});

test("P5 wand: a Plot-submenu game steer fires a real turn and resolves LIVE off {{rpgSceneState}} on the wire", {
  tag: "@live",
}, async () => {
  test.setTimeout(300_000);
  const { chatId, cleanup } = await seedGame(castId<CharacterHandle>("e2e-pp-p5-wand"));
  try {
    // Seed a KNOWN scene state the steer's `{{rpgSceneState}}` macro must resolve into the provider prompt.
    const marker = "Ashfell Night Market";
    await editSnapshot(chatId, { location: marker, recentEvents: ["A hooded figure watches from the shadows"] });

    // Fire the wand's "Grounded twist" steer (kind "twist") on a REAL turn — its kit-homed SYSTEM template
    // embeds `{{rpgSceneState}}`, resolved through the macro engine against the game turn's gather feed. The
    // steer injects as a depth-0 system injection into the assembled HISTORY, so it rides the vLLM `messages`
    // array (NOT the previewAssembly prefix) — the wire capture is the honest instrument. The prompt must carry
    // BOTH the steer's template markers (the twist prose) AND the seeded location (proof `{{rpgSceneState}}`
    // resolved against THIS game's live snapshot, not an empty string). The model's answer is irrelevant here.
    await sendGameSteerTurn(chatId, "twist");

    const captures = await fetchWireCaptures(chatId);
    expect(captures.length).toBeGreaterThan(0);
    const turnCapture = captures.find((c) => c.backend === "vllm");
    expect(turnCapture).toBeDefined();
    const promptText = turnCapture === undefined ? "" : wireMessagesText(turnCapture);
    // The twist template's markers ("Story steer" heading + "complication" ask) reached the prompt…
    expect(promptText).toContain("Story steer");
    expect(promptText).toContain("complication");
    // …AND the seeded scene state resolved LIVE into it (the `{{rpgSceneState}}` proof — not an empty macro).
    expect(promptText).toContain(marker);

    expect(await fetchDebugErrors()).toEqual([]);
  } finally {
    await cleanup();
  }
});
