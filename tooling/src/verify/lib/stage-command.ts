// WHAT A STAGE'S `argv[0]` ACTUALLY IS — resolved from EVIDENCE on this checkout, never from a name list.
//
// THE DEFECT (#2220). `ops/run.ts` carried `PATH_RESOLVED = new Set(["pnpm", "node"])` and sent every
// other argv[0] to `node_modules/.bin/<cmd>`. The registry's `lint:hook-syntax` row spells
// `["bash", "-c", "for f in .claude/hooks/*.mjs; do node --check \"$f\"; done"]`, so `bash` fell through
// to `<root>/node_modules/.bin/bash`, which does not exist; `spawnNicedTranscript` existence-checks a
// path-shaped command and returns `code: null`, and every classifier maps null to a TOOL ERROR. The stage
// therefore exited 2 on EVERY static run since it landed on 2026-09-11 and has NEVER produced a verdict —
// while the thing it guards is the PreToolUse Bash guard, whose own syntax error fails OPEN.
//
// WHY NOT JUST ADD "bash" TO THE SET. That set is an allowlist of NAMES, and a name is a guess about the
// world. It grows one entry per incident, each entry paid for by a stage that silently stopped measuring;
// and it does not model the third category it was handed — a SYSTEM program, which is neither a
// `pnpm <script>` nor a workspace bin. So the set is gone. This module asks the filesystem instead, in a
// fixed order whose FIRST rung is the property the old split was really buying:
//
//   1. argv[0] contains a separator  → a PATH LITERAL; taken as written, relative to the repo root.
//   2. `node_modules/.bin/<cmd>` is executable → the WORKSPACE BIN. It wins over any system copy of the
//      same name, which is the version pin: a stage must run the `tsc`/`biome`/`vitest` this repo
//      installed, never whatever a developer happens to have on PATH.
//   3. an executable `<cmd>` on PATH → a SYSTEM PROGRAM (`bash`, and today's `pnpm`/`node` — which are on
//      PATH and not in `.bin`, so the retired allowlist's two members fall out of this rung for free).
//   4. neither → UNRESOLVABLE, and the runner REFUSES rather than spawning: a named tool error, printed
//      with where it looked, instead of an anonymous exit 2 nobody can attribute (#2225).
//
// THE REFUSAL IS THE POINT, not a courtesy. Under the §3.3 exit contract a 2 means "the run is not a
// verdict", and #2225 is the general form of #2220: a registered stage that can never produce a verdict is
// invisible to its tier. A resolver that cannot resolve must SAY the command it could not find; a bare 2
// among thirty rows is what let this one live for a day.
import { statSync } from "node:fs";
import { delimiter, isAbsolute, join, resolve, sep } from "node:path";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";

refuseDirectInvocation(import.meta.url, "pnpm verify");

/** How a stage's `argv[0]` resolved, WITH the evidence — `kind` is the rung that answered, `command` is
 *  what the runner will hand `spawnNicedTranscript`. `unresolvable` carries no command, only where we
 *  looked, because there is nothing to spawn and the refusal has to name both attempts. */
export type StageCommand =
  | { readonly kind: "path-literal" | "workspace-bin" | "system-program"; readonly command: string }
  | { readonly kind: "unresolvable"; readonly requested: string; readonly workspaceBin: string; readonly pathDirs: number };

/** Executable-file test WITHOUT a throw: `statSync`'s `throwIfNoEntry: false` answers "absent" as
 *  `undefined`, so the resolver owns no caught failure. Mode bits (not `access(X_OK)`) because the question
 *  is "is there an executable file of this name here", not "may THIS euid run it" — and because `.bin`
 *  entries are symlinks, which `statSync` follows by design. */
function executableAt(candidate: string): boolean {
  const stat = statSync(candidate, { throwIfNoEntry: false });
  if (stat === undefined || !stat.isFile()) {
    return false;
  }
  // The alternative, `accessSync(X_OK)`, THROWS on the negative answer — it would make this resolver the
  // owner of a caught failure for the ordinary case of "that command is not here".
  // biome-ignore lint/suspicious/noBitwiseOperators: a POSIX mode IS a bitfield; `& 0o111` (any of user/group/other execute) is the domain operation on it, not the mistyped `&&` the rule hunts.
  return (stat.mode & 0o111) !== 0;
}

/** The PATH directories, in order, from an explicitly-passed PATH string — the caller owns reading the
 *  environment, so this module stays pure and a test can hand it a fabricated PATH. */
function pathDirectories(pathEnv: string): readonly string[] {
  return pathEnv.split(delimiter).filter((dir) => dir.length > 0);
}

/** Where the workspace bin for `cmd` would live on this checkout. Named so the refusal can print it. */
export function workspaceBinPath(root: string, cmd: string): string {
  return join(root, "node_modules", ".bin", cmd);
}

/** THE RESOLUTION, rung by rung (the module header states the order and why). `pathEnv` is the PATH the
 *  CHILD will be spawned with, not necessarily the parent's — the runner composes a stage's env and this
 *  must agree with it, or the resolver would answer about a search path the child never gets. */
export function resolveStageCommand(root: string, cmd: string, pathEnv: string): StageCommand {
  if (cmd.includes(sep) || cmd.includes("/")) {
    return { kind: "path-literal", command: isAbsolute(cmd) ? cmd : resolve(root, cmd) };
  }
  const workspaceBin = workspaceBinPath(root, cmd);
  if (executableAt(workspaceBin)) {
    return { kind: "workspace-bin", command: workspaceBin };
  }
  const dirs = pathDirectories(pathEnv);
  for (const dir of dirs) {
    const candidate = join(dir, cmd);
    if (executableAt(candidate)) {
      return { kind: "system-program", command: candidate };
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
