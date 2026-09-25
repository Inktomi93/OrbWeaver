// The relay controller: off → starting → up(url) → down(reason), one relay at a time. Every launch gets a generation;
// an event from an older process is ignored, so a stop or a restart can never be undone by a late exit or URL.
//
// THE HOST IS ADMITTED ONLY FROM THE CURRENT PROCESS'S FIRST URL, and dropped before anything else happens on a stop or
// a death. A restart gets a new random name, so the old name must never stay admitted.

import type { RelayDownReason, RelayStatus } from "@orb/contracts/identity";
import { getLog } from "#foundation/observability";
import type { RelayProcess } from "#infra/relay";
import type { RelayController, RelayControllerDeps } from "../contract/service.ts";

/** The wait before the first restart after a death; each further restart waits {@link RELAY_RESTART_BACKOFF} times longer. */
export const RELAY_RESTART_FIRST_DELAY_MS = 2000;
export const RELAY_RESTART_BACKOFF = 4;
/** Restarts in a row before the relay stays down for the owner: waits of 2 s, 8 s, 32 s, then about 2 and 8.5 minutes. */
export const RELAY_RESTART_LIMIT = 5;
/** A relay that reports no URL in this long is killed and counted as a death. */
export const RELAY_URL_WAIT_MS = 60_000;
/** A relay up this long has earned a fresh restart budget: its next death starts the schedule over. */
export const RELAY_STABLE_UP_MS = 600_000;

const SHARE_WARNING =
  "Anyone with this link reaches this server's sign-in page. Invite friends from a room's invite dialog; they sign in with the accounts you made for them.";

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function createRelayController(deps: RelayControllerDeps): RelayController {
  const log = getLog();
  let status: RelayStatus = { state: "off" };
  let generation = 0;
  let running: RelayProcess | null = null;
  let host: string | null = null;
  let upSince: number | null = null;
  let restarts = 0;
  let cancelTimer: (() => void) | null = null;

  const cancelPending = (): void => {
    cancelTimer?.();
    cancelTimer = null;
  };

  const dropHost = (): void => {
    if (host !== null) {
      deps.hosts.remove(host);
      host = null;
    }
  };

  function reported(gen: number, url: string): void {
    if (gen !== generation || status.state !== "starting") {
      return;
    }
    let admitted: string;
    try {
      admitted = deps.hosts.add(new URL(url).hostname);
    } catch (err) {
      log.warn({ share: true, err, url }, "share: the relay reported a URL that is not one relay host; ending it");
      died(gen, "no_url", `the relay reported a URL that is not one relay host: ${errorText(err)}`);
      return;
    }
    cancelPending();
    host = admitted;
    upSince = deps.now();
    status = { state: "up", relay: deps.relay, url };
    log.warn({ share: true, url }, `share: this server is shared at ${url}. ${SHARE_WARNING}`);
  }

  function died(gen: number, reason: RelayDownReason, detail: string): void {
    if (gen !== generation) {
      return;
    }
    generation += 1;
    cancelPending();
    running?.stop();
    running = null;
    dropHost();
    if (upSince !== null && deps.now() - upSince >= RELAY_STABLE_UP_MS) {
      restarts = 0;
    }
    upSince = null;
    if (restarts >= RELAY_RESTART_LIMIT) {
      status = { state: "down", relay: deps.relay, reason, restarting: false };
      log.error({ share: true, reason, detail }, "share: the relay keeps dying, so it stays down; start sharing again from the Share card");
      return;
    }
    const delay = RELAY_RESTART_FIRST_DELAY_MS * RELAY_RESTART_BACKOFF ** restarts;
    restarts += 1;
    status = { state: "down", relay: deps.relay, reason, restarting: true };
    log.warn({ share: true, reason, detail, restartInMs: delay }, "share: the relay is down; restarting it under a new link");
    cancelTimer = deps.schedule(() => {
      cancelTimer = null;
      const next = begin(reason);
      launch(next).catch((err: unknown) => {
        log.error({ share: true, err }, "share: a relay restart could not launch");
        died(next, "launch_failed", errorText(err));
      });
    }, delay);
  }

  // A restart keeps its death on `starting`: the down window is shorter than a poll, so the card would miss it.
  function begin(restartAfter: RelayDownReason | null): number {
    cancelPending();
    generation += 1;
    status = { state: "starting", relay: deps.relay, restartAfter };
    return generation;
  }

  async function launch(gen: number): Promise<void> {
    const started = await deps.launcher.launch(deps.origin(), {
      onUrl: (url) => {
        reported(gen, url);
      },
      onExit: (detail) => {
        died(gen, "exited", detail);
      },
    });
    if (gen !== generation) {
      started.stop();
      return;
    }
    running = started;
    if (status.state === "starting") {
      cancelTimer = deps.schedule(() => {
        died(gen, "no_url", `no URL within ${RELAY_URL_WAIT_MS} ms`);
      }, RELAY_URL_WAIT_MS);
    }
  }

  return {
    start: async (): Promise<RelayStatus> => {
      if (status.state === "starting" || status.state === "up") {
        return status;
      }
      restarts = 0;
      const gen = begin(null);
      try {
        await launch(gen);
      } catch (err) {
        if (gen === generation) {
          generation += 1;
          status = { state: "off" };
        }
        throw err;
      }
      return status;
    },
    stop: (): void => {
      generation += 1;
      cancelPending();
      running?.stop();
      running = null;
      host = null;
      deps.hosts.clear();
      upSince = null;
      restarts = 0;
      if (status.state !== "off") {
        log.info({ share: true }, "share: sharing stopped; the relay link no longer reaches this server");
      }
      status = { state: "off" };
    },
    status: (): RelayStatus => status,
  };
}
