// CI baseline selection and release promotion share one metadata predicate and workflow-owned generation.
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { execGit, GIT_READ_PREFIX } from "@orb/tooling/_shared/git";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { runTool, UsageError } from "@orb/tooling/_shared/run-tool";
import { hasQualifiedMainPush, resolveCiQualification } from "@orb/tooling/verify";
import YAML from "yaml";
import { z } from "zod";

const WORKFLOW = z.object({
  env: z.object({
    ORB_CI_REPOSITORY: z.literal("Inktomi93/OrbWeaver"),
    ORB_CI_QUALIFICATION_GENERATION: z.string().regex(/^Orbweaver qualification [a-z0-9-]+$/u),
    ORB_CI_PUBLICATION_BOOTSTRAP_SHA: z.string().regex(/^[0-9a-f]{40}$/u),
  }),
});
const HISTORICAL_GENERATION = z.object({ env: z.object({ ORB_CI_QUALIFICATION_GENERATION: z.string().optional() }).optional() });

await runTool(() => {
  const [mode, head, eventBase = ""] = process.argv.slice(2);
  if ((mode !== "baseline" && mode !== "release") || head === undefined) {
    throw new UsageError("ci-qualification requires baseline|release <tested-sha> [event-base]");
  }
  const root = process.cwd();
  if (eventBase !== "" && !/^[0-9a-f]{40,64}$/u.test(eventBase)) {
    throw new UsageError("CI event base must be empty or a commit ID");
  }
  if (head !== execGit(root, [...GIT_READ_PREFIX, "rev-parse", "HEAD"]).trim()) {
    throw new UsageError("CI qualification head differs from the tested HEAD");
  }
  const { env } = WORKFLOW.parse(YAML.parse(readFileSync(join(root, ".github/workflows/ci.yml"), "utf8")));
  const config = {
    repository: env.ORB_CI_REPOSITORY,
    generation: env.ORB_CI_QUALIFICATION_GENERATION,
    publication: env.ORB_CI_PUBLICATION_BOOTSTRAP_SHA,
    hasCurrentGeneration: (source: string): boolean =>
      HISTORICAL_GENERATION.parse(YAML.parse(source)).env?.ORB_CI_QUALIFICATION_GENERATION === env.ORB_CI_QUALIFICATION_GENERATION,
  };
  if (mode === "release") {
    if (!hasQualifiedMainPush(root, head, config)) {
      process.stderr.write(`release: CI for ${head} is not green under the current qualification generation\n`);
      return 1;
    }
    return 0;
  }
  const decision = resolveCiQualification(root, head, eventBase, config);
  const output = [
    `base=${decision.base}`,
    `head=${decision.head}`,
    `event_base=${eventBase}`,
    `code=${String(decision.code)}`,
    `tool_mode=${decision.toolMode}`,
    `authority=${decision.authority}`,
  ].join("\n");
  process.stdout.write(`${output}\n`);
  const destination = inheritedProcessEnv()["GITHUB_OUTPUT"];
  if (destination !== undefined) {
    appendFileSync(destination, `${output}\n`);
  }
  return 0;
});
