// domain/plugin/substrate/snippet-gate — the per-USER concurrent-snippet ceiling. `plugin.runSnippet` is the
// one plugin path that mints a context WITHOUT an installed row behind it (every other verb operates on the
// caller's OWN `plugins` row, whose per-plugin belts bound it — a snippet is anonymous and transient, so the
// only unit left to bound it by is the USER), and each call
// mints a whole fresh `QuickJSContext` on the shared WASM module — a 32 MiB memory ceiling held for as long as
// the run takes, up to the snippet's settlement wall. The transport's `general` rate bucket bounds requests per
// MINUTE, which is the wrong axis entirely: it cannot say how many contexts one user may pin AT ONCE, and a
// member well inside that bucket can park a wall's worth of them.
//
// WHY THIS IS THE REAL BOUND AND NOT A BAND-AID (owner ruling: no reachability band-aid on runSnippet). A hung
// snippet already self-heals — the invocation settlement deadline ends it and the caller's `using` frees the
// context — so this is not a leak patch. It is the missing CONCURRENCY belt: the thing that decides how much of
// the host one member may hold simultaneously, which is a ceiling, not a timeout.
//
// SCOPE, stated so it is not mistaken for more: the state is IN-MEMORY and per process
// (`ASSUMES(single-replica)` — the notify-floor / resident-registry precedent). A restart resets it, which is
// the honest bound for a resource belt; a member cannot restart the host. It counts RUNS, not requests: the slot
// is held for the whole call and released in a `finally`, so a refused-mid-run or thrown snippet never leaks one.

import type { UserId } from "@orb/kit/ids";
import { PluginSnippetBusyError } from "../contract/errors.ts";
import type { SnippetGate } from "../contract/ops.ts";

/** Concurrently-running snippets per user. A LEAN, with its resolution criterion recorded: raise it when a real
 *  workflow needs parallel snippets, lower it if measured abuse arrives first. A snippet is a personal REPL — 1
 *  is the usage shape and the slack above it is for a double-submit or a retry over a still-settling run, NOT
 *  for fan-out. Worst case per user at this value: 4 × the 32 MiB context ceiling, released at the wall.
 *
 *  @public Test-anchored module surface; focused tests pin this production-local behavior. */
export const SNIPPET_CONCURRENCY_PER_USER = 4;

/** Build the process-wide snippet gate. Zero state per user at rest: the map holds a key only while that user
 *  has a run in flight (the release deletes the entry at 0), so a long-lived process accumulates nothing and
 *  needs no sweep — the counted thing is inherently transient, unlike the notify floor's cooldown timestamps. */
export function createSnippetGate(max: number = SNIPPET_CONCURRENCY_PER_USER): SnippetGate {
  const running = new Map<UserId, number>();
  return {
    admit: (userId): (() => void) => {
      const current = running.get(userId) ?? 0;
      if (current >= max) {
        throw new PluginSnippetBusyError(max);
      }
      running.set(userId, current + 1);
      // The release is IDEMPOTENT: a caller that somehow released twice must not hand its neighbour a free slot
      // (that would be the negative-drift class the membrane's in-flight counter was just repaired for).
      let released = false;
      return (): void => {
        if (released) {
          return;
        }
        released = true;
        const count = (running.get(userId) ?? 1) - 1;
        if (count <= 0) {
          running.delete(userId);
          return;
        }
        running.set(userId, count);
      };
    },
  };
}
