// The virtualizer memo exceptions expire when the installed compiler removes its denylist token.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";

const COMPILER = "babel-plugin-react-compiler";
const BUNDLE = "dist/index.js";
const VIRTUALIZER = "@tanstack/react-virtual";
const CLIENT_PACKAGE = "packages/client/package.json";

test("installed React Compiler still denylists the virtualizer used by manual-memo exceptions", ({ repoRoot }) => {
  const manifest = createRequire(resolve(repoRoot, CLIENT_PACKAGE)).resolve(`${COMPILER}/package.json`);
  const bundle = readFileSync(join(dirname(manifest), BUNDLE), "utf8");
  expect(bundle, "retire message-list/media-grid memo exceptions when this token disappears").toContain(VIRTUALIZER);
});
