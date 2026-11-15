// @subject packages/server/src/domain/regex/verbs/attachments/list-for-chat.ts
// @subject packages/server/src/domain/chat/verbs/room-tier-for-member.ts
// @subject packages/server/src/domain/chat/contract/metadata.ts
// Every read that can return the host's regex rows, asked by a seated non-host member through the composed root. The
// host reads the room tier whole; a member reads only the room-tier part of their display read: nothing while the
// host withholds display scripts, and otherwise only the enabled display-pass rows the room's levers apply. Every
// other host-owned read refuses the member or answers only the member's own library.
import { createCharacterSchema } from "@orb/contracts/character";
import { resolveHostDisplayScripts } from "@orb/contracts/chat";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { RegexScriptId } from "@orb/kit/ids";
import type { RegexPass } from "@orb/kit/regex";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { CHAT_OP_CODES } from "#server/domain/chat/contract/errors.ts";
import { parseChatMetadata } from "#server/domain/chat/contract/metadata.ts";
import { invitePerson } from "../persona-cache-physical.ts";
import { textRoom } from "../scenario-physical.ts";

type Principal = ChatRoot["owner"];

const NOT_HOST = { code: CHAT_OP_CODES.notHost };

interface Seed {
  readonly passes: readonly RegexPass[];
  readonly enabled?: boolean;
}

async function script(h: ChatRoot, principal: Principal, name: string, { passes, enabled = true }: Seed): Promise<RegexScriptId> {
  const input = createRegexScriptSchema.parse({ name, enabled, findRegex: "a", replaceString: "b", targets: ["AI_OUTPUT"], passes });
  return (await h.root.services.regex.createScript({ principal, input })).id;
}

/** The host's four room-tier rows: one a member may draw, and three a member must never read. */
async function hostRoomTier(h: ChatRoot, host: Principal): Promise<{ readonly drawn: RegexScriptId; readonly all: readonly RegexScriptId[] }> {
  const drawn = await script(h, host, "panel", { passes: ["display"] });
  const all = [
    drawn,
    await script(h, host, "prompt only", { passes: ["prompt"] }),
    await script(h, host, "switched off", { passes: ["display"], enabled: false }),
    await script(h, host, "on save", { passes: ["save"] }),
  ];
  for (const scriptId of all) {
    await h.root.services.regex.attachToChat({ principal: host, chatId: h.chatId, scriptId });
  }
  return { drawn, all };
}

async function roomTier(h: ChatRoot, principal: Principal): Promise<readonly RegexScriptId[]> {
  return (await h.root.services.regex.listForChat({ principal, chatId: h.chatId })).map((row) => row.id);
}

async function displayedRoomTier(h: ChatRoot, principal: Principal): Promise<readonly RegexScriptId[]> {
  return (await h.root.services.chat.listDisplayScripts({ principal, chatId: h.chatId })).flatMap(({ script: row, from }) => (from === "chat" ? [row.id] : []));
}

test("a member's room-tier read is the room-tier part of their display read, and the host's is whole", async () => {
  await using h = await textRoom([]);
  const member = await invitePerson(h);
  const { drawn, all } = await hostRoomTier(h, h.owner);

  // Shared by default: the member reads only the row their display read draws.
  expect(await roomTier(h, member)).toEqual([drawn]);
  expect(await roomTier(h, member)).toEqual(await displayedRoomTier(h, member));
  expect(await roomTier(h, h.owner)).toEqual(all);

  await h.root.services.chat.setRegexAllow({ principal: h.owner, chatId: h.chatId, lever: { kind: "tier", tier: "chat", enabled: false } });
  expect(await roomTier(h, member)).toEqual([]);
  await h.root.services.chat.setRegexAllow({ principal: h.owner, chatId: h.chatId, lever: { kind: "tier", tier: "chat", enabled: true } });

  await h.root.services.chat.setHostDisplayScripts({ principal: h.owner, chatId: h.chatId, enabled: false });
  expect(await roomTier(h, member)).toEqual([]);
  expect(await displayedRoomTier(h, member)).toEqual([]);
  expect(await roomTier(h, h.owner)).toEqual(all);
});

test("after a handoff the former host reads the room tier as a member", async () => {
  await using h = await textRoom([]);
  const heir = await invitePerson(h);
  await hostRoomTier(h, h.owner);

  await h.root.services.chat.nominateHostHandoff({ principal: h.owner, chatId: h.chatId, userId: heir.userId });
  await h.root.services.chat.acceptHostHandoff({ principal: heir, chatId: h.chatId });
  const { drawn, all } = await hostRoomTier(h, heir);

  expect(await roomTier(h, heir)).toEqual(all);
  expect(await roomTier(h, h.owner)).toEqual([drawn]);
});

test("every other read of the host's regex rows refuses a member or answers the member's own library", async () => {
  const card = createCharacterSchema.parse({ handle: "seraphine", name: "Seraphine", description: "A courier." });
  await using h = await textRoom([], { characters: [card] });
  const characterId = h.characters[0]?.id;
  if (characterId === undefined) {
    throw new Error("the room seated no character");
  }
  const member = await invitePerson(h);
  const regex = h.root.services.regex;
  const { drawn } = await hostRoomTier(h, h.owner);
  await regex.attachGlobal({ principal: h.owner, scriptId: await script(h, h.owner, "host global", { passes: ["display"] }) });
  await regex.attachToCharacter({ principal: h.owner, characterId, scriptId: await script(h, h.owner, "on the card", { passes: ["display"] }) });
  const preset = await h.caller.preset.create({ name: "Host preset", kind: "custom" });
  await regex.attachToPreset({ principal: h.owner, presetId: preset.id, scriptId: await script(h, h.owner, "on the preset", { passes: ["display"] }) });
  const own = await script(h, member, "mine", { passes: ["display"] });

  await expect(regex.listForCharacter({ principal: member, characterId })).rejects.toThrow(DomainNotFoundError);
  await expect(regex.listForPreset({ principal: member, presetId: preset.id })).rejects.toThrow(DomainNotFoundError);
  await expect(regex.listScriptUsage({ principal: member, scriptId: drawn })).rejects.toThrow(DomainNotFoundError);
  expect(await regex.exportScript({ principal: member, scriptId: drawn })).toBeNull();
  await expect(h.root.services.chat.listEffectiveRegex({ principal: member, chatId: h.chatId })).rejects.toMatchObject(NOT_HOST);
  // The two prompt previews carry the host's resolved regex set; both are the host's alone.
  const signal = new AbortController().signal;
  await expect(h.root.services.chat.previewAssembly({ principal: member, chatId: h.chatId, signal })).rejects.toMatchObject(NOT_HOST);
  await expect(h.root.services.chat.getShapeTrace({ principal: member, chatId: h.chatId, signal })).rejects.toMatchObject(NOT_HOST);
  expect(await regex.countScripts({ principal: member })).toBe(1);
  expect((await regex.listScripts({ principal: member })).map((row) => row.id)).toEqual([own]);
  expect(await regex.listGlobal({ principal: member })).toEqual([]);
  // Positive control: the host's own reads hold the rows the member was refused.
  expect((await regex.listForCharacter({ principal: h.owner, characterId })).map((row) => row.name)).toEqual(["on the card"]);
  expect(await regex.exportScript({ principal: h.owner, scriptId: drawn })).not.toBeNull();
});

test("a stored sharing value that does not parse reads as the host's off, and an absent one as shared", () => {
  expect(resolveHostDisplayScripts(parseChatMetadata({ hostDisplayScripts: "yes" }).hostDisplayScripts)).toBe(false);
  expect(resolveHostDisplayScripts(parseChatMetadata({}).hostDisplayScripts)).toBe(true);
  expect(resolveHostDisplayScripts(parseChatMetadata({ hostDisplayScripts: true }).hostDisplayScripts)).toBe(true);
});
