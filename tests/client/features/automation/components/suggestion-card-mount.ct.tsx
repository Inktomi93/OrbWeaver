// CT: C3 — the REAL automation SUGGESTION-CARD source rendering a prose-audit REWRITE card, end to end
// (interaction-direction-spec §7 row C3). Mirrors its source
// `packages/client/src/features/automation/components/suggestion-card-mount.tsx`.
//
// It is the twin of the chips CT one seam over, and it proves the half no server test can: that the host-only
// `suggestionRaised` payload — summary + the C3 `detail` — becomes a card whose body is a COLLAPSED
// `@orb/ui/diff`, closed until the host opens it. The whole path runs: socket frame → the client fold
// (`apply-automation-bus-event`) → the source's publish → the real band → the disclosure.
//
// Per the S1 hazards: the frame is served ONLY after the automation room has attached (a live-only room DROPS
// a frame for a room nobody joined — there is no replay to recover it), via a gate registered AFTER
// routeOrbSocket so it runs FIRST (LIFO). Every assertion barriers on a SETTLED rendered state — the card
// visible, the panel's own visibility — never on a state that exists only mid-flight.

import type { AutomationBusEvent } from "@orb/contracts/automation";
import type { ChatIdentity, GroupConfig } from "@orb/contracts/chat";
import { DEFAULT_GROUP_CONFIG } from "@orb/contracts/chat";
import type { StreamFrame } from "@orb/contracts/stream";
import type { AutomationRuleId, AutomationSuggestionId, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeOrbSocket } from "../../../../support/node/route-orb-socket.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { STREAM_MUTATION_ROUTES } from "../../../data/bus/fixtures.ts";
import { AutomationSuggestionCardStory } from "../../chat/_ct-stories.tsx";
import { CHAT_AMBIENT_ROUTES, CHAT_ID, makeMessagesPage, makeMessageView } from "../../chat/fixtures.ts";

/** The attach handshake's poll ceiling — 200 × 25ms = 5s as a deterministic iteration count (no wall-clock
 *  read, so `test-determinism` stays green; the real deadline is playwright's own route timeout). */
const MAX_ATTACH_POLLS = 200;

/** The audited reply and the rewrite the audit offers — chosen so the diff has one clear removal and one
 *  clear addition at WORD granularity, which is what the card renders. */
const BEFORE = "The door was open. The door was open.";
const AFTER = "The door was open.";

/** The card's own TTL deadline, far enough out that the source's prune timer cannot retire it mid-test. */
const FAR_FUTURE_MS = 4_102_444_800_000; // 2100-01-01

/** One live automation frame raising C3's rewrite card — the wire shape verbatim. Network-stubbed, so the
 *  rule/suggestion ids are authored raw. */
function rewriteCardFrame(): StreamFrame {
  const event: AutomationBusEvent = {
    type: "suggestionRaised",
    chatId: CHAT_ID,
    source: { kind: "rule", ruleId: castId<AutomationRuleId>("automationrule_ct_audit") },
    suggestionId: castId<AutomationSuggestionId>("automationsuggestion_ct_audit"),
    kind: "confirm",
    summary: "Fix the last reply — repeats itself?",
    expiresAt: FAR_FUTURE_MS,
    detail: { kind: "rewrite", before: BEFORE, after: AFTER },
  };
  return { channel: "automation", chatId: CHAT_ID, event };
}

/** The room floor (the chips CT's own `routeRoom`), then the socket with an attach handshake gated on the
 *  AUTOMATION room specifically. */
async function routeRoom(page: Page, frames: readonly StreamFrame[]): Promise<{ readonly count: (p: string) => number }> {
  const trpc = await routeTrpc(page, {
    ...CHAT_AMBIENT_ROUTES,
    ...STREAM_MUTATION_ROUTES,
    "chat.previewContextFit": () => ({
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
    "chat.listMessages": () => makeMessagesPage([makeMessageView({ id: castId<MessageId>("msg_audit_room"), role: "assistant", content: BEFORE, seq: 1 })]),
    "automation.confirmSuggestion": () => ({ ran: "stashed-arm", outcome: "fired" }),
    "automation.dismissSuggestion": () => null,
  });
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

test("a rewrite card renders its question with the diff COLLAPSED, and the disclosure opens it", async ({ mount, page }) => {
  await routeRoom(page, [rewriteCardFrame()]);

  const component = await mount(<AutomationSuggestionCardStory />);

  // The room is really rendered (the discriminator) before the socket-driven card is trusted.
  await expect(component.getByText(BEFORE).first()).toBeVisible();
  // The card itself: the audit's question, and its two required affordances.
  await expect(component.getByText("Fix the last reply — repeats itself?")).toBeVisible();
  await expect(component.getByRole("button", { name: "Do it" })).toBeVisible();

  // COLLAPSED by default — the trigger is there, the diff segments are not (Base UI removes a closed panel
  // from the DOM, so "not attached" IS the settled closed state).
  const disclosure = component.getByRole("button", { name: "Show the change" });
  await expect(disclosure).toBeVisible();
  await expect(component.locator('[data-diff="removed"]')).toHaveCount(0);

  await disclosure.click();

  // Opened: the word-granularity diff marks the duplicated sentence as REMOVED and keeps the rest unchanged.
  await expect(component.locator('[data-diff="removed"]').first()).toBeVisible();
  await expect(component.locator('[data-diff="unchanged"]').first()).toContainText("The door was open.");
});

test("confirming the card calls confirmSuggestion once — the card's action is a front-door verb, not a turn", async ({ mount, page }) => {
  const trpc = await routeRoom(page, [rewriteCardFrame()]);

  const component = await mount(<AutomationSuggestionCardStory />);
  await expect(component.getByText("Fix the last reply — repeats itself?")).toBeVisible();
  await component.getByRole("button", { name: "Do it" }).click();

  await expect.poll(() => trpc.count("automation.confirmSuggestion"), { intervals: [20, 50, 100] }).toBe(1);
});

// ── #700 ARM A: the acting tab RETIRES its own card the moment the take resolves ─────────────────────────
// The confirm/dismiss verbs delete the ask server-side, but the mutations are `busDriven` with no query to
// refetch (RULED F1) and this room is live-only — so before the fix nothing on THIS tab dropped the answered
// card: it sat rendered and re-enabled until TTL (30 min) / reconnect, and as the band's `cards.at(-1)` it
// masked every older pending card behind a lying "+N pending". ARM A wires the per-call `onSuccess` local
// removal. (The server is stubbed here, so only the client half runs — which is exactly ARM A's scope; the
// `suggestionResolved` bus member covers the host's OTHER tabs and is proven in the fold unit test.)
test("#700 ARM A: confirming the card retires it on THIS tab — the answered card leaves the band without waiting on TTL", async ({ mount, page }) => {
  await routeRoom(page, [rewriteCardFrame()]);

  const component = await mount(<AutomationSuggestionCardStory />);
  const question = component.getByText("Fix the last reply — repeats itself?");
  await expect(question).toBeVisible();

  await component.getByRole("button", { name: "Do it" }).click();
  // The mutation's per-call onSuccess filters the ask out of the mount's local state, so the whole card is
  // gone — the settled state a working retire produces (before the fix this stayed visible).
  await expect(question).toBeHidden();
});

test("#700 ARM A: dismissing the card retires it on THIS tab too", async ({ mount, page }) => {
  await routeRoom(page, [rewriteCardFrame()]);

  const component = await mount(<AutomationSuggestionCardStory />);
  const question = component.getByText("Fix the last reply — repeats itself?");
  await expect(question).toBeVisible();

  // The band renders the dismiss affordance as `aria-label="Dismiss <title>"` (chat-controls-band.tsx).
  await component.getByRole("button", { name: "Dismiss Fix the last reply — repeats itself?" }).click();
  await expect(question).toBeHidden();
});
