// E2E — the HUB gap: SAME user, TWO tabs, BOTH INSIDE THE SAME ROOM. multi-tab-sync.spec.ts deliberately
// stays LIST-only (its header explains why: orb has no `/chat/$id` URL, so a room can't be deep-linked),
// which left IN-ROOM cross-tab sync — the per-chat bus fan, the thing a second device actually depends on
// — verified nowhere. This spec closes that: two pages in ONE browser context (same session) each open the
// SAME chat by clicking its list row, then a mutation in tab A must reach tab B's OPEN ROOM live, with no
// reload and no user gesture in B.
//
// The two tabs are genuinely independent subscribers: each holds its own `chat.streamMessages` SSE and its
// own QueryClient (staleTime Infinity + refetchOnWindowFocus off — the bus is the ONLY freshness driver),
// so a passive tab that updates can only have done so off the bus. That is exactly what makes these
// assertions load-bearing: if the bus fan regresses, multi-device divergence is SILENT.
//
// Split by cost: membership + config sync are DETERMINISTIC (model-free roster/metadata writes); the
// transcript/turn fan needs a real turn and is tagged `@live` (local vLLM, zero hosted spend), honest-bail
// (early return + annotation, never `test.skip(cond, …)`) if the stack has no local backend.
//
// Self-seeded: spec-owned characters (unique handles + display names) and a uniquely-titled chat, torn
// down in a finally — never `listChats()[0]` on the shared DB.

import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import {
  assistantRows,
  castChipNames,
  castChips,
  openChatByTitle,
  openContextTab,
  openDetailPanel,
  openGroupBehaviorSection,
  openMemberRowMenu,
  typeAndSend,
} from "./support/chat-room";
import { assistantTurns, characterSeats, deleteChat, getGroupConfig, mintFreshCharacter, removeCharacter, startGroupChat } from "./support/trpc";

const CAST = [
  { handle: "e2e-hub-alpha", name: "Hubspec Alpha" },
  { handle: "e2e-hub-bravo", name: "Hubspec Bravo" },
  { handle: "e2e-hub-cirrus", name: "Hubspec Cirrus" },
] as const;

const LIVE_TIMEOUT_MS = 180_000;

/** The composer's in-flight Stop affordance (composer.tsx) — present for the whole turn, and only gone once
 *  the bus's turnCompleted/turnAborted closes the slot. Both label states, since it spins while stopping. */
const STOP_AFFORDANCE = /^(Stop generating|Stopping…)$/u;

interface Room {
  readonly chatId: string;
  readonly characterIds: readonly string[];
  readonly title: string;
}

/** Seed the room the two tabs will share: `count` spec-owned characters, `opening: "none"` (empty canon),
 *  a unique title so a list-row locator can only match this chat. */
async function seedRoom(label: string, count: number, groupConfig?: Record<string, unknown>): Promise<Room> {
  const characterIds: string[] = [];
  for (const member of CAST.slice(0, count)) {
    // biome-ignore lint/performance/noAwaitInLoops: mintFreshCharacter re-mints by handle (remove-then-create) — a parallel fan would race the same handle.
    characterIds.push(await mintFreshCharacter(member.handle, member.name, `${member.name} greeting.`));
  }
  const title = `e2e-hub-${label}-${Date.now()}`;
  // The founding cast is the first two; any extra minted character is the one tab A will SEAT mid-test.
  const chat = await startGroupChat({ characterIds: characterIds.slice(0, 2), title, ...(groupConfig === undefined ? {} : { groupConfig }) });
  return { chatId: chat.id, characterIds, title };
}

async function teardown(room: Room): Promise<void> {
  await deleteChat(room.chatId).catch(() => null);
  for (const id of room.characterIds) {
    // biome-ignore lint/performance/noAwaitInLoops: teardown is a best-effort sequence; a parallel fan would hide which removal failed.
    await removeCharacter(id).catch(() => null);
  }
}

/** Put a page INSIDE the room and wait until its own chat-bus subscription is observably live — otherwise
 *  a mutation fired from the sibling tab can land before this tab is subscribed and the assertion races. */
async function joinRoom(page: Page, title: string): Promise<void> {
  await openChatByTitle(page, title);
  await expect(castChips(page).first()).toBeVisible({ timeout: 15_000 });
}

test("a roster change in tab A reaches tab B's open room live (seat added, then removed)", async ({ browser }) => {
  const room = await seedRoom("roster", 3);
  const ctx = await browser.newContext();
  try {
    const tabA = await ctx.newPage();
    const tabB = await ctx.newPage();
    await joinRoom(tabA, room.title);
    await joinRoom(tabB, room.title);
    expect(await castChipNames(tabB)).toHaveLength(2);

    // Tab A seats the third character through the cast bar's own affordance (the only committed-room
    // add-member path) — a REAL user gesture, not an API poke. Tab A must be the FOREGROUND tab for it:
    // the picker is an anchored Popover, and an anchored layer in a backgrounded page never settles open
    // (Base UI dismisses on the window's focus loss). That is also the honest scenario — the human acts in
    // the tab they are looking at; tab B's passivity is the property under test, not tab A's.
    await tabA.bringToFront();
    await tabA.getByRole("button", { name: "Add a character", exact: true }).click();
    await tabA.getByRole("option", { name: CAST[2].name, exact: true }).click();
    await expect.poll(async () => (await castChipNames(tabA)).length, { timeout: 15_000 }).toBe(3);

    // THE load-bearing assertion: tab B never touched anything, yet its OPEN ROOM shows the new member.
    await expect.poll(async () => (await castChipNames(tabB)).length, { timeout: 15_000 }).toBe(3);
    expect(await castChipNames(tabB)).toContain(CAST[2].name);

    // …and the symmetric drop fans the same way (the seat leaves B's room with no reload).
    await openDetailPanel(tabA);
    await openContextTab(tabA, "Members");
    await openMemberRowMenu(tabA, CAST[2].name);
    await tabA.getByRole("menuitem", { name: `Remove ${CAST[2].name} from chat` }).click();

    await expect.poll(async () => (await characterSeats(room.chatId)).length, { timeout: 15_000 }).toBe(2);
    await expect.poll(async () => (await castChipNames(tabB)).length, { timeout: 15_000 }).toBe(2);
    expect(await castChipNames(tabB)).not.toContain(CAST[2].name);
  } finally {
    await ctx.close();
    await teardown(room);
  }
});

test("a group-config change in tab A reaches tab B's open Group-behavior section live", async ({ browser }) => {
  const room = await seedRoom("config", 2);
  const ctx = await browser.newContext();
  try {
    const tabA = await ctx.newPage();
    const tabB = await ctx.newPage();
    await joinRoom(tabA, room.title);
    await joinRoom(tabB, room.title);
    // BOTH tabs sit on the "This chat" tab's Group-behavior section (the panel-redesign home of the former
    // Group tab), so B's `chat.getGroupConfig` read is already mounted and cached — the only thing that can
    // refresh it is a bus-driven invalidation.
    for (const tab of [tabA, tabB]) {
      // biome-ignore lint/performance/noAwaitInLoops: the two tabs open their panels sequentially so a failure names the tab that failed.
      await openDetailPanel(tab);
      await openGroupBehaviorSection(tab);
    }
    await expect(tabB.getByRole("button", { name: "Per-speaker", exact: true })).toHaveAttribute("aria-pressed", "true");

    await tabA.getByRole("button", { name: "Narrator", exact: true }).click();
    // The write really landed (so a red below is a SYNC failure, never a lost write).
    await expect.poll(async () => (await getGroupConfig(room.chatId)).output, { timeout: 20_000 }).toBe("narrator");

    // THE load-bearing assertion: tab B's open Group-behavior section re-reads the room's behavior off the bus.
    await expect(tabB.getByRole("button", { name: "Narrator", exact: true })).toHaveAttribute("aria-pressed", "true", { timeout: 15_000 });
  } finally {
    await ctx.close();
    await teardown(room);
  }
});

test("a turn driven in tab A streams into tab B's open transcript", { tag: "@live" }, async ({ browser }) => {
  test.setTimeout(LIVE_TIMEOUT_MS);
  // `list` policy pins the round to EXACTLY the two seated characters, in roster order — so the teardown
  // gate below knows precisely how many rows the round owes before the room is quiescent.
  const room = await seedRoom("turn", 2, { output: "per-speaker", policy: "list" });
  const ctx = await browser.newContext();
  try {
    const tabA = await ctx.newPage();
    const tabB = await ctx.newPage();
    await joinRoom(tabA, room.title);
    await joinRoom(tabB, room.title);
    expect(await assistantRows(tabB).count()).toBe(0);

    // A unique body so `getByText` in tab B is unambiguous proof it received THIS message.
    const probe = `hub-probe-${Date.now()}`;
    await typeAndSend(tabA.getByRole("textbox", { name: "Message" }), probe);

    // The human line fans first (persistUserMessage emits `messageCommitted` before the AI round runs)…
    await expect(tabB.getByText(probe).first()).toBeVisible({ timeout: 30_000 });
    // …and then the character's turn lands in the passive tab's transcript too.
    await expect.poll(async () => assistantRows(tabB).count(), { timeout: 120_000 }).toBeGreaterThanOrEqual(1);

    // Let the WHOLE round finish before teardown. An assistant ROW in the DOM appears while the reply is
    // still streaming, and tearing the room down mid-round makes the next `delta` chat_events insert violate
    // its chatId FK — which crashes the dev server outright (an unhandled rejection, observed 2026-07-25;
    // reported as a separate robustness finding). Two gates, because the round owes TWO speakers: every row
    // is durable in canon, AND tab A's Stop affordance has closed (it stays up until the bus's
    // turnCompleted/turnAborted lands, so its absence is the honest "nothing is in flight" signal).
    await expect.poll(async () => (await assistantTurns(room.chatId)).length, { timeout: 120_000 }).toBe(2);
    await expect(tabA.getByRole("button", { name: STOP_AFFORDANCE })).toHaveCount(0, { timeout: 60_000 });
  } finally {
    await ctx.close();
    await teardown(room);
  }
});
