// THE DEPLOYMENT BOOT HINT — this device's remembered answer to the deployment CAPABILITY questions the
// shell must answer SYNCHRONOUSLY, at first paint, instead of ~90ms–4.7s into the boot. One axis today:
// `multiHumanCapable`.
//
// WHY IT EXISTS (measured; #476, escalated from the priced tradeoff #465 recorded in
// `features/notifications/lib/notifications-chrome.tsx`). `/api/auth/config` is fetched at app-root MOUNT,
// so the `topbar.trail` bell's gate reads FALSE for the first frames of every shell life and the bell then
// MOUNTS INTO the trail: `.shell-topbar-trail` 1169,8,99,32 → 1127,7,141,34 (x −42px), a layout-shift value
// of 0.00015 on every boot. It sits an order of magnitude under the `[cls]` flagger's own 0.002 reporting
// floor (`lib/motion-stats.ts` MIN_REPORTED_SHIFT), which is why no console line ever named it — a buffered
// `PerformanceObserver({ type: "layout-shift" })` replay is the only instrument that sees it. The two arms
// without a remembered answer are both wrong: reserve a control that a SINGLE-human deployment will never
// render, or ship this shift on every multi-human boot.
//
// SO THE ANSWER IS PERSISTED HERE, exactly as `appearance-boot-hint.ts` persists the appearance axes, and
// read SYNCHRONOUSLY at first paint (a persisted store rehydrates off localStorage at MODULE INIT, before
// React mounts). This is the same durable-local store class, not a second pattern.
//
// A RENDER HINT, NEVER AN AUTHORIZATION INPUT. It decides whether a SLOT is drawn, nothing more: the bell's
// data, its verbs, and every permission behind them still come from the real config and the real server
// reads. The acceptable failure it buys is a stale hint drawing a bell on a deployment that is no longer
// multi-human, for the milliseconds until the config lands and un-draws it — a corrected slot, never a
// granted capability. Nothing here is ever consulted BESIDE a resolved read.
//
// THE SERVER ALWAYS WINS, and a capability FLIP is never masked: `useMultiHumanCapable` (data/auth-config.ts,
// the one seam that knows the read has landed) returns the resolved value the instant it exists and writes it
// back here, so a deployment that changed its answer corrects both the UI and the device's memory in the same
// commit. A device that has never been told stamps NOTHING — `null`, which reads as the pre-existing floor
// (no bell), which is the honest first-ever-visit arm.

import { createPersistedStore } from "./create-persisted-store.ts";

/** This device's remembered deployment capabilities. `null` = never told, i.e. fall back to the floor. */
interface DeploymentBootHintState {
  /** The last `/api/auth/config.multiHumanCapable` this device was served, or null on a fresh device. */
  readonly multiHumanCapable: boolean | null;
}

const DEFAULT_STATE: DeploymentBootHintState = { multiHumanCapable: null };

const PERSIST_VERSION = 1;

/** TOTAL: anything that is not a remembered boolean degrades to "this device knows nothing". */
function migrate(persisted: unknown): DeploymentBootHintState {
  const value = (persisted as { multiHumanCapable?: unknown } | null | undefined)?.multiHumanCapable;
  return { multiHumanCapable: typeof value === "boolean" ? value : null };
}

const useDeploymentBootHintStore = createPersistedStore<DeploymentBootHintState>("deployment-boot", (): DeploymentBootHintState => DEFAULT_STATE, {
  version: PERSIST_VERSION,
  migrate,
  partialize: (s): DeploymentBootHintState => ({ multiHumanCapable: s.multiHumanCapable }),
});

/** This device's remembered `multiHumanCapable`, or null when it has never been told — the subscribed read
 *  the PENDING arm of `useMultiHumanCapable` renders from. */
export function useMultiHumanCapableHint(): boolean | null {
  return useDeploymentBootHintStore((s) => s.multiHumanCapable);
}

/** Record what the SERVER said about `multiHumanCapable`. Only ever called with an authoritative value. */
export function rememberMultiHumanCapable(capable: boolean): void {
  if (useDeploymentBootHintStore.getState().multiHumanCapable === capable) {
    return;
  }
  useDeploymentBootHintStore.setState({ multiHumanCapable: capable }, false, "deploymentBootHint/rememberMultiHuman");
}

/** Test seam: forget the remembered answers (a CT/unit run must not inherit another test's device). */
export function __resetDeploymentBootHint(): void {
  useDeploymentBootHintStore.setState({ ...DEFAULT_STATE }, false, "deploymentBootHint/__reset");
}
