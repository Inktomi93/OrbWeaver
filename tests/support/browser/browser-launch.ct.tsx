import { readBrowserAcceleration } from "@orb/tooling/floor/browser/browser-acceleration";
import { timingCapability } from "@orb/tooling/floor/host/timing-capability";
import { expect, test } from "@playwright/test";

test("the component runner exposes its actual Chromium acceleration posture", async ({ browser, browserName }, info) => {
  test.skip(browserName !== "chromium", "Browser SystemInfo is a Chromium protocol; other engines do not establish acceleration here");
  const acceleration = await readBrowserAcceleration(browser);
  const session = await browser.newBrowserCDPSession();
  let commandLine = "";
  try {
    ({ commandLine } = await session.send("SystemInfo.getInfo"));
  } finally {
    await session.detach();
  }
  const timing = timingCapability();
  const qualified = acceleration.posture === "hardware" && timing.policy === "assert";
  const argumentsAvailable = commandLine !== "";
  const enableGpuPresent = commandLine.includes("--enable-gpu");
  const launchArguments = {
    commandLine: argumentsAvailable ? "available" : "unavailable",
    argsVerified: argumentsAvailable && enableGpuPresent,
  };
  await info.attach("component-browser-posture", {
    body: JSON.stringify({ browserName, browserVersion: browser.version(), acceleration, timing, launchArguments, qualifiedTiming: qualified }, null, 2),
    contentType: "application/json",
  });
  expect(!argumentsAvailable || enableGpuPresent).toBe(true);
  expect(acceleration.backend.length).toBeGreaterThan(0);
  expect(["hardware", "software", "unknown"]).toContain(acceleration.posture);
  expect(acceleration.gpuCompositing.length).toBeGreaterThan(0);
  expect(acceleration.rasterization.length).toBeGreaterThan(0);
});
