import { EXIT } from "@orb/tooling/floor/cli/exit-contract";
import { runServedProbe } from "../../../../tooling/src/stack/ops/served-probe.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("served probe returns tool-error when freshness cannot be measured", async () => {
  expect(await runServedProbe([])).toBe(EXIT.toolError);
});
