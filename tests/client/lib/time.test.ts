// The viewer's zone has one source: the zone timeLib renders in is the zone viewerTimeZone reports, even if the
// host zone changes after the module loaded (a zone the server evaluates for the viewer must match their screen).

import { hostTimeZone } from "@orb/kit/time";
import { afterEach, vi } from "vitest";
import { timeLib, viewerTimeZone } from "../../../packages/client/src/lib/time.ts";
import { expect, test } from "../../support/fixtures.ts";

afterEach(() => {
  vi.unstubAllEnvs();
});

test("viewerTimeZone keeps the zone timeLib renders in when the host zone changes afterwards", () => {
  const loadedIn = viewerTimeZone();
  vi.stubEnv("TZ", loadedIn === "Pacific/Auckland" ? "America/Los_Angeles" : "Pacific/Auckland");

  expect(hostTimeZone()).not.toBe(loadedIn);
  expect(viewerTimeZone()).toBe(loadedIn);
  expect(timeLib.calendarPosition(0).day).toBe(new Intl.DateTimeFormat("en-CA", { timeZone: loadedIn }).format(0));
});
