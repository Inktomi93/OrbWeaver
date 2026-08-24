// substrate: rate-floor — the per-plugin HOURLY call floor, the ONLY bound on a RATE anywhere in the plugin
// sandbox. Everything else is per-call (safeFetch's deadline/byte cap, the side-gen output budget) or
// per-instance (`HOST_CALLS_IN_FLIGHT_MAX`, which bounds CONCURRENCY — 32 at a time as fast as they settle is
// legal under every other cap). The D46 security review recorded the `net.fetch` half as tracked-and-open
// ("no per-plugin fetch counter anywhere in `infra/network/egress.ts` or the membrane"); `llm.quiet` would have
// shipped with the same hole and the installer's credential behind it.
//
// These pins are the MECHANISM (window, keying, claim atomicity). The bridge's own suite pins that the claim
// happens BEFORE the op it guards, and membrane.test pins that infra calls it before `safeFetch`.

import type { PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { createPluginRateFloor } from "../../../../../packages/server/src/domain/plugin/substrate/rate-floor.ts";
import { createFrozenClock, FROZEN_AT_MS } from "../../../../support/clock.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const PLUGIN = castId<PluginId>("plugin_floor00000000000000001");
const OTHER = castId<PluginId>("plugin_floor00000000000000002");
const ONE_HOUR_MS = 3_600_000;
const SPEC = { capability: "net.fetch", limit: 3 } as const;
/** The refusal must NAME the capability and the number — a ceiling nobody can read is one nobody designs around. */
const OVER_CEILING_RE = /net\.fetch is limited to 3 calls per hour/u;

describe("createPluginRateFloor — the hourly ceiling", () => {
  test("admits up to the limit, then REFUSES naming the capability and the number", () => {
    const clock = createFrozenClock(FROZEN_AT_MS);
    const floor = createPluginRateFloor(() => clock.now(), SPEC);

    floor.admit(PLUGIN);
    floor.admit(PLUGIN);
    floor.admit(PLUGIN);

    expect(() => floor.admit(PLUGIN)).toThrow(OVER_CEILING_RE);
  });

  test("the window ROLLS: the ceiling releases an hour after the window opened", () => {
    const clock = createFrozenClock(FROZEN_AT_MS);
    const floor = createPluginRateFloor(() => clock.now(), SPEC);

    floor.admit(PLUGIN);
    floor.admit(PLUGIN);
    floor.admit(PLUGIN);
    expect(() => floor.admit(PLUGIN)).toThrow();

    clock.advance(ONE_HOUR_MS - 1);
    expect(() => floor.admit(PLUGIN)).toThrow(); // still inside the window

    clock.advance(1);
    expect(() => floor.admit(PLUGIN)).not.toThrow(); // a fresh window
  });

  test("the window is FIXED, not sliding: it opens at the first call and does not slide with later ones", () => {
    // Stated as a pin because it is a deliberate imprecision, not an accident. A sliding window needs a
    // timestamp per call — unbounded memory per plugin within the hour — to bound a number this coarse. The
    // accepted cost is the boundary burst (up to 2×limit across an hour edge), which is the right direction
    // to be imprecise in for a ceiling nobody legitimate approaches.
    const clock = createFrozenClock(FROZEN_AT_MS);
    const floor = createPluginRateFloor(() => clock.now(), SPEC);

    floor.admit(PLUGIN); // window opens here
    clock.advance(ONE_HOUR_MS - 1000);
    floor.admit(PLUGIN);
    floor.admit(PLUGIN);
    expect(() => floor.admit(PLUGIN)).toThrow();

    clock.advance(1000); // one hour past the OPEN, not past the last call
    expect(() => floor.admit(PLUGIN)).not.toThrow();
  });

  test("the ceiling is PER PLUGIN — one plugin's exhaustion never spends another's budget", () => {
    const clock = createFrozenClock(FROZEN_AT_MS);
    const floor = createPluginRateFloor(() => clock.now(), SPEC);

    floor.admit(PLUGIN);
    floor.admit(PLUGIN);
    floor.admit(PLUGIN);
    expect(() => floor.admit(PLUGIN)).toThrow();

    // A `plugins` row is unique per (owner, slug), so per-plugin is already per-owner.
    expect(() => floor.admit(OTHER)).not.toThrow();
  });

  test("a REFUSED call does not consume a slot (the refusal is not itself a claim)", () => {
    // Otherwise a plugin at its ceiling would keep pushing its own window's count up and could never be told
    // apart from one making progress — and the count would be a fact about refusals, not about work.
    const clock = createFrozenClock(FROZEN_AT_MS);
    const floor = createPluginRateFloor(() => clock.now(), { capability: "llm.quiet", limit: 1 });

    floor.admit(PLUGIN);
    expect(() => floor.admit(PLUGIN)).toThrow();
    expect(() => floor.admit(PLUGIN)).toThrow();

    clock.advance(ONE_HOUR_MS);
    // Exactly one slot is available in the new window — the two refusals above consumed nothing.
    expect(() => floor.admit(PLUGIN)).not.toThrow();
    expect(() => floor.admit(PLUGIN)).toThrow();
  });

  test("the claim is SYNCHRONOUS: a burst of concurrent callers cannot all observe the pre-burst count", () => {
    // The membrane admits up to 32 concurrent host calls per instance, so a floor that checked, returned a
    // verdict, and let the caller await the work before recording would let a burst straight through the gap.
    // `admit` checks AND records in one step — this is that property, expressed as a synchronous burst.
    const clock = createFrozenClock(FROZEN_AT_MS);
    const floor = createPluginRateFloor(() => clock.now(), { capability: "llm.quiet", limit: 5 });

    let admitted = 0;
    for (let i = 0; i < 32; i += 1) {
      try {
        floor.admit(PLUGIN);
        admitted += 1;
      } catch {
        // refused — counted by omission
      }
    }
    expect(admitted).toBe(5);
  });
});
