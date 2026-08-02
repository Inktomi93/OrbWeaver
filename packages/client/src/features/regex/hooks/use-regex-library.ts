// The regex LIBRARY mutations (D121-E). Module-scope `createEntityMutation` factories (the D54 §13.1
// editor-factory pattern), all `busDriven`: every regex verb emits `regexChanged`, and the invalidation map
// path-invalidates the whole `regex` router — so no call site hand-invalidates and no read goes stale after
// a mutation on another device.
//
// There is no autosave section-patch here any more. The library is ROWS, so the surface issues real CRUD.

import type { CreateRegexScriptInput, RegexScriptRow, UpdateRegexScriptInput } from "@orb/contracts/regex";
import type { RegexScriptId } from "@orb/kit/ids";
import { createEntityMutation } from "#data";

export const useCreateRegexScript = createEntityMutation<{ readonly input: CreateRegexScriptInput }, RegexScriptRow>({
  options: (trpc) => trpc.regex.createScript.mutationOptions(),
  busDriven: true, // createScript emits regexChanged → the invalidation map covers regex.pathFilter().
  errorToast: "Couldn't create that regex script.",
});

export const useUpdateRegexScript = createEntityMutation<{ readonly scriptId: RegexScriptId; readonly input: UpdateRegexScriptInput }, RegexScriptRow>({
  options: (trpc) => trpc.regex.updateScript.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't save that regex script.",
});

export const useRemoveRegexScript = createEntityMutation<{ readonly scriptId: RegexScriptId }, { readonly deleted: boolean }>({
  options: (trpc) => trpc.regex.removeScript.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't delete that regex script.",
});

export const useDuplicateRegexScript = createEntityMutation<{ readonly scriptId: RegexScriptId }, RegexScriptRow>({
  options: (trpc) => trpc.regex.duplicateScript.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't duplicate that regex script.",
});

export const useAttachRegexGlobal = createEntityMutation<{ readonly scriptId: RegexScriptId }, void>({
  options: (trpc) => trpc.regex.attachGlobal.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't make that script global.",
});

export const useDetachRegexGlobal = createEntityMutation<{ readonly scriptId: RegexScriptId }, { readonly detached: boolean }>({
  options: (trpc) => trpc.regex.detachGlobal.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't clear that script's global scope.",
});
