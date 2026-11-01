import type { CharacterId, ChatId, PresetId, RegexScriptId } from "@orb/kit/ids";
import { createEntityMutation } from "#data";

export const useAttachCharacter = createEntityMutation<{ readonly characterId: CharacterId; readonly scriptId: RegexScriptId }, void>({
  options: (trpc) => trpc.regex.attachToCharacter.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't attach that script to this character.",
});

export const useDetachCharacter = createEntityMutation<{ readonly characterId: CharacterId; readonly scriptId: RegexScriptId }, { readonly detached: boolean }>(
  {
    options: (trpc) => trpc.regex.detachFromCharacter.mutationOptions(),
    busDriven: true,
    errorToast: "Couldn't detach that script from this character.",
  },
);

export const useAttachPreset = createEntityMutation<{ readonly presetId: PresetId; readonly scriptId: RegexScriptId }, void>({
  options: (trpc) => trpc.regex.attachToPreset.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't attach that script to this preset.",
});

export const useDetachPreset = createEntityMutation<{ readonly presetId: PresetId; readonly scriptId: RegexScriptId }, { readonly detached: boolean }>({
  options: (trpc) => trpc.regex.detachFromPreset.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't detach that script from this preset.",
});

export const useAttachChat = createEntityMutation<{ readonly chatId: ChatId; readonly scriptId: RegexScriptId }, void>({
  options: (trpc) => trpc.regex.attachToChat.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't attach that script to this chat.",
});

export const useDetachChat = createEntityMutation<{ readonly chatId: ChatId; readonly scriptId: RegexScriptId }, { readonly detached: boolean }>({
  options: (trpc) => trpc.regex.detachFromChat.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't detach that script from this chat.",
});
