// Gate: tooling-os-neutral — tooling/, scripts/ and tests/support/ run on Linux, macOS and Windows, so an OS-specific
// program, path, env key or line ending outside the platform module is a defect. Cases: contract/os-neutral.ts.
// Spawns are judged by the door they reach (`node:child_process`, the proc.ts doors), argv tables by shape. EXEMPT:
// `_shared/platform.ts` and its leaf `platform-probes.ts`, one module in two flat files because the load budget sits
// under the process doors. The git door's own spawn is the door, not an exemption.
// DECLARED LIMITS: a command, env key or separator passed as a parameter; a literal spelled across modules; a regex.
// FAMILY: singleton — no sibling policy reads its argv, path, env or line-split vocabulary. POPULATION: new;
// `docker/*.sh` runs only in the Linux container and `.claude/hooks` is not TypeScript. RETIRED MARKERS: none.
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { OsNeutralCase } from "../contract/os-neutral.ts";
import { defineGate } from "../contract/policy.ts";
import { unwrapExpression } from "../lib/ast-read.ts";
import {
  isGit,
  isJudgedProgram,
  isKernelPath,
  isLinuxOnlyArgv,
  isLinuxOnlyArgvTable,
  isNewlineSeparator,
  isPackageManager,
  isTmpPath,
  literalText,
  missingEnvTwins,
  OS_NEUTRAL_CASE_MESSAGES,
  objectMemberName,
  pairKey,
} from "../lib/os-neutral.ts";
import { classifyProjectHomeOrigin, locateProjectHome, readPackageExportOrigin } from "../lib/project-home-origin.ts";
import { readMemberAccess, readStringConstant } from "../lib/symbol-reference.ts";

/** The platform module: the spawns and openers, and the leaf that holds the `/proc` and `/sys` reads. */
const PLATFORM_HOME: ReadonlySet<string> = new Set(["tooling/src/_shared/platform.ts", "tooling/src/_shared/platform-probes.ts"]);
const GIT_HOME = "tooling/src/_shared/git.ts";
const PROC_HOME = {
  path: "tooling/src/_shared/proc.ts",
  names: [
    "runNicedSync",
    "execNicedSync",
    "execNicedSyncBuffer",
    "spawnFullPrioritySync",
    "spawnFullPriorityChild",
    "spawnNicedChild",
    "spawnNicedTranscript",
    "spawnNiced",
  ],
} as const;
const PROC_RECEIPT = "spawn doors: proc";
const CHILD_PROCESS: readonly string[] = ["node:child_process", "child_process"];
/** `exec`/`execSync` run their one command string in a shell; the rest take a program and an argv. */
const SHELL_DOORS: ReadonlySet<string> = new Set(["exec", "execSync"]);
const RAW_DOORS: ReadonlySet<string> = new Set(["spawn", "spawnSync", "execFile", "execFileSync", ...SHELL_DOORS]);
const SPLIT = "split";
const SHELL_OPTION = "shell";
const WHITESPACE_RE = /\s+/u;

/** Which door a call reaches: node's own spawn API (a shell or an argv door), a proc.ts door, or none. */
type Door = "shell" | "raw" | "proc" | null;

const MESSAGE =
  "an OS-specific program, path, env key or line ending in contributor tooling — tooling/, scripts/ and tests/support/ run on Linux, macOS and Windows, and only the platform module (`tooling/src/_shared/platform.ts` and its leaf `platform-probes.ts`) may branch on the OS (docs/plans/os-neutral-tooling/design.md, The policy).";
const FIX =
  "route the OS-specific read through a `_shared/platform.ts` door, take the temp dir from `os.tmpdir()`, spawn pnpm with `pnpmInvocation` or a proc.ts door, set `USERPROFILE` beside `HOME` and `TEMP` and `TMP` beside `TMPDIR`, split file text on `/\\r?\\n/u`, and run git through `runGit`/`execGit` in _shared/git.ts.";

/** The string values of an argv array literal; a non-literal element is `undefined`. */
function argvOf(node: Node | undefined): readonly (string | undefined)[] {
  const array = node === undefined ? undefined : unwrapExpression(node);
  return array?.isKind(SyntaxKind.ArrayLiteralExpression) === true ? array.getElements().map((element) => readStringConstant(element)) : [];
}

/** Does an options object literal set `shell` to anything but `false`? */
function setsShell(node: Node | undefined): boolean {
  const options = node === undefined ? undefined : unwrapExpression(node);
  if (options?.isKind(SyntaxKind.ObjectLiteralExpression) !== true) {
    return false;
  }
  const shell = options.getProperty(SHELL_OPTION);
  const value = shell?.isKind(SyntaxKind.PropertyAssignment) === true ? shell.getInitializer() : undefined;
  return value !== undefined && !value.isKind(SyntaxKind.FalseKeyword);
}

interface SpawnInput {
  readonly door: Exclude<Door, null>;
  readonly command: string;
  /** The call's arguments after the command: the argv, then the options. */
  readonly rest: readonly Node[];
  readonly inGitDoor: boolean;
}

/** Which case one door call is, or null when it is OS-neutral. */
function spawnCase(input: SpawnInput): OsNeutralCase | null {
  const [argvNode, afterArgv] = input.rest;
  const argv = argvOf(argvNode);
  const [program = "", ...args] = input.door === "shell" ? input.command.trim().split(WHITESPACE_RE) : [input.command, ...argv];
  if (isLinuxOnlyArgv(program, args)) {
    return "linux-spawn";
  }
  if (isGit(program)) {
    return input.inGitDoor ? null : "git-bypass";
  }
  const options = argv.length > 0 ? afterArgv : argvNode;
  return input.door === "raw" && isPackageManager(program) && !setsShell(options) ? "package-manager-spawn" : null;
}

export const gate = defineGate({
  id: "tooling-os-neutral",
  family: "tooling-os-neutral",
  authority: "hard",
  severity: "error",
  population: { in: ["@tooling", "@scripts", "@tests"], under: ["tooling/src/**", "scripts/**", "tests/support/**"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const proc = locateProjectHome(ctx.files, ctx.relativePath, PROC_HOME);
    const report = (node: Node, which: OsNeutralCase): void => {
      const message = `${OS_NEUTRAL_CASE_MESSAGES[which]}. ${MESSAGE}`;
      // A template head is no carrier of its own: report its template, positioned at the head's exact text.
      const template = node.isKind(SyntaxKind.TemplateHead) ? node.getParent() : undefined;
      if (template === undefined) {
        ctx.report.node(node, { message });
      } else {
        ctx.report.node(template, { message, token: node.getText(), offset: 0 });
      }
    };
    const exempt = (sourceFile: SourceFile): boolean => PLATFORM_HOME.has(ctx.relativePath(sourceFile));

    const doorOf = (callee: Node): Door => {
      const node = readPackageExportOrigin(callee, CHILD_PROCESS, RAW_DOORS);
      if (node.verdict === "home") {
        return node.exportedName !== null && SHELL_DOORS.has(node.exportedName) ? "shell" : "raw";
      }
      return classifyProjectHomeOrigin(callee, proc) === "home" ? "proc" : null;
    };

    const judgeSpawn = (call: Node, sourceFile: SourceFile): void => {
      if (!call.isKind(SyntaxKind.CallExpression)) {
        return;
      }
      const [first, ...rest] = call.getArguments();
      const command = first === undefined ? undefined : readStringConstant(first);
      // The literal is the cheap test; a door's identity needs the checker, so it is asked only behind it.
      const door = command !== undefined && isJudgedProgram(command.trim().split(WHITESPACE_RE)[0] ?? "") ? doorOf(call.getExpression()) : null;
      if (door !== null && first !== undefined && command !== undefined) {
        const which = spawnCase({ door, command, rest, inGitDoor: ctx.relativePath(sourceFile) === GIT_HOME });
        if (which !== null) {
          report(first, which);
        }
      }
    };

    const judgeSplit = (call: Node): void => {
      if (!call.isKind(SyntaxKind.CallExpression)) {
        return;
      }
      const member = readMemberAccess(call.getExpression());
      const [separator] = call.getArguments();
      if (member?.name === SPLIT && separator !== undefined && isNewlineSeparator(separator)) {
        report(separator, "newline-split");
      }
    };

    const judgeKeys = (members: readonly { readonly node: Node; readonly key: string | undefined }[]): void => {
      const keys = new Set(members.flatMap((member) => (member.key === undefined ? [] : [member.key])));
      for (const missing of missingEnvTwins(keys)) {
        const carrier = members.find((member) => member.key === missing.key);
        if (carrier !== undefined) {
          report(carrier.node, missing.case);
        }
      }
    };

    return {
      visitors: [
        {
          kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral, SyntaxKind.TemplateHead],
          visit: (node, sourceFile) => {
            const text = literalText(node);
            if (text === undefined || exempt(sourceFile)) {
              return;
            }
            if (isKernelPath(text)) {
              report(node, "kernel-path");
            } else if (isTmpPath(text)) {
              report(node, "tmp-path");
            }
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile) => {
            if (exempt(sourceFile)) {
              return;
            }
            judgeSpawn(node, sourceFile);
            judgeSplit(node);
          },
        },
        {
          kinds: [SyntaxKind.ArrayLiteralExpression],
          visit: (node, sourceFile) => {
            if (!node.isKind(SyntaxKind.ArrayLiteralExpression) || exempt(sourceFile)) {
              return;
            }
            const elements = node.getElements();
            if (isLinuxOnlyArgvTable(elements.map((element) => readStringConstant(element)))) {
              report(node, "linux-spawn");
            }
            const pairs = elements.map((element) => ({ node: element, key: pairKey(element) }));
            if (pairs.length > 0 && pairs.every((pair) => pair.key !== undefined)) {
              judgeKeys(pairs);
            }
          },
        },
        {
          kinds: [SyntaxKind.ObjectLiteralExpression],
          visit: (node, sourceFile) => {
            if (!node.isKind(SyntaxKind.ObjectLiteralExpression) || exempt(sourceFile)) {
              return;
            }
            judgeKeys(node.getProperties().map((member) => ({ node: member, key: objectMemberName(member) })));
          },
        },
      ],
      evaluate: () => {
        ctx.receipt({ kind: "population", source: PROC_RECEIPT, members: proc.members, unresolved: proc.unresolved });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: withProc({
        "tooling/src/seed/ops/ps.ts": 'import { runNicedSync } from "../../_shared/proc.ts";\nexport const x = runNicedSync("ps", ["-o", "pid="]);\n',
      }),
      expect: { count: 1, token: '"ps"', messageIncludes: "a Linux-only program in an argv" },
      why: "the founding shape — a Linux-only program handed to a proc.ts door by literal; the door is resolved by declaration, not by the spelled name",
    },
    {
      mode: "types",
      files: withProc({
        "scripts/shell.ts": 'import { spawnSync as run } from "node:child_process";\nexport const r = run("bash", ["-c", "echo hi"]);\n',
      }),
      expect: { count: 1, token: '"bash"', messageIncludes: "a Linux-only program in an argv" },
      why: "`bash -c` through node's own spawn door under an IMPORT ALIAS — the callee resolves to `node:child_process`'s export whatever its local name, and the tell flag is read from the argv literal",
    },
    {
      mode: "types",
      files: withProc({
        "scripts/find.ts": 'import { execSync } from "node:child_process";\nexport const r = execSync("grep -P \'x\\d\' notes.txt");\n',
      }),
      expect: { count: 1, messageIncludes: "a Linux-only program in an argv" },
      why: "a SHELL door takes one command string: its first word is the program and the rest are the argv, so `grep -P` inside the string is the same finding",
    },
    {
      mode: "types",
      files: withProc({
        "tooling/src/verify/lib/stages.ts": 'export const argv = ["bash", "-c", "for f in *.mjs; do node --check \\"$f\\"; done"];\n',
      }),
      expect: { count: 1, messageIncludes: "a Linux-only program in an argv" },
      why: "an ARGV TABLE handed to a runner later: the array literal is the argv, so its program and tell flag are judged by shape with no door in sight (the live `lint:hook-syntax` row)",
    },
    {
      mode: "types",
      files: withProc({
        "tooling/src/seed/lib/stat.ts": 'export const status = "/proc/self/status";\nexport const net = (id: string): string => `/sys/class/net/${id}`;\n',
      }),
      expect: { count: 2, messageIncludes: "a `/proc` or `/sys` path" },
      why: "a `/proc` string and a `/sys` template HEAD — a path whose root is spelled in a template before its first substitution is the same path",
    },
    {
      mode: "types",
      files: withProc({ "tests/support/scratch.ts": 'export const scratch = "/tmp/orb-scratch";\n' }),
      expect: { count: 1, token: '"/tmp/orb-scratch"', messageIncludes: "a hardcoded `/tmp` path" },
      why: "a hardcoded `/tmp` in test support, which the population admits beside tooling and scripts",
    },
    {
      mode: "types",
      files: withProc({
        "scripts/install.ts": 'import { spawnSync } from "node:child_process";\nexport const r = spawnSync("pnpm", ["install"], { stdio: "inherit" });\n',
      }),
      expect: { count: 1, token: '"pnpm"', messageIncludes: "spawned raw with no shell" },
      why: "pnpm through node's own spawn door with no shell: on Windows `pnpm` is `pnpm.cmd`, which `spawn` refuses without a shell",
    },
    {
      mode: "types",
      files: withProc({ "tests/support/home.ts": "export const env = (dir: string): NodeJS.ProcessEnv => ({ ...process.env, HOME: dir });\n" }),
      expect: { count: 1, token: "HOME", messageIncludes: "sets `HOME` without `USERPROFILE`" },
      why: "an env object that moves HOME alone, so a Windows child still reads the real profile through USERPROFILE",
    },
    {
      mode: "types",
      files: withProc({
        "tests/support/temp.ts": 'export const env = (dir: string): Record<string, string> => Object.fromEntries([["TMPDIR", dir], ["TEMP", dir]]);\n',
      }),
      expect: { count: 1, messageIncludes: "sets `TMPDIR` without both `TEMP` and `TMP`" },
      why: "the `Object.fromEntries` PAIR LIST spelling of an env object: TEMP is set but TMP is not, and a Windows child reads either",
    },
    {
      mode: "types",
      files: withProc({
        "tooling/src/seed/lib/lines.ts": [
          'import { readFileSync } from "node:fs";',
          'const NEWLINE = "\\n";',
          'export const direct = (path: string): string[] => readFileSync(path, "utf8").split("\\n");',
          "export const lines = (text: string): string[] => text.split(NEWLINE);",
          "",
        ].join("\n"),
      }),
      expect: { count: 2, messageIncludes: "a line split on a bare" },
      why: "a line split on a bare LF, over file text and over text of unknown origin through a `const` separator: which strings came from a file, a resource or a child cannot be told statically, and each can carry CRLF",
    },
    {
      mode: "types",
      files: withProc({
        "scripts/probe.ts":
          'import { execFileSync } from "node:child_process";\nexport const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" });\n',
        "tooling/src/seed/ops/log.ts": 'import { runNicedSync } from "../../_shared/proc.ts";\nexport const x = runNicedSync("git", ["log"]);\n',
      }),
      expect: { count: 2, token: '"git"', messageIncludes: "a git spawn outside the git door" },
      why: "git spawned through node's door and through a proc.ts door outside `_shared/git.ts`: neither drops the `GIT_*` namespace a hook exports",
    },
    {
      mode: "types",
      files: withProc({
        "tooling/src/_shared/platform.ts": 'export const root = "/proc";\n',
        "tooling/src/_shared/platform-parse.ts": 'export const stat = "/proc/self/stat";\n',
      }),
      expect: { count: 1, token: '"/proc/self/stat"', messageIncludes: "a `/proc` or `/sys` path" },
      why: "the exemption names two files exactly: a sibling that merely shares the platform module's name prefix reports like any other module",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: withProc({
        "tooling/src/_shared/platform.ts":
          'import { runNicedSync } from "./proc.ts";\nexport const listening = runNicedSync("ss", ["-tlnp"]);\nexport const root = "/proc";\n',
        "tooling/src/_shared/platform-probes.ts": 'export const cgroup = "/sys/fs/cgroup";\n',
      }),
      why: "THE ONE EXEMPTION: the platform module and its leaf are where OS-specific programs and paths live; cutting the exemption reds both files",
    },
    {
      mode: "types",
      files: withProc({
        "tooling/src/_shared/git.ts":
          'import { runNicedSync } from "./proc.ts";\nexport const runGit = (args: string[]): unknown => runNicedSync("git", args);\n',
      }),
      why: "the git door's own spawn IS the door: `runGit` in `_shared/git.ts` is where a git child's environment is cleaned",
    },
    {
      mode: "types",
      files: withProc({
        "tooling/src/seed/ops/install.ts": 'import { runNicedSync } from "../../_shared/proc.ts";\nexport const r = runNicedSync("pnpm", ["install"]);\n',
        "scripts/shelled.ts": [
          'import { exec, spawnSync } from "node:child_process";',
          'export const a = spawnSync("pnpm", ["install"], { shell: true });',
          'export const b = exec("pnpm install");',
          "",
        ].join("\n"),
      }),
      why: "pnpm through a proc.ts door (cross-spawn on win32), through node's door with a shell, and through the shell door itself: each resolves the `.cmd` shim",
    },
    {
      mode: "types",
      files: withProc({
        "tooling/src/seed/lib/names.ts": 'export const PROGRAMS = ["ss", "ps"];\nexport const SHELLS = ["bash", "sh"];\n',
      }),
      why: "a VOCABULARY LIST is not an argv: a Linux-only program followed by a word rather than a flag, or a shell with no `-c`, reports nothing",
    },
    {
      mode: "types",
      files: withProc({
        "tests/support/env.ts": [
          "export const home = (dir: string): Record<string, string> => ({ HOME: dir, USERPROFILE: dir });",
          'export const temp = (dir: string): Record<string, string> => Object.fromEntries([["TMPDIR", dir], ["TEMP", dir], ["TMP", dir]]);',
          "",
        ].join("\n"),
      }),
      why: "an env object that sets every OS's key together is OS-neutral, in both the object and the pair-list spelling",
    },
    {
      mode: "types",
      files: withProc({
        "tooling/src/seed/lib/split.ts": [
          'import { readFileSync } from "node:fs";',
          'export const crlf = (path: string): string[] => readFileSync(path, "utf8").split(/\\r?\\n/u);',
          'export const cells = (row: string): string[] => row.split("\\t");',
          "export const by = (text: string, separator: string): string[] => text.split(separator);",
          "",
        ].join("\n"),
      }),
      why: "a CRLF-tolerant line split and a split on another separator pass; a separator handed in through a parameter is the DECLARED LIMIT",
    },
    {
      mode: "types",
      files: withProc({
        "tooling/src/seed/ops/local.ts": [
          "function runNicedSync(cmd: string, args: readonly string[]): string {",
          "  return [cmd, ...args].join(' ');",
          "}",
          'export const x = runNicedSync("ps", ["-o", "pid="]);',
          "",
        ].join("\n"),
      }),
      why: "IDENTITY, NOT SPELLING: a local function that merely shares a proc.ts door's name spawns nothing, so its argument is no Linux-only spawn",
    },
    {
      mode: "types",
      files: withProc({
        "tooling/src/seed/ops/prose.ts": "// Linux reads /proc and runs `bash -c`; this module does neither.\nexport const doc = true;\n",
        "packages/server/src/infra/tmp.ts": 'export const scratch = "/tmp/server";\n',
        "tests/tooling/proc-reader.test.ts": 'export const stat = "/proc/self/stat";\n',
      }),
      why: "comment posture is comment-SAFE (literal node kinds only), and the population fence holds: product code and tests outside `tests/support` are not contributor tooling",
    },
  ],
  mustRefuse: [
    {
      mode: "types",
      files: { "tooling/src/seed/ops/ps.ts": 'export const x = "ps";\n' },
      expect: { messageIncludes: '"spawn doors: proc"' },
      why: "the proc.ts doors are located and receipted, so a moved or renamed home refuses the run instead of every proc.ts spawn silently passing",
    },
  ],
});

/** The proc.ts door surface, planted so a proof locates and receipts it. */
function withProc(files: Readonly<Record<string, string>>): Readonly<Record<string, string>> {
  const doors = PROC_HOME.names.map(
    (name) => `export function ${name}(cmd: string, args: readonly string[]): string {\n  return [cmd, ...args].join(" ");\n}\n`,
  );
  return { [PROC_HOME.path]: doors.join(""), ...files };
}
