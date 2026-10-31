// The cast of a composed room through the root seeds: a stored avatar, a character, a persona and a room, each named
// by one string so a case reads as the story it sets up. Each builder returns the production id or hash.
import { createCharacterSchema } from "@orb/contracts/character";
import { createPersonaSchema } from "@orb/contracts/persona";
import type { CharacterId, ChatId, PersonaId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { makeAssetBytes, seedAsset } from "../factories/asset.ts";
import { seedCharacter } from "../factories/character.ts";
import { seedChat } from "../factories/chat.ts";
import { seedPersona } from "../factories/persona.ts";
import type { ChatRoot } from "./composed.ts";

type Principal = ChatRoot["owner"];

export interface StoredAvatar {
  readonly assetId: Awaited<ReturnType<typeof seedAsset>>["stored"]["assetId"];
  readonly hash: string;
}

/** Store one distinct avatar image for `principal`. */
export async function storeAvatar(h: ChatRoot, principal: Principal): Promise<StoredAvatar> {
  const { stored } = await seedAsset(h.root, { principal, bytes: makeAssetBytes(h.root.idSource.typeId(ID_PREFIX.asset)), kind: "avatar", mime: "image/png" });
  return { assetId: stored.assetId, hash: stored.hash };
}

/** A character of the room's owner, named and described by `handle`. */
export async function addCharacter(h: ChatRoot, handle: string, avatar?: StoredAvatar): Promise<CharacterId> {
  const { view } = await seedCharacter(h.root, {
    principal: h.owner,
    input: createCharacterSchema.parse({
      handle,
      name: handle,
      description: `${handle} description`,
      ...(avatar === undefined ? {} : { avatarAssetId: avatar.assetId }),
    }),
  });
  return view.id;
}

/** A persona of `principal`; the description defaults to one built from the name. */
export async function addPersona(
  h: ChatRoot,
  principal: Principal,
  name: string,
  options: { readonly avatar?: StoredAvatar; readonly description?: string } = {},
): Promise<PersonaId> {
  const { view } = await seedPersona(h.root, {
    principal,
    input: createPersonaSchema.parse({
      name,
      description: options.description ?? `${name} description`,
      ...(options.avatar === undefined ? {} : { avatarAssetId: options.avatar.assetId }),
    }),
  });
  return view.id;
}

/** A new room of the owner's with the given roster and no opening line. */
export async function startRoom(h: ChatRoot, characterIds: readonly CharacterId[]): Promise<ChatId> {
  const { view } = await seedChat(h.root, { principal: h.owner, characterIds: [...characterIds], opening: "none" });
  return view.chat.id;
}
