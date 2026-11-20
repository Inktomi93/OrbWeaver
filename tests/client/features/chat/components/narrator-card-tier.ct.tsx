// A narrator row's card renders in its sandboxed frame when every present character consents, and inert with a notice
// whose controls reach each character holding it plain when any does not: the real transcript (`MessageListSurface`) over a
// corpus room whose latest row is a narrator turn the real round engine committed from a scripted provider reply. The
// room's reads, its card frames and `/api/auth/config` are answered by the corpus root under the viewing account.
import type { PlainRemedy } from "@orb/client/lib";
import { CHARACTER_TRUST_TAB_ID } from "@orb/client/state";
import { createCharacterSchema } from "@orb/contracts/character";
import { DEFAULT_GROUP_CONFIG, renderPolicyOverrideForStep } from "@orb/contracts/chat";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { ROOM_PROCEDURES, routeAuthConfig, routeCardFrames, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { finiteReplies } from "@orb/testkit/iso";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_PROVIDER_ENDPOINT,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  captureCookieAuth,
  createCorpusHarness,
  createCorpusProviderExecution,
} from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { PlainContentNoticeStory } from "./_plain-content-notice-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Caller = Awaited<ReturnType<Root["internalCallerFor"]>>;

const STORY = "tests/client/features/chat/components/_plain-content-notice-stories/PlainContentNoticeStory";
const VIEWER_PASSWORD = "narrator-card-viewer-password";
const NOTICE = '[data-slot="plain-notice"]';
const NOTICE_ACTION = '[data-slot="plain-notice-action"]';
const INERT_CARD = '[data-slot="inert-card"]';
const READOUT = '[data-slot="navigation-readout"]';
const ROUTED_CARD = '[data-slot="immersive-card-panel"] [data-slot="sandbox-frame"][data-delivery="routed"]';
const CARD_LINE = "High water at dusk.";
const NARRATED_CARD = `:::card title="Tide tables"\n<p id="tide-line" style="margin:0">${CARD_LINE}</p>\n:::`;
const TRANSCRIPT_READS = [
  ...ROOM_PROCEDURES,
  "sessions.me",
  "settings.getUserSettings",
  "plugin.list",
  "plugin.listSurfaces",
  "regex.listScripts",
  "rpg.getGame",
  "rpg.listTurnToolCalls",
] as const;

interface NarratorRoom {
  readonly chatId: ChatId;
  readonly aria: CharacterId;
  readonly kai: CharacterId;
}

/** A corpus root whose chat turns reach the loopback corpus endpoint, answering the one narrator reply `take` holds. */
async function narratorRoot(take: () => string): Promise<Root> {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "unused finite reply fallback",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    completion: () => ({ text: take(), toolCalls: [], usage: { promptTokens: 4, completionTokens: 2 } }),
  });
  return await createCorpusHarness(undefined, { providerFetch: provider.execute });
}

/** The owner's two-character narrator room, with one narrator turn committed through the real round engine. */
async function narratorRoom(root: Root, owner: Caller): Promise<NarratorRoom> {
  const principal = await root.principalFor(root.ownerId);
  const connection = await root.services.connection.create({
    principal,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared: { kind: "generation", generation: { input: ["text"], context: { window: 32_000 } }, features: { detectServer: false } },
  });
  await owner.connection.setBinding({ task: "chat", connectionId: connection.id });
  const aria = await owner.character.create({
    input: createCharacterSchema.parse({ handle: "narrated-aria", name: "Aria", description: "A warden of the ford." }),
  });
  const kai = await owner.character.create({ input: createCharacterSchema.parse({ handle: "narrated-kai", name: "Kai", description: "A wandering bard." }) });
  const chatId = (await owner.chat.startChat({ characterIds: [aria.id, kai.id], opening: "none" })).chat.id;
  await owner.chat.setGroupConfig({ chatId, config: { output: "narrator", policy: DEFAULT_GROUP_CONFIG.policy } });
  const outcome = await root.services.chat.send({ principal, chatId, content: "Read the tide tables.", timeZone: UTC_TIME_ZONE });
  expect(outcome.messages.find(({ role }) => role === "assistant")?.kind).toBe("narrator");
  await root.settleBackground();
  return { chatId, aria: aria.id, kai: kai.id };
}

type Step = "trusted" | "untrusted";

/** Each character's step; Render HTML sits below the interactive default, so the frame runs no card script. */
async function setSteps(owner: Caller, room: NarratorRoom, aria: Step, kai: Step): Promise<void> {
  await owner.character.update({ characterId: room.aria, input: renderPolicyOverrideForStep(aria) });
  await owner.character.update({ characterId: room.kai, input: renderPolicyOverrideForStep(kai) });
}

/** Each control in the notice, in order, opens the Trust tab of the character beside it. */
async function expectControlsOpen(page: Page, characters: readonly CharacterId[]): Promise<void> {
  const controls = page.locator(NOTICE_ACTION);
  await expect(controls).toHaveCount(characters.length);
  const readout = page.locator(READOUT);
  for (const [index, characterId] of characters.entries()) {
    await controls.nth(index).click();
    await expect(readout).toHaveAttribute("data-section", "characters");
    await expect(readout).toHaveAttribute("data-character", characterId);
    await expect(readout).toHaveAttribute("data-context-tab", CHARACTER_TRUST_TAB_ID);
  }
}

/** The room's reads, card frames and auth config under `viewer`'s own session. */
async function serveRoom(page: Page, root: Root, viewer: Caller, viewerId: Root["ownerId"]): Promise<void> {
  const { cookie } = await captureCookieAuth(root, await root.principalFor(viewerId), VIEWER_PASSWORD);
  const config = await root.http.request("/api/auth/config", { headers: { cookie } });
  await routeAuthConfig(page, await config.text());
  await routeTrpc(page, serveCorpusProcedures(viewer, TRANSCRIPT_READS));
  await routeCardFrames(page, root, cookie);
}

async function expectFramed(page: Page): Promise<void> {
  await expect(page.frameLocator(ROUTED_CARD).locator("#tide-line")).toHaveText(CARD_LINE);
  await expect(page.locator(NOTICE)).toHaveCount(0);
  await expect(page.locator(INERT_CARD)).toHaveCount(0);
}

async function expectHeldPlain(page: Page, remedy: PlainRemedy): Promise<void> {
  await expect(page.locator(INERT_CARD)).toHaveCount(1);
  const notice = page.locator(NOTICE);
  await expect(notice).toHaveCount(1);
  await expect(notice).toHaveAttribute("data-reason", "character");
  await expect(notice).toHaveAttribute("data-remedy", remedy);
}

test("the host sees a narrator card in its frame while every character consents, and a control for each character holding it plain", async ({
  mount,
  page,
}) => {
  using plan = finiteReplies("narrator card host", [NARRATED_CARD]);
  await using root = await narratorRoot(plan.take);
  const owner = await root.internalCallerFor(root.ownerId);
  const room = await narratorRoom(root, owner);

  await setSteps(owner, room, "trusted", "trusted");
  await serveRoom(page, root, owner, root.ownerId);
  const framed = await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  await expectFramed(page);
  await framed.unmount();
  await page.unrouteAll({ behavior: "wait" });

  await setSteps(owner, room, "trusted", "untrusted");
  await serveRoom(page, root, owner, root.ownerId);
  const kaiHolds = await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  await expectHeldPlain(page, "character-trust");
  await expectControlsOpen(page, [room.kai]);
  await kaiHolds.unmount();
  await page.unrouteAll({ behavior: "wait" });

  // Both at plain text: raising either alone leaves the row plain, so the host reaches each, in roster order.
  await setSteps(owner, room, "untrusted", "untrusted");
  await serveRoom(page, root, owner, root.ownerId);
  await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  await expectHeldPlain(page, "character-trust");
  await expect(page.locator(NOTICE_ACTION)).toHaveCount(2);
  await expectControlsOpen(page, [room.aria, room.kai]);
  await page.unrouteAll({ behavior: "wait" });
});

test("a member sees the same narrator card tier, and is told to ask the host, with no control, when both characters hold it plain", async ({
  corpus,
  mount,
  page,
}) => {
  using plan = finiteReplies("narrator card member", [NARRATED_CARD]);
  await using root = await narratorRoot(plan.take);
  const memberId = corpus.memberIdentities?.sharedMember.viewer.userId;
  if (memberId === undefined) {
    throw new Error("The corpus has no shared member");
  }
  await (await root.internalCallerFor(root.ownerId)).settings.updateAppSettings({ partial: { localMultiUser: true } });
  const owner = await root.internalCallerFor(root.ownerId);
  const member = await root.internalCallerFor(memberId);
  const room = await narratorRoom(root, owner);
  const invite = await root.services.chat.createInvite({
    principal: await root.principalFor(root.ownerId),
    chatId: room.chatId,
    input: { invitedHandle: (await root.principalFor(memberId)).handle },
  });
  await root.services.chat.acceptInvite({ principal: await root.principalFor(memberId), inviteId: invite.invite.id });

  await setSteps(owner, room, "trusted", "trusted");
  await serveRoom(page, root, member, memberId);
  const framed = await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  await expectFramed(page);
  await framed.unmount();
  await page.unrouteAll({ behavior: "wait" });

  await setSteps(owner, room, "untrusted", "untrusted");
  await serveRoom(page, root, member, memberId);
  await mount<typeof PlainContentNoticeStory>(STORY, { chatId: room.chatId });
  await expectHeldPlain(page, "ask-host");
  await expect(page.locator(NOTICE_ACTION)).toHaveCount(0);
  await page.unrouteAll({ behavior: "wait" });
});
