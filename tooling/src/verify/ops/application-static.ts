// Application invocations reuse native checker configurations. Population is resolved before a child
// starts, and every nonzero/no-verdict exit survives; no diagnostic is classified by its path.
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import { APPLICATION_STATIC_CHECKERS } from "../contract/application.ts";
import { readApplicationSubjects } from "../lib/application-programs.ts";
import { asViolations, ownScheme } from "../lib/exit-classifiers.ts";
import { runApplicationKnip } from "./application-knip.ts";
import { runScopedEslint } from "./eslint.ts";

refuseDirectInvocation(import.meta.url, "pnpm exec node tooling/src/verify/cli.ts application-static <checker>");

export async function runApplicationStatic(root: string, args: readonly string[]): Promise<number> {
  const [checker, ...rest] = args;
  if (rest.length > 0 || !(APPLICATION_STATIC_CHECKERS as readonly string[]).includes(checker ?? "")) {
    throw new UsageError(`application-static requires exactly one of ${APPLICATION_STATIC_CHECKERS.join(", ")}`);
  }
  const population = await readApplicationSubjects(root);
  const { files, subjects } = population;
  if (checker === "eslint") {
    return await runScopedEslint(root, files);
  }
  const run = (name: string, argv: readonly string[]): number => {
    const result = runNicedSync(join(root, "node_modules/.bin", name), argv, { cwd: root, stdio: "inherit" });
    return asViolations(result.status);
  };
  if (checker === "biome") {
    return run("biome", ["check", ...subjects, "--diagnostic-level=error", "--reporter=concise"]);
  }
  if (checker === "imports") {
    return run("depcruise", [...files, "--config", ".dependency-cruiser.cjs", "--output-type", "err-long"]);
  }
  if (checker === "cpd") {
    const implementation = subjects.filter((path) => path.startsWith("packages/") || path.startsWith("tooling/src/"));
    if (implementation.length === 0) {
      throw new Error("application duplication population has no implementation files");
    }
    return ownScheme(
      runNicedSync(process.execPath, ["scripts/cpd.ts", "-c", "jscpd.json", ...implementation, "--fail-on-empty"], { cwd: root, stdio: "inherit" }).status,
    );
  }
  return runApplicationKnip(root, population, checker === "knip-prod");
}
