// World intent stays independent of filesystem and compiler discovery.
import { BROWSER_PACKAGES, predictedProgram, TEST_WORLD_PROGRAMS, worldOf } from "@orb/tooling/_shared/project-worlds";
import { expect, test } from "../../support/tool-fixtures.ts";

test("worldOf: package src by PACKAGE_WORLDS, the test surface by directory then suffix, nothing else", () => {
  expect(worldOf("packages/kit/src/ids.ts")).toBe("iso");
  expect(worldOf("packages/server/src/app.ts")).toBe("node");
  expect(worldOf("packages/ui/src/primitives/button/button.tsx")).toBe("browser");
  expect(worldOf("packages/unknown/src/x.ts")).toBeUndefined();
  expect(worldOf("tooling/src/verify/cli.ts")).toBe("node");
  expect(worldOf("tests/support/node/route-trpc.ts")).toBe("node");
  expect(worldOf("tests/support/browser/pixel-contrast.ts")).toBe("browser");
  expect(worldOf("tests/client/data/x.test.ts")).toBe("node");
  expect(worldOf("tests/tooling/snap/ops/overflow.ct.tsx")).toBe("browser");
  expect(worldOf("tests/tooling/snap/cascade.suite.int.test.ts")).toBe("node");
  expect(worldOf("scripts/probes/st-goldens/generate-goldens.ts")).toBe("browser");
  expect(worldOf("scripts/dev/engines.ts")).toBe("node");
  expect(worldOf("playwright/index.tsx")).toBe("browser");
  expect(worldOf("knip.ts")).toBe("node");
  expect(worldOf("packages/client/vite.config.ts")).toBe("node");
  expect(worldOf("packages/ui/token-contract.ts")).toBe("node");
  expect(worldOf("tests/support/iso/values.ts")).toBe("iso");
  expect(worldOf("tests/support/node/misplaced.tsx")).toBe("node");
  expect(worldOf("tests/client/data/x.dom.test.ts")).toBe("browser");
  expect(worldOf("tests/client/data/x.dom.test-d.ts")).toBe("browser");
  expect(worldOf("reset.d.ts")).toBeUndefined();
  expect([...BROWSER_PACKAGES].toSorted()).toEqual(["client", "ui"]);
});

test("primary compiler ownership follows package homes and the complete test-world map", () => {
  expect(predictedProgram("tests/ui/primitives/badge/badge.ct.tsx")).toBe(TEST_WORLD_PROGRAMS.browser);
  expect(predictedProgram("tests/server/foundation/env/index.test.ts")).toBe(TEST_WORLD_PROGRAMS.node);
  expect(predictedProgram("packages/ui/src/x.ts")).toBe("packages/ui/tsconfig.json");
  expect(predictedProgram("tests/support/iso/value.ts")).toBe("tsconfig.tests-iso.json");
  expect(predictedProgram("tests/support/iso/view.tsx")).toBe("tsconfig.tests-iso.json");
});
