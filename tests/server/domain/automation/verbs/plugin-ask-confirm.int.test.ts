// A plugin's ask runs on the host's yes: the installer only needs to be in the room with the plugin enabled,
// so a member's ask and a demoted host's ask both run when the room's host confirms them. The confirmer must
// still host, and an installer who is gone or whose plugin is off gets no act out of an open card.
// @subject packages/server/src/domain/automation/verbs/confirm-suggestion.ts

import { spawn } from "node:child_process";
import { createCharacterSchema } from "@orb/contracts/character";
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

const ASK_OPS = { turn: "(h, room) => h.chat.requestTurn(room, {})" } as const satisfies GuestOps;
const ASKED = { ok: false, name: new PluginSuggestedError("requestTurn").name };
const ASK_WAIT_MS = 20_000;

interface AskRoom extends AsyncDisposable {
  readonly h: ChatRoot;
  readonly member: Principal;
  readonly memberPlugin: PluginId;
  readonly memberGuest: GuestRun;
  readonly ownerGuest: GuestRun;
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
  const h = await createChatRoot({ providerFetch: provider.execute, memoryEnabled: false, server: { pluginSpawn: spawn } });
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
  return {
    h,
    member,
    memberPlugin,
    memberGuest: guestRunner({ root: h.root, caller: member, pluginId: memberPlugin, chatId: h.chatId }),
    ownerGuest: guestRunner({ root: h.root, caller: h.owner, pluginId: ownerPlugin, chatId: h.chatId }),
    nextAsk: async (): Promise<AutomationSuggestionId> => {
      for (;;) {
        const next = await stream.next();
        if (next.done === true) {
          throw new Error("the automation stream ended before an ask");
        }
        if (next.value.type === "suggestionRaised") {
          return next.value.suggestionId;
        }
      }
    },
    assistantTurns: async (): Promise<number> => (await readRoomCanon(h.root, h.owner, h.chatId)).filter(({ role }) => role === "assistant").length,
    [Symbol.asyncDispose]: async (): Promise<void> => {
      cancellation.abort();
      await stream.return?.();
      await h[Symbol.asyncDispose]();
    },
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
