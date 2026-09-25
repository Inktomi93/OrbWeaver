// domain/share/relay/controller — the relay state machine over a fake launcher and a manual scheduler, with the REAL
// relay host registry, so what the Host allowlist would admit is read from the same `hosts()` the app reads.

import { DomainOperationError } from "@orb/kit/errors";
import type { RelayControllerDeps } from "@orb/server/domain/share";
import { createRelayController } from "@orb/server/domain/share";
import { createRelayHostRegistry } from "@orb/server/infra/auth";
import type { RelayEvents, RelayLauncher } from "@orb/server/infra/relay";
import { describe } from "vitest";
import {
  RELAY_RESTART_BACKOFF,
  RELAY_RESTART_FIRST_DELAY_MS,
  RELAY_RESTART_LIMIT,
  RELAY_STABLE_UP_MS,
  RELAY_URL_WAIT_MS,
} from "../../../../../packages/server/src/domain/share/relay/controller.ts";
import { createFrozenClock } from "../../../../support/clock.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const ORIGIN = "http://127.0.0.1:8788";
const FIRST = "https://calm-river-four-birds.trycloudflare.com";
const SECOND = "https://quiet-lake-two-foxes.trycloudflare.com";

interface Launched {
  readonly events: RelayEvents;
  stopped: boolean;
}

interface Timer {
  readonly run: () => void;
  readonly ms: number;
  cancelled: boolean;
}

interface Harness {
  readonly clock: ReturnType<typeof createFrozenClock>;
  readonly registry: ReturnType<typeof createRelayHostRegistry>;
  readonly controller: ReturnType<typeof createRelayController>;
  readonly launched: Launched[];
  readonly timers: Timer[];
  readonly origins: string[];
  readonly latest: () => Launched;
  readonly pending: () => Timer[];
  readonly fire: () => Promise<void>;
}

function harness(refuseLaunch: () => Error | null = () => null): Harness {
  const clock = createFrozenClock();
  const registry = createRelayHostRegistry();
  const launched: Launched[] = [];
  const timers: Timer[] = [];
  const origins: string[] = [];
  const launcher: RelayLauncher = {
    launch: (origin, events) => {
      origins.push(origin);
      const refusal = refuseLaunch();
      if (refusal !== null) {
        return Promise.reject(refusal);
      }
      const proc: Launched = { events, stopped: false };
      launched.push(proc);
      return Promise.resolve({
        stop: (): void => {
          proc.stopped = true;
        },
      });
    },
  };
  const deps: RelayControllerDeps = {
    relay: "quick",
    launcher,
    hosts: registry.writer,
    origin: () => ORIGIN,
    now: clock.now,
    schedule: (run, ms) => {
      const timer: Timer = { run, ms, cancelled: false };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
  };
  const controller = createRelayController(deps);
  const latest = (): Launched => {
    const proc = launched.at(-1);
    if (proc === undefined) {
      throw new Error("no relay was launched");
    }
    return proc;
  };
  const pending = (): Timer[] => timers.filter((timer) => !timer.cancelled);
  // Runs the one live timer, as its deadline passing would.
  const fire = async (): Promise<void> => {
    const live = pending();
    expect(live).toHaveLength(1);
    const timer = live[0];
    if (timer === undefined) {
      return;
    }
    timer.cancelled = true;
    timer.run();
    await Promise.resolve();
    await Promise.resolve();
  };
  return { clock, registry, controller, launched, timers, origins, latest, pending, fire };
}

describe("createRelayController", () => {
  test("admits the relay host the moment the relay reports its URL, and reads up with that URL", async () => {
    const h = harness();
    expect(await h.controller.start()).toEqual({ state: "starting", relay: "quick", restartAfter: null });
    expect(h.origins).toEqual([ORIGIN]);
    expect(h.registry.hosts()).toEqual([]);
    h.latest().events.onUrl(FIRST);
    expect(h.registry.hosts()).toEqual(["calm-river-four-birds.trycloudflare.com"]);
    expect(h.controller.status()).toEqual({ state: "up", relay: "quick", url: FIRST });
  });

  test("a start while starting or up runs no second relay", async () => {
    const h = harness();
    await h.controller.start();
    await h.controller.start();
    h.latest().events.onUrl(FIRST);
    expect(await h.controller.start()).toEqual({ state: "up", relay: "quick", url: FIRST });
    expect(h.launched).toHaveLength(1);
  });

  test("stop ends the process and drops the host before anything else can reach it", async () => {
    const h = harness();
    await h.controller.start();
    h.latest().events.onUrl(FIRST);
    h.controller.stop();
    expect(h.latest().stopped).toBe(true);
    expect(h.registry.hosts()).toEqual([]);
    expect(h.controller.status()).toEqual({ state: "off" });
  });

  test("a URL or an exit from a stopped relay is ignored, so it can never re-admit its host", async () => {
    const h = harness();
    await h.controller.start();
    const stale = h.latest();
    h.controller.stop();
    stale.events.onUrl(FIRST);
    stale.events.onExit("late exit");
    expect(h.registry.hosts()).toEqual([]);
    expect(h.controller.status()).toEqual({ state: "off" });
    expect(h.pending()).toEqual([]);
  });

  test("a second URL from the same relay never replaces the first", async () => {
    const h = harness();
    await h.controller.start();
    h.latest().events.onUrl(FIRST);
    h.latest().events.onUrl(SECOND);
    expect(h.registry.hosts()).toEqual(["calm-river-four-birds.trycloudflare.com"]);
    expect(h.controller.status()).toEqual({ state: "up", relay: "quick", url: FIRST });
  });

  test("a death drops the host at once and restarts under a new link after the first backoff", async () => {
    const h = harness();
    await h.controller.start();
    h.latest().events.onUrl(FIRST);
    h.latest().events.onExit("cloudflared exited (code 1, signal null)");
    expect(h.registry.hosts()).toEqual([]);
    expect(h.controller.status()).toEqual({ state: "down", relay: "quick", reason: "exited", restarting: true });
    expect(h.pending().map((timer) => timer.ms)).toEqual([RELAY_RESTART_FIRST_DELAY_MS]);
    await h.fire();
    expect(h.launched).toHaveLength(2);
    // The restart keeps its death until the new URL arrives, so a poll that missed `down` still reads a restart.
    expect(h.controller.status()).toEqual({ state: "starting", relay: "quick", restartAfter: "exited" });
    h.latest().events.onUrl(SECOND);
    expect(h.registry.hosts()).toEqual(["quiet-lake-two-foxes.trycloudflare.com"]);
    expect(h.controller.status()).toEqual({ state: "up", relay: "quick", url: SECOND });
  });

  test("restarts are bounded: past the limit the relay stays down for the owner, with no restart owed", async () => {
    const h = harness();
    await h.controller.start();
    const waits: number[] = [];
    for (let death = 0; death < RELAY_RESTART_LIMIT; death += 1) {
      h.latest().events.onExit(`death ${death}`);
      waits.push(...h.pending().map((timer) => timer.ms));
      await h.fire();
    }
    expect(waits).toEqual(Array.from({ length: RELAY_RESTART_LIMIT }, (_, n) => RELAY_RESTART_FIRST_DELAY_MS * RELAY_RESTART_BACKOFF ** n));
    h.latest().events.onExit("one death too many");
    expect(h.controller.status()).toEqual({ state: "down", relay: "quick", reason: "exited", restarting: false });
    expect(h.pending()).toEqual([]);
    expect(h.launched).toHaveLength(RELAY_RESTART_LIMIT + 1);
  });

  test("a relay up for the stable spell earns a fresh restart budget", async () => {
    const h = harness();
    await h.controller.start();
    for (let death = 0; death < RELAY_RESTART_LIMIT; death += 1) {
      h.latest().events.onExit(`death ${death}`);
      await h.fire();
    }
    h.latest().events.onUrl(FIRST);
    h.clock.advance(RELAY_STABLE_UP_MS);
    h.latest().events.onExit("after a long spell up");
    expect(h.controller.status()).toEqual({ state: "down", relay: "quick", reason: "exited", restarting: true });
    expect(h.pending().map((timer) => timer.ms)).toEqual([RELAY_RESTART_FIRST_DELAY_MS]);
  });

  test("a relay that reports no URL in time is killed and counted as a death", async () => {
    const h = harness();
    await h.controller.start();
    const silent = h.latest();
    expect(h.pending().map((timer) => timer.ms)).toEqual([RELAY_URL_WAIT_MS]);
    await h.fire();
    expect(silent.stopped).toBe(true);
    expect(h.controller.status()).toEqual({ state: "down", relay: "quick", reason: "no_url", restarting: true });
    silent.events.onUrl(FIRST);
    expect(h.registry.hosts()).toEqual([]);
  });

  test("a stop during a pending restart cancels it", async () => {
    const h = harness();
    await h.controller.start();
    h.latest().events.onExit("died");
    h.controller.stop();
    expect(h.pending()).toEqual([]);
    expect(h.controller.status()).toEqual({ state: "off" });
  });

  test("a binary refusal at start rethrows its coded error and leaves the relay off", async () => {
    const h = harness(() => new DomainOperationError("relay_binary_checksum_mismatch", "not the pinned bytes"));
    await expect(h.controller.start()).rejects.toMatchObject({ code: "relay_binary_checksum_mismatch" });
    expect(h.controller.status()).toEqual({ state: "off" });
    expect(h.pending()).toEqual([]);
  });

  test("a restart whose launch is refused counts as a death, reason launch_failed", async () => {
    const outages = new Set<string>();
    const h = harness(() => (outages.has("download") ? new DomainOperationError("relay_binary_download_failed", "offline") : null));
    await h.controller.start();
    h.latest().events.onExit("died");
    outages.add("download");
    await h.fire();
    expect(h.controller.status()).toEqual({ state: "down", relay: "quick", reason: "launch_failed", restarting: true });
    expect(h.pending().map((timer) => timer.ms)).toEqual([RELAY_RESTART_FIRST_DELAY_MS * RELAY_RESTART_BACKOFF]);
  });
});
