// Native compiler observations keep closure and root reconciliation independent of the shared parser.
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { isWithinRoot } from "@orb/kit/path-containment";
import { isTypeWorldSource } from "@orb/tooling/floor/compiler/project-worlds";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import type { PolicyProgramMembership } from "../contract/policy-scope.ts";

// tsgo's --listFilesOnly on the widest program is ~5,400 absolute paths (~0.5MB); 64MiB is generous headroom.
const LIST_FILES_MAX_BUFFER = 67_108_864;
const TS7_WRAPPER = fileURLToPath(new URL("../../../../scripts/ts7.ts", import.meta.url));

/** The absolute-path import closure of one tsgo program (module resolution only — no typecheck). Returns
 *  undefined on any failure (the caller maps that to a TOOL ERROR — a broken listing is not a verdict). */
function programClosure(root: string, program: PolicyProgramMembership): readonly string[] | undefined {
  const { config } = program;
  const ts7 = join(root, "scripts", "ts7.ts");
  const res = runNicedSync(process.execPath, [ts7, "--noEmit", "--listFilesOnly", "-p", config], {
    cwd: root,
    maxBuffer: LIST_FILES_MAX_BUFFER,
    supervised: true,
  });
  if (res.status !== 0) {
    process.stderr.write(`tests-type-membership: \`ts7 --listFilesOnly -p ${config}\` failed (status ${String(res.status)})\n${res.stderr}`);
    return;
  }
  const files = res.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim().replaceAll("\\", "/"))
    .filter((line) => line !== "");
  if ((files.length === 0 && program.files.length > 0) || files.some((file) => !isAbsolute(file))) {
    process.stderr.write(
      `tests-type-membership: \`ts7 --listFilesOnly -p ${config}\` returned ${files.length === 0 ? "no files for a concrete program" : "a non-absolute file"}\n`,
    );
    return;
  }
  return files;
}

/** Every program's closure, keyed by config, as Sets of ABSOLUTE posix paths. undefined ⇒ a listing broke. */
export function programClosures(root: string, programs: readonly PolicyProgramMembership[]): ReadonlyMap<string, ReadonlySet<string>> | undefined {
  const out = new Map<string, ReadonlySet<string>>();
  for (const program of programs) {
    const closure = programClosure(root, program);
    if (closure === undefined) {
      return; // a broken listing → the whole reconciliation is a tool error, not a false "clean"
    }
    out.set(program.config, new Set(closure));
  }
  return out;
}

/** `launcher` is the injected native compiler wrapper; the checkout's own wrapper by default. */
export function nativeProgramRoots(root: string, program: PolicyProgramMembership, launcher: string = TS7_WRAPPER): ReadonlySet<string> | undefined {
  const result = runNicedSync(process.execPath, [launcher, "--showConfig", "-p", program.config], {
    cwd: root,
    maxBuffer: LIST_FILES_MAX_BUFFER,
  });
  if (result.status !== 0) {
    process.stderr.write(`tests-type-membership: native TS7 --showConfig failed for ${program.config} (status ${String(result.status)})\n${result.stderr}`);
    return;
  }
  let parsed: unknown;
  // @orb-waive caught-failure-ownership(catch): the catch writes the malformed-JSON line to stderr and returns undefined; nativeRootSets returns undefined (tests-type-membership.ts:39) and the caller returns EXIT.toolError (tests-type-membership.ts:298), as does the direct caller (tests-type-membership.ts:376). Ends if malformed native output can produce a membership verdict.
  try {
    parsed = JSON.parse(result.stdout) as unknown;
  } catch {
    process.stderr.write(`tests-type-membership: native TS7 --showConfig returned malformed JSON for ${program.config}\n`);
    return;
  }
  const files = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "files") : undefined;
  if (!(Array.isArray(files) && files.every((file) => typeof file === "string"))) {
    process.stderr.write(`tests-type-membership: native TS7 --showConfig returned no files array for ${program.config}\n`);
    return;
  }
  const configDir = dirname(resolve(root, program.config));
  const roots = new Set<string>();
  for (const file of files) {
    const absolute = isAbsolute(file) ? file : join(configDir, file);
    const rel = relative(root, absolute);
    if (!isWithinRoot(root, resolve(absolute), { sep }) || rel.includes(`${sep}node_modules${sep}`)) {
      continue;
    }
    const posix = rel.split(sep).join("/");
    if (isTypeWorldSource(posix)) {
      roots.add(posix);
    }
  }
  return roots;
}
