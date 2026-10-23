import { expect, test } from "@orb/testkit/tooling";
import { EXIT } from "@orb/tooling/floor/cli/exit-contract";
import { runServedProbe } from "../../../../tooling/src/stack/ops/served-probe.ts";

test("served probe returns tool-error when freshness cannot be measured", async () => {
  expect(await runServedProbe([])).toBe(EXIT.toolError);
});
