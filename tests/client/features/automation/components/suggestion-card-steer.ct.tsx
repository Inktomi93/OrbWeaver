// A plugin's turn ask reaches the host as a card: the plugin-named title, the installer in its own line, and the
// whole steer behind a closed disclosure the host can reach and open from the keyboard.
import { spawn } from "node:child_process";
import type { AutomationBusEvent } from "@orb/contracts/automation";
import { routeOrbSocket, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  guestRunner,
  installGuest,
} from "@orb/testkit/node/composed";
import type { SuggestionCardStory } from "./_suggestion-card-stories.tsx";

const STEER_OPS = { steer: "(h, room, a) => h.chat.requestTurn(room, { guided: a.steer })" } as const;
// Longer than the card's one-line title, and in two paragraphs, so only the disclosure can show all of it.
const STEER = `${"The tide turns against the harbor, and the lanterns go out one by one. ".repeat(4).trim()}\n\nThen the bell rings.`;
const MAX_TABS = 12;

type RaisedAsk = Extract<AutomationBusEvent, { type: "suggestionRaised" }>;

test("a plugin turn card names its installer apart from its title and opens to the whole steer from the keyboard", async ({ page, mount }) => {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The room answers.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using h = await createChatRoot({ providerFetch: provider.execute, memoryEnabled: false, server: { pluginSpawn: spawn } });
  const member = await h.root.principalFor((await h.root.actor()).id);
  const invitation = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: member.handle } });
  await h.root.services.chat.acceptInvite({ principal: member, inviteId: invitation.invite.id });
  const pluginId = await installGuest(h.root, member, { slug: "steer-asker", capabilities: ["chat.read", "turn.trigger"] }, STEER_OPS);

  // The host's card is the real raise: a member's guest asks, and the room's automation bus carries the event.
  const cancellation = new AbortController();
  const events = h.root.app.liveBuses.automation.subscribeAutomation(h.chatId, cancellation.signal)[Symbol.asyncIterator]();
  const raised = (async (): Promise<RaisedAsk> => {
    for (;;) {
      const next = await events.next();
      if (next.done === true) {
        throw new Error("the automation stream ended before an ask");
      }
      if (next.value.type === "suggestionRaised") {
        return next.value;
      }
    }
  })();
  await guestRunner({ root: h.root, caller: member, pluginId, chatId: h.chatId })("steer", { steer: STEER });
  const card = await raised;
  cancellation.abort();
  await events.return?.();

  const automationRoom = ({ ref }: { readonly ref: { readonly channel: string } }): null | ReturnType<typeof trpcError> =>
    ref.channel === "automation" ? null : trpcError({ code: "NOT_FOUND" });
  await routeTrpc(page, {
    ...serveCorpusProcedures(h.caller, ["sessions.me", "settings.getUserSettings"]),
    "stream.attach": automationRoom,
    "stream.detach": automationRoom,
  });
  await routeOrbSocket(page, { awaitAttaches: 1, frames: [{ channel: "automation", chatId: h.chatId, event: card }] });
  // The card's expiry is stamped on the root's frozen clock; the page reads the same instant, or the mount's own
  // expiry timer retires the card as soon as it paints.
  await page.clock.setFixedTime(h.root.clock.now());
  await mount<typeof SuggestionCardStory>("tests/client/features/automation/components/_suggestion-card-stories/SuggestionCardStory", { chatId: h.chatId });

  const cards = page.locator('[data-slot="chat-control-cards"]');
  const title = cards.getByText(card.summary, { exact: true });
  await expect(title).toBeVisible();
  await expect(title).not.toContainText(member.handle);
  await expect(cards.locator('[data-slot="chat-control-card-byline"]')).toContainText(member.handle);

  const trigger = cards.locator('[data-slot="collapsible-trigger"]');
  const steer = cards.locator('[data-slot="scroll-area-viewport"] [data-slot="suggestion-steer"]');
  await expect(trigger).toHaveAccessibleName(/\S/);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(steer).toBeHidden();

  for (let presses = 0; presses < MAX_TABS && !(await trigger.evaluate((node) => node === document.activeElement)); presses += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(steer).toBeVisible();
  await expect(steer).toHaveText(STEER);
});
