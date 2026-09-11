// CT: B3 — the REAL automation QUICK-REPLY CHIP source, end-to-end (interaction-direction-spec §7 row B3).
// Mirrors its source `packages/client/src/features/automation/components/quick-reply-chip-mount.tsx`.
//
// The band CT (`tests/client/features/chat/components/chat-controls-band.ct.tsx`) proves the S1 SEAM with a
// synthetic source; this proves the FIRST REAL member-visible consumer: `automationQuickReplySource`, appended
// to the `chat-controls` registry exactly as `authed-app.tsx` does it (the `AutomationChipsStory`, wired the
// door's way through the real band), fed a HAND-FIRED `quickReplySurfaced` frame on the automation room. So the
// whole path is exercised — socket frame → the client fold (`apply-quick-reply-event`) → the source's publish
// → the real band → a member's click — which is the ONLY place the arm's per-choice `sendText`/`mode` are
// proven to reach the click contract.
//
// Per the S1 hazards: the frame is served ONLY after the automation room has attached (a live-only room DROPS
// a frame for a room nobody joined — no replay to recover it), via a gate registered AFTER routeOrbSocket so
// it runs FIRST (LIFO). `route` is never `abort`ed here. Every assertion barriers on a SETTLED rendered state
// (the chip visible, the send recorded, the composer's value) — never a draft-state read.

import type { AutomationBusEvent } from "@orb/contracts/automation";
import type { ChatIdentity, GroupConfig } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { StreamFrame } from "@orb/contracts/stream";
import type { AutomationRuleId, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeOrbSocket } from "../../../../support/node/route-orb-socket.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { STREAM_MUTATION_ROUTES } from "../../../data/bus/fixtures.ts";
import { AutomationChipsStory } from "../../chat/_ct-stories.tsx";
import { CHAT_AMBIENT_ROUTES, CHAT_ID, makeMessagesPage, makeMessageView } from "../../chat/fixtures.ts";

const CHIPS = '[data-slot="chat-control-chips"]';
/** The attach handshake's poll ceiling — 200 × 25ms = 5s, expressed as a deterministic iteration count (no
 *  wall-clock read, so `test-determinism` stays green; the real deadline is playwright's own route timeout). */
const MAX_ATTACH_POLLS = 200;

/** The choice shape the arm surfaces — derived from the wire union, never re-spelled. */
type QuickReplyChoices = Extract<AutomationBusEvent, { type: "quickReplySurfaced" }>["choices"];

/** One live automation frame carrying the member-visible chips — the wire shape verbatim (`{ channel,
 *  chatId, event }`). Network-stubbed, so the ruleId is authored raw. */
function chipsFrame(choices: QuickReplyChoices): StreamFrame {
  const event: AutomationBusEvent = {
    type: "quickReplySurfaced",
    chatId: CHAT_ID,
    source: { kind: "rule", ruleId: castId<AutomationRuleId>("automationrule_ct_chip") },
    choices,
  };
  return { channel: "automation", chatId: CHAT_ID, event };
}

/** The room floor (the band CT's own `routeRoom`, plus the bus's attach mutations so `routeOrbSocket` owns the
 *  socket while the batched attaches still resolve), then the socket with an attach handshake gated on the
 *  AUTOMATION room specifically. */
async function routeRoom(
  page: Page,
  frames: readonly StreamFrame[],
): Promise<{ readonly count: (p: string) => number; readonly lastInput: (p: string) => unknown }> {
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...STREAM_MUTATION_ROUTES,
    "chat.previewContextFit": (): unknown => ({
      boundaryMessageId: null,
      usedTokens: 120,
      ceilingTokens: 32_768,
      ceilingEstimated: false,
      reserveOutputTokens: 2048,
      droppedCount: 0,
      compactSummary: null,
    }),
    "chat.getChat": (): { participants: never[]; anchorPersonaId: null; identities: readonly ChatIdentity[]; group: GroupConfig } => ({
      participants: [],
      anchorPersonaId: null,
      identities: [],
      group: DEFAULT_GROUP_CONFIG,
    }),
    "chat.listMessages": (): unknown =>
      makeMessagesPage([makeMessageView({ id: castId<MessageId>("msg_chip_room"), role: "assistant", content: "The corridor forks.", seq: 1 })]),
    "chat.send": (): unknown => ({ ok: true }),
  });
  // A gate registered AFTER routeOrbSocket runs FIRST (LIFO) — it holds the EventSource until the source has
  // joined its room, then falls through to routeOrbSocket, which serves the scripted frame.
  const socket = await routeOrbSocket(page, { frames });
  await page.route("**/api/trpc/**", async (route) => {
    if ((route.request().headers()["accept"] ?? "").includes("text/event-stream")) {
      for (let i = 0; i < MAX_ATTACH_POLLS && !socket.attachedChannels().some((key) => key.startsWith("automation:")); i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    await route.fallback();
  });
  return trpc;
}

test("a hand-fired quickReplySurfaced renders its choices as chips above the composer", async ({ mount, page }) => {
  await routeRoom(page, [
    chipsFrame([
      { label: "Draw your blade", sendText: "I draw my blade.", mode: "send" },
      { label: "Time skip", sendText: "Some hours later,", mode: "compose" },
    ]),
  ]);

  const component = await mount(<AutomationChipsStory />);

  // The room is really rendered (the discriminator) before the socket-driven chips are trusted.
  await expect(component.getByText("The corridor forks.")).toBeVisible();
  // The frame folded into two chips in the one row — the arm's labels, on the real band.
  await expect(component.getByRole("button", { name: "Draw your blade" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Time skip" })).toBeVisible();
  const chipsBox = await component.locator(CHIPS).boundingBox();
  const composerBox = await component.getByRole("textbox", { name: "Message" }).boundingBox();
  expect((chipsBox?.y ?? 0) + (chipsBox?.height ?? 0)).toBeLessThanOrEqual(composerBox?.y ?? 0);
});

test("send mode: clicking a chip posts the arm's rendered sendText as the member's turn", async ({ mount, page }) => {
  const trpc = await routeRoom(page, [chipsFrame([{ label: "Draw your blade", sendText: "I draw my blade.", mode: "send" }])]);

  const component = await mount(<AutomationChipsStory />);
  await component.getByRole("button", { name: "Draw your blade" }).click();

  await expect.poll(() => trpc.count("chat.send"), { intervals: [20, 50, 100] }).toBe(1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the poll settled the recorder — the send is recorded, so its input is a fixed value.
  expect((trpc.lastInput("chat.send") as { readonly content?: string }).content).toBe("I draw my blade.");
});

test("compose mode: clicking a chip seeds THIS room's composer draft and fires NO send", async ({ mount, page }) => {
  const trpc = await routeRoom(page, [chipsFrame([{ label: "Time skip", sendText: "Some hours later,", mode: "compose" }])]);

  const component = await mount(<AutomationChipsStory />);
  await component.getByRole("button", { name: "Time skip" }).click();

  const composer = component.getByRole("textbox", { name: "Message" });
  await expect(composer).toHaveValue("Some hours later,");
  await expect(composer).toBeFocused();
  // Settled snapshot: a negative about a synchronous click path whose full effect (the seeded draft + focus) has
  // already landed and is asserted web-first above — there is no later moment a send could appear.
  await expect.poll(async () => trpc.count("chat.send")).toBe(0);
});

// ── MOBILE: the chips stay IN-COLUMN at a phone width on a COARSE pointer (§3-S1 "in-column on mobile") ──
// The above-composer anchor is a ROOM-level contribution in the room's own flex column, so a chip must ride
// that column above the composer at a phone width — not spill to a flank or off-screen — and still be
// tappable. `hasTouch` flips `matchMedia("(pointer: coarse)")` (the first assertion proves the emulation
// landed before geometry is trusted — the `rpg-actor-trackers` precedent).
test.describe("coarse pointer, phone width", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 780 } });

  test("a surfaced chip rides the column above the composer and its send still fires", async ({ mount, page }) => {
    await expect.poll(() => page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
    const trpc = await routeRoom(page, [chipsFrame([{ label: "Draw your blade", sendText: "I draw my blade.", mode: "send" }])]);

    const component = await mount(<AutomationChipsStory />);
    const chip = component.getByRole("button", { name: "Draw your blade" });
    await expect(chip).toBeVisible();

    // IN-COLUMN: the chip row sits above the composer AND within its horizontal band (not pushed to a flank
    // or off the narrow viewport) — the two edges a single-column phone layout must keep.
    const chipBox = await component.locator(CHIPS).boundingBox();
    const composerBox = await component.getByRole("textbox", { name: "Message" }).boundingBox();
    expect((chipBox?.y ?? 0) + (chipBox?.height ?? 0)).toBeLessThanOrEqual(composerBox?.y ?? 0);
    expect(chipBox?.x ?? -1).toBeGreaterThanOrEqual(0);
    expect((chipBox?.x ?? 0) + (chipBox?.width ?? 0)).toBeLessThanOrEqual(390);

    // …and it is a live affordance at a real touch pointer, not just painted.
    await chip.click();
    await expect.poll(() => trpc.count("chat.send"), { intervals: [20, 50, 100] }).toBe(1);
  });
});
