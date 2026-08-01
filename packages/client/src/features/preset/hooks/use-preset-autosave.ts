// The preset editor's ONE save path — every autosave write goes through `preset.update` here, together with
// the fork-once retarget the LOCKED built-in default needs, and the fork CHOICE that retarget now asks for.
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
//
// THE CHOICE (owner ruling): the copy-on-write is silent only while there is nothing to forget. Once the
// owner already has a fork of the built-in, this is where the write is INTERCEPTED — the save chain parks on
// a promise the dialog resolves, and nothing is written until they pick: keep editing the fork they have (the
// server's own convergence pick, resolved here so the dialog can NAME it) or mint a new one. This is the ONE
// place a built-in edit enters the mutation path, so it is the only place the question can be asked once per
// session rather than per debounced field — after either arm, `forkRef` retargets and no later save is a COW
// at all. `preset.list` is what makes the question answerable (which forks exist, what they are called); the
// library pane already holds it, so the editor's read is a cache hit.

import type { PromptConfig } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { selectPreset } from "#state";
import { mergeOnSubmit } from "../lib/preset-editor-model";
import { findConvergenceFork, suggestForkName } from "../lib/preset-fork-choice";
import { useSetDefaultPreset, useUpdatePreset } from "./use-preset-mutations";

export interface PresetAutosaveDeps {
  /** The preset the editor currently has open (the LIST selection). */
  readonly presetId: PresetId;
  /** The server row's config — `mergeOnSubmit`'s normalization base (schemaVersion + server-only blobs). */
  readonly server: PromptConfig;
  /** `settings.config.seeds.defaultPresetId` — `null` means the built-in default is the active pick. */
  readonly activePresetId: string | null;
}

/** The open question: this edit targets the built-in and the owner already has a fork of it. */
export interface PresetForkChoicePrompt {
  /** The built-in default's name. */
  readonly sourceName: string;
  /** The fork "keep editing" would land on (the server's convergence pick — the oldest). */
  readonly forkName: string;
  /** The pre-filled name for a new fork. */
  readonly suggestedName: string;
}

export interface PresetAutosaveHandle {
  /** The `save` the autosave boundary drives. Rejects on failure (the session lights its retry affordance). */
  readonly save: (values: PromptConfig) => Promise<void>;
  /** Non-null while a save is parked on the owner's choice — the surface renders the dialog for it. */
  readonly forkChoice: PresetForkChoicePrompt | null;
  /** Answer with "land it on the fork I already have". */
  readonly keepEditingFork: () => void;
  /** Answer with "mint a new fork called `name`". */
  readonly startNewFork: (name: string) => void;
}

/** The editor's save path: serialized writes, the built-in's fork retarget, and the choice that precedes it. */
export function usePresetAutosave({ presetId, server, activePresetId }: PresetAutosaveDeps): PresetAutosaveHandle {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const update = useUpdatePreset({ trpc, invalidation });
  const setDefault = useSetDefaultPreset({ trpc, invalidation });
  // The library rows — read for the fork question only (which forks of the built-in exist, and their names).
  const { data: presets } = useSuspenseQuery(trpc.preset.list.queryOptions());

  // The fork this session minted, keyed by its origin id. Read/written only inside the save callback.
  const forkRef = useRef<{ readonly from: PresetId; readonly to: PresetId } | null>(null);
  // The save queue — saves run strictly one at a time so the fork response always lands before the next write.
  const chainRef = useRef<Promise<unknown>>(Promise.resolve());
  // The parked save's answer sink: `null` = the new fork's name, a string = keep editing / mint under it.
  const answerRef = useRef<((name: string | null) => void) | null>(null);
  const [forkChoice, setForkChoice] = useState<PresetForkChoicePrompt | null>(null);

  /** Point every later save at `to`, and move the editor + the active-for-generation pick with it. */
  const retarget = (from: PresetId, to: PresetId): void => {
    forkRef.current = { from, to };
    if (activePresetId === null || activePresetId === from) {
      setDefault.mutate({ section: "seeds", patch: { defaultPresetId: to } });
    }
    selectPreset(to);
  };

  /** The owner's answer, or `undefined` when nothing is being asked: `null` = keep editing, string = new fork. */
  const answer = (name: string | null): void => {
    const resolve = answerRef.current;
    answerRef.current = null;
    setForkChoice(null);
    resolve?.(name);
  };

  /** Ask, then write where the owner said. `sourceName` is the built-in's; `existing` is the convergence fork. */
  const saveWithChoice = async (targetId: PresetId, sourceName: string, existing: (typeof presets)[number], config: PromptConfig): Promise<void> => {
    // Park the chain — NOTHING is written until the owner answers (dismissal answers "keep editing").
    const chosenName = await new Promise<string | null>((resolve) => {
      answerRef.current = resolve;
      setForkChoice({
        sourceName,
        forkName: existing.name,
        suggestedName: suggestForkName(
          sourceName,
          presets.filter((p) => p.forkedFrom === targetId).length,
          presets.map((p) => p.name),
        ),
      });
    });
    if (chosenName === null) {
      // Keep editing: the edit lands DIRECTLY on the existing fork — no copy-on-write, so nothing is minted.
      await update.mutateAsync({ id: existing.id, config });
      retarget(targetId, existing.id);
      return;
    }
    const minted = await update.mutateAsync({ id: targetId, config, fork: { mode: "new", name: chosenName } });
    retarget(targetId, minted.id);
  };

  const save = (values: PromptConfig): Promise<void> => {
    const run = chainRef.current.then(async (): Promise<void> => {
      const fork = forkRef.current;
      const targetId = fork !== null && fork.from === presetId ? fork.to : presetId;
      const config = mergeOnSubmit(values, server);

      const source = presets.find((p) => p.id === targetId);
      const existing = source?.isSystemDefault === true ? findConvergenceFork(presets, targetId) : null;
      if (source !== undefined && existing !== null) {
        await saveWithChoice(targetId, source.name, existing, config);
        return;
      }

      const row = await update.mutateAsync({ id: targetId, config });
      if (row.id === targetId) {
        return; // a plain patch of an owned row
      }
      retarget(targetId, row.id);
    });
    // The queue must survive a rejected save (else every later save inherits the rejection); the caller still
    // gets the rejecting promise so the session's own error/retry lifecycle runs.
    chainRef.current = run.catch(() => undefined);
    return run;
  };

  return {
    save,
    forkChoice,
    keepEditingFork: (): void => answer(null),
    startNewFork: (name: string): void => answer(name),
  };
}
