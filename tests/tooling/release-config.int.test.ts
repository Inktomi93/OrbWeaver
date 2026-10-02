// The stable release automation's couplings that no single file shows: release-please must write the tag the
// version reader looks for (or every stable build reads as `main`), and the release workflow must publish the
// image the default compose file pulls, built from the tag so its stamp derives the stable channel.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { releaseTagRef } from "@orb/kit/version-identity";
import { parse } from "yaml";
import { z } from "zod";
import { expect, test } from "../support/tool-fixtures.ts";

function read(repoRoot: string, rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

const releaseConfig = z.object({
  packages: z.object({
    ".": z.object({
      "include-v-in-tag": z.boolean().optional(),
      "include-component-in-tag": z.boolean().optional(),
      "initial-version": z.string(),
      "bump-minor-pre-major": z.boolean().optional(),
      "bump-patch-for-minor-pre-major": z.boolean().optional(),
    }),
  }),
});

const releaseWorkflow = z.object({
  on: z.object({ push: z.object({ branches: z.array(z.string()) }) }),
  jobs: z.object({
    image: z.object({
      if: z.string(),
      env: z.record(z.string(), z.string()),
      steps: z.array(z.object({ uses: z.string().optional(), with: z.record(z.string(), z.unknown()).optional() })),
    }),
  }),
});

test("release-please tags a release exactly as the version reader looks for it", ({ repoRoot }) => {
  const root = releaseConfig.parse(JSON.parse(read(repoRoot, "release-please-config.json"))).packages["."];
  // release-please's defaults: a `v` prefix unless turned off, a component prefix unless turned off.
  const prefix = root["include-v-in-tag"] === false ? "" : "v";
  expect(root["include-component-in-tag"]).toBe(false);
  expect(`refs/tags/${prefix}${root["initial-version"]}`).toBe(releaseTagRef(root["initial-version"]));
});

test("the first release is v0.1.0 and the version stays below 1.0: feat bumps the minor, fix the patch", ({ repoRoot }) => {
  const root = releaseConfig.parse(JSON.parse(read(repoRoot, "release-please-config.json"))).packages["."];
  expect(root["initial-version"]).toBe("0.1.0");
  // A breaking change bumps the minor instead of jumping to 1.0.0; a feature keeps its minor bump.
  expect(root["bump-minor-pre-major"]).toBe(true);
  expect(root["bump-patch-for-minor-pre-major"]).not.toBe(true);
});

test("the release workflow runs on the stable branch and publishes, from the tag, the image compose pulls", ({ repoRoot }) => {
  const workflow = releaseWorkflow.parse(parse(read(repoRoot, ".github/workflows/release.yml")));
  expect(workflow.on.push.branches).toEqual(["release"]);
  expect(workflow.jobs.image.if).toContain("release_created == 'true'");
  const checkout = workflow.jobs.image.steps.find((step) => step.uses?.startsWith("actions/checkout@") === true);
  expect(checkout?.with?.["ref"]).toBe("refs/tags/${{ needs.release-please.outputs.tag_name }}");

  const compose = z
    .object({ services: z.object({ orbweaver: z.object({ image: z.string(), build: z.unknown().optional() }) }) })
    .parse(parse(read(repoRoot, "docker-compose.yaml")));
  expect(compose.services.orbweaver.image).toBe(`\${ORB_IMAGE:-${workflow.jobs.image.env["IMAGE"] ?? "no IMAGE env"}:latest}`);
  // The base file never builds: a source build has its own overlay and its own local image name.
  expect(compose.services.orbweaver.build).toBeUndefined();
});
