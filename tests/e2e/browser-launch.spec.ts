import { readBrowserAcceleration } from "@orb/tooling/floor/browser/browser-acceleration";
import { timingCapability } from "@orb/tooling/floor/host/timing-capability";
import { currentRunLease, inheritedRunMarker, runLeaseArg, runMarkerArg } from "@orb/tooling/floor/process/run-marker";
import { expect, test } from "@playwright/test";

test("the E2E runner requests acceleration without losing browser ownership", async ({ browser, browserName }, info) => {
  test.skip(browserName !== "chromium", "Browser command line and SystemInfo are Chromium protocols");
  const acceleration = await readBrowserAcceleration(browser);
  const timing = timingCapability();
  const session = await browser.newBrowserCDPSession();
  try {
    const { commandLine } = await session.send("SystemInfo.getInfo");
    const marker = inheritedRunMarker();
    const lease = currentRunLease();
    const expectedArguments = ["--enable-gpu", ...(marker === null ? [] : [runMarkerArg(marker)]), ...(lease === null ? [] : [runLeaseArg(lease)])];
    const argumentsAvailable = commandLine !== "";
    const argsVerified = argumentsAvailable && expectedArguments.every((argument) => commandLine.includes(argument));
    const launchArguments = {
      commandLine: argumentsAvailable ? "available" : "unavailable",
      argsVerified,
    };
    await info.attach("e2e-browser-posture", {
      body: JSON.stringify(
        {
          browserName,
          browserVersion: browser.version(),
          acceleration,
          timing,
          launchArguments,
          qualifiedTiming: acceleration.posture === "hardware" && timing.policy === "assert",
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    expect(!argumentsAvailable || argsVerified).toBe(true);
    expect(acceleration.backend.length).toBeGreaterThan(0);
  } finally {
    await session.detach();
  }
});
