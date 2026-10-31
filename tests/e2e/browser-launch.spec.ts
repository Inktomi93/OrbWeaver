import { browserArgsWithAcceleration, readBrowserAcceleration } from "@orb/tooling/floor/browser/browser-acceleration";
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
    const expectedArguments = [
      ...browserArgsWithAcceleration(),
      ...(marker === null ? [] : [runMarkerArg(marker)]),
      ...(lease === null ? [] : [runLeaseArg(lease)]),
    ];
    const launchArguments = {
      commandLine: commandLine === "" ? "unavailable" : "available",
      argsVerified: commandLine !== "" && expectedArguments.every((argument) => commandLine.includes(argument)),
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
    // An empty command line proves nothing about the launch, so it fails here rather than passing the argument check.
    expect(commandLine, "SystemInfo.getInfo reports the browser's command line").not.toBe("");
    for (const argument of expectedArguments) {
      expect(commandLine).toContain(argument);
    }
    expect(acceleration.backend, "the GPU info names a renderer").not.toBe("unknown");
  } finally {
    await session.detach();
  }
});
