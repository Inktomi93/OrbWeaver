// @subject packages/server/src/domain/chat/verbs/read.ts
// @subject packages/contracts/src/chat/metadata.ts
// The display-pass set a viewer's transcript renders through, through the composed root: a display script runs where
// it is attached, resolved with the room's tiers and levers, the host's tiers reach a member unless the host switched
// sharing off (shared by default), and the viewer's own globals come last.
import { createCharacterSchema } from "@orb/contracts/character";
import { characterRegexTierKey, REGEX_NOT_APPLIED_OVERFLOW_CODE, REGEX_SCRIPT_NOT_APPLIED_CODE, REGEX_VIEWER_SOURCE } from "@orb/contracts/chat";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { RegexScriptId } from "@orb/kit/ids";
import type { RegexPass } from "@orb/kit/regex";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { invitePerson } from "../persona-cache-physical.ts";
import { textRoom } from "../scenario-physical.ts";

type Principal = ChatRoot["owner"];

interface ScriptSeed {
  readonly name: string;
  readonly passes: readonly RegexPass[];
  readonly enabled?: boolean;
  readonly findRegex?: string;
}

async function script(h: ChatRoot, principal: Principal, { name, passes, enabled = true, findRegex = "a" }: ScriptSeed): Promise<RegexScriptId> {
  const input = createRegexScriptSchema.parse({ name, enabled, findRegex, replaceString: "b", targets: ["AI_OUTPUT"], passes });
  return (await h.root.services.regex.createScript({ principal, input })).id;
}

async function displaySet(h: ChatRoot, principal: Principal, inRoom = true): Promise<readonly { readonly name: string; readonly from: string }[]> {
  const entries = await h.root.services.chat.listDisplayScripts({ principal, chatId: inRoom ? h.chatId : null });
  return entries.map(({ script: { name }, from }) => ({ name, from }));
}

const sharing = async (h: ChatRoot, principal: Principal): Promise<boolean> =>
  (await h.root.services.chat.getChat({ principal, chatId: h.chatId })).hostDisplayScripts;

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

test("a member receives the host's tiers in a room whose host never touched sharing, and their own globals last", async () => {
  await using h = await textRoom([]);
  const member = await invitePerson(h);
  const other = await invitePerson(h);
  const stranger = await h.root.principalFor((await h.root.actor()).id);
  const regex = h.root.services.regex;
  const chatId = h.chatId;
  await regex.attachToChat({ principal: h.owner, chatId, scriptId: await script(h, h.owner, { name: "host panel", passes: ["display"] }) });
  await regex.attachGlobal({ principal: h.owner, scriptId: await script(h, h.owner, { name: "host everywhere", passes: ["display"] }) });
  // Never reach a member: a host script on the save pass, one attached to no tier of this room, and another
  // member's own globals.
  await regex.attachToChat({ principal: h.owner, chatId, scriptId: await script(h, h.owner, { name: "host save", passes: ["save"] }) });
  await script(h, h.owner, { name: "host unattached", passes: ["display"] });
  await regex.attachGlobal({ principal: member, scriptId: await script(h, member, { name: "my style", passes: ["display"] }) });
  await regex.attachGlobal({ principal: other, scriptId: await script(h, other, { name: "their style", passes: ["display"] }) });

  expect([await sharing(h, h.owner), await sharing(h, member)]).toEqual([true, true]);
  const shared = [
    { name: "host everywhere", from: "global" },
    { name: "host panel", from: "chat" },
  ];
  expect(await displaySet(h, member)).toEqual([...shared, { name: "my style", from: REGEX_VIEWER_SOURCE }]);
  // The host reads the same room tiers: the member's transcript draws what the host's does.
  expect(await displaySet(h, h.owner)).toEqual(shared);
  // Outside any room only the viewer's own globals apply.
  expect(await displaySet(h, member, false)).toEqual([{ name: "my style", from: REGEX_VIEWER_SOURCE }]);

  // Switching sharing on by hand hands a member exactly what the default does, field for field.
  const byDefault = await h.root.services.chat.listDisplayScripts({ principal: member, chatId });
  await h.root.services.chat.setHostDisplayScripts({ principal: h.owner, chatId, enabled: true });
  expect(await h.root.services.chat.listDisplayScripts({ principal: member, chatId })).toEqual(byDefault);

  // The room's levers still govern what is shared.
  await h.root.services.chat.setRegexAllow({ principal: h.owner, chatId, lever: { kind: "tier", tier: "chat", enabled: false } });
  expect(await displaySet(h, member)).toEqual([
    { name: "host everywhere", from: "global" },
    { name: "my style", from: REGEX_VIEWER_SOURCE },
  ]);
  await h.root.services.chat.setRegexAllow({ principal: h.owner, chatId, lever: { kind: "master", enabled: false } });
  expect(await displaySet(h, member)).toEqual([{ name: "my style", from: REGEX_VIEWER_SOURCE }]);
  await expect(displaySet(h, stranger)).rejects.toThrow(DomainNotFoundError);
});

test("a host's off withholds their scripts from every member, a late joiner included, and no event carries them", async () => {
  await using h = await textRoom([]);
  const member = await invitePerson(h);
  const regex = h.root.services.regex;
  const chatId = h.chatId;
  const panelPattern = "HOSTPANELPATTERN";
  const panel = await script(h, h.owner, { name: "host panel", passes: ["display"], findRegex: panelPattern });
  await regex.attachToChat({ principal: h.owner, chatId, scriptId: panel });
  await regex.attachGlobal({ principal: member, scriptId: await script(h, member, { name: "my style", passes: ["display"] }) });

  await h.root.services.chat.setHostDisplayScripts({ principal: h.owner, chatId, enabled: false });
  const lateJoiner = await invitePerson(h);
  expect([await sharing(h, h.owner), await sharing(h, member), await sharing(h, lateJoiner)]).toEqual([false, false, false]);
  expect(await displaySet(h, member)).toEqual([{ name: "my style", from: REGEX_VIEWER_SOURCE }]);
  expect(await displaySet(h, lateJoiner)).toEqual([]);
  // The host still draws their own room.
  expect(await displaySet(h, h.owner)).toEqual([{ name: "host panel", from: "chat" }]);

  // The setting outlives the next change: an unrelated host write leaves it off.
  await h.root.services.chat.setRegexAllow({ principal: h.owner, chatId, lever: { kind: "tier", tier: "global", enabled: true } });
  expect(await displaySet(h, lateJoiner)).toEqual([]);

  await h.root.services.chat.setHostDisplayScripts({ principal: h.owner, chatId, enabled: true });
  expect(await displaySet(h, lateJoiner)).toEqual([{ name: "host panel", from: "chat" }]);

  // The set rides no room event, on or off: the room announces a change and a member re-reads through the gate.
  for (const principal of [member, lateJoiner]) {
    const replay = JSON.stringify(await h.root.services.chat.replayChatEvents({ principal, chatId }));
    expect(replay).not.toContain(panelPattern);
    expect(replay).not.toContain(panel);
  }

  // A departed member reads nothing.
  await h.root.services.chat.selfLeave({ principal: member, chatId });
  await expect(displaySet(h, member)).rejects.toThrow(DomainNotFoundError);
});

test("the skipped-script warning stays host-only while the room shares its display scripts", async () => {
  await using h = await textRoom(["Noted."]);
  const member = await invitePerson(h);
  const chatId = h.chatId;
  const broken = await script(h, h.owner, { name: "broken on save", passes: ["save"], findRegex: "/(unclosed/" });
  await h.root.services.regex.attachToChat({ principal: h.owner, chatId, scriptId: broken });
  expect(await sharing(h, member)).toBe(true);

  await h.root.services.chat.send({ principal: h.owner, chatId, content: "A line of mine.", timeZone: UTC_TIME_ZONE });

  const regexWarnings = async (principal: Principal): Promise<unknown[]> =>
    (await h.root.services.chat.replayChatEvents({ principal, chatId })).flatMap(({ event }) =>
      event.type === "warning" && (event.code === REGEX_SCRIPT_NOT_APPLIED_CODE || event.code === REGEX_NOT_APPLIED_OVERFLOW_CODE) ? [event] : [],
    );
  expect((await regexWarnings(h.owner)).length).toBeGreaterThan(0);
  expect(await regexWarnings(member)).toEqual([]);
});

test("after a handoff the new host's tiers are shared and the former host's scripts are not", async () => {
  await using h = await textRoom([]);
  const heir = await invitePerson(h);
  const member = await invitePerson(h);
  const regex = h.root.services.regex;
  const chatId = h.chatId;
  await regex.attachGlobal({ principal: h.owner, scriptId: await script(h, h.owner, { name: "old host look", passes: ["display"] }) });
  await regex.attachGlobal({ principal: heir, scriptId: await script(h, heir, { name: "heir look", passes: ["display"] }) });
  expect(await displaySet(h, member)).toEqual([{ name: "old host look", from: "global" }]);

  await h.root.services.chat.nominateHostHandoff({ principal: h.owner, chatId, userId: heir.userId });
  await h.root.services.chat.acceptHostHandoff({ principal: heir, chatId });

  expect(await displaySet(h, member)).toEqual([{ name: "heir look", from: "global" }]);
  expect(await displaySet(h, heir)).toEqual([{ name: "heir look", from: "global" }]);
  // The former host is now a member: the heir's tiers, then their own globals as a viewer.
  expect(await displaySet(h, h.owner)).toEqual([
    { name: "heir look", from: "global" },
    { name: "old host look", from: REGEX_VIEWER_SOURCE },
  ]);
});
