// The --motion window's CPU bracket: what it sends around the window, and the rate it hands back to the session.
// A recording CDP stand-in decides on any box; the session side of the same CDP call is
// tests/tooling/snap/ops/session-load-emulation.int.test.ts.
import { expect, test } from "@orb/testkit/tooling";
import { MOTION_CPU_THROTTLE, motionCpuRates, NO_CPU_THROTTLE } from "../../../../../tooling/src/snap/lib/throttle.ts";
import { withCpuRate } from "../../../../../tooling/src/snap/ops/arms/motion.ts";
import { parseSnapArgs } from "../../../../../tooling/src/snap/ops/parse.ts";

const CPU_THROTTLE_METHOD = "Emulation.setCPUThrottlingRate";

interface Sent {
  readonly method: string;
  readonly params: object;
}

function recordingCdp(): { readonly cdp: { send: (method: string, params: object) => Promise<unknown> }; readonly sent: readonly Sent[] } {
  const sent: Sent[] = [];
  return {
    sent,
    cdp: {
      send: (method: string, params: object): Promise<unknown> => {
        sent.push({ method, params });
        return Promise.resolve({});
      },
    },
  };
}

/** The bracket one parsed argv gives its motion window. */
function windowRates(argv: readonly string[]): ReturnType<typeof motionCpuRates> {
  const opts = parseSnapArgs(["/", ...argv, "--motion"]);
  expect(opts.errors).toEqual([]);
  return motionCpuRates(opts.motionThrottle, opts.cpuThrottle);
}

test("a --cpu-throttle session still holds its rate after a motion window", async () => {
  // Lighter than the motion throttle: the window runs at the motion rate, then hands the session's rate back.
  const light = recordingCdp();
  await withCpuRate(light.cdp, windowRates(["--cpu-throttle", "2"]), () => Promise.resolve());
  expect(light.sent).toEqual([
    { method: CPU_THROTTLE_METHOD, params: { rate: MOTION_CPU_THROTTLE } },
    { method: CPU_THROTTLE_METHOD, params: { rate: 2 } },
  ]);

  // Heavier than the motion throttle: the session's own rate already covers the window, so nothing is sent.
  const heavy = recordingCdp();
  await withCpuRate(heavy.cdp, windowRates(["--cpu-throttle", "6"]), () => Promise.resolve());
  expect(heavy.sent).toEqual([]);

  // A window that throws still hands the session's rate back.
  const thrown = recordingCdp();
  await expect(withCpuRate(thrown.cdp, windowRates(["--cpu-throttle", "2"]), () => Promise.reject(new Error("window failed")))).rejects.toThrow(
    "window failed",
  );
  expect(thrown.sent.at(-1)).toEqual({ method: CPU_THROTTLE_METHOD, params: { rate: 2 } });
});

test("an unthrottled session gets the motion throttle for the window and the identity rate after it", async () => {
  const plain = recordingCdp();
  await withCpuRate(plain.cdp, windowRates([]), () => Promise.resolve());
  expect(plain.sent).toEqual([
    { method: CPU_THROTTLE_METHOD, params: { rate: MOTION_CPU_THROTTLE } },
    { method: CPU_THROTTLE_METHOD, params: { rate: NO_CPU_THROTTLE } },
  ]);
  // --motion-no-throttle leaves the session's emulation alone.
  const off = recordingCdp();
  await withCpuRate(off.cdp, windowRates(["--cpu-throttle", "2", "--motion-no-throttle"]), () => Promise.resolve());
  expect(off.sent).toEqual([]);
});
