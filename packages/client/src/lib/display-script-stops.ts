// The display scripts stopped this page session, as one store: stopped by this browser's display pass or the
// editor's preview, or reported by a server pass of the host's room. It holds no Worker, so the lib barrel carries
// it to the roster and the room's warning surface; the runner (`display-pass-runner.ts`) is what stops a script.
//
// A stop is keyed by the script's id and its pattern, so an edit runs it again. Browser stops raise ONE notice,
// updated in place as they accumulate (a preset of two hundred slow scripts must not stack two hundred toasts).
// Only a browser stop keeps a script out of this browser's runs: a server pass is a different pass with its own
// deadline.
//
// A STOP A ROW SHOWS RAISES NO NOTICE. A script whose row is in view (`showStopRow`) reads its stop inline, and a
// toast beside it says the same thing twice. The notice's next step belongs to the room, which can name the reader's
// control and open the script's row, so the room lends it through `bindStopNoticeDoor`; with no room bound the notice
// states the stop alone.

import type { RegexNotAppliedCause, RegexServerPass } from "@orb/contracts/chat";
import type { RegexScriptRow } from "@orb/contracts/regex";
import type { DisplayStopReason } from "./display-pass-copy.ts";
import { displayScriptsStoppedDescription, displayScriptsStoppedTitle } from "./display-pass-copy.ts";
import type { NotifyAction } from "./notify.ts";
import { notify } from "./notify.ts";

const STOPPED_NOTICE_ID = "display-scripts-stopped";

/** Which script a stop names: its row id, or `null` for an editor draft that has none yet. */
export interface StopSubject {
  readonly id: RegexScriptRow["id"] | null;
  /** The pattern it was stopped on: an edit that changes the pattern runs the script again. */
  readonly findRegex: string;
  readonly name: string;
}

/** A script stopped this session: by this browser's display pass or preview, or reported by a server pass of the
 *  host's room (`noteServerStoppedScript`). Only a browser stop keeps the script out of this browser's runs. */
export type StoppedDisplayScript = StopSubject &
  (
    | { readonly side: "browser"; readonly reason: DisplayStopReason }
    | { readonly side: "server"; readonly cause: RegexNotAppliedCause; readonly pass: RegexServerPass }
  );

/** What a room adds to a browser stop's notice for the script it names. */
export interface StopNoticeDoor {
  /** The reader's next step for this script, or `undefined` when the room cannot yet say whose control it is. */
  readonly fix: (script: StopSubject) => string | undefined;
  readonly action: (script: StopSubject) => NotifyAction | undefined;
}

let noticeDoor: StopNoticeDoor | null = null;

/** Lend the mounted room's door to the browser stop notice; the returned function takes it back. */
export function bindStopNoticeDoor(door: StopNoticeDoor): () => void {
  noticeDoor = door;
  return (): void => {
    if (noticeDoor === door) {
      noticeDoor = null;
    }
  };
}

const shownRows = new Map<string, number>();

/** Record that a row for this script is in view, where a stop on it reads inline; the returned function removes it. */
export function showStopRow(script: Pick<StopSubject, "id" | "findRegex">): () => void {
  const key = displayScriptStopKey(script);
  shownRows.set(key, (shownRows.get(key) ?? 0) + 1);
  return (): void => {
    const rest = (shownRows.get(key) ?? 1) - 1;
    if (rest === 0) {
      shownRows.delete(key);
    } else {
      shownRows.set(key, rest);
    }
  };
}

/** Whether a row for this script is in view. */
export function isStopRowShown(script: Pick<StopSubject, "id" | "findRegex">): boolean {
  return shownRows.has(displayScriptStopKey(script));
}

const stoppedKeys = new Set<string>();
let stopped: readonly StoppedDisplayScript[] = [];
const stoppedListeners = new Set<() => void>();

/** The scripts stopped this session, as a store for `useSyncExternalStore`. */
export const stoppedDisplayScripts = {
  subscribe(listener: () => void): () => void {
    stoppedListeners.add(listener);
    return (): void => {
      stoppedListeners.delete(listener);
    };
  },
  getSnapshot(): readonly StoppedDisplayScript[] {
    return stopped;
  },
};

/** Whether a browser stop keeps this script out of this browser's runs. */
export function isDisplayScriptStopped(script: Pick<StopSubject, "id" | "findRegex">): boolean {
  return stoppedKeys.has(displayScriptStopKey(script));
}

/** What a stop is keyed by: the script and the pattern it was stopped on. */
export function displayScriptStopKey(script: Pick<StopSubject, "id" | "findRegex">): string {
  return `${script.id ?? ""}\u0000${script.findRegex}`;
}

/** Stop scripts for the session; a script already stopped stays as it was. */
export function stopDisplayScripts(scripts: readonly StopSubject[], reason: DisplayStopReason, notice: boolean): void {
  const fresh = scripts.filter((script) => !stoppedKeys.has(displayScriptStopKey(script)));
  if (fresh.length === 0) {
    return;
  }
  for (const script of fresh) {
    stoppedKeys.add(displayScriptStopKey(script));
  }
  stopped = [
    ...stopped,
    ...fresh.map((script): StoppedDisplayScript => ({ id: script.id, findRegex: script.findRegex, name: script.name, side: "browser", reason })),
  ];
  for (const listener of stoppedListeners) {
    listener();
  }
  // The notice names the newest stop no row shows; when every row shows its own, the notice would only repeat them.
  const named = fresh.findLast((script) => !isStopRowShown(script));
  if (!notice || named === undefined) {
    return;
  }
  const action = noticeDoor?.action(named);
  notify.warn({
    id: STOPPED_NOTICE_ID,
    title: displayScriptsStoppedTitle(stoppedKeys.size),
    description: displayScriptsStoppedDescription(named.name, reason, stoppedKeys.size, noticeDoor?.fix(named)),
    ...(action === undefined ? {} : { action }),
  });
}

/** Record that a server pass did not apply a host script, keyed as a browser stop is, so the roster marks it. It
 *  leaves the browser's own runs alone: the display pass is a different pass with its own deadline. A later report
 *  for the same script and pattern replaces the earlier one. */
export function noteServerStoppedScript(script: StopSubject, cause: RegexNotAppliedCause, pass: RegexServerPass): void {
  const key = displayScriptStopKey(script);
  const kept = stopped.filter((entry) => entry.side !== "server" || displayScriptStopKey(entry) !== key);
  stopped = [...kept, { id: script.id, findRegex: script.findRegex, name: script.name, side: "server", cause, pass }];
  for (const listener of stoppedListeners) {
    listener();
  }
}
