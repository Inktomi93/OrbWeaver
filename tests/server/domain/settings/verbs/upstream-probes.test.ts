// @subject packages/server/src/domain/settings/verbs/upstream-probes.ts

import type { UpstreamOf, UpstreamProbeResult } from "@orb/kit/version-identity";
import { createCachedUpstreamProbes, UPSTREAM_ANSWER_TTL_MS } from "@orb/server/domain/settings";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { vi } from "vitest";

const MAIN: UpstreamProbeResult<UpstreamOf<"main">> = { ok: true, upstream: { channel: "main", commit: "commit-one", short: "commit-one", committedAt: null } };
const STABLE: UpstreamProbeResult<UpstreamOf<"stable">> = { ok: true, upstream: { channel: "stable", version: "1.2.3", publishedAt: null } };

test("construction does no I/O, success caches only its own channel, and the exact TTL boundary re-probes", async ({ clock }) => {
  const main = vi.fn(async () => MAIN);
  const stable = vi.fn(async () => STABLE);
  const probes = createCachedUpstreamProbes({ now: clock.now, probes: { main, stable } });
  expect(main).not.toHaveBeenCalled();
  expect(stable).not.toHaveBeenCalled();
  expect(await probes.main()).toEqual(MAIN);
  expect(await probes.stable()).toEqual(STABLE);
  clock.advance(UPSTREAM_ANSWER_TTL_MS - 1);
  expect(await probes.main()).toEqual(MAIN);
  expect(await probes.stable()).toEqual(STABLE);
  expect(main).toHaveBeenCalledTimes(1);
  expect(stable).toHaveBeenCalledTimes(1);
  clock.advance(1);
  expect(await probes.main()).toEqual(MAIN);
  expect(main).toHaveBeenCalledTimes(2);
  expect(stable).toHaveBeenCalledTimes(1);
});

test("a named failure never occupies the answer cache; the next click really retries", async ({ clock }) => {
  const main = vi.fn<() => Promise<UpstreamProbeResult<UpstreamOf<"main">>>>().mockResolvedValueOnce({ ok: false, reason: "offline" }).mockResolvedValue(MAIN);
  const probes = createCachedUpstreamProbes({ now: clock.now, probes: { main, stable: async () => STABLE } });
  expect(await probes.main()).toEqual({ ok: false, reason: "offline" });
  expect(await probes.main()).toEqual(MAIN);
  expect(main).toHaveBeenCalledTimes(2);
  expect(await probes.main()).toEqual(MAIN);
  expect(main).toHaveBeenCalledTimes(2);
});
