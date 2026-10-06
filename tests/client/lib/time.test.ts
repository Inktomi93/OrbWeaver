// The display zone is fixed at module load even when the host zone later changes.
import { hostTimeZone } from "@orb/kit/time";
import { afterEach, vi } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

for (const { loadedIn, later, expectedDay } of [
  { loadedIn: "Pacific/Auckland", later: "America/Los_Angeles", expectedDay: "1970-01-01" },
  { loadedIn: "America/Los_Angeles", later: "Pacific/Auckland", expectedDay: "1969-12-31" },
]) {
  test(`viewerTimeZone retains ${loadedIn} after a host zone change`, async () => {
    vi.resetModules();
    vi.stubEnv("TZ", loadedIn);
    const { timeLib, viewerTimeZone } = await import("../../../packages/client/src/lib/time.ts");
    expect(viewerTimeZone()).toBe(loadedIn);
    expect(timeLib.calendarPosition(0).day).toBe(expectedDay);
    vi.stubEnv("TZ", later);
    expect(hostTimeZone()).toBe(later);
    expect(viewerTimeZone()).toBe(loadedIn);
    expect(timeLib.calendarPosition(0).day).toBe(expectedDay);
  });
}
