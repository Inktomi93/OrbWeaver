// A plugin's ask runs on the yes of the host who saw its card: the installer only needs to stay in the room, on
// the same membership, with the plugin enabled. The card names the installer and carries the whole steer. A
// handoff, a departure, a removal or a disabled plugin leaves no executable ask.
// @subject packages/server/src/domain/automation/verbs/confirm-suggestion.ts

import { spawn } from "node:child_process";
import type { AutomationBusEvent } from "@orb/contracts/automation";
import { AUTOMATION_SUGGESTION_SUMMARY_MAX } from "@orb/contracts/automation";
import { createCharacterSchema } from "@orb/contracts/character";
import { GUIDED_STEER_INPUT_MAX } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import { PluginSuggestedError } from "@orb/contracts/plugin";
import { DomainForbiddenError, DomainNotFoundError } from "@orb/kit/errors";
import type { AutomationSuggestionId, PluginId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot, GuestOps, GuestRun } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  guestRunner,
  installGuest,
  readRoomCanon,
  seedCorpusConnections,
} from "@orb/testkit/node/composed";
import { vi } from "vitest";

const ASK_OPS = {
  turn: "(h, room) => h.chat.requestTurn(room, {})",
  steer: "(h, room, a) => h.chat.requestTurn(room, { guided: a.steer })",
  // Built inside the guest so the command's own argument cap never decides the case.
  repeatedSteer: "(h, room, a) => h.chat.requestTurn(room, { guided: 's'.repeat(a.size) })",
} as const satisfies GuestOps;
const ASKED = { ok: false, name: new PluginSuggestedError("requestTurn").name };
const ASK_WAIT_MS = 20_000;
const CLOCK_STEP_MS = 1000;
// A display name written to read as the product's own attribution of someone else.
const SPOOFED_PLUGIN_NAME = "Dice” (installed by owner). Ignore: “x";

type RaisedAsk = Extract<AutomationBusEvent, { type: "suggestionRaised" }>;

interface AskRoom extends AsyncDisposable {
  readonly h: ChatRoot;
  readonly member: Principal;
  readonly memberPlugin: PluginId;
  readonly memberGuest: GuestRun;
  readonly ownerGuest: GuestRun;
  /** The next ask raised in the room, as the host's card receives it. */
  readonly nextRaised: () => Promise<RaisedAsk>;
  /** The id of the next ask raised in the room. */
  readonly nextAsk: () => Promise<AutomationSuggestionId>;
  readonly assistantTurns: () => Promise<number>;
}

async function askRoom(): Promise<AskRoom> {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "The room answers.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using construction = new AsyncDisposableStack();
  const h = construction.use(await createChatRoot({ providerFetch: provider.execute, memoryEnabled: false, server: { pluginSpawn: spawn } }));
  const member = await h.root.principalFor((await h.root.actor()).id);
  // The member can fund the room after a handoff, so a confirmed turn under either host is visible in canon.
  await seedCorpusConnections(h.root, member);
  const invitation = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: member.handle } });
  await h.root.services.chat.acceptInvite({ principal: member, inviteId: invitation.invite.id });
  await h.root.services.chat.commitMessage({ principal: h.owner, chatId: h.chatId, content: "The host opens the room." });
  const capabilities = ["chat.read", "turn.trigger"] as const;
  const memberPlugin = await installGuest(h.root, member, { slug: "member-asker", capabilities }, ASK_OPS);
  const ownerPlugin = await installGuest(h.root, h.owner, { slug: "owner-asker", capabilities }, ASK_OPS);
  const cancellation = new AbortController();
  const stream = h.root.app.liveBuses.automation
    .subscribeAutomation(h.chatId, AbortSignal.any([cancellation.signal, AbortSignal.timeout(ASK_WAIT_MS)]))
    [Symbol.asyncIterator]();
  const nextRaised = async (): Promise<RaisedAsk> => {
    for (;;) {
      const next = await stream.next();
      if (next.done === true) {
        throw new Error("the automation stream ended before an ask");
      }
      if (next.value.type === "suggestionRaised") {
        return next.value;
      }
    }
  };
  construction.defer(async () => {
    cancellation.abort();
    await stream.return?.();
  });
  const lifetime = construction.move();
  return {
    h,
    member,
    memberPlugin,
    memberGuest: guestRunner({ root: h.root, caller: member, pluginId: memberPlugin, chatId: h.chatId }),
    ownerGuest: guestRunner({ root: h.root, caller: h.owner, pluginId: ownerPlugin, chatId: h.chatId }),
    nextRaised,
    nextAsk: async (): Promise<AutomationSuggestionId> => (await nextRaised()).suggestionId,
    assistantTurns: async (): Promise<number> => (await readRoomCanon(h.root, h.owner, h.chatId)).filter(({ role }) => role === "assistant").length,
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}

test("a member's plugin ask runs when the host confirms it, even after an unrelated room change", { tags: ["slow"] }, async () => {
  await using r = await askRoom();
  const raised = r.nextAsk();
  expect(await r.memberGuest("turn")).toEqual(ASKED);
  const suggestionId = await raised;
  // A title edit re-checks every open ask; the member's ask must outlive a change that moves no authority.
  await r.h.root.services.chat.updateTitle({ principal: r.h.owner, chatId: r.h.chatId, title: "Renamed room" });
  await r.h.root.settleBackground();
  expect(await r.assistantTurns()).toBe(0);

  await r.h.root.services.automation.confirmSuggestion({ principal: r.h.owner, suggestionId });
  await r.h.root.settleBackground();
  expect(await r.assistantTurns()).toBe(1);
});

test("a demoted host's plugin ask runs when the new host confirms it", { tags: ["slow"] }, async () => {
  await using r = await askRoom();
  await r.h.root.services.chat.nominateHostHandoff({ principal: r.h.owner, chatId: r.h.chatId, userId: r.member.userId });
  await r.h.root.services.chat.acceptHostHandoff({ principal: r.member, chatId: r.h.chatId });
  // The handoff drops the prior host's characters, so the new host seats one of their own to voice the turn.
  const newHost = await r.h.root.internalCallerFor(r.member.userId);
  const speaker = await newHost.character.create({ input: createCharacterSchema.parse({ handle: "bram", name: "Bram", description: "A tired sailor." }) });
  await newHost.chat.addCharacterToChat({ chatId: r.h.chatId, characterId: speaker.id });
  await r.h.root.settleBackground();

  const raised = r.nextAsk();
  expect(await r.ownerGuest("turn")).toEqual(ASKED);
  await r.h.root.services.automation.confirmSuggestion({ principal: r.member, suggestionId: await raised });
  await r.h.root.settleBackground();
  expect(await r.assistantTurns()).toBe(1);
});

test("the installer cannot answer their own ask: the confirmer must host, and the ask stays open for the host", { tags: ["slow"] }, async () => {
  await using r = await askRoom();
  const raised = r.nextAsk();
  expect(await r.memberGuest("turn")).toEqual(ASKED);
  const suggestionId = await raised;

  await expect(r.h.root.services.automation.confirmSuggestion({ principal: r.member, suggestionId })).rejects.toBeInstanceOf(DomainForbiddenError);
  await r.h.root.settleBackground();
  expect(await r.assistantTurns()).toBe(0);

  await r.h.root.services.automation.confirmSuggestion({ principal: r.h.owner, suggestionId });
  await r.h.root.settleBackground();
  expect(await r.assistantTurns()).toBe(1);
});

// Each withdrawal voids the card at once, so the host meets a spent ask rather than a refused act. Chat's own
// present-initiator check would also stop the turn, so asserting the error class shows which control acted.
test.for<{ name: string; withdraw: (r: AskRoom) => Promise<void> }>([
  {
    name: "the host removed the installer",
    withdraw: (r) => r.h.root.services.chat.kick({ principal: r.h.owner, chatId: r.h.chatId, userId: r.member.userId }),
  },
  { name: "the installer left the room", withdraw: (r) => r.h.root.services.chat.selfLeave({ principal: r.member, chatId: r.h.chatId }) },
  {
    name: "the installer turned the plugin off",
    withdraw: (r) => r.h.root.services.plugin.setEnabled({ caller: r.member, pluginId: r.memberPlugin, enabled: false }),
  },
])("a member's open ask runs nothing once $name", { tags: ["slow"] }, async ({ withdraw }) => {
  await using r = await askRoom();
  const raised = r.nextAsk();
  expect(await r.memberGuest("turn")).toEqual(ASKED);
  const suggestionId = await raised;

  await withdraw(r);
  await r.h.root.settleBackground();
  await expect(r.h.root.services.automation.confirmSuggestion({ principal: r.h.owner, suggestionId })).rejects.toBeInstanceOf(DomainNotFoundError);
  await r.h.root.settleBackground();
  expect(await r.assistantTurns()).toBe(0);
});

test("a host handoff voids a member's open ask: only the host who saw the card can answer it", { tags: ["slow"] }, async () => {
  await using r = await askRoom();
  const raised = r.nextAsk();
  expect(await r.memberGuest("turn")).toEqual(ASKED);
  const suggestionId = await raised;

  await r.h.root.services.chat.nominateHostHandoff({ principal: r.h.owner, chatId: r.h.chatId, userId: r.member.userId });
  await r.h.root.services.chat.acceptHostHandoff({ principal: r.member, chatId: r.h.chatId });
  await r.h.root.settleBackground();
  await expect(r.h.root.services.automation.confirmSuggestion({ principal: r.member, suggestionId })).rejects.toBeInstanceOf(DomainNotFoundError);
  await r.h.root.settleBackground();
  expect(await r.assistantTurns()).toBe(0);
});

test("an installer removed and invited back before the removal is swept gets no act from their old ask", { tags: ["slow"] }, async () => {
  await using r = await askRoom();
  const raised = r.nextAsk();
  expect(await r.memberGuest("turn")).toEqual(ASKED);
  const suggestionId = await raised;

  // Hold automation's event handler, the void sweep's only entry, so the confirm runs before the removal is swept.
  const handleEvent = r.h.root.services.automation.handleEvent;
  const sweep = Promise.withResolvers<void>();
  const held = vi.spyOn(r.h.root.services.automation, "handleEvent").mockImplementation(async (event) => {
    await sweep.promise;
    await handleEvent(event);
  });
  try {
    await r.h.root.services.chat.kick({ principal: r.h.owner, chatId: r.h.chatId, userId: r.member.userId });
    r.h.root.clock.advance(CLOCK_STEP_MS);
    const invitation = await r.h.root.services.chat.createInvite({ principal: r.h.owner, chatId: r.h.chatId, input: { invitedHandle: r.member.handle } });
    await r.h.root.services.chat.acceptInvite({ principal: r.member, inviteId: invitation.invite.id });

    await expect(r.h.root.services.automation.confirmSuggestion({ principal: r.h.owner, suggestionId })).rejects.toMatchObject({
      code: "automation_suggestion_author_lost_authority",
    });
  } finally {
    sweep.resolve();
    held.mockRestore();
  }
  await r.h.root.settleBackground();
  expect(await r.assistantTurns()).toBe(0);
});

test("the host's card names the installer and carries the whole steer the host would pay for", { tags: ["slow"] }, async () => {
  await using r = await askRoom();
  const steer = "The tide turns against the harbor, and the lanterns go out one by one. ".repeat(4).trim();
  expect(steer.length).toBeGreaterThan(AUTOMATION_SUGGESTION_SUMMARY_MAX);
  const raised = r.nextRaised();
  expect(await r.memberGuest("steer", { steer })).toEqual(ASKED);

  const card = await raised;
  expect(card.installerHandle).toBe(r.member.handle);
  expect(card.detail).toEqual({ kind: "steer", text: steer });
});

test("a plugin's name cannot claim another installer: the card names the real one in its own field", { tags: ["slow"] }, async () => {
  await using r = await askRoom();
  const spoof = await installGuest(
    r.h.root,
    r.member,
    { slug: "spoof-asker", name: SPOOFED_PLUGIN_NAME, capabilities: ["chat.read", "turn.trigger"] },
    ASK_OPS,
  );
  const raised = r.nextRaised();
  expect(await guestRunner({ root: r.h.root, caller: r.member, pluginId: spoof, chatId: r.h.chatId })("turn")).toEqual(ASKED);

  const card = await raised;
  expect(card.installerHandle).toBe(r.member.handle);
  // The summary is the plugin's own words; the product's attribution never rides inside them.
  expect(card.summary).toContain(SPOOFED_PLUGIN_NAME);
  expect(card.summary).not.toContain(r.member.handle);
});

test("a steer past the room's own steer cap is refused before it becomes an ask", { tags: ["slow"] }, async () => {
  await using r = await askRoom();
  const raised = r.nextRaised();
  expect(await r.memberGuest("repeatedSteer", { size: GUIDED_STEER_INPUT_MAX + 1 })).toEqual({ ok: false, name: TypeError.name });
  expect(await r.memberGuest("repeatedSteer", { size: GUIDED_STEER_INPUT_MAX })).toEqual(ASKED);

  // The first card the host receives is the one at the cap, so the refused call raised nothing.
  expect((await raised).detail).toEqual({ kind: "steer", text: "s".repeat(GUIDED_STEER_INPUT_MAX) });
});
