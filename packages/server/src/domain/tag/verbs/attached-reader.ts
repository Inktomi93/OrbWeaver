// Each injected read retains its owner's admission; only the tag display-name projection lives here.
import type { AttachedEntityReaders } from "../contract/attached-reader.ts";
import type { TagContext } from "../contract/service.ts";

export function createReadAttachedEntity(read: AttachedEntityReaders): TagContext["readAttachedEntity"] {
  return async (caller, target): ReturnType<TagContext["readAttachedEntity"]> => {
    switch (target.targetType) {
      case "character":
        return { ...target, name: (await read.characterName(caller, target.targetId)).name };
      case "chat":
        return { ...target, name: (await read.chatTitle(caller, target.targetId)).title ?? "Untitled chat" };
      case "worldBook":
        return { ...target, name: (await read.worldBookName(caller, target.targetId)).name };
      case "persona":
        return { ...target, name: (await read.personaName(caller, target.targetId)).name };
      case "preset":
        return { ...target, name: (await read.presetName(caller.userId, target.targetId)).name };
      default:
        return target satisfies never;
    }
  };
}
