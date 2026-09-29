import { join } from "node:path";
import process from "node:process";
import { REPO_ROOT } from "./artifacts.ts";
import { runNicedSync } from "./proc.ts";

function run(command: "build" | "check", inherit: boolean): boolean {
  const result = runNicedSync(process.execPath, [join(REPO_ROOT, "tooling", "src", "plugin-author-showcase", "cli.ts"), command], {
    cwd: REPO_ROOT,
    ...(inherit ? { stdio: "inherit" as const } : {}),
  });
  return result.status === 0;
}

/** Verify that the runtime zip tree is an exact build of tracked showcase sources. */
export function showcaseArtifactsAreCurrent(): boolean {
  return run("check", false);
}

/** Build the ignored runtime zip tree before any server process is started. */
export function buildShowcaseArtifacts(): boolean {
  return run("build", true);
}
