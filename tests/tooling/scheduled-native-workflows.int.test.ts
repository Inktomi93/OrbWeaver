import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { parse } from "yaml";
import { z } from "zod";

const stepSchema = z.object({
  id: z.string().optional(),
  if: z.string().optional(),
  run: z.string().optional(),
  uses: z.string().optional(),
  with: z.record(z.string(), z.json()).optional(),
});
const workflowSchema = z.object({
  on: z.object({ schedule: z.array(z.object({ cron: z.string() })) }).loose(),
  jobs: z.record(z.string(), z.object({ needs: z.union([z.string(), z.array(z.string())]).optional(), steps: z.array(stepSchema) })),
});

test("Docker install checks out the immutable published release source and runs a pinned image", ({ repoRoot }) => {
  const workflow = workflowSchema.parse(parse(readFileSync(join(repoRoot, ".github/workflows/install.yml"), "utf8")));
  const docker = workflow.jobs["docker"];
  const checkout = docker?.steps.find((step) => step.uses?.startsWith("actions/checkout@") === true);
  // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
  expect(checkout?.with?.["ref"]).toBe("${{ steps.release.outputs.tag }}");
  const proof = docker?.steps.find((step) => step.id === "image");
  expect(proof?.run).toContain("git rev-parse HEAD");
  expect(proof?.run).toContain('.commit == $sha and .channel == "stable"');
  expect(proof?.run).toContain("ORB_IMAGE=$image@$digest");
  expect(readFileSync(join(repoRoot, ".github/workflows/install.yml"), "utf8")).not.toContain("windows_proof_repetitions");
});
