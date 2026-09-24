// One security line per key per hour. A key is an address the line is about (a TCP peer, a client address);
// without the throttle a tunnel or a port-forward repeats the same line on every request and buries it.

const NOTICE_WINDOW_MS = 3_600_000;
// Bounds the key map: an IPv6 sender can present an unbounded number of source addresses.
const NOTICE_MAX_KEYS = 1024;

// Drops expired entries once the map is full; true when a new key still fits.
function roomForNewKey(loggedAt: Map<string, number>, at: number): boolean {
  if (loggedAt.size < NOTICE_MAX_KEYS) {
    return true;
  }
  for (const [key, stamp] of loggedAt) {
    if (at - stamp >= NOTICE_WINDOW_MS) {
      loggedAt.delete(key);
    }
  }
  return loggedAt.size < NOTICE_MAX_KEYS;
}

/** Runs `emit` at most once per `key` per hour on the composition root's clock. When the map is full of live
 *  keys, a new key is not logged: the operator already has the notice, and dropping beats an unbounded map. */
export function createKeyedNoticeThrottle(now: () => number): (key: string, emit: () => void) => void {
  const loggedAt = new Map<string, number>();
  return (key, emit) => {
    const at = now();
    const last = loggedAt.get(key);
    if (last === undefined ? !roomForNewKey(loggedAt, at) : at - last < NOTICE_WINDOW_MS) {
      return;
    }
    loggedAt.set(key, at);
    emit();
  };
}
