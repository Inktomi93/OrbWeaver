// The load arm is what the browser was sent, and the RESULT line reads that, never the argv. The recording
// cases need no browser and decide on any box; the matrix case proves a cell context gets the arm too.
import { expect, test } from "@orb/testkit/tooling";
import { closeProbeSession } from "../../../../tooling/src/floor/browser/browser.ts";
import { NETWORK_PROFILES, throttleResultValue } from "../../../../tooling/src/snap/lib/throttle.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/ops/parse.ts";
import { applyLoadEmulation, launchSnapSession, loadEmulationFor, openSnapMatrixContext } from "../../../../tooling/src/snap/ops/session.ts";
import { scaledBudget } from "../../_load-budget.ts";

type LoadEmulationTarget<P> = Parameters<typeof applyLoadEmulation<P>>[0];

const BROWSER_TIMEOUT_MS = scaledBudget(60_000);
const CPU_THROTTLE_METHOD = "Emulation.setCPUThrottlingRate";
const NETWORK_METHOD = "Network.emulateNetworkConditions";

interface Sent {
  readonly page: string;
  readonly method: string;
  readonly params: object;
}

/** One context over named stand-in pages whose CDP sessions record every send. */
function recordingTarget(pages: readonly string[]): { readonly target: LoadEmulationTarget<string>; readonly sent: readonly Sent[] } {
  const sent: Sent[] = [];
  const target: LoadEmulationTarget<string> = {
    contexts: [
      {
        context: {
          pages: () => pages,
          newCDPSession: (page) =>
            Promise.resolve({
              send: (method: string, params: object): Promise<unknown> => {
                sent.push({ page, method, params });
                return Promise.resolve({});
              },
            }),
        },
      },
    ],
  };
  return { target, sent };
}

test("--cpu-throttle is sent to every page, and the RESULT line reads the rate that was sent", async () => {
  const { target, sent } = recordingTarget(["first", "second"]);
  const applied = await applyLoadEmulation(target, { cpuThrottle: 8, network: null });
  expect(sent).toEqual([
    { page: "first", method: CPU_THROTTLE_METHOD, params: { rate: 8 } },
    { page: "second", method: CPU_THROTTLE_METHOD, params: { rate: 8 } },
  ]);
  expect(throttleResultValue(applied)).toBe("cpu:8x/net:live");
});

test("--network is sent as DevTools' own condition beside the throttle", async () => {
  const { target, sent } = recordingTarget(["only"]);
  const applied = await applyLoadEmulation(target, { cpuThrottle: 4, network: "slow-4g" });
  expect(sent).toEqual([
    { page: "only", method: CPU_THROTTLE_METHOD, params: { rate: 4 } },
    { page: "only", method: NETWORK_METHOD, params: NETWORK_PROFILES["slow-4g"] },
  ]);
  expect(throttleResultValue(applied)).toBe("cpu:4x/net:slow-4g");
});

test("an unthrottled run sends nothing, and a context with no page received no arm", async () => {
  const quiet = recordingTarget(["only"]);
  expect(throttleResultValue(await applyLoadEmulation(quiet.target, { cpuThrottle: 1, network: null }))).toBe("cpu:1x/net:live");
  expect(quiet.sent).toEqual([]);
  // The arm was asked for, but no page existed to receive it: the line must not claim it.
  const empty = recordingTarget([]);
  expect(throttleResultValue(await applyLoadEmulation(empty.target, { cpuThrottle: 8, network: "offline" }))).toBe("cpu:1x/net:live");
});

test("a matrix cell context runs under the load emulation its run asked for", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const opts = parseSnapArgs(["--file", import.meta.filename, "--network", "offline", "--cpu-throttle", "8"]);
  const owner = await launchSnapSession(opts);
  try {
    // The positive control: the owner's own page is offline, so the probe below can see the emulation.
    expect(await owner.page.evaluate<boolean>("navigator.onLine")).toBe(false);
    const cell = await openSnapMatrixContext(owner, opts, "owner");
    try {
      expect(await cell.session.page.evaluate<boolean>("navigator.onLine")).toBe(false);
      expect(throttleResultValue(loadEmulationFor(cell.session))).toBe("cpu:8x/net:offline");
    } finally {
      await cell.context.context.close();
    }
  } finally {
    await closeProbeSession(owner);
  }
});
