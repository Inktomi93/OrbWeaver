// The host slot pools' FILE LAYER (./host-slots.ts holds the doors and the queue): the owned-directory and
// planted-entry refusals, the slot/ticket record reader, the liveness verdict, and the one exclusive-create
// sweep. Every rule in the host-slots.ts header binds here too; this module only owns where it is enforced.
import { chmodSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import process from "node:process";

/** Who holds a slot, as its file records it. */
export interface HostSlotHolder {
  readonly pid: number;
  readonly startedAt: string;
  readonly label: string;
}

const GROUP_OR_OTHER_WRITE = 0o022;
const OWNER_ONLY_DIR = 0o700;

// POSIX ownership and mode are the check where the platform has them; Windows has neither, and its temp
// dir is already per-user.
function refuseForeignDir(dir: string): void {
  const stat = lstatSync(dir);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error(`host pool directory ${dir} is a symlink or not a directory — refusing to write through it.`);
  }
  const uid = process.getuid?.();
  if (uid === undefined) {
    return;
  }
  if (stat.uid !== uid) {
    throw new Error(`host pool directory ${dir} must be owned by uid ${String(uid)} — refusing to use it.`);
  }
  // The current uid owns it, so a too-permissive mode (0775, left by older code) is OURS to fix, not a
  // reason to refuse: tighten it in place rather than wedging every later run on a directory we made.
  // biome-ignore lint/suspicious/noBitwiseOperators: a POSIX file mode is an OS-owned bitfield; masking it is the only way to read the group and other write bits.
  if ((stat.mode & GROUP_OR_OTHER_WRITE) !== 0) {
    chmodSync(dir, OWNER_ONLY_DIR);
  }
}

/** Create (owner-only) or accept one pool directory, and refuse one that is not ours. */
export function ownedDir(dir: string): string {
  mkdirSync(dir, { recursive: true, mode: OWNER_ONLY_DIR });
  refuseForeignDir(dir);
  return dir;
}

/** A pool entry is absent or a regular file; anything else is a planted entry and is refused. */
function refusePlantedEntry(path: string): void {
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat !== undefined && !stat.isFile()) {
    throw new Error(`host pool entry ${path} is a symlink or not a regular file — refusing to read or replace it.`);
  }
}

/** A slot file or a queue ticket. `beatMs` is the writer's last heartbeat: a holder rewrites its slot file
 *  and a waiter its ticket on a timer, so a record whose beat stopped belongs to a frozen writer or to a
 *  pid the OS handed to something else. `null` is a record an older writer left without one. */
export interface PoolRecord extends HostSlotHolder {
  readonly beatMs: number | null;
}

export function readHolder(path: string): PoolRecord | null {
  refusePlantedEntry(path);
  // @orb-waive caught-failure-ownership(catch): the FAILURE IS THE VERDICT — an unreadable or half-written slot file is DEBRIS, and `null` is how this reader says so to its one caller, which then STEALS the slot and PRINTS that it did. Any other surfacing wedges the box on a torn write. Ends if a caller starts reading `null` as "someone holds this".
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const row = parsed as Record<string, unknown>;
    const pid = row["pid"];
    if (typeof pid !== "number") {
      return null;
    }
    return {
      pid,
      startedAt: typeof row["startedAt"] === "string" ? row["startedAt"] : "unknown",
      label: typeof row["label"] === "string" ? row["label"] : "",
      beatMs: typeof row["beatMs"] === "number" ? row["beatMs"] : null,
    };
  } catch {
    return null;
  }
}

/** The process table and the clock as this module reads them, injected as one unit so a faked table
 *  never meets a real clock. `staleAfterMs` is how long a record may go without a beat. */
export interface Liveness {
  readonly alive: (pid: number) => boolean;
  readonly nowMs: () => number;
  readonly staleAfterMs: number;
}

const HOLDER_STATES = ["live", "gone", "silent"] as const;
type HolderState = (typeof HOLDER_STATES)[number];

/** `alive` runs first: a pid that is gone, or foreign (EPERM), is gone. A live pid whose record's beat is
 *  older than the window is silent: a frozen holder, or a recycled pid that never refreshes a file it does
 *  not know. A record with no beat at all is judged by the pid alone. */
export function holderState(liveness: Liveness, holder: PoolRecord): HolderState {
  if (!liveness.alive(holder.pid)) {
    return "gone";
  }
  if (holder.beatMs === null) {
    return "live";
  }
  return liveness.nowMs() - holder.beatMs <= liveness.staleAfterMs ? "live" : "silent";
}

export const STATE_TEXT: Readonly<Record<Exclude<HolderState, "live">, string>> = { gone: "no such process", silent: "no heartbeat" };

export function defaultAlive(pid: number): boolean {
  // @orb-waive caught-failure-ownership(catch): `kill(pid, 0)` ASKS A QUESTION and throws to answer "no" — the throw IS the ESRCH answer, not a lost failure, and the caller acts on the boolean by stealing the slot and saying so out loud. Ends if this ever needs to distinguish EPERM from ESRCH.
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Rewrite a record in place through a rename, so a reader never sees a torn record. The temp file is
 *  created exclusively; a leftover one is removed first, never written through. */
export function rewriteRecord(path: string, record: PoolRecord, pid: number): void {
  const tmp = `${path}.${String(pid)}.tmp`;
  rmSync(tmp, { force: true });
  writeFileSync(tmp, `${JSON.stringify(record)}\n`, { flag: "wx" });
  renameSync(tmp, path);
}

interface SweepInput {
  readonly paths: readonly string[];
  readonly body: string;
  readonly liveness: Liveness;
}

/** ONE sweep across `paths`. Three outcomes: the INDEX taken · `"stole"` (nothing taken, but at least one
 *  dead holder's file was cleared, so the caller must sweep again AT ONCE) · `null` (every file is held by
 *  a LIVE holder).
 *
 *  A stolen file is re-attempted on the NEXT sweep rather than written straight away, because another
 *  waiter may have won the same steal — a second `wx` is how we find that out without a second race. */
export function takeAnySlot(input: SweepInput, onNotice: ((message: string) => void) | undefined): number | "stole" | null {
  let stole = false;
  for (const [index, path] of input.paths.entries()) {
    // `wx` is the whole mechanism: an EXCLUSIVE create is atomic, so two runners racing this line cannot
    // both win. A pre-read-then-write would have a window exactly the size of the defect.
    // @orb-waive caught-failure-ownership(catch): the EEXIST throw IS "this slot is taken" — the catch arm reads the holder and either moves to the next slot (live) or STEALS the slot with a printed note (dead). Every path out of it is owned and visible. Ends if this stops re-deciding and starts swallowing.
    try {
      writeFileSync(path, input.body, { flag: "wx" });
      return index;
    } catch {
      const holder = readHolder(path);
      // A LIVE holder is a holder, even if its pid is OURS. Exempting our own pid so a recycled pid could
      // be stolen made the cap silently double-issue: one process holding both CT slots was handed slot 1
      // a third time, because it read its own record as debris. A recycled pid is caught by its silence
      // instead: the new process never refreshes a file it does not know.
      const state = holder === null ? "gone" : holderState(input.liveness, holder);
      if (holder !== null && state === "live") {
        continue;
      }
      const who = holder === null || state === "live" ? "an unreadable record" : `pid ${String(holder.pid)} (${STATE_TEXT[state]})`;
      onNotice?.(`host slot file ${path} was held by ${who} — stealing it; a dead holder must never wedge the box.`);
      rmSync(path, { force: true });
      stole = true;
    }
  }
  return stole ? "stole" : null;
}

/** Every slot's live holder, in slot order — the list a caller's "queued behind" sentence is built from. */
export function liveHolders(paths: readonly string[], liveness: Liveness): readonly HostSlotHolder[] {
  const holders: HostSlotHolder[] = [];
  for (const path of paths) {
    const holder = readHolder(path);
    if (holder !== null && holderState(liveness, holder) === "live") {
      holders.push(holder);
    }
  }
  return holders;
}
