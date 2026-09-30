// Resolve stage commands against the child environment, preferring workspace binaries.
// Windows command shims use PATHEXT; POSIX commands require executable permission.
import { statSync } from "node:fs";
import { extname, isAbsolute, join, resolve, sep } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { processEnvValue } from "@orb/tooling/_shared/process-env";
import type { StageCommand, StageCommandOptions } from "../contract/stage.ts";
import { REGISTRY } from "./registry.ts";

refuseDirectInvocation(import.meta.url, "pnpm verify");

/** Executable-file test WITHOUT a throw: `statSync`'s `throwIfNoEntry: false` answers "absent" as
 *  `undefined`, so the resolver owns no caught failure. Mode bits (not `access(X_OK)`) because the question
 *  is "is there an executable file of this name here", not "may THIS euid run it" — and because `.bin`
 *  entries are symlinks, which `statSync` follows by design. */
function executableAt(candidate: string, platform: NodeJS.Platform): boolean {
  const stat = statSync(candidate, { throwIfNoEntry: false });
  if (stat === undefined || !stat.isFile()) {
    return false;
  }
  if (platform === "win32") {
    return true;
  }
  // The alternative, `accessSync(X_OK)`, THROWS on the negative answer — it would make this resolver the
  // owner of a caught failure for the ordinary case of "that command is not here".
  // biome-ignore lint/suspicious/noBitwiseOperators: a POSIX mode IS a bitfield; `& 0o111` (any of user/group/other execute) is the domain operation on it, not the mistyped `&&` the rule hunts.
  return (stat.mode & 0o111) !== 0;
}

/** The PATH directories, in order, from an explicitly-passed PATH string — the caller owns reading the
 *  environment, so this module stays pure and a test can hand it a fabricated PATH. */
function pathDirectories(pathEnv: string, platform: NodeJS.Platform): readonly string[] {
  return pathEnv.split(platform === "win32" ? ";" : ":").filter((dir) => dir.length > 0);
}

const WINDOWS_EXECUTABLE_EXTENSIONS = ".COM;.EXE;.BAT;.CMD";

function commandNames(cmd: string, platform: NodeJS.Platform, pathExt: string): readonly string[] {
  if (platform !== "win32") {
    return [cmd];
  }
  const extensions = pathExt
    .toLowerCase()
    .split(";")
    .filter((extension) => extension.length > 0);
  return extensions.includes(extname(cmd).toLowerCase()) ? [cmd] : extensions.map((extension) => `${cmd}${extension}`);
}

/** Where the workspace bin for `cmd` would live on this checkout. Named so the refusal can print it. */
export function workspaceBinPath(root: string, cmd: string): string {
  return join(root, "node_modules", ".bin", cmd);
}

/** Prefer pinned workspace tools, then search the child's PATH and executable extensions. */
export function resolveStageCommand(root: string, cmd: string, pathEnv: string, options: StageCommandOptions = {}): StageCommand {
  const platform = options.platform ?? process.platform;
  const pathExt = options.pathExt ?? processEnvValue("PATHEXT") ?? WINDOWS_EXECUTABLE_EXTENSIONS;
  if (cmd.includes(sep) || cmd.includes("/")) {
    return { kind: "path-literal", command: isAbsolute(cmd) ? cmd : resolve(root, cmd) };
  }
  const workspaceBin = workspaceBinPath(root, cmd);
  const names = commandNames(cmd, platform, pathExt);
  for (const name of names) {
    const candidate = workspaceBinPath(root, name);
    if (executableAt(candidate, platform)) {
      return { kind: "workspace-bin", command: candidate };
    }
  }
  const dirs = pathDirectories(pathEnv, platform);
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (executableAt(candidate, platform)) {
        return { kind: "system-program", command: candidate };
      }
    }
  }
  return { kind: "unresolvable", requested: cmd, workspaceBin, pathDirs: dirs.length };
}

/** The refusal, as the stage's own TRANSCRIPT — so it lands in `reports/verify/<stage>.log`, in the
 *  `failureExcerpt` cut from that transcript, and therefore in `reports/verify.json`. A refusal that lived
 *  only in the console summary would be invisible to a bot reading the artifact, which is the failure mode
 *  #2225 names. */
export function unresolvableCommandTranscript(stageName: string, unresolved: Extract<StageCommand, { kind: "unresolvable" }>): string {
  return [
    "",
    `[verify] REFUSED to run stage "${stageName}": its argv[0] "${unresolved.requested}" resolves to nothing runnable on this checkout.`,
    `[verify]   no workspace bin at ${unresolved.workspaceBin}`,
    `[verify]   not found as an executable in any of the ${unresolved.pathDirs} PATH director${unresolved.pathDirs === 1 ? "y" : "ies"}`,
    "[verify] This is a TOOL ERROR (exit 2) under the §3.3 contract: the stage produced NO VERDICT and nothing was measured.",
    "[verify] Fix the row's argv in tooling/src/verify/lib/registry.ts, or install the command this checkout is missing.",
    "",
  ].join("\n");
}

/** EVERY REGISTRY ROW WHOSE WHOLE-SCOPE `argv[0]` RESOLVES TO NOTHING on this checkout — the static half
 *  of #2225. `--list` is the ONE home for tier membership, and a row printed there reads as runnable; a row
 *  that can never spawn is a tier claiming coverage it does not have. Only the whole-scope `argv` is
 *  statically answerable (a `scopedArgv` needs a Selection), which is exactly what `--list` prints. */
export function unrunnableRegistryRows(root: string, pathEnv: string): readonly { readonly name: string; readonly transcript: string }[] {
  const rows: { readonly name: string; readonly transcript: string }[] = [];
  for (const stage of REGISTRY) {
    const resolved = resolveStageCommand(root, stage.argv[0], pathEnv);
    if (resolved.kind === "unresolvable") {
      rows.push({ name: stage.name, transcript: unresolvableCommandTranscript(stage.name, resolved) });
    }
  }
  return rows;
}

/** `--list`'s verdict. The listing still PRINTS (it is the reader's map), and then an unrunnable row is
 *  REFUSED rather than left looking like a stage that merely has not run yet — exit 2, because a registry
 *  the runner cannot execute is a broken instrument, never a finding about the repo. */
export function refuseUnrunnableRows(root: string): number {
  // biome-ignore lint/style/noProcessEnv: `--list` has no stage env to inherit, and the PATH this process was given IS the PATH a stage child would get — reading it here is the measurement, not configuration.
  const rows = unrunnableRegistryRows(root, process.env["PATH"] ?? "");
  if (rows.length === 0) {
    return EXIT.clean;
  }
  process.stdout.write(
    `\n[verify] REFUSED: ${rows.length} registry row(s) name a command this checkout cannot run — they are listed above as if runnable and are not.\n`,
  );
  for (const row of rows) {
    process.stdout.write(row.transcript);
  }
  return EXIT.toolError;
}
