// Gate: tsconfig-routing-parity — the shared JS parser and native TS7 must resolve identical roots.
// It also enforces each test/harness root's intended exclusive primary; imported closures are separate.
// Compiler/tool failure is loud, never a clean parity verdict. Comments are not part of the subject.
import { isAbsolute, join, relative, sep } from "node:path";
import process from "node:process";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { predictedProgram, requiresExclusiveRoot } from "@orb/tooling/_shared/project-worlds";
import type { GateDescriptor } from "../contract/gate.ts";
import type { CompilerProgram } from "../contract/policy-scope.ts";
import { readCompilerPrograms } from "../lib/policy-program-membership.ts";

const TS_SOURCE_RE = /\.(?:ts|tsx|mts|cts)$/u;

function compare(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function sameValues(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

function nativeRoots(root: string, config: string): ReadonlySet<string> {
  const wrapper = join(process.cwd(), "scripts", "ts7.cjs");
  const result = runNicedSync("pnpm", ["exec", "node", wrapper, "--showConfig", "-p", join(root, config)], { cwd: process.cwd() });
  if (result.status !== 0) {
    const detail = [result.stderr.trim(), result.stdout.trim()].filter((part) => part !== "").join("\n");
    throw new Error(`native TS7 --showConfig failed for ${config} (exit ${String(result.status)}): ${detail}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout) as unknown;
  } catch (error) {
    throw new Error(`native TS7 --showConfig returned malformed JSON for ${config}`, { cause: error });
  }
  const files = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "files") : undefined;
  if (!(Array.isArray(files) && files.every((file) => typeof file === "string"))) {
    throw new Error(`native TS7 --showConfig returned no files array for ${config}`);
  }
  const configDir = join(root, config, "..");
  const roots = new Set<string>();
  for (const file of files) {
    const absolute = isAbsolute(file) ? file : join(configDir, file);
    const rel = relative(root, absolute);
    if (rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel) || rel.includes(`${sep}node_modules${sep}`)) {
      continue;
    }
    const posix = rel.split(sep).join("/");
    if (TS_SOURCE_RE.test(posix)) {
      roots.add(posix);
    }
  }
  return roots;
}

interface Divergence {
  readonly file: string;
  readonly message: string;
}

function programDivergences(program: CompilerProgram, native: ReadonlySet<string>): readonly Divergence[] {
  const parsed = new Set(program.files.filter((path) => TS_SOURCE_RE.test(path)));
  if (sameValues(parsed, native)) {
    return [];
  }
  return [
    ...[...parsed]
      .filter((path) => !native.has(path))
      .map((path) => ({ file: path, message: `${program.config}: shared config parser roots this file but native TS7 does not` })),
    ...[...native]
      .filter((path) => !parsed.has(path))
      .map((path) => ({ file: path, message: `${program.config}: native TS7 roots this file but the shared config parser does not` })),
  ];
}

function primaryDivergence(file: string, roots: readonly string[]): Divergence | null {
  const intended = predictedProgram(file);
  if (intended !== undefined && !roots.includes(intended)) {
    return { file, message: `intended primary ${intended} is absent from native roots {${roots.join(", ")}}` };
  }
  if (requiresExclusiveRoot(file) && roots.length !== 1) {
    return { file, message: `test/harness primary must be exclusive, but native roots are {${roots.join(", ")}}` };
  }
  return null;
}

function reconcile(root: string): readonly Divergence[] {
  const programs = readCompilerPrograms(root);
  const divergences: Divergence[] = [];
  const rootsByFile = new Map<string, string[]>();
  for (const program of programs) {
    const parsed = new Set(program.files.filter((path) => TS_SOURCE_RE.test(path)));
    const native = nativeRoots(root, program.config);
    divergences.push(...programDivergences(program, native));
    for (const file of parsed) {
      const owners = rootsByFile.get(file) ?? [];
      owners.push(program.id);
      rootsByFile.set(file, owners);
    }
  }
  for (const [file, roots] of rootsByFile) {
    const divergence = primaryDivergence(file, roots);
    if (divergence !== null) {
      divergences.push(divergence);
    }
  }
  return divergences.toSorted((left, right) => compare(`${left.file}\0${left.message}`, `${right.file}\0${right.message}`));
}

const BASE = '{"compilerOptions":{"noEmit":true,"strict":true,"target":"es2025","lib":["es2025"],"module":"esnext","moduleResolution":"bundler"},"files":[]}\n';

export const gate: GateDescriptor = {
  name: "tsconfig-routing-parity",
  docRow: "Core-Enforcement-Active-Gates.md (parity gate)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "the shared compiler-membership parser disagrees with native TS7 roots, or a test/harness has no exclusive intended primary. Scoped typecheck routing would be incomplete or ambiguous.",
  fix: "correct the owning native tsconfig; routing is derived from compiler membership and has no path table to patch.",
  run: (ctx) => {
    // The harness converts a thrown compiler/config failure into a ToolError. Reporting it as an ordinary
    // finding would blame authored code for a run that never obtained a native parity verdict.
    for (const divergence of reconcile(ctx.root)) {
      ctx.report({ file: divergence.file, line: 0, column: 0, message: divergence.message });
    }
  },
  mustFlag: [
    {
      files: {
        "tsconfig.base.json": BASE,
        "tsconfig.json": '{"extends":"./tsconfig.base.json","include":["tests"]}\n',
        "tsconfig.tests-dom.json": '{"extends":"./tsconfig.base.json","include":["tests/**/*.dom.test.ts"]}\n',
        "tests/client/value.dom.test.ts": "export {};\n",
      },
      expect: { messageIncludes: "primary must be exclusive" },
      why: "a DOM test rooted by both Node and browser programs has no honest exclusive primary",
    },
  ],
  mustPass: [
    {
      files: {
        "tsconfig.base.json": BASE,
        "tsconfig.json": '{"extends":"./tsconfig.base.json","include":["tests"],"exclude":["tests/**/*.dom.test.ts"]}\n',
        "tsconfig.tests-dom.json": '{"extends":"./tsconfig.base.json","include":["tests/**/*.dom.test.ts"]}\n',
        "tests/client/value.dom.test.ts": "export {};\n",
        "tests/server/value.test.ts": "export {};\n",
      },
      why: "native and shared roots agree and each test has exactly one intended primary",
    },
  ],
};
