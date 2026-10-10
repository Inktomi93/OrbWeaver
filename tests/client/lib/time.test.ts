// A Worker env copy cannot change native Intl's zone; drive real zone changes in an isolated main thread.

import process from "node:process";
import { fileURLToPath } from "node:url";
import { hostTimeZone } from "@orb/kit/time";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { z } from "zod";
import { expect, test } from "../../support/fixtures.ts";

const observation = z.object({ hostZone: z.string(), viewerZone: z.string(), day: z.string() });
const snapshot = z.object({ before: observation, after: observation });
const clientTimeUrl = new URL("../../../packages/client/src/lib/time.ts", import.meta.url).href;
const root = fileURLToPath(new URL("../../../", import.meta.url));

for (const { loadedIn, later, expectedDay } of [
  { loadedIn: "Pacific/Auckland", later: "America/Los_Angeles", expectedDay: "1970-01-01" },
  { loadedIn: "America/Los_Angeles", later: "Pacific/Auckland", expectedDay: "1969-12-31" },
]) {
  test(`viewerTimeZone retains ${loadedIn} after a host zone change`, async () => {
    const parentZone = hostTimeZone();
    const result = await spawnNiced(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `import { hostTimeZone } from "@orb/kit/time";
       const { timeLib, viewerTimeZone } = await import(${JSON.stringify(clientTimeUrl)});
       const observe = () => ({ hostZone: hostTimeZone(), viewerZone: viewerTimeZone(), day: timeLib.calendarPosition(0).day });
       const before = observe();
       process.env["TZ"] = ${JSON.stringify(later)};
       process.stdout.write(JSON.stringify({ before, after: observe() }));`,
      ],
      { cwd: root, env: { ["TZ"]: loadedIn } },
    );
    expect(result.code, result.stderr).toBe(0);
    expect(snapshot.parse(JSON.parse(result.stdout))).toEqual({
      before: { hostZone: loadedIn, viewerZone: loadedIn, day: expectedDay },
      after: { hostZone: later, viewerZone: loadedIn, day: expectedDay },
    });
    expect(hostTimeZone()).toBe(parentZone);
  });
}
