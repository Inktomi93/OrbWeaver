// The theme-editor's autosave save path — mirrors `usePresetAutosave`'s deferred-mint shape (no fork
// choice here; a theme has no "already forked" convergence question, only DRAFT vs owned row). Writes
// through `updateTheme`, and for a DRAFT session (`mint` supplied) intercepts the FIRST save to mint the
// real row first — nothing is written until the autosave driver's own debounce fires on a real edit, so
// opening a customize/new-theme session and navigating straight back mints nothing (the mechanism the old
// `MintOnFirstEdit` + `form.Subscribe` machinery existed for; the autosave driver's own
// edit → debounce → save chain now IS that trigger, so the manual subscription is gone).

import type { Theme } from "@orb/contracts/theme";
import type { ThemeId } from "@orb/kit/ids";
import { useRef, useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import type { ThemeFormValues } from "../lib/theme-editor-model.ts";
import { themeInputFromForm } from "../lib/theme-editor-model.ts";
import { useUpdateTheme } from "./use-theme-mutations.ts";

export interface ThemeAutosaveDeps {
  /** The OWNED theme being edited — or, with `mint`, the DRAFT values a not-yet-existing row starts from. */
  readonly theme: Theme;
  /** DRAFT session: create the row this session edits, and resolve to it. Called AT MOST ONCE, by the
   *  autosave driver's first real save (or a retry that beat it). Omit for an existing row. */
  readonly mint?: () => Promise<Theme>;
}

export interface ThemeAutosaveHandle {
  /** The `save` the autosave session drives. */
  readonly save: (values: ThemeFormValues) => Promise<void>;
  /** The server's de-collided name ("Mocha copy" → "Mocha copy 2") the instant a mint resolves, or `null`
   *  before that — the editor applies it to the `name` field ONLY while that field is still untouched
   *  (the same guard the old `ensureRow` inlined; here it must live in the render body, where the live
   *  session's form is reachable, not in this hook). */
  readonly mintedName: string | null;
}

/** The editor's save path: a serialized single mint (idempotent replay-safe — a save that races the mint
 *  awaits the same promise, so it can never patch the seed it was customizing) ahead of every write. */
export function useThemeAutosave({ theme, mint }: ThemeAutosaveDeps): ThemeAutosaveHandle {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateTheme = useUpdateTheme({ trpc, invalidation });
  const themeId = theme.id as ThemeId;

  // The row this session actually writes to, and the single in-flight mint. Both are refs: read/written
  // only inside `ensureRow`, never at render.
  const rowIdRef = useRef<ThemeId | null>(mint === undefined ? themeId : null);
  const mintRef = useRef<Promise<Theme> | null>(null);
  const [mintedName, setMintedName] = useState<string | null>(null);

  const ensureRow = async (): Promise<ThemeId> => {
    const existing = rowIdRef.current;
    if (existing !== null || mint === undefined) {
      return existing ?? themeId;
    }
    const pending = mintRef.current ?? mint();
    mintRef.current = pending;
    try {
      const row = await pending;
      rowIdRef.current = row.id as ThemeId;
      setMintedName(row.name);
      return row.id as ThemeId;
    } catch (err) {
      // Let a retry (the autosave driver's own retry affordance, or the next debounced attempt) mint
      // again rather than inheriting the rejection.
      mintRef.current = null;
      throw err;
    }
  };

  const save = async (values: ThemeFormValues): Promise<void> => {
    await updateTheme.mutateAsync({ id: await ensureRow(), input: themeInputFromForm(values) });
  };

  return { save, mintedName };
}
