// World intent stays independent of filesystem and compiler discovery.
import { BROWSER_PACKAGES, BROWSER_TESTS_PROGRAM, NODE_WORLD_PROGRAM, predictedTestProgram, worldOf } from "@orb/tooling/_shared/project-worlds";
import { expect, test } from "../../support/tool-fixtures.ts";

test("worldOf: package src by PACKAGE_WORLDS, the test surface by directory then suffix, nothing else", () => {
  expect(worldOf("packages/kit/src/ids.ts")).toBe("iso");
  expect(worldOf("packages/server/src/app.ts")).toBe("node");
  expect(worldOf("packages/ui/src/primitives/button/button.tsx")).toBe("browser");
  expect(worldOf("packages/unknown/src/x.ts")).toBeUndefined();
  expect(worldOf("tooling/src/verify/cli.ts")).toBe("node");
  expect(worldOf("tests/support/node/route-trpc.ts")).toBe("node");
  expect(worldOf("tests/support/browser/pixel-contrast.ts")).toBe("browser");
  expect(worldOf("tests/client/data/x.test.ts")).toBe("browser");
  expect(worldOf("tests/tooling/snap/ops/overflow.ct.tsx")).toBe("browser");
  expect(worldOf("tests/tooling/snap/cascade.suite.int.test.ts")).toBe("node");
  expect(worldOf("scripts/probes/st-goldens/generate-goldens.ts")).toBe("browser");
  expect(worldOf("scripts/dev/engines.ts")).toBe("node");
  expect(worldOf("playwright/index.tsx")).toBe("browser");
  expect(worldOf("knip.ts")).toBeUndefined();
  expect([...BROWSER_PACKAGES].toSorted()).toEqual(["client", "ui"]);
});

test("predictedTestProgram: browser → the browser-tests world, node → the root graph, off-surface → nothing", () => {
  expect(predictedTestProgram("tests/ui/primitives/badge/badge.ct.tsx")).toBe(BROWSER_TESTS_PROGRAM);
  expect(predictedTestProgram("tests/server/foundation/env/index.test.ts")).toBe(NODE_WORLD_PROGRAM);
  expect(predictedTestProgram("packages/ui/src/x.ts")).toBeUndefined();
});
