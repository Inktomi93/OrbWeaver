import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { parse } from "yaml";
import { z } from "zod";

const catalog = z.object({ catalog: z.object({ ["@playwright/test"]: z.string() }) });
const pin = z.object({ playwrightVersion: z.string() });

test("the DevTools closure pin and the devcontainer browser bake name the catalog's Playwright version", ({ repoRoot }) => {
  const read = (file: string): string => readFileSync(join(repoRoot, file), "utf8");
  const version = catalog.parse(parse(read("pnpm-workspace.yaml"))).catalog["@playwright/test"];
  expect(pin.parse(JSON.parse(read("tooling/src/snap/lib/devtools-frontend/pin.json"))).playwrightVersion).toBe(version);
  expect(read(".devcontainer/Dockerfile")).toContain(`ARG PLAYWRIGHT_VERSION=${version}\n`);
});
