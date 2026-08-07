// The regex LIBRARY mutations (D121-E). Module-scope `createEntityMutation` factories (the D54 §13.1
// editor-factory pattern), all `busDriven`: every regex verb emits `regexChanged`, and the invalidation map
// path-invalidates the whole `regex` router — so no call site hand-invalidates and no read goes stale after
// a mutation on another device.
//
// There is no autosave section-patch here any more. The library is ROWS, so the surface issues real CRUD.

import type { CreateRegexScriptInput, RegexScriptRow, UpdateRegexScriptInput } from "@orb/contracts/regex";
import type { RegexScriptId } from "@orb/kit/ids";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
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

/** The row kebab's Duplicate — a fresh unattached "<name> (copy)" row (the server verb detaches at every
 *  scope, so a copy never silently inherits the original's global/preset/character/room membership). */
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

// ── The BULK arm (REGX2) ──────────────────────────────────────────────────────────────────────────────
// One mutation per batch verb, `busDriven` like every sibling: each server verb emits ONE `regexChanged`
// for the whole batch, so a 20-script gesture repaints the library once instead of twenty times. Every one
// answers `{affected}` — the count the server actually changed, which is what the toast says.

// `scriptIds` is a MUTABLE array, matching the wire input tsc infers from the router's `z.array(brandedId)`
// (the `applyScopeOrder` mutation's `orderedScriptIds` shape verbatim — a readonly array is not assignable
// to it under this project's settings, and re-declaring the outcome by hand would fork the wire type).
interface RegexBulkArgs {
  readonly scriptIds: RegexScriptId[];
}

/** The batch verbs' shared answer, DERIVED from the wire rather than re-spelled. NOT exported (the house
 *  shape for a client-feature derived type): a consumer re-derives it from the same proc. */
type RegexBulkOutcome = inferOutput<Trpc["regex"]["bulkRemove"]>;

export const useBulkSetRegexEnabled = createEntityMutation<RegexBulkArgs & { readonly enabled: boolean }, RegexBulkOutcome>({
  options: (trpc) => trpc.regex.bulkSetEnabled.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't switch those scripts.",
});

export const useBulkSetRegexGlobal = createEntityMutation<RegexBulkArgs & { readonly global: boolean }, RegexBulkOutcome>({
  options: (trpc) => trpc.regex.bulkSetGlobal.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't change those scripts' global scope.",
});

export const useBulkRemoveRegexScripts = createEntityMutation<RegexBulkArgs, RegexBulkOutcome>({
  options: (trpc) => trpc.regex.bulkRemove.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't delete those scripts.",
});

/** The single-entity IMPORT door's mutation (REGX2 · D121-D `band=Import`) — the file's TEXT, through the
 *  same thin-arm verb the backup bundle calls. `created:false` ⇒ it deduped onto a script already in the
 *  library, which is a success, not a failure. */
export const useImportRegexScriptFile = createEntityMutation<{ readonly fileText: string }, { readonly created: boolean }>({
  options: (trpc) => trpc.regex.importScriptFile.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't import that script.",
});
