// `pnpm typecheck` passes the compiler's own measurements through per program, and only when asked.
// Each case runs scripts/typecheck.ts over two planted programs in a scratch directory and reads what the native
// compiler printed and wrote; absolute tsconfig paths keep the planted programs out of the checked-in tree.
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@orb/testkit/tooling";
import { runNicedSync } from "@orb/tooling/floor/process/proc";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";

const SCRIPT = fileURLToPath(new URL("../../scripts/typecheck.ts", import.meta.url));
// A line the compiler prints for every program under --extendedDiagnostics and under nothing else.
const CHECK_TIME_LINE = /^Check time:/gmu;
const PROGRAM_COUNT = 2;

// Two minimal programs; the compiler resolves its bundled libs, so they need no node_modules.
function plantPrograms(scratch: string): readonly string[] {
  return Array.from({ length: PROGRAM_COUNT }, (_, index) => {
    const dir = join(scratch, `program-${index}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "main.ts"), `export const value: number = ${index};\n`);
    const config = join(dir, "tsconfig.json");
    writeFileSync(
      config,
      JSON.stringify({
        compilerOptions: { strict: true, types: [], module: "esnext", target: "esnext", moduleResolution: "bundler" },
        files: ["main.ts"],
      }),
    );
    return config;
  });
}

function run(args: readonly string[]): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
  const result = runNicedSync(process.execPath, [SCRIPT, ...args], { env: inheritedProcessEnv() });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("the compiler's diagnostics reach the output for each program with the flag, and never without it", { tags: ["slow"] }, ({ scratch }) => {
  const programs = plantPrograms(scratch);

  const quiet = run(programs);
  const measured = run([...programs, "--extendedDiagnostics"]);

  expect(quiet.status).toBe(0);
  expect(quiet.stdout).not.toMatch(CHECK_TIME_LINE);
  expect(measured.status).toBe(0);
  expect(measured.stdout.match(CHECK_TIME_LINE)).toHaveLength(PROGRAM_COUNT);
});

test("--generateTrace writes each program's trace to its own subdirectory", { tags: ["slow"] }, ({ scratch }) => {
  const programs = plantPrograms(scratch);
  const traceRoot = join(scratch, "traces");

  const traced = run([...programs, `--generateTrace=${traceRoot}`]);

  expect(traced.status).toBe(0);
  const programDirs = readdirSync(traceRoot);
  expect(programDirs).toHaveLength(PROGRAM_COUNT);
  for (const dir of programDirs) {
    expect(existsSync(join(traceRoot, dir, "trace.json"))).toBe(true);
  }
  // Tracing alone adds no diagnostics output.
  expect(traced.stdout).not.toMatch(CHECK_TIME_LINE);
});

test("a misspelled flag is refused before any compiler runs", ({ scratch }) => {
  const programs = plantPrograms(scratch);

  const refused = run([...programs, "--extendedDiagnostic"]);

  expect(refused.status).not.toBe(0);
  expect(refused.stderr).toContain("Expected a tsconfig file");
  expect(refused.stdout).not.toContain("typecheck ");
});
