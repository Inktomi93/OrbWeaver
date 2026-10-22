import { readFile } from "node:fs/promises";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/fixtures.ts";

// D257 keys combine vendored tables with native normalization, casing and script matching.
test("vendored handle tables match the runtime Unicode version", async () => {
  const artifact = await readFile(new URL("../../../packages/kit/src/handle-key/unicode-data.ts", import.meta.url), "utf8");
  const declarations = [...artifact.matchAll(/^export const UNICODE_DATA_VERSION = "(\d+\.\d+\.\d+)";/gm)];
  expect(declarations).toHaveLength(1);
  const vendored = declarations[0]?.[1];
  const engine = process.versions["unicode"];
  expect(vendored?.startsWith(`${engine}.`), `vendored Unicode ${vendored}; engine Unicode ${engine}`).toBe(true);
});
