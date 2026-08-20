// THE BOOT-CRITICAL DEPENDENT-READ GATE (#282). `data-app-ready` (agent-bridge.ts installAppReadySignal)
// settles when the query cache goes idle after a fetch has been seen. That is a LIE for a CHAINED read: the
// selected theme is fetched only once `settings.getUserSettings` resolves (`useSelectedTheme` gates
// `settings.getTheme` on the returned id), so between the parent SETTLING and the child fetch STARTING the
// cache is momentarily idle — and the readiness signal fired there, lifting the boot veil onto the base
// palette a beat before the resolved theme swapped it. On a cold cache with no boot hint a Light user
// therefore cold-loaded the dark base and then flipped: the theme-POLARITY flash. The boot hint
// (appearance-boot-hint.ts) already kills the WARM case; this gate is the COLD one — readiness now WAITS for
// the registered boot-critical reads, exactly as it already waits for an in-flight fetch and for route
// resolution.
//
// A MODULE SINGLETON, not an installAppReadySignal parameter: the reader (agent-bridge, lib tier) and the
// one writer (`useSelectedTheme`, feature tier) both reach it, and keeping it OFF the signal's signature
// leaves every existing readiness caller (the CT stories, the router door) untouched — an empty set never
// delays anything, so a surface with no selected theme (the login screen) settles exactly as before.
//
// SAFETY (the CANNOT-HANG contract): the gate only DELAYS the FIRST settle, and only while a read is
// registered pending. It can never hang a waiter — `data-app-ready` is one-shot (installAppReadySignal's
// `finish` is idempotent), the 20s ceiling still fires `degraded` if a registered read never resolves, and
// the one writer clears the read the instant its chain SETTLES EITHER WAY (success OR error), never on a
// success-only condition that a failed settings/theme read would leave stuck.

/** The readiness signal's read side: are any boot-critical dependent reads still pending? (Local — only
 *  `bootReads` below is exported; the reader imports the value, never the shape.) */
interface BootReadsGate {
  /** TRUE while any registered boot-critical read is still unresolved. */
  readonly isPending: () => boolean;
  /** Fire `onChange` whenever the pending set may have changed; returns the unsubscribe. */
  readonly subscribe: (onChange: () => void) => () => void;
}

const pending = new Set<string>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const onChange of listeners) {
    onChange();
  }
}

/** The gate `installAppReadySignal` reads — the readiness signal holds while this is TRUE. */
export const bootReads: BootReadsGate = {
  isPending: (): boolean => pending.size > 0,
  subscribe: (onChange: () => void): (() => void) => {
    listeners.add(onChange);
    return (): void => {
      listeners.delete(onChange);
    };
  },
};

/**
 * Register (or clear) a NAMED boot-critical read as still-pending — called from the one seam that knows
 * whether the read has settled (`useSelectedTheme` for the theme, keyed `"theme"`). Idempotent; notifies the
 * readiness signal only on an actual change so a settle re-check runs the instant the last read clears.
 */
export function setBootReadPending(key: string, isPending: boolean): void {
  const had = pending.has(key);
  if (isPending === had) {
    return;
  }
  if (isPending) {
    pending.add(key);
  } else {
    pending.delete(key);
  }
  notify();
}

/** Test seam: forget every registered boot-critical read (a CT/unit run must not inherit another's).
 *
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function __resetBootReads(): void {
  if (pending.size === 0) {
    return;
  }
  pending.clear();
  notify();
}
