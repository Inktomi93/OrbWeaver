// The preset editor's ONE save path — every autosave write goes through `preset.update` here, together with
// the fork-once retarget the LOCKED built-in default needs.
//
// The built-in is copy-on-write SERVER-side: `preset.update` against the system default inserts a new OWNED
// fork ("Default (edited)") and returns ITS id (server `domain/preset/verbs/update.ts`) — the response id is
// the only signal a fork happened. Closing that loop is the editor's job, and before this it did not: every
// debounced field save still targeted the built-in, so one editing session minted a fork PER FIELD (the owner
// dogfooded ten "Default (edited)" rows) and none of them ever became the active-for-generation pick, making
// every edit a no-op at generation time.
//
// The mint happens exactly ONCE because of two things here:
//   • the SERIALIZED chain — a save awaits the previous save, so a second field's debounce can never be
//     in-flight against the built-in while the first save's fork response is still pending (the flood race);
//   • `forkRef` — written from the fork response BEFORE the chain releases the next save, so every later
//     write patches the fork. Keyed by the id it forked FROM, so switching to a third preset can't inherit it.
//
// The retarget rides the same await, atomically with the mint: the LIST selection swaps to the fork (the
// editor, its header and the library row all follow the selection), and the ACTIVE-for-generation seed moves
// to the fork when the built-in was what was active (`defaultPresetId === null` is the built-in, or an
// explicit pointer at the row we just forked). Leaving the built-in active is what made the edits invisible.
// The swap costs one `preset.get` fetch on the new id (a brief editor fallback) — priming that cache from the
// mutation response is imperative cache surgery, which `client-cache-surgery-only-in-data` correctly bans.

import type { PromptConfig } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { useRef } from "react";
import { useInvalidation, useTRPC } from "#data";
import { selectPreset } from "#state";
import { mergeOnSubmit } from "../lib/preset-editor-model";
import { useSetDefaultPreset, useUpdatePreset } from "./use-preset-mutations";

export interface PresetAutosaveDeps {
  /** The preset the editor currently has open (the LIST selection). */
  readonly presetId: PresetId;
  /** The server row's config — `mergeOnSubmit`'s normalization base (schemaVersion + server-only blobs). */
  readonly server: PromptConfig;
  /** `settings.config.seeds.defaultPresetId` — `null` means the built-in default is the active pick. */
  readonly activePresetId: string | null;
}

/** The `save` the autosave boundary drives. Rejects on failure (the session lights its retry affordance). */
export function usePresetAutosave({ presetId, server, activePresetId }: PresetAutosaveDeps): (values: PromptConfig) => Promise<void> {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const update = useUpdatePreset({ trpc, invalidation });
  const setDefault = useSetDefaultPreset({ trpc, invalidation });

  // The fork this session minted, keyed by its origin id. Read/written only inside the save callback.
  const forkRef = useRef<{ readonly from: PresetId; readonly to: PresetId } | null>(null);
  // The save queue — saves run strictly one at a time so the fork response always lands before the next write.
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());

  return (values: PromptConfig): Promise<void> => {
    const run = chainRef.current.then(async (): Promise<void> => {
      const fork = forkRef.current;
      const targetId = fork !== null && fork.from === presetId ? fork.to : presetId;
      const row = await update.mutateAsync({ id: targetId, config: mergeOnSubmit(values, server) });
      if (row.id === targetId) {
        return; // a plain patch of an owned row
      }
      forkRef.current = { from: targetId, to: row.id };
      if (activePresetId === null || activePresetId === targetId) {
        setDefault.mutate({ section: "seeds", patch: { defaultPresetId: row.id } });
      }
      selectPreset(row.id);
    });
    // The queue must survive a rejected save (else every later save inherits the rejection); the caller still
    // gets the rejecting promise so the session's own error/retry lifecycle runs.
    chainRef.current = run.catch(() => undefined);
    return run;
  };
}
