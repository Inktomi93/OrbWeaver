// The committed appearance channel sheet matches a fresh run of its generator. The owner-css manifest freshness
// is owner-css-surface.repo.int.test.ts's first case.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/node";
import { APPEARANCE_CHANNEL_PATHS, renderAppearanceChannelCss } from "../../../packages/client/appearance-channel.build.ts";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

test("appearance-channel.gen.css is what appearance:build generates", () => {
  expect(readFileSync(join(REPO_ROOT, APPEARANCE_CHANNEL_PATHS.css), "utf8")).toBe(renderAppearanceChannelCss());
});
