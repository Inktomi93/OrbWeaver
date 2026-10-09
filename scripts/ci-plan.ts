import { appendFileSync } from "node:fs";
import process from "node:process";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { runTool, UsageError } from "@orb/tooling/_shared/run-tool";
import { applicationPartitionKeys } from "@orb/tooling/verify";

await runTool(() => {
  const [tier, ...rest] = process.argv.slice(2);
  if ((tier !== "full" && tier !== "product") || rest.length > 0) {
    throw new UsageError("ci-plan requires full|product");
  }
  const include = applicationPartitionKeys(tier).map((key) => {
    const [partition, shard = ""] = key.split(":");
    return { partition, shard, key: key.replaceAll(":", "-").replaceAll("/", "-") };
  });
  const matrix = JSON.stringify({ include });
  process.stdout.write(`${matrix}\n`);
  const output = inheritedProcessEnv()["GITHUB_OUTPUT"];
  if (output !== undefined) {
    appendFileSync(output, `matrix=${matrix}\n`);
  }
  return 0;
});
