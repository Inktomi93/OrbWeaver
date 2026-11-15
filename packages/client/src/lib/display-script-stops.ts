// The display scripts stopped this page session, as one store: stopped by this browser's display pass or the
// editor's preview, or reported by a server pass of the host's room. It holds no Worker, so the lib barrel carries
// it to the roster and the room's warning surface; the runner (`display-pass-runner.ts`) is what stops a script.
//
// A stop is keyed by the script's id and its pattern, so an edit runs it again. Browser stops raise ONE notice,
// updated in place as they accumulate (a preset of two hundred slow scripts must not stack two hundred toasts).
// Only a browser stop keeps a script out of this browser's runs: a server pass is a different pass with its own
// deadline.

import type { RegexNotAppliedCause, RegexServerPass } from "@orb/contracts/chat";
import type { RegexScriptRow } from "@orb/contracts/regex";
import type { DisplayStopReason } from "./display-pass-copy.ts";
import { displayScriptsStoppedDescription, displayScriptsStoppedTitle } from "./display-pass-copy.ts";
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
  const latest = fresh.at(-1);
  if (latest === undefined) {
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
  if (!notice) {
    return;
  }
  notify.warn({
    id: STOPPED_NOTICE_ID,
    title: displayScriptsStoppedTitle(stoppedKeys.size),
    description: displayScriptsStoppedDescription(latest.name, reason, stoppedKeys.size),
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
