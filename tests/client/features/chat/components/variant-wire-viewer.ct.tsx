// CT: RAWVIEW — the HOST-only per-variant wire inspector, driven through its REAL graft point. WIREBTN moved
// that graft point (owner nit, 2026-08-03): the trigger was a lone quiet button on the message METADATA row
// and is now a "View wire trace…" item in the message KEBAB (D62 §12 — the ⋯ menu is the action home), so
// this CT mounts the whole `MessageRow` and reaches the inspector the way a host actually does.
//
// The load-bearing behaviors are all at that seam, not inside the dialog:
//   1. THE HOST GATE. A non-host viewer must not get the item at all — the read is `requireHost` server-side,
//      so a visible item for a member would be an affordance that only ever refuses, and it would advertise a
//      plane they cannot have. This pin is the client half of the two-belt gate; the server half (member ⇒
//      not_host, stranger ⇒ NOT_FOUND, foreign variantId ⇒ NOT_FOUND) is pinned in
//      tests/server/domain/chat/verbs/read.int.test.ts.
//   2. THE FETCH GATE. `chat.getVariantWire` returns a full assembled prompt — every member's content, the
//      room's hidden spans, every card at full fidelity. It must NOT be fetched per rendered row on mount;
//      the key is built only when the host opens the dialog (`enabled: open`). If that ever loosens, every
//      transcript render would pull the whole host plane down the wire for rows nobody asked about.
//   3. THE HOME. The metadata row is DATA ONLY — it must carry no wire affordance, for a host or anyone else.
// Plus the honest-absence arms: a variant that captured nothing, and a deleted row (NOT_FOUND), each say so
// rather than rendering a blank panel.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import { MESSAGE_ACTIONS_MENU_NAME } from "../../../../../packages/client/src/features/chat/lib/message-action-names.ts";
import { routeTrpc, trpcError } from "../../../../support/node/route-trpc.ts";
import { MessageRowStory } from "../_ct-stories.tsx";
import { CHAT_AMBIENT_ROUTES, CHAT_ROOM_ROUTES } from "../fixtures.ts";

const WIRE_PROC = "chat.getVariantWire";
const WIRE_ITEM = "View wire trace…";
const MENU_TRIGGER = MESSAGE_ACTIONS_MENU_NAME;

/** Only the token datum on — the wire item is gated by AUTHORITY, not by an appearance toggle, so the row
 *  keeps one ordinary metadata datum beside it (the datum that proves the metadata row still renders, and
 *  renders nothing EXTRA, after the move). It used to be the MODEL datum; #167 moved that credit out of
 *  the metadata row into the action cluster, so tokens is the ordinary datum this row still owns. */
const WIRE_STORY_VISIBILITY = {
  showTimestamps: false,
  showMessageId: false,
  showModelIcon: false,
  showTokenCount: true,
  showGenerationTimer: false,
  showGenerationCost: false,
} as const;

const WIRE_DATA = {
  variantId: "mv_ct_1",
  prompt: {
    static: "SYSTEM: you are Aria.\nCARD: Aria is a locksmith.",
    dynamic: 'STEER: raise the stakes.\n<lie character="Z" truth="he is the traitor"/>',
    sendHistory: true,
    afterHistory: [{ position: "in_chat", depth: 0, role: "system", content: "keep it terse" }],
  },
  params: { temperature: 0.7 },
  macroDraws: null,
  rawContent: null,
  macroFreezes: null,
};

/** The FREEZE-PROVENANCE arms (#1032) — the three fields the dialog never destructured. Kept separate from
 *  `WIRE_DATA` so the default stub stays the "nothing nondeterministic happened" case and each pin opts in. */
const WIRE_DATA_WITH_PROVENANCE = {
  ...WIRE_DATA,
  macroDraws: { mood: { tone: "grim" } },
  macroFreezes: [
    { name: "roll", args: "2d6", value: "7" },
    { name: "time", value: "dusk" },
  ],
  rawContent: "The dice said {{roll::2d6}} and it was {{time}}.",
};

/** The A3 action cluster rests `opacity-0 pointer-events-none` and reveals on hover/focus-within; these
 *  tests care about the wire seam, not the CSS variant, so they force the revealed+interactive state inline
 *  (the `message-actions-row.ct` precedent — `pointer-events` too, or the rest state swallows the click). */
async function openActionsMenu(component: Locator): Promise<void> {
  await component.locator("[data-slot='message-actions-row']").evaluate((el: HTMLElement) => {
    el.style.opacity = "1";
    el.style.pointerEvents = "auto";
  });
  await component.getByRole("button", { name: MENU_TRIGGER }).click();
}

/** Menu items portal to the page body — resolve them off the page, never the component root. */
function menuItem(page: Page, name: string): Locator {
  return page.getByRole("menuitem", { name });
}

test("a NON-HOST viewer gets no wire item at all — the host-only plane is never advertised", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, [WIRE_PROC]: () => WIRE_DATA });
  const component = await mount(<MessageRowStory chatStyle="bubble" metadataVisibility={WIRE_STORY_VISIBILITY} viewerIsHost={false} />);

  // The ordinary member-plane datum still renders — nothing about the row is suppressed, only the host arm.
  await expect(component.locator('[data-slot="message-metadata-tokens"]')).toHaveText("128 tok");
  await openActionsMenu(component);
  await expect(menuItem(page, WIRE_ITEM)).toHaveCount(0);
  await expect.poll(() => trpc.count(WIRE_PROC)).toBe(0);
});

test("the HOST gets the kebab item, but NO fetch fires until it is opened", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, [WIRE_PROC]: () => WIRE_DATA });
  const component = await mount(<MessageRowStory chatStyle="bubble" metadataVisibility={WIRE_STORY_VISIBILITY} viewerIsHost={true} />);

  await openActionsMenu(component);
  await expect(menuItem(page, WIRE_ITEM)).toBeVisible();
  // The whole point of the gate: a rendered transcript must not pull the host plane for every row.
  await expect.poll(() => trpc.count(WIRE_PROC)).toBe(0);
});

test("WIREBTN — the METADATA row carries no wire affordance, even for the host (it is data only now)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, [WIRE_PROC]: () => WIRE_DATA });
  const component = await mount(<MessageRowStory chatStyle="bubble" metadataVisibility={WIRE_STORY_VISIBILITY} viewerIsHost={true} />);

  const metadataRow = component.locator('[data-slot="message-metadata-row"]');
  await expect(metadataRow).toBeVisible();
  // The row renders its DATUM and nothing else — no button of any kind, and specifically not the old
  // orphaned trigger (whose accessible name was "Show what this reply sent").
  await expect(metadataRow.getByRole("button")).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Show what this reply sent" })).toHaveCount(0);
});

test("opening fires exactly one fetch keyed by the shown swipe's variantId and renders both prompt halves", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, [WIRE_PROC]: () => WIRE_DATA });
  const component = await mount(<MessageRowStory chatStyle="bubble" metadataVisibility={WIRE_STORY_VISIBILITY} viewerIsHost={true} />);

  await openActionsMenu(component);
  await menuItem(page, WIRE_ITEM).click();

  await expect.poll(() => trpc.count(WIRE_PROC), { intervals: [20, 50, 100] }).toBe(1);
  // Scoped to the SELECTED variant (the shown swipe), not the slot — a swipe has its own sent prompt.
  await expect.poll(() => trpc.lastInput(WIRE_PROC)).toMatchObject({ chatId: "chat_ct_keystone", variantId: "mv_ct_1" });

  const dialog = page.locator('[data-testid="variant-wire-viewer"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("CARD: Aria is a locksmith.");
  await expect(dialog).toContainText("STEER: raise the stakes.");
  // The host IS entitled to the hidden plane (§3.6 — the reveal eye), so the lie's truth is correctly here.
  await expect(dialog).toContainText("he is the traitor");
  await expect(dialog).toContainText("[system @ depth 0] keep it terse");
  await expect(dialog).toContainText("temperature");
});

// #1032 — the three recorded inputs the dialog served but never rendered. A host asking "why did it say
// THAT" of a nondeterministic turn got the prompt and the knobs and nothing about the roll that decided it.
test("the freeze provenance renders: the frozen draws, the baked volatile macros, and the pre-transform text", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, [WIRE_PROC]: () => WIRE_DATA_WITH_PROVENANCE });
  const component = await mount(<MessageRowStory chatStyle="bubble" metadataVisibility={WIRE_STORY_VISIBILITY} viewerIsHost={true} />);

  await openActionsMenu(component);
  await menuItem(page, WIRE_ITEM).click();
  const dialog = page.locator('[data-testid="variant-wire-viewer"]');

  // The DRAWS — macro → input → the value the turn actually drew (a swipe replays exactly this).
  await expect(dialog).toContainText("Frozen random draws (1)");
  await expect(dialog).toContainText("mood.tone = grim");
  // The FREEZES — occurrence-ordered, argument-carrying and argument-less both spelled honestly.
  await expect(dialog).toContainText("Frozen volatile macros (2)");
  await expect(dialog).toContainText("{{roll::2d6}} → 7");
  await expect(dialog).toContainText("{{time}} → dusk");
  // The RAW — the authored text before the transforms + the freeze rewrote it.
  await expect(dialog).toContainText("Authored text, before transforms");
  await expect(dialog).toContainText("The dice said {{roll::2d6}} and it was {{time}}.");
});

test("nothing nondeterministic happened: no draws/freezes/raw sections at all (absent, never an empty shell)", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, [WIRE_PROC]: () => WIRE_DATA });
  const component = await mount(<MessageRowStory chatStyle="bubble" metadataVisibility={WIRE_STORY_VISIBILITY} viewerIsHost={true} />);

  await openActionsMenu(component);
  await menuItem(page, WIRE_ITEM).click();
  const dialog = page.locator('[data-testid="variant-wire-viewer"]');
  // Settle on the arm that IS present before asserting the absences (never assert absence into a pending read).
  await expect(dialog).toContainText("Static prefix");
  await expect(dialog).not.toContainText("Frozen random draws");
  await expect(dialog).not.toContainText("Frozen volatile macros");
  await expect(dialog).not.toContainText("Authored text, before transforms");
});

// The greeting-swipe case the freeze record was minted FOR: a verbatim/greeting-seeded variant carries no
// prompt at all, and its freezes are the only record of what it rolled. Hiding them behind the prompt arm
// would blind exactly the case that motivated the column.
test("a variant with NO prompt still shows its freeze provenance beside the honest empty answer", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    [WIRE_PROC]: () => ({ ...WIRE_DATA_WITH_PROVENANCE, prompt: null, params: null }),
  });
  const component = await mount(<MessageRowStory chatStyle="bubble" metadataVisibility={WIRE_STORY_VISIBILITY} viewerIsHost={true} />);

  await openActionsMenu(component);
  await menuItem(page, WIRE_ITEM).click();
  const dialog = page.locator('[data-testid="variant-wire-viewer"]');
  await expect(dialog).toContainText("No prompt was captured for this reply");
  await expect(dialog).toContainText("{{roll::2d6}} → 7");
  await expect(dialog).toContainText("mood.tone = grim");
});

test("a variant that captured nothing says so — never a blank panel", async ({ mount, page }) => {
  await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...CHAT_ROOM_ROUTES,
    [WIRE_PROC]: () => ({ variantId: "mv_ct_1", prompt: null, params: null, macroDraws: null, rawContent: null, macroFreezes: null }),
  });
  const component = await mount(<MessageRowStory chatStyle="bubble" metadataVisibility={WIRE_STORY_VISIBILITY} viewerIsHost={true} />);

  await openActionsMenu(component);
  await menuItem(page, WIRE_ITEM).click();
  const dialog = page.locator('[data-testid="variant-wire-viewer"]');
  await expect(dialog).toContainText("No prompt was captured for this reply");
  // The pointer to where raw provider bytes actually live (the dev ring) — never a fake "not captured" arm
  // for columns that don't exist.
  await expect(dialog).toContainText("WIRE_CAPTURE");
});

test("a deleted row's NOT_FOUND is a typed gone-arm, not a retry spinner or a thrown boundary", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, [WIRE_PROC]: () => trpcError({ code: "NOT_FOUND" }) });
  const component = await mount(<MessageRowStory chatStyle="bubble" metadataVisibility={WIRE_STORY_VISIBILITY} viewerIsHost={true} />);

  await openActionsMenu(component);
  await menuItem(page, WIRE_ITEM).click();
  await expect(page.locator('[data-testid="variant-wire-viewer"]')).toContainText("This reply is gone");
});

test("a USER row offers no wire item even to the host — an authored message never generated a prompt", async ({ mount, page }) => {
  await routeTrpc(page, { ...CHAT_AMBIENT_ROUTES, ...CHAT_ROOM_ROUTES, [WIRE_PROC]: () => WIRE_DATA });
  const component = await mount(<MessageRowStory chatStyle="bubble" messageRole="user" metadataVisibility={WIRE_STORY_VISIBILITY} viewerIsHost={true} />);

  await openActionsMenu(component);
  await expect(menuItem(page, WIRE_ITEM)).toHaveCount(0);
});
