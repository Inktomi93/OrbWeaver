// E2E (LOCAL mode) — the MEMBERS TAB, RENDERED, from BOTH roles' browsers against ONE live two-human room.
// This closes the long-parked side-eye residue "Members tab capture needs the multi-user e2e stack": the
// surface had never been seen with two real accounts, so nobody had checked that the host's membership
// gestures are ABSENT for a member rather than merely inert.
//
// Two ISOLATED browser contexts (support/browser-actors.ts), each logged in through the real
// `POST /api/auth/login` form door — context A is the box owner (the room HOST), context B is the seeded
// `member`. Both open the SAME chat and the SAME context tab, so the two PNGs are a like-for-like diff.
//
// WHY NOT `snap --contexts 2` (the ordinary two-human pixels tool): it targets the multi-user FIXTURE
// stack, which reuses the SHARED dev ports 8788/5173 verbatim (tooling/src/snap/ops/fixture.ts) — so it is
// unusable while the operator's dev stack is up, and using it means stopping their box. This project's
// stack is genuinely isolated (own ports, own DB, `E2E_HARNESS=on`), so the pixels are taken here.
//
// RECEIPTS: reports/snaps/d22-members-tab-host.png + d22-members-tab-member.png (+ the D22 clamped card
// viewer, member-side). The assertions are the real check — a PNG proves nothing on its own — but the
// screenshots are the deliverable a human reviews.

import type { CharacterHandle, CharacterId, ChatId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/test";
import { STORY_SHOT_DIR } from "../support/node/story-shot.ts";
import type { ActorClient } from "./support/actors.ts";
import { addMemberToChat, loginLocal, ownerActor } from "./support/actors.ts";
import { openBrowserActor, openMembersTab } from "./support/browser-actors.ts";
import { LOCAL_MEMBER, LOCAL_OWNER } from "./support/modes.ts";

// The pointer-free story-shot family (#1201): `reports/snaps/` is the SNAP instrument's published
// alias, and a screenshot written there follows the symlink into a finished run's slot.
const SNAP_DIR = STORY_SHOT_DIR;
const MEMBERS_PANEL = "[data-testid=members-panel]";
const INVITE_BUTTON = "[data-testid=invite-people-button]";
const RENDER_TIMEOUT_MS = 20_000;
// Floors, not exact geometry: the docked context panel is a real column (~20rem) at the 1280×720 default
// viewport. Anything under these is a collapsed/undocked panel, which is the failure this guards.
const PANEL_MIN_WIDTH_PX = 200;
const PANEL_MIN_HEIGHT_PX = 200;
// THE PRESENCE CLAUSE IS PART OF THE NAME AND MAY OR MAY NOT BE THERE (#1039, `ff6f460b8`):
// `rowAccessibleName` (member-rows.ts) appends ", online"/", offline" — and NOTHING when the presence read
// has not resolved, which is its own honest third state. These four were `$`-anchored on the role clause and
// were never swept when that landed, so every one of them stopped matching against a live stack (#1851). The
// anchor is KEPT — dropping it would let ", nominated as host" or ", limited history" slip past a pin whose
// whole job is to say which state each viewer sees — and the optional clause is spelled out rather than
// wildcarded, so a fourth presence word would still red these.
const PRESENCE = "(?:, online|, offline)?";
const HOST_VIEWER_ROW = new RegExp(` — host, you${PRESENCE}$`, "u");
const MEMBER_ROW = new RegExp(` — member${PRESENCE}$`, "u");
const HOST_ROW = new RegExp(` — host${PRESENCE}$`, "u");
const MEMBER_VIEWER_ROW = new RegExp(` — member, you${PRESENCE}$`, "u");

interface CreatedCharacter {
  readonly id: CharacterId;
}
interface StartedChat {
  readonly chat: { readonly id: ChatId };
}

/** Two cast members so the Members tab screenshots a room with a real CAST LIST rather than a single row.
 *  (The ≥2-character floor that used to gate the Cast section — and the whole tab — died with #162: any room
 *  with a cast shows it, and a host always has the tab. Two seats is still the honest capture.) */
const CAST_A = {
  handle: "e2e-members-a",
  name: "Marisol",
  description: "Cartographer of the salt flats.",
  greetings: [{ text: "She looks up from the chart." }],
};
const CAST_B = {
  handle: "e2e-members-b",
  name: "Thornwick",
  description: "A traveller with mud on his boots.",
  greetings: [{ text: "He nods, once." }],
};
const CAST = [CAST_A, CAST_B];

async function freshCharacter(host: ActorClient, card: (typeof CAST)[number]): Promise<CharacterId> {
  const prior = await host.query<{ readonly items: readonly { readonly id: string; readonly handle: CharacterHandle }[] }>("character.list", {});
  const stale = prior.items.find((c) => c.handle === card.handle);
  if (stale !== undefined) {
    await host.mutation("character.remove", { characterId: stale.id });
  }
  const created = await host.mutation<CreatedCharacter>("character.create", { input: card });
  return created.id;
}

test("MEMBERS TAB: the same two-human room rendered as HOST and as MEMBER (host gestures absent for the member)", async ({ baseURL, browser }) => {
  test.setTimeout(180_000);
  const origin = baseURL ?? "";
  const api = ownerActor(origin);
  const characterIds: string[] = [];
  for (const card of CAST) {
    characterIds.push(await freshCharacter(api, card));
  }

  try {
    const started = await api.mutation<StartedChat>("chat.startChat", { characterIds });
    const chatId = started.chat.id;
    const memberApi = await loginLocal(origin, castId<Handle>(LOCAL_MEMBER.handle), LOCAL_MEMBER.password);
    await addMemberToChat(api, memberApi, chatId, LOCAL_MEMBER.handle);
    // A committed room (the Members tab's `phase === "committed"` arm) — the greeting alone leaves the chat
    // in its founding state on some paths, so plant one durable user row.
    await api.mutation("chat.commitMessage", { chatId, content: "Both of you, on me." });

    const hostView = await openBrowserActor(browser, origin, castId<Handle>(LOCAL_OWNER.handle), LOCAL_OWNER.password);
    const memberView = await openBrowserActor(browser, origin, castId<Handle>(LOCAL_MEMBER.handle), LOCAL_MEMBER.password);

    try {
      await openMembersTab(hostView.page, chatId);
      await openMembersTab(memberView.page, chatId);

      const hostPanel = hostView.page.locator(MEMBERS_PANEL);
      const memberPanel = memberView.page.locator(MEMBERS_PANEL);
      await hostPanel.waitFor({ state: "visible", timeout: RENDER_TIMEOUT_MS });
      await memberPanel.waitFor({ state: "visible", timeout: RENDER_TIMEOUT_MS });

      // GEOMETRY BARRIER — done ≠ rendered. A panel whose context drawer never docked still reports
      // `visible` and still yields innerText, but screenshots as a ~2KB sliver (this is exactly what the
      // first run produced). Assert the panel is actually laid out before trusting the pixels.
      for (const panel of [hostPanel, memberPanel]) {
        const box = await panel.boundingBox();
        expect(box?.width ?? 0).toBeGreaterThan(PANEL_MIN_WIDTH_PX);
        expect(box?.height ?? 0).toBeGreaterThan(PANEL_MIN_HEIGHT_PX);
      }

      // BOTH views list BOTH humans through their IN-ROOM identities — never raw login handles (#162).
      // Role + viewer state distinguishes the same persona name honestly in each viewer's panel.
      await expect(hostPanel.getByRole("button", { name: HOST_VIEWER_ROW })).toBeVisible();
      await expect(hostPanel.getByRole("button", { name: MEMBER_ROW })).toBeVisible();
      await expect(memberPanel.getByRole("button", { name: HOST_ROW })).toBeVisible();
      await expect(memberPanel.getByRole("button", { name: MEMBER_VIEWER_ROW })).toBeVisible();
      for (const panel of [hostPanel, memberPanel]) {
        const text = await panel.innerText();
        expect(text).toContain(CAST_A.name);
        expect(text).toContain(CAST_B.name);
      }

      // THE ASYMMETRY: the host's membership gestures are OMITTED for a member, not merely disabled — the
      // §8.1 permission-omit. `onInvitePeople`/`onKick`/`onNominateHost`/`onSetHistoryVisibility` are all
      // passed only when `isHost && multiHumanCapable`, and the invite button is their visible anchor.
      await expect(hostView.page.locator(INVITE_BUTTON)).toBeVisible();
      await expect(memberView.page.locator(INVITE_BUTTON)).toHaveCount(0);

      // RECEIPTS — the same surface, the same moment, two roles.
      await hostPanel.screenshot({ path: `${SNAP_DIR}/d22-members-tab-host.png` });
      await memberPanel.screenshot({ path: `${SNAP_DIR}/d22-members-tab-member.png` });
      await hostView.page.screenshot({ path: `${SNAP_DIR}/d22-members-room-host.png` });
      await memberView.page.screenshot({ path: `${SNAP_DIR}/d22-members-room-member.png` });
    } finally {
      await hostView.close();
      await memberView.close();
    }
  } finally {
    for (const characterId of characterIds) {
      await api.mutation("character.remove", { characterId });
    }
  }
});
