// createFormHandleBridge — the generic module-scope external store that publishes a live editor-form
// handle across a shell-region boundary (clone-audit item 6). Content (which owns the form) and Context
// (an inspector) share no React ancestor below the route, so lexical form context can't cross — the
// editor publishes its live handle on mount and clears on unmount, and the inspector subscribes via
// `useSyncExternalStore`. character-editor-bridge + preset-editor-bridge duplicated this mechanism
// verbatim; this is the ONE home, each feature keeps a thin typed instantiation + its own `resolve*` gate.

import { useSyncExternalStore } from "react";

/** A single-handle external store: publish/clear the live handle, read it, or subscribe reactively. */
export interface FormHandleBridge<THandle> {
  /** Publish the live handle — the editor's mount effect. Replaces any prior handle. */
  readonly publish: (next: THandle) => void;
  /** Clear the handle — the editor's unmount cleanup. Subscribers then see `null`. */
  readonly clear: () => void;
  /** Non-reactive snapshot (guard/delete code paths + tests read it directly). */
  readonly read: () => THandle | null;
  /** Reactive: the currently-published handle (`null` = no editor mounted). */
  readonly useHandle: () => THandle | null;
}

/** Mint a form-handle bridge. One editor is mounted at a time, so a single published handle is the store. */
export function createFormHandleBridge<THandle>(): FormHandleBridge<THandle> {
  let handle: THandle | null = null;
  const listeners = new Set<() => void>();

  const emit = (): void => {
    for (const listener of listeners) {
      listener();
    }
  };
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return (): void => {
      listeners.delete(listener);
    };
  };
  const getSnapshot = (): THandle | null => handle;

  return {
    publish(next: THandle): void {
      handle = next;
      emit();
    },
    clear(): void {
      handle = null;
      emit();
    },
    read(): THandle | null {
      return handle;
    },
    useHandle(): THandle | null {
      return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    },
  };
}
