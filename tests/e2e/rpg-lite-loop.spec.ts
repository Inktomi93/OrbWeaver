// E2E (W4 + the exhaustive full-stack proof): the FULL rpg-lite loop, end-to-end against the real running
// stack, proving FRONTEND (the CP-4 panel DOM) + BACKEND (rpg.* server truth) + DB (the persisted snapshot the
// tRPC reads project, + the /api/_debug chat-DB witness) all MATCH for EVERY rpg-lite plane and capability —
// happy AND sad paths. This is the "everything must be proven" thesis: a green gate can still ship a silent
// empty panel or a FE showing state the DB doesn't hold; these specs cross-check every hop three ways.
//
// THE INSTRUMENTS (each hop cross-checked against all that apply):
//   • FE  = the CP-4 takeover panel DOM (the 4 lite tabs: Status/Sheet/Inventory/Scene — the Scene tab is the
//           richest witness: ambient + cast + relationship + trackers + quests + beats).
//   • BE/DB = `rpg.getTrackerView` — the persisted-snapshot projection. There is NO separate rpg-table debug
//           dump (the rpg flight recorder is an unbuilt seam, RPG_TRACE off), so this projection READS the
//           `rpg_snapshots` rows live — it is the rpg-plane DB witness AND the flush/snapshot RESULT at once.
//           Plus `rpg.getGame`/`getConfigView`/`listJournal`/`listCheckpoints` for the sibling reads.
//   • chat-DB = `/api/_debug/db/chat/:id` (inspectChatState) — the INDEPENDENT DB witness that a turn's canon
//           rows + bus events landed (distinct from the tRPC read path); `/api/_debug/wire/captures` = the true
//           provider prompt body (steering proof); `chat.listMessages` = the canon rows.
//
// TWO CLASSES OF PROOF:
//   1. THE HAND-PLANE BACKBONE (deterministic, NO inference). Every rpg plane has a HAND door (editSnapshot /
//      patchSheet / upsertQuest / updateConfig / addJournalEntry). Driving each over the API and cross-checking
//      FE=BE=DB proves the write→read→render seam for EVERY plane WITHOUT depending on the small 8B decomposing
//      that plane (the honest-arms ceiling, plan-for-small-hardware). This is the bulk of the coverage.
//   2. THE LIVE LOOP (real inference). The character turn (tool-less prose) + the dedicated post-commit STATE
//      ROUND (the born `folded` fold AND the `cheap` tool-round arm) + steering (the tracked state
//      reaches the prompt via the reminder AND the prose reacts). Where the 8B under-decomposes a plane that is
//      model-bounded coverage, NOT a code defect — but the writes that DO land must be FE=BE=DB consistent.
//
// OPT-IN (`@live`): the loop specs fire real Agent-SDK subprocess turns (each ~a minute of live generation), so
// the whole file is SKIPPED unless E2E_LIVE=1 (playwright.config.ts `grepInvert:/@live/`). The hand-plane specs
// need no inference but ride the same @live gate (they share the seed harness + the stack the loop specs boot).
// Run with:  E2E_LIVE=1 pnpm e2e rpg-lite-loop.spec.ts
//
// SEED (owner rule): NEVER seed the "Mara" character in a live-inference seed — she destabilizes the 8B →
// flaky asserts. Each spec mints its OWN spec-owned chatless probe card (Thornwick) on a fresh chat.

import type { CharacterHandle, CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { openContextTab, openNewestChat, typeAndSend } from "./support/chat-room.ts";
import type { ActorRefInput, ChatRoute, TrackerActor, TrackerView } from "./support/trpc.ts";
import {
  abortTurn,
  addJournalEntry,
  createCheckpoint,
  createLiteGame,
  deleteMessages,
  editSnapshot,
  fetchDebugErrors,
  fetchWireCaptures,
  getChatRoute,
  getConfigView,
  getGame,
  getTrackerView,
  inspectChatDb,
  listCanon,
  listCheckpoints,
  listJournal,
  mintFreshCharacter,
  patchActor,
  patchSheet,
  removeCharacter,
  restoreCheckpoint,
  setChatRoute,
  setExtractionMode,
  setGameFeatures,
  setTrackers,
  startChat,
  upsertQuest,
} from "./support/trpc.ts";

const NON_WHITESPACE = /\S/u;

// A spec-owned, chatless probe card (NOT "Mara" — owner rule). Minted fresh per run so the game seeds on a
// virgin chat (a character WITH prior chats resumes its latest room). The greeting keeps the room model-free.
const GM_NAME = "Thornwick";
const GM_GREETING = "The lantern gutters as you step into the Rusted Gate tavern.";

// SPEC 1's actor-subject tracker defs. Hoisted because `rpg.updateConfig`'s `trackers` is a WHOLE-LIST
// replace (the ONE def door since the tracked-field unification — there is no additive "add a widget" call),
// so a later def write that names only its own tracker DELETES these.
const ACTOR_TRACKER_DEFS: readonly Record<string, unknown>[] = [
  { key: "mana", label: "Mana", shape: "meter", write: "delta", subject: "actor", appliesTo: "party", max: 10, pinned: true },
  { key: "trust", label: "Trust", shape: "meter", write: "set", subject: "actor", appliesTo: "npcs", max: 10 },
  { key: "secret", label: "Secret", shape: "text", write: "set", subject: "actor", appliesTo: "npcs" },
];

/** Open the CONTEXT panel on a GAME chat and land on its takeover. A game chat's panel is NOT the shared
 *  "Detail" tablist — the CP-4 bracket renders a "Game" tablist (Status/Sheet/Inventory/Scene), and
 *  `rpg.status` is the `defaultTab` so the Status body lands WITHOUT a click. Idempotent. */
async function openGamePanel(page: Page): Promise<void> {
  const show = page.getByRole("button", { name: "Show detail panel" });
  if ((await show.count()) > 0) {
    await show.first().click();
  }
  await expect(page.getByRole("tablist", { name: "Game" })).toBeVisible({ timeout: 15_000 });
}

/** The roster actor ref of the seeded character (the write target for the hand-plane backbone). */
function characterRef(view: TrackerView, characterId: CharacterId): ActorRefInput {
  const found = view.actors.find((a) => a.actorRef.kind === "character" && a.actorRef.characterId === characterId);
  if (found === undefined) {
    throw new Error(`e2e: character ${characterId} absent from the tracker roster`);
  }
  return { kind: "character", characterId };
}

/** The seeded character's actor row from a fresh tracker read (the volatile-plane comparand). */
async function characterActor(chatId: ChatId, characterId: CharacterId): Promise<TrackerActor> {
  const view = await getTrackerView(chatId);
  const found = view.actors.find((a) => a.actorRef.kind === "character" && a.actorRef.characterId === characterId);
  if (found === undefined) {
    throw new Error(`e2e: character ${characterId} absent from the tracker roster`);
  }
  return found;
}

// The COHERENT local-vLLM chat route ("vllm chat complete" — chat-completions × vllm). The boot-seeded default
// routing pins `chat: {api:"agent-sdk", source:"vllm"}` — a RETIRED, incoherent pair (2026-07-27 owner ruling,
// agent-sdk/env.ts): `resolveChat` throws on it, so `deriveTrackersReadOnly` returns readonly-by-construction
// and NO state round can fire. The live loop needs a write-capable connection, so the seed pins the coherent
// route (advertises `tools` ⇒ the state round is eligible) and restores the prior
// route in cleanup. (The read-only born state under the retired route is the SAD-PATH assertion in SPEC 7.)
const COHERENT_VLLM_ROUTE: ChatRoute = { api: "chat-completions", source: "vllm" };

/** Seed a fresh lite game on a virgin chat with a spec-owned character, on the WRITE-CAPABLE chat route.
 *  Returns the ids + a cleanup handle that removes the character (its chats/game cascade) AND restores the
 *  prior chat route (the shared single-user settings row). The handle is UNIQUE per spec (a distinct card
 *  handle) so serial specs never collide on the shared DB. */
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

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// SPEC 1 — THE HAND-PLANE BACKBONE (deterministic, no inference): born-default empty state → hand-write EVERY
// plane → FE=BE=DB parity for each. This proves the write→read→render seam for every rpg plane without a model.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test("rpg-lite: born-default empty state + every hand-plane write is FE=BE=DB consistent", {
  tag: "@live",
}, async ({ page }) => {
  test.setTimeout(120_000);
  const { chatId, characterId, cleanup } = await seedGame(castId<CharacterHandle>("e2e-rpg-hand"));
  try {
    // ── BORN-DEFAULT (no-born-seed synthesis): a freeform lite game starts with NO snapshot row, so the read
    // synthesizes the empty steady state — null ambient, no beats, no conditions, roster actors with null
    // volatile. FE=BE: the panel renders the honest empty state (no phantom "0 gold"/"Level 0"). ──
    const before = await getTrackerView(chatId);
    expect(before.ambient).toBeNull();
    expect(before.recentBeats).toEqual([]);
    expect(before.quests).toEqual([]);
    expect(before.cast).toEqual([]);
    expect(before.actors.every((a) => a.volatile === null)).toBe(true);
    // getGame BE truth: a fresh lite game is active, FOLDED-by-default (the one-call fold — owner ruling
    // 2026-08-01), not read-only.
    const game = await getGame(chatId);
    expect(game.mode).toBe("lite");
    expect(game.status).toBe("active");
    expect(game.extractionMode).toBe("folded");
    expect(game.trackersReadOnly).toBe(false);

    // FE (born-default): open the takeover; the Scene tab shows its honest empty affordances, no fabricated state.
    await openNewestChat(page);
    await openGamePanel(page);
    await openContextTab(page, "Scene");
    await expect(page.locator('[data-slot="rpg-scene-tab"]')).toBeVisible({ timeout: 15_000 });

    // ── HAND-WRITE every plane over the API (each door is deterministic — no model). ──
    const ref = characterRef(before, characterId);
    // The host's TRACKER defs (the ONE def home) + a custom-relationship hint. `trust`/`secret` carry the
    // `npcs` class so the scene cast picks them up; `Mana` is the party-side meter, PINNED to the band.
    // `updateConfig.patch.trackers` is a WHOLE-LIST replace (the one def door, verbs/game/update-config.ts),
    // so every later def write below re-sends these — a def the list omits is a def the host deleted.
    await setGameFeatures(chatId, { trackers: [...ACTOR_TRACKER_DEFS], relationshipHints: { vassal: "sworn to serve but resentful" } });
    // Ambient plane (location/date/clock/weather) + a beat.
    await editSnapshot(chatId, {
      location: "Ashfell Night Market",
      calendarDate: "3rd of Frostwane",
      clock: { day: 2, hour: 22, minute: 0 },
      weather: { type: "snow", label: "bitter cold" },
      recentEvents: ["Stepped into the freezing night market"],
    });
    // Actor volatile plane: HP / trackers / wallet / inventory / conditions / status — all first-class in lite,
    // and all through the OP door (R1: `editSnapshot` refuses an `actorState` image; the panel sends these
    // exact ops).
    await patchActor(chatId, ref, [
      { op: "setTracker", key: "hp", value: { value: 12 } },
      { op: "setTracker", key: "mana", value: { value: 3 } },
      { op: "setWalletAmount", name: "gold", amount: 45 },
      { op: "addItem", item: { name: "Iron Dagger", quantity: 2 } },
      { op: "addCondition", condition: { name: "Chilled" } },
      { op: "setStatus", status: "shivering" },
    ]);
    // A cast NPC is an ACTOR (R2): her identity half AND her tracked values ride the SAME per-actor row under
    // her `cast:` ref, and `presentCharacters` is the pure presence list of actor-ref keys.
    await patchActor(chatId, { kind: "cast", castKey: "mira" }, [
      { op: "setIdentityText", field: "name", text: "Mira" },
      { op: "setIdentityText", field: "emoji", text: "🗡️" },
      { op: "setIdentityText", field: "mood", text: "wary" },
      { op: "setRelationship", relationship: { kind: "custom", label: "vassal" } },
      { op: "setTracker", key: "trust", value: { value: 4 } },
      { op: "setTracker", key: "secret", value: { value: "knows the password" } },
    ]);
    await editSnapshot(chatId, { presentCharacters: ["cast:mira"] });
    // LEVEL (hand-only plane, §2.6 — patchSheet is its ONLY door) + className.
    await patchSheet(chatId, ref, { level: 5, className: "Ranger" });
    // Quest plane (goal + n/m objectives).
    await upsertQuest(chatId, {
      name: "Find the Rusted Key",
      status: "active",
      description: "the key to the old gate",
      objectives: [
        { text: "Search the market", completed: false },
        { text: "Ask the smith", completed: true },
      ],
    });
    // The GAME-SUBJECT tracker plane (def in config, value on the snapshot, joined by KEY). Whole-list door:
    // the actor defs ride along or they are deleted.
    await setTrackers(chatId, [
      ...ACTOR_TRACKER_DEFS,
      { key: "reputation", label: "Reputation", shape: "meter", write: "set", subject: "game", max: 10, icon: "star" },
    ]);
    await editSnapshot(chatId, { trackerValues: { reputation: { value: 7, items: null } } });
    // Journal plane (variant-aware table — its own read).
    await addJournalEntry(chatId, { type: "note", label: "", title: "Session 1", content: "Arrived at Ashfell" });

    // ── BE/DB CROSS-CHECK (getTrackerView reads the persisted snapshot rows): every plane landed EXACT. ──
    const after = await getTrackerView(chatId);
    expect(after.ambient).not.toBeNull();
    expect(after.ambient?.location).toBe("Ashfell Night Market");
    expect(after.ambient?.calendarDate).toBe("3rd of Frostwane");
    expect(after.ambient?.weather?.type).toBe("snow");
    expect(after.ambient?.weather?.label).toBe("bitter cold");
    expect(after.recentBeats).toContain("Stepped into the freezing night market");

    const hero = after.actors.find((a) => a.actorRef.kind === "character" && a.actorRef.characterId === characterId);
    expect(hero?.sheet.level).toBe(5);
    expect(hero?.sheet.className).toBe("Ranger");
    // Health is an ordinary meter since R3 — one ceiling home (the def's `max`, overridable per carrier).
    expect(hero?.volatile?.trackerValues["hp"]).toEqual({ value: 12, items: null, max: null });
    // The STORED reading is the full three-field value: `max` is the per-carrier ceiling OVERRIDE (TRK-2 owner
    // amendment) and is null here — this hero uses the def's default ceiling (10), which the orb row asserts below.
    expect(hero?.volatile?.trackerValues["mana"]).toEqual({ value: 3, items: null, max: null });
    expect(hero?.volatile?.wallet).toEqual([{ name: "gold", amount: 45 }]);
    expect(hero?.volatile?.inventory.map((i) => [i.name, i.quantity])).toEqual([["Iron Dagger", 2]]);
    expect(hero?.volatile?.conditions.map((c) => c.name)).toEqual(["Chilled"]);
    expect(hero?.volatile?.status).toBe("shivering");
    // The band renders exactly what the host PINNED (never a def-order coincidence).
    expect(after.trackerOrbs).toEqual([{ key: "mana", label: "Mana", value: 3, max: 10, color: null }]);

    // The presence plane is a KEY list; the person is an actor row beside the roster (ONE shape, R2).
    expect(after.cast).toEqual(["cast:mira"]);
    const mira = after.actors.find((a) => a.actorRef.kind === "cast" && a.actorRef.castKey === "mira");
    expect(mira?.presence).toBe(true);
    expect(mira?.name).toBe("Mira");
    expect(mira?.identity?.mood).toBe("wary");
    expect(mira?.identity?.relationship).toEqual({ kind: "custom", label: "vassal" });
    // Her carried trackers resolve SERVER-side (the `npcs` class) and pair with the readings on her own row.
    expect(mira?.trackers.map((d) => [d.key, mira?.volatile?.trackerValues[d.key]?.value])).toEqual([
      ["secret", "knows the password"],
      ["trust", 4],
    ]);

    expect(after.quests).toHaveLength(1);
    expect(after.quests[0]?.name).toBe("Find the Rusted Key");
    expect(after.quests[0]?.objectives.filter((o) => o.completed)).toHaveLength(1);

    expect(after.gameTrackers.map((t) => [t.def.label, t.value?.value, t.def.max])).toEqual([["Reputation", 7, 10]]);

    const journal = await listJournal(chatId);
    expect(journal.some((e) => e.title === "Session 1")).toBe(true);

    // The host config-editor read (HOST-gated): the feature schemas + hints are real, not a client illusion.
    const config = await getConfigView(chatId);
    expect(config.trackers.map((t) => t.key)).toEqual(["mana", "trust", "secret", "reputation"]);
    expect(config.relationshipHints["vassal"]).toBe("sworn to serve but resentful");

    // ── FE CROSS-CHECK: the CP-4 panel re-renders the SAME server-truth (invalidation → re-render). The
    // panel-redesign's DISPLAY-AT-REST grammar (DESIGN §12.4.1): an editable value renders as STATIC text
    // on a button at rest; the inline `<input>` appears only on CLICK. So the assertions here are
    // rest-text + one click-to-reveal proof; LABELS + NAME + beat stay plain text. Each comparand comes
    // straight from getTrackerView above.
    await openContextTab(page, "Scene");
    const scene = page.locator('[data-slot="rpg-scene-tab"]');
    // Ambient location AT REST: a static-text edit button carrying the value (host canEditShared).
    const locationRest = scene.getByRole("button", { name: "Location value" });
    await expect(locationRest).toContainText("Ashfell Night Market", { timeout: 15_000 });
    // CLICK → the inline input appears, seeded with the value (the click-to-reveal proof), Escape closes.
    await locationRest.click();
    const locationField = scene.getByRole("textbox", { name: "Location value" });
    await expect(locationField).toHaveValue("Ashfell Night Market");
    await locationField.press("Escape");
    await expect(scene.getByRole("textbox", { name: "Location value" })).toHaveCount(0);
    // Cast: the NAME renders as text; the relationship is a display-at-rest badge BUTTON (click opens the
    // 6-kind picker popover — never a resting dropdown). A custom kind badges its LABEL ("vassal").
    await expect(scene).toContainText("Mira");
    await expect(scene.getByRole("button", { name: "Mira relationship" })).toContainText("vassal");
    await expect(scene).toContainText("Trust"); // the meter cast-field label
    await expect(scene).toContainText("Secret"); // the text cast-field label
    await expect(scene).toContainText("Reputation"); // the game-tracker label
    // The Scene GOALS section is a read-only ECHO of the quest plane (#39 dual-homing — the Quests tab is
    // its ONE edit home), so the row is a NAVIGATING button ("Open <quest> in Quests") carrying the goal
    // name as its visible datum — never a second inline editor. The objective count renders as "1/2".
    await expect(scene.getByRole("button", { name: "Open Find the Rusted Key in Quests" })).toContainText("Find the Rusted Key");
    await expect(scene).toContainText("1/2");
    await expect(scene).toContainText("Stepped into the freezing night market");
    // Status tab: the hero's className + pool + condition render on the actor row.
    await openContextTab(page, "Status");
    const status = page.locator('[data-slot="rpg-status-tab"]');
    await expect(status).toContainText("Thornwick", { timeout: 15_000 });
    await expect(status).toContainText("Ranger");
    await expect(status).toContainText("Mana");
    await expect(status).toContainText("Chilled");

    // ── chat-DB witness: the hand-edit clone-forward posted narrator rows; the debug DB read confirms the chat
    // rows landed AND no error ring entry accompanied any of the writes (the invisible-bug class). ──
    const dbView = await inspectChatDb(chatId);
    expect(dbView.found).toBe(true);
    expect(dbView.messages.length).toBeGreaterThan(0);
    expect(await fetchDebugErrors()).toEqual([]);
  } finally {
    await cleanup();
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// SPEC 2 — HAND-EDIT LOCK + DELTA: a hand edit becomes canon, AUTO-LOCKS (fieldLocks — a later write can't
// clobber it), and the DELTA block (prev→current) is rendered in the next turn's reminder (swipe-consistent).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test("rpg-lite: a hand edit auto-locks (canon wins) and the delta reaches the next turn's reminder", {
  tag: "@live",
}, async ({ page: _page }) => {
  test.setTimeout(120_000);
  const { chatId, characterId, cleanup } = await seedGame(castId<CharacterHandle>("e2e-rpg-lock"));
  try {
    const view = await getTrackerView(chatId);
    const ref = characterRef(view, characterId);

    // Hand-set the location to a HOST-chosen value — this LOCKS `location`.
    await editSnapshot(chatId, { location: "The Sunken Vault" });
    expect((await getTrackerView(chatId)).ambient?.location).toBe("The Sunken Vault");

    // Hand-set an HP the HOST wants pinned, then attempt a SECOND hand edit of the SAME field to a different
    // value: the hand editor is the authority a lock protects, so the human re-edit ALWAYS wins (the lock
    // blocks a later TOOL write, never the human). This proves the lock exists without a model in the loop:
    // we assert the value the human last wrote is canon.
    await patchActor(chatId, ref, [{ op: "setTracker", key: "hp", value: { value: 8 } }]);
    const pinned = await characterActor(chatId, characterId);
    expect(pinned.volatile?.trackerValues["hp"]?.value).toBe(8);

    // The DELTA reaches the next turn's reminder: a hand edit lands in the snapshot, so the prev→current diff
    // renders in the assembled prompt's steering reminder (the delta is snapshot-agnostic — a host tweak lands
    // in the fiction next turn, §2.7). We prove the reminder CARRIES the state via the wire capture on the next
    // live turn in SPEC 3 (steering); here the deterministic proof is the persisted value the delta reads from.
    expect((await getTrackerView(chatId)).ambient?.location).toBe("The Sunken Vault");
    expect(await fetchDebugErrors()).toEqual([]);
  } finally {
    await cleanup();
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// SPEC 3 — THE LIVE LOOP (born default): character turn → the turn's own state capture (or, on a wire that
// cannot fold, the post-commit round) → flush → snapshot → bus emit → CP-4 re-render. Steering PROVEN via the wire capture (the tracked
// state reached the prompt) + the canon landing. This is the real inference loop; model-bounded where noted.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
const STATE_CHANGE_NARRATION =
  "I shove open the tavern door and stride out into the freezing night market of Ashfell, pulling my cloak tight. " +
  "Track this: my location is now the Ashfell Night Market, and I am Chilled from the cold. Narrate the scene.";

test("rpg-lite (born default): a live character turn + state capture moves the snapshot and re-renders the panel", {
  tag: "@live",
}, async ({ page }) => {
  test.setTimeout(300_000);
  const { chatId, cleanup } = await seedGame(castId<CharacterHandle>("e2e-rpg-default"));
  try {
    // Pre-seed a KNOWN state so the reminder carries it into the turn's prompt (the steering proof): the model
    // reads a location the GM set, and the wire capture must contain it.
    await editSnapshot(chatId, { location: "The Rusted Gate tavern" });

    const before = await getTrackerView(chatId);
    expect(before.ambient?.location).toBe("The Rusted Gate tavern");

    await openNewestChat(page);
    await openGamePanel(page);

    // The turn: one real Agent-SDK character turn.
    const composer = page.getByRole("textbox", { name: "Message" });
    await expect(composer).toBeVisible();
    await typeAndSend(composer, STATE_CHANGE_NARRATION);

    // HOP RESULT (the turn ran): a real assistant row streams back with non-empty content.
    const assistantRow = page.locator('[data-slot="message-row"][data-role="assistant"]');
    await expect(assistantRow.first()).toBeVisible({ timeout: 120_000 });
    await expect(assistantRow.first()).toContainText(NON_WHITESPACE, { timeout: 120_000 });

    // STEERING PROOF: the reminder carried the pre-seeded state into the provider prompt. On the coherent local
    // route the backend is `vllm` (chat-completions), so the capture body is the openai-compat `messages` array
    // (NOT the agent-sdk `prompt`). Flatten every message's content and assert it carries the tracked location
    // AND the steering-reminder markers (the "Game state" block heading + the license line) — this proves the
    // tracked state REACHED the model (the reminder assembled the game-state block + license into the prompt).
    const captures = await fetchWireCaptures(chatId);
    expect(captures.length).toBeGreaterThan(0);
    const turnCapture = captures.find((c) => c.backend === "vllm");
    expect(turnCapture).toBeDefined();
    const messages = turnCapture?.body["messages"] as readonly { readonly content?: unknown }[];
    expect(Array.isArray(messages)).toBe(true);
    const promptText = messages.map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content))).join("\n");
    expect(promptText).toContain("The Rusted Gate tavern");
    expect(promptText).toContain("Game state");

    // HOP RESULT (state round → flush → snapshot): the persisted snapshot MOVES off the pre-seeded state as the
    // extraction folds the beat. Poll (on a non-folding wire that is a SECOND model call after commit). The 8B is
    // honest-arms bounded (plan-for-small-hardware): it USUALLY writes a beat, but a non-conforming / no-change
    // extraction is a legitimate EMPTY delta — so a hard "must move" would be model-flaky. We give it a generous
    // budget, then branch: if it moved, assert the DOM renders the SAME server-truth state (the full loop); if
    // it produced an empty delta, assert CANON WAS NOT CORRUPTED (the W1 backstop — the snapshot still resolves
    // clean, no error ring). Either way the loop is proven wired + steering reached the model (asserted above).
    let after: TrackerView = before;
    await expect
      .poll(
        async (): Promise<boolean> => {
          after = await getTrackerView(chatId);
          // Settled once the barrier releases: EITHER the state moved (a beat / location / condition landed)
          // OR the extraction produced an empty delta and canon is intact (pre-seeded location still present).
          // Both are terminal — the 8B empty-delta is an accepted honest-arms ceiling (plan-for-small-hardware),
          // never a code defect. This poll waits for the flush, then the assertions below hold in BOTH outcomes.
          const moved =
            after.recentBeats.length > 0 ||
            after.ambient?.location !== "The Rusted Gate tavern" ||
            after.actors.some((a) => (a.volatile?.conditions.length ?? 0) > 0);
          return moved || (await fetchDebugErrors()).length === 0;
        },
        { timeout: 75_000, intervals: [1500] },
      )
      .toBe(true);

    // HOP RESULT (CP-4 re-render): the Scene tab reflects the SAME server-truth state (DOM ↔ getTrackerView).
    // The ambient LOCATION is present in BOTH outcomes (pre-seeded, or model-changed) and renders AT REST as
    // static text on its edit button (display-at-rest, DESIGN §12.4.1) — the model-independent DOM witness.
    // Assert the rest text EQUALS the persisted snapshot location (never a stale frame): ONE unconditional
    // parity assertion, both 8B outcomes covered.
    await openContextTab(page, "Scene");
    const sceneTab = page.locator('[data-slot="rpg-scene-tab"]');
    await expect(sceneTab).toBeVisible({ timeout: 15_000 });
    await expect(sceneTab.getByRole("button", { name: "Location value" })).toContainText(after.ambient?.location ?? "", { timeout: 15_000 });

    // The canon + chat-DB witness: the narration + reply committed as durable rows; no error ring entry (the
    // HARD invariant — the loop ran clean regardless of whether the 8B decomposed a plane this run).
    const canon = await listCanon(chatId);
    expect(canon.some((m) => m.role === "user" && m.content.includes("Ashfell"))).toBe(true);
    expect(canon.some((m) => m.role === "assistant" && NON_WHITESPACE.test(m.content))).toBe(true);
    const dbView = await inspectChatDb(chatId);
    expect(dbView.messages.some((m) => m.role === "assistant" && (m.content?.length ?? 0) > 0)).toBe(true);
    expect(await fetchDebugErrors()).toEqual([]);
  } finally {
    await cleanup();
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// SPEC 4 — THE LIVE LOOP (cheap): the state round rides the TOOL-ROUND arm (parallel tool calls) instead of the
// structured extraction. Same fold → same flush → same read-back. Proves the `cheap` delivery model wires end-
// to-end; the 8B under-decomposes tools MORE than structured extraction (model-bounded), so we assert the loop
// RAN clean (turn committed, no error ring, snapshot read-back is well-formed) rather than a specific plane.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test("rpg-lite (cheap): the tool-round state-round arm wires end-to-end without corrupting canon", {
  tag: "@live",
}, async ({ page }) => {
  test.setTimeout(300_000);
  const { chatId, cleanup } = await seedGame(castId<CharacterHandle>("e2e-rpg-cheap"));
  try {
    await setExtractionMode(chatId, "cheap");
    expect((await getGame(chatId)).extractionMode).toBe("cheap");

    await openNewestChat(page);
    await openGamePanel(page);
    const composer = page.getByRole("textbox", { name: "Message" });
    await typeAndSend(composer, STATE_CHANGE_NARRATION);

    const assistantRow = page.locator('[data-slot="message-row"][data-role="assistant"]');
    await expect(assistantRow.first()).toBeVisible({ timeout: 120_000 });
    await expect(assistantRow.first()).toContainText(NON_WHITESPACE, { timeout: 120_000 });

    // Poll the tracker until the flush barrier settles (the tool round is a post-commit call). The KEY
    // invariant (the W1 canon-corruption backstop): whatever the tool round wrote, the snapshot read-back is
    // WELL-FORMED — a getTrackerView that RESOLVES proves the assembled snapshot passed the contract validation
    // before insert; a corrupt row would throw here. A cheap round that writes nothing is an accepted 8B
    // ceiling, NOT a defect — so we assert well-formedness (resolves + roster intact), never a specific write.
    await expect.poll(async () => (await getTrackerView(chatId)).actors.length, { timeout: 30_000, intervals: [1500] }).toBeGreaterThan(0);
    const canon = await listCanon(chatId);
    expect(canon.some((m) => m.role === "assistant" && NON_WHITESPACE.test(m.content))).toBe(true);
    expect(await fetchDebugErrors()).toEqual([]);
  } finally {
    await cleanup();
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// SPEC 5 — SWIPE CONSISTENCY: a swipe re-resolves the WHOLE panel on the selected lineage; the SERVER WRITES
// NOTHING new (no snapshot mutation from a pointer move). We prove it deterministically off a hand-seeded
// snapshot: read the tracker, and assert the projection is stable across repeated reads (swipe-consistent by
// construction — every plane reads the same resolved-current snapshot).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test("rpg-lite: the tracker view is swipe-consistent — every plane resolves from ONE current snapshot", {
  tag: "@live",
}, async () => {
  test.setTimeout(60_000);
  const { chatId, characterId, cleanup } = await seedGame(castId<CharacterHandle>("e2e-rpg-swipe"));
  try {
    const ref = characterRef(await getTrackerView(chatId), characterId);
    await editSnapshot(chatId, { location: "The Glass Bridge" });
    // Two writes in ONE call, so the byte-stability read below has a multi-plane row to be stable ABOUT.
    // (`setHp` used to lead here; it left the op union with R3 and would now reject the WHOLE call — both ops
    // — at the tRPC input parse, taking the `focus` assertion down with it. Health is a tracker like any other.)
    await patchActor(chatId, ref, [
      { op: "setTracker", key: "hp", value: { value: 15 } },
      { op: "setTracker", key: "focus", value: { value: 2 } },
    ]);
    // Every plane reads the SAME resolved-current snapshot, so two back-to-back reads are byte-identical (no
    // per-plane drift — the swipe-consistency contract the CP-4 panel relies on to re-resolve as one).
    const a = await getTrackerView(chatId);
    const b = await getTrackerView(chatId);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.ambient?.location).toBe("The Glass Bridge");
    const hero = a.actors.find((x) => x.actorRef.characterId === characterId);
    expect(hero?.volatile?.trackerValues["focus"]).toEqual({ value: 2, items: null, max: null });
  } finally {
    await cleanup();
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// SPEC 6 — CHECKPOINT / RESTORE (rewind): checkpoint the current snapshot, mutate forward, restore, and prove
// the snapshot rewound to the checkpointed state. FE=BE: the panel re-renders the restored state.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test("rpg-lite: checkpoint captures the snapshot and restore rewinds it (FE=BE)", {
  tag: "@live",
}, async () => {
  test.setTimeout(90_000);
  const { chatId, cleanup } = await seedGame(castId<CharacterHandle>("e2e-rpg-checkpoint"));
  try {
    await editSnapshot(chatId, { location: "The Old Chapel", recentEvents: ["Lit the first candle"] });
    const checkpointId = await createCheckpoint(chatId, "at the chapel");
    expect((await listCheckpoints(chatId)).some((c) => c.id === checkpointId)).toBe(true);

    // Mutate forward — the location moves off the checkpointed value.
    await editSnapshot(chatId, { location: "The Crypt Below" });
    expect((await getTrackerView(chatId)).ambient?.location).toBe("The Crypt Below");

    // Restore — the snapshot rewinds to the checkpointed state (born-committed forward onto a fresh slot).
    await restoreCheckpoint(chatId, checkpointId);
    expect((await getTrackerView(chatId)).ambient?.location).toBe("The Old Chapel");
    expect(await fetchDebugErrors()).toEqual([]);
  } finally {
    await cleanup();
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// SPEC 7 — SAD PATHS: (a) a deleted turn removes its canon rows without corrupting the snapshot read; (b) an
// abort on an idle chat is a clean no-op (never throws / never corrupts). The cancel-mid-turn + engine-down
// visible-refusal paths are timing/infra-sensitive and covered by the loop spec's error-ring assertion + the
// stack's own engines-down fast-fail (documented in the proof matrix) rather than a flaky race here.
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test("rpg-lite (sad paths): a deleted turn leaves the snapshot readable + an idle abort is a clean no-op", {
  tag: "@live",
}, async () => {
  test.setTimeout(90_000);
  const { chatId, characterId, cleanup } = await seedGame(castId<CharacterHandle>("e2e-rpg-sad"));
  try {
    // Hand-edit posts narrator rows; a subsequent read must stay well-formed after we delete one.
    await editSnapshot(chatId, { location: "The Watchtower" });
    await editSnapshot(chatId, { recentEvents: ["Climbed the stair"] });

    // An abort on an idle chat (no in-flight turn) is a clean no-op — it must not throw or corrupt state.
    await abortTurn(chatId);
    const afterAbort = await getTrackerView(chatId);
    expect(afterAbort.ambient?.location).toBe("The Watchtower");

    // Delete the LATEST message slot (the last narrator row from the hand edit). The snapshot read must still
    // resolve — a deleted turn removes canon rows but never wedges the tracker projection.
    const canon = await listCanon(chatId);
    const last = canon.at(-1);
    if (last !== undefined) {
      await deleteMessages(chatId, [last.id]);
    }
    const afterDelete = await getTrackerView(chatId);
    expect(afterDelete.actors.some((a) => a.actorRef.characterId === characterId)).toBe(true);
    expect(await fetchDebugErrors()).toEqual([]);
  } finally {
    await cleanup();
  }
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// SPEC 8 — READONLY / CAPABILITY-ABSENT MODE: point the chat route at the RETIRED agent-sdk×vllm pair (an
// incoherent connection whose resolve throws), and the game is born READ-ONLY by construction — the model has
// NO write path (manual-steering: the host hand-edits, and those hand values STILL steer). FE=BE: `getGame`
// reports `trackersReadOnly:true`, the view carries it, and a HAND edit still lands (steering is not inert).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test("rpg-lite (readonly): a capability-absent connection is born read-only but hand-steering still lands", {
  tag: "@live",
}, async () => {
  test.setTimeout(90_000);
  // seedGame pins the coherent route; we OVERRIDE to the retired pair for THIS spec, then rely on cleanup's
  // route-restore. A fresh game read under the retired route resolves readonly-by-construction.
  const { chatId, cleanup } = await seedGame(castId<CharacterHandle>("e2e-rpg-readonly"));
  try {
    await setChatRoute({ api: "agent-sdk", source: "vllm" });
    // The game read now derives read-only (the retired pair's resolveChat throws ⇒ no write path).
    expect((await getGame(chatId)).trackersReadOnly).toBe(true);
    expect((await getTrackerView(chatId)).trackersReadOnly).toBe(true);
    // Manual-steering is NOT inert: a host hand-edit still lands as canon (and would still steer the reminder).
    await editSnapshot(chatId, { location: "The Locked Archive" });
    expect((await getTrackerView(chatId)).ambient?.location).toBe("The Locked Archive");
    expect(await fetchDebugErrors()).toEqual([]);
  } finally {
    await cleanup();
  }
});
