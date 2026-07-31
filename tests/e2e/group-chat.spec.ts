// E2E — GROUP CHAT mechanics, DETERMINISTIC (zero model turns, runs in the normal lane). Group chat had
// no e2e coverage at all before this file; the arbitration ENGINE is pure + exhaustively unit-tested
// (tests/server/domain/chat/engine/select-speakers.test.ts), so this spec deliberately tests the OTHER
// half — the mechanics that need no generation and that a unit test cannot reach:
//   1. a solo room CONVERTS to a group (the roster-size-gated group surfaces appear live, off the bus),
//   2. the add/remove roster verbs move the real roster (remove is the newly-wired `removeCharacterFromChat`),
//   3. the group config actually PERSISTS what the Group-behavior section shows (the "lying setting" class: a control
//      that flips in the DOM, never reaches `chats.metadata.group`, and reads back stale after a reload),
//   4. seat knobs (mute · talkativeness) persist PER SEAT.
// Every assertion's ground truth is the SERVER (`chat.getGroupConfig` / `chat.getChat` over the tRPC
// helpers) — the DOM is only ever the second witness, and nothing here pins layout or geometry.
//
// SELF-SEEDING: the DB is shared, so each test mints its OWN characters (unique handles + unique display
// names, so a role/name locator is unambiguous) and its OWN uniquely-titled chat, then removes the
// characters in a finally (removing a character takes its chats with it). `opening: "none"` seeds NO
// greeting rows, so the canon starts genuinely empty.
//
// The group surfaces are roster-size-gated BY CONSTRUCTION (chats-section.tsx): the Cast bar renders only
// above 1 character (chat-cast-bar.tsx), the Members tab only when the cast justifies it (lib/roster.ts
// `membersTabJustified`), the group-behavior controls only for a host of a >1-character room. So asserting
// their PRESENCE/ABSENCE is a statement about the ROSTER, not about pixels.
//
// IA NOTE (panel-redesign consolidation — this spec's pre-consolidation "Group TAB" pins are updated, not
// dodged): the standalone Group tab is GONE. Its whole body is now the host+group-gated "Group behavior"
// SECTION of the ONE "This chat" tab (settings-context-tab.tsx), so the roster gate that used to add/remove
// a TAB now adds/removes a SECTION — same behavior, same `showGroup` predicate, one less tab. Every control
// below (Narrator · Label each speaker · Advanced · the policy/visibility selects) is byte-identical; only
// the navigation to them changed (`openGroupBehaviorSection`).

import { expect, test } from "@playwright/test";
import { castChipNames, castChips, openChatByTitle, openContextTab, openDetailPanel, openGroupBehaviorSection, openMemberRowMenu } from "./support/chat-room";
import type { RosterSeat } from "./support/trpc";
import {
  addCharacterToChat,
  characterSeats,
  deleteChat,
  getChatDetail,
  getGroupConfig,
  mintFreshCharacter,
  removeCharacter,
  startGroupChat,
} from "./support/trpc";

/** A spec-owned cast: unique handles (idempotent re-mint across crashed runs) + unique DISPLAY names, so a
 *  `getByRole(..., { name })` locator can never collide with a seeded library card. */
const CAST = [
  { handle: "e2e-group-alpha", name: "Groupspec Alpha" },
  { handle: "e2e-group-bravo", name: "Groupspec Bravo" },
] as const;

interface SeededCast {
  readonly characterIds: readonly string[];
  readonly cleanup: () => Promise<void>;
}

async function mintCast(count: number): Promise<SeededCast> {
  const chosen = CAST.slice(0, count);
  const characterIds: string[] = [];
  for (const member of chosen) {
    // biome-ignore lint/performance/noAwaitInLoops: mintFreshCharacter re-mints by handle (remove-then-create) — concurrent mints would race the same handle.
    characterIds.push(await mintFreshCharacter(member.handle, member.name, `${member.name} greeting.`));
  }
  return {
    characterIds,
    cleanup: async (): Promise<void> => {
      for (const id of characterIds) {
        // biome-ignore lint/performance/noAwaitInLoops: teardown is a best-effort sequence; a parallel fan would hide which removal failed.
        await removeCharacter(id).catch(() => null);
      }
    },
  };
}

/** The room's PRESENT character seat for one character (the roster read is present-only, so a removed
 *  member is simply absent). */
function seatFor(seats: readonly RosterSeat[], characterId: string): RosterSeat | undefined {
  return seats.find((s) => s.characterId === characterId);
}

test("a solo room converts to a group: the cast bar, the Members tab and the Group-behavior section appear live when a second character joins", async ({
  page,
}) => {
  const cast = await mintCast(2);
  const title = `e2e-group-convert-${Date.now()}`;
  const chat = await startGroupChat({ characterIds: [cast.characterIds[0] ?? ""], title });
  try {
    await openChatByTitle(page, title);
    await openDetailPanel(page);

    // SOLO: one character ⇒ no cast bar, no Members tab, and the "This chat" tab carries NO Group-behavior
    // section (the `showGroup` gate is the same roster predicate the old Group TAB's `when` was).
    expect(await castChips(page).count()).toBe(0);
    await expect(page.getByRole("tab", { name: "Members", exact: true })).toHaveCount(0);
    await openContextTab(page, "This chat");
    await expect(page.getByRole("heading", { name: "Group behavior" })).toHaveCount(0);

    // The conversion itself — the server-side seat insert; the open room must learn about it off the
    // chat bus (`chatUpdated` → getChat refetch), with NO reload.
    await addCharacterToChat(chat.id, cast.characterIds[1] ?? "");

    await expect.poll(async () => (await castChipNames(page)).length, { timeout: 15_000 }).toBe(2);
    expect(await castChipNames(page)).toEqual(expect.arrayContaining([CAST[0].name, CAST[1].name]));
    await expect(page.getByRole("tab", { name: "Members", exact: true })).toBeVisible({ timeout: 10_000 });
    // …and the group-behavior controls arrive with it, live, inside the "This chat" tab.
    await openGroupBehaviorSection(page);

    // The roster is really two present character seats server-side, not just two chips.
    expect((await characterSeats(chat.id)).map((s) => s.displayName)).toEqual([CAST[0].name, CAST[1].name]);
  } finally {
    await deleteChat(chat.id).catch(() => null);
    await cast.cleanup();
  }
});

test("removing a character through the Members row menu drops the seat server-side and shrinks the room back to solo", async ({ page }) => {
  const cast = await mintCast(2);
  const title = `e2e-group-remove-${Date.now()}`;
  const chat = await startGroupChat({ characterIds: cast.characterIds, title });
  try {
    await openChatByTitle(page, title);
    await openDetailPanel(page);
    await openContextTab(page, "Members");

    // The newly-wired `removeCharacterFromChat`, driven through its ONE user-facing affordance.
    await openMemberRowMenu(page, CAST[1].name);
    await page.getByRole("menuitem", { name: `Remove ${CAST[1].name} from chat` }).click();

    // Server truth first: the seat is gone from the PRESENT roster (leftSeq-stamped out).
    await expect.poll(async () => (await characterSeats(chat.id)).map((s) => s.displayName), { timeout: 15_000 }).toEqual([CAST[0].name]);
    // …and the room re-reads it: back below the group floor, so the cast bar unmounts.
    await expect.poll(async () => castChips(page).count(), { timeout: 15_000 }).toBe(0);
  } finally {
    await deleteChat(chat.id).catch(() => null);
    await cast.cleanup();
  }
});

test("group config round-trips through the Group-behavior section: output / speaker tags / policy / card visibility persist and survive a reload", async ({
  page,
}) => {
  const cast = await mintCast(2);
  const title = `e2e-group-config-${Date.now()}`;
  const chat = await startGroupChat({ characterIds: cast.characterIds, title });
  try {
    // The starting point is the canonical default (per-speaker × natural × sheet) — so every flip below is
    // a real change, not a coincidental match.
    const before = await getGroupConfig(chat.id);
    expect(before.output).toBe("per-speaker");
    expect(before.policy).toBe("natural");

    await openChatByTitle(page, title);
    await openDetailPanel(page);
    await openGroupBehaviorSection(page);

    // `output` is the union DISCRIMINATOR — flipping it re-derives the coupled speakerTags default
    // (narrator ⇒ true), so the speakerTags flip comes AFTER, and lands on `false`.
    await page.getByRole("button", { name: "Narrator", exact: true }).click();
    await page.getByRole("switch", { name: "Label each speaker" }).click();
    await page.getByRole("button", { name: "Advanced", exact: true }).click();
    await page.getByRole("combobox", { name: "Who speaks each round" }).click();
    await page.getByRole("option", { name: "Round-robin", exact: true }).click();
    await page.getByRole("combobox", { name: "How much of each member the others see" }).click();
    await page.getByRole("option", { name: "Full card", exact: true }).click();

    // THE ANTI-LYING-SETTING ASSERTION: every flip must have reached `chats.metadata.group`. The form
    // autosaves on a debounce, so poll the SERVER read rather than racing the write.
    await expect
      .poll(
        async () => {
          const config = await getGroupConfig(chat.id);
          return { output: config.output, policy: config.policy, speakerTags: config.speakerTags, visibility: config.memberCardVisibility };
        },
        { timeout: 20_000 },
      )
      .toEqual({ output: "narrator", policy: "pooled", speakerTags: false, visibility: "full" });
    // The narrator arm carries NO cardScope (the narrator ⇒ merged constraint is unrepresentable, not
    // merely unset) — proof the whole DISCRIMINATED UNION was rewritten, not one field patched.
    expect((await getGroupConfig(chat.id)).cardScope).toBeUndefined();

    // …and the tab RE-READS it after a full reload (the other half of the lying-setting class: persisted
    // but never re-hydrated).
    await page.reload();
    await openChatByTitle(page, title);
    await openDetailPanel(page);
    await openGroupBehaviorSection(page);
    await expect(page.getByRole("button", { name: "Narrator", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("switch", { name: "Label each speaker" })).toHaveAttribute("aria-checked", "false");
  } finally {
    await deleteChat(chat.id).catch(() => null);
    await cast.cleanup();
  }
});

test("per-speaker card scope persists: scoping each character to their own card round-trips through the Group-behavior section", async ({ page }) => {
  const cast = await mintCast(2);
  const title = `e2e-group-scope-${Date.now()}`;
  const chat = await startGroupChat({ characterIds: cast.characterIds, title });
  try {
    expect((await getGroupConfig(chat.id)).cardScope).toBe("merged");

    await openChatByTitle(page, title);
    await openDetailPanel(page);
    await openGroupBehaviorSection(page);
    // `cardScope` is per-speaker-ONLY, so its control exists only on that arm (the default) — under
    // Advanced, beside the policy select.
    await page.getByRole("button", { name: "Advanced", exact: true }).click();
    await page.getByRole("switch", { name: "Each character sees only their own card" }).click();

    await expect.poll(async () => (await getGroupConfig(chat.id)).cardScope, { timeout: 20_000 }).toBe("scoped");

    await page.reload();
    await openChatByTitle(page, title);
    await openDetailPanel(page);
    await openGroupBehaviorSection(page);
    await page.getByRole("button", { name: "Advanced", exact: true }).click();
    await expect(page.getByRole("switch", { name: "Each character sees only their own card" })).toHaveAttribute("aria-checked", "true");
  } finally {
    await deleteChat(chat.id).catch(() => null);
    await cast.cleanup();
  }
});

test("seat knobs are per-seat: muting one member and re-weighting another persist independently", async ({ page }) => {
  const cast = await mintCast(2);
  const title = `e2e-group-seats-${Date.now()}`;
  const chat = await startGroupChat({ characterIds: cast.characterIds, title });
  const [alphaId, bravoId] = [cast.characterIds[0] ?? "", cast.characterIds[1] ?? ""];
  try {
    const seeded = await characterSeats(chat.id);
    const baselineWeight = seatFor(seeded, alphaId)?.talkativeness ?? 0;
    expect(baselineWeight).toBeGreaterThan(0);

    await openChatByTitle(page, title);
    await openDetailPanel(page);
    await openContextTab(page, "Members");

    // Mute BRAVO through the row menu (the canonical action home).
    await openMemberRowMenu(page, CAST[1].name);
    await page.getByRole("menuitem", { name: `Mute ${CAST[1].name}` }).click();
    // Base UI keeps a CLOSING popup mounted (and in the a11y tree) through its exit animation, so opening
    // the next row's menu back-to-back leaves BRAVO's dying menu and ALPHA's live one both matchable — a
    // strict-mode collision, not an app defect. Gate on the first menu actually being gone.
    await expect(page.getByRole("menuitem", { name: "Talkativeness…" })).toHaveCount(0);

    // Re-weight ALPHA through the anchored talkativeness slider. Base UI commits a KEYBOARD adjustment via
    // `onValueCommitted`, one step per ArrowLeft (step 0.05) — `Home`/`End` do NOT move the underlying
    // range input in this build, verified live, so the arrow is the honest gesture.
    await openMemberRowMenu(page, CAST[0].name);
    await page.getByRole("menuitem", { name: "Talkativeness…" }).click();
    const slider = page.getByRole("slider", { name: `Talkativeness: ${CAST[0].name}` });
    await expect(slider).toBeVisible({ timeout: 10_000 });
    await slider.press("ArrowLeft");
    await slider.press("ArrowLeft");

    // Both knobs land on their OWN seat and neither bleeds into the other: ALPHA got lighter but stayed
    // unmuted, BRAVO got muted at its untouched default weight.
    await expect.poll(async () => seatFor(await characterSeats(chat.id), alphaId)?.talkativeness ?? null, { timeout: 20_000 }).toBeLessThan(baselineWeight);
    const knobbed = await characterSeats(chat.id);
    expect(seatFor(knobbed, alphaId)?.disabled).toBe(false);
    expect(seatFor(knobbed, bravoId)?.disabled).toBe(true);
    expect(seatFor(knobbed, bravoId)?.talkativeness).toBe(baselineWeight);
    const alphaWeight = seatFor(knobbed, alphaId)?.talkativeness ?? null;

    // The room re-reads BOTH after a reload (the roster is DB truth, not session state).
    await page.reload();
    await openChatByTitle(page, title);
    await openDetailPanel(page);
    await openContextTab(page, "Members");
    await expect(page.getByRole("button", { name: `Actions for ${CAST[1].name}`, exact: true })).toBeVisible({ timeout: 15_000 });
    const persisted = (await getChatDetail(chat.id)).participants;
    expect(seatFor(persisted, bravoId)?.disabled).toBe(true);
    expect(seatFor(persisted, alphaId)?.talkativeness).toBe(alphaWeight);
    // The muted seat is legible as muted in the row's accessible NAME (member-rows.ts `rowAccessibleName`).
    await expect(page.getByRole("button", { name: `${CAST[1].name} — character, muted` })).toBeVisible({ timeout: 10_000 });
  } finally {
    await deleteChat(chat.id).catch(() => null);
    await cast.cleanup();
  }
});
