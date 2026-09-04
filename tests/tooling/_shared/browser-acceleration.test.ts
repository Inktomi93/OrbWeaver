import { browserArgsWithAcceleration, classifyBrowserAcceleration } from "@orb/tooling/_shared/browser-acceleration";
import { expect, test } from "../../support/tool-fixtures.ts";

test("the shared browser launch requests GPU acceleration and leaves caller overrides last", () => {
  expect(browserArgsWithAcceleration()).toEqual(["--enable-gpu"]);
  expect(browserArgsWithAcceleration(["--use-angle=gl", "--disable-gpu"])).toEqual(["--enable-gpu", "--use-angle=gl", "--disable-gpu"]);
});

test("acceleration is hardware only when the backend and both rendering features prove it", () => {
  expect(classifyBrowserAcceleration("Mesa Intel UHD 770", "enabled", "enabled_on")).toBe("hardware");
  expect(classifyBrowserAcceleration("SwiftShader Device", "enabled", "enabled")).toBe("software");
  expect(classifyBrowserAcceleration("unknown", "unknown", "unknown")).toBe("unknown");
  expect(classifyBrowserAcceleration("Mesa Intel UHD 770", "disabled_software", "enabled")).toBe("unknown");
});
