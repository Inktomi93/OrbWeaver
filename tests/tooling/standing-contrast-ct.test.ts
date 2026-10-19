// Deleting the standing worst-legal-art contrast CT restores a known blind class across every theme polarity at once
// (docs/law/Spine-Testing.md §5), so its file is the one named-file floor in the client test tree.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";

const STANDING_CONTRAST_CT = "tests/legacy/client/features/chat/surfaces/worst-legal-art-contrast.suite.ct.tsx";

test("the standing worst-legal-art contrast CT exists", ({ repoRoot }) => {
  expect(existsSync(join(repoRoot, STANDING_CONTRAST_CT)), `restore ${STANDING_CONTRAST_CT}`).toBe(true);
});
