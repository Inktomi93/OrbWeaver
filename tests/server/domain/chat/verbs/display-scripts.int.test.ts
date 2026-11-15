// @subject packages/server/src/domain/chat/verbs/read.ts
// The display-pass set a viewer's transcript renders through, through the composed root: a display script runs where
// it is attached, resolved with the room's tiers and levers, the host's tiers reach a member only when the host opted
// the room in, and the viewer's own globals come last.
import { createCharacterSchema } from "@orb/contracts/character";
import { characterRegexTierKey, REGEX_VIEWER_SOURCE } from "@orb/contracts/chat";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { RegexScriptId } from "@orb/kit/ids";
import type { RegexPass } from "@orb/kit/regex";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { invitePerson } from "../persona-cache-physical.ts";
import { textRoom } from "../scenario-physical.ts";

type Principal = ChatRoot["owner"];

interface ScriptSeed {
  readonly name: string;
  readonly passes: readonly RegexPass[];
  readonly enabled?: boolean;
}

async function script(h: ChatRoot, principal: Principal, { name, passes, enabled = true }: ScriptSeed): Promise<RegexScriptId> {
  const input = createRegexScriptSchema.parse({ name, enabled, findRegex: "a", replaceString: "b", targets: ["AI_OUTPUT"], passes });
  return (await h.root.services.regex.createScript({ principal, input })).id;
}

async function displaySet(h: ChatRoot, principal: Principal, inRoom = true): Promise<readonly { readonly name: string; readonly from: string }[]> {
  const entries = await h.root.services.chat.listDisplayScripts({ principal, chatId: inRoom ? h.chatId : null });
  return entries.map(({ script: { name }, from }) => ({ name, from }));
}

test("a display script runs where it is attached, in the room's run order, under the room's levers", async () => {
  const card = createCharacterSchema.parse({ handle: "seraphine", name: "Seraphine", description: "A courier." });
  await using h = await textRoom([], { characters: [card] });
  const characterId = h.characters[0]?.id;
  if (characterId === undefined) {
    throw new Error("the room seated no character");
  }
  const regex = h.root.services.regex;
  const principal = h.owner;
  await regex.attachGlobal({ principal, scriptId: await script(h, principal, { name: "everywhere", passes: ["display"] }) });
  await regex.attachToCharacter({ principal, characterId, scriptId: await script(h, principal, { name: "on the card", passes: ["display"] }) });
  await regex.attachToChat({ principal, chatId: h.chatId, scriptId: await script(h, principal, { name: "in the room", passes: ["display"] }) });
  // Attached but not on the display pass, or switched off: the transcript never runs them.
  await regex.attachToChat({ principal, chatId: h.chatId, scriptId: await script(h, principal, { name: "when saved", passes: ["save"] }) });
  await regex.attachToChat({
    principal,
    chatId: h.chatId,
    scriptId: await script(h, principal, { name: "switched off", passes: ["display"], enabled: false }),
  });
  // In the library on the display pass, attached nowhere: it runs nowhere.
  await script(h, principal, { name: "unattached", passes: ["display"] });

  expect(await displaySet(h, principal)).toEqual([
    { name: "everywhere", from: "global" },
    { name: "on the card", from: characterRegexTierKey(characterId) },
    { name: "in the room", from: "chat" },
  ]);

  await h.root.services.chat.setRegexAllow({ principal, chatId: h.chatId, lever: { kind: "tier", tier: "chat", enabled: false } });
  expect(await displaySet(h, principal)).toEqual([
    { name: "everywhere", from: "global" },
    { name: "on the card", from: characterRegexTierKey(characterId) },
  ]);

  await h.root.services.chat.setRegexAllow({ principal, chatId: h.chatId, lever: { kind: "master", enabled: false } });
  expect(await displaySet(h, principal)).toEqual([]);
});

test("a member receives the host's tiers only when the room is opted in, and their own globals last", async () => {
  await using h = await textRoom([]);
  const member = await invitePerson(h);
  const stranger = await h.root.principalFor((await h.root.actor()).id);
  const regex = h.root.services.regex;
  await regex.attachToChat({ principal: h.owner, chatId: h.chatId, scriptId: await script(h, h.owner, { name: "host panel", passes: ["display"] }) });
  await regex.attachGlobal({ principal: member, scriptId: await script(h, member, { name: "my style", passes: ["display"] }) });

  expect(await displaySet(h, member)).toEqual([{ name: "my style", from: REGEX_VIEWER_SOURCE }]);

  await h.root.services.chat.setHostDisplayScripts({ principal: h.owner, chatId: h.chatId, enabled: true });
  expect(await displaySet(h, member)).toEqual([
    { name: "host panel", from: "chat" },
    { name: "my style", from: REGEX_VIEWER_SOURCE },
  ]);
  // Outside any room only the viewer's own globals apply.
  expect(await displaySet(h, member, false)).toEqual([{ name: "my style", from: REGEX_VIEWER_SOURCE }]);
  // The host's own globals are the room's global tier, so the host reads no viewer tier of their own.
  expect(await displaySet(h, h.owner)).toEqual([{ name: "host panel", from: "chat" }]);
  await expect(displaySet(h, stranger)).rejects.toThrow(DomainNotFoundError);
});
