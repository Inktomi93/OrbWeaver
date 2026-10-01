// Tracks boot-critical dependent reads, including settings followed by the selected theme.
// An idle query cache can precede a dependent fetch; app-ready-signal must wait for this gate.
// Pending reads still permit the bounded degraded fallback; clearing them can complete late settlement.

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
