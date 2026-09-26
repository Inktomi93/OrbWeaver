// The predicates of the `tooling-os-neutral` policy: which argv, path, env and line-split shapes only work
// on one operating system. Pure readers over delivered nodes; the policy owns the walk, the door identity
// and the report.
import type { Node } from "ts-morph";
import { Node as MorphNode, SyntaxKind } from "ts-morph";
import type { OsNeutralCase } from "../contract/os-neutral.ts";
import { unwrapExpression } from "./ast-read.ts";
import { readStringConstant } from "./symbol-reference.ts";

/** The per-case sentence a finding carries; the policy's `message` states the rule once. */
export const OS_NEUTRAL_CASE_MESSAGES: Readonly<Record<OsNeutralCase, string>> = {
  "linux-spawn": "a Linux-only program in an argv: `ss`, `ps`, `kill`, `xdg-open`, `bash -c`/`sh -c`, `grep -P` or `readlink -f`",
  "kernel-path": "a `/proc` or `/sys` path, which exists only on Linux",
  "tmp-path": "a hardcoded `/tmp` path; the temp directory is `os.tmpdir()` on every OS",
  "package-manager-spawn": "`pnpm`, `npm` or `npx` spawned raw with no shell: on Windows each is a `.cmd` that `spawn` cannot start",
  "home-without-userprofile": "an env object that sets `HOME` without `USERPROFILE`, the home Windows programs read",
  "tmpdir-without-temp": "an env object that sets `TMPDIR` without both `TEMP` and `TMP`, the temp dirs Windows programs read",
  "newline-split": 'a line split on a bare `"\\n"`: file, resource and child text carries CRLF on Windows, which leaves a `\\r` on every line',
  "git-bypass": "a git spawn outside the git door, so a hook's `GIT_*` variables reach the child",
};

/** A Linux-only program and the flag that makes it Linux-only; `null` means the program itself is. */
const LINUX_ONLY_PROGRAMS: Readonly<Record<string, string | null>> = {
  ss: null,
  ps: null,
  kill: null,
  "xdg-open": null,
  bash: "-c",
  sh: "-c",
  grep: "-P",
  readlink: "-f",
};

/** The package managers whose Windows entry point is a `.cmd` shim. */
const PACKAGE_MANAGERS: ReadonlySet<string> = new Set(["pnpm", "npm", "npx"]);
const GIT = "git";

/** Is `program args…` a Linux-only invocation? */
export function isLinuxOnlyArgv(program: string, args: readonly (string | undefined)[]): boolean {
  if (!Object.hasOwn(LINUX_ONLY_PROGRAMS, program)) {
    return false;
  }
  const flag = LINUX_ONLY_PROGRAMS[program];
  return flag === null || args.includes(flag);
}

/** An argv table rather than a vocabulary list: its program is Linux-only, and when the program alone is
 *  not the tell, its tell flag is present; when it is, the next element is a flag. */
export function isLinuxOnlyArgvTable(elements: readonly (string | undefined)[]): boolean {
  const [program, ...args] = elements;
  if (program === undefined || !isLinuxOnlyArgv(program, args)) {
    return false;
  }
  return LINUX_ONLY_PROGRAMS[program] !== null || (args[0]?.startsWith("-") ?? false);
}

export function isPackageManager(program: string): boolean {
  return PACKAGE_MANAGERS.has(program);
}

export function isGit(program: string): boolean {
  return program === GIT;
}

/** Is this a program any spawn case judges? The cheap test a door's identity is resolved behind. */
export function isJudgedProgram(program: string): boolean {
  return Object.hasOwn(LINUX_ONLY_PROGRAMS, program) || isPackageManager(program) || isGit(program);
}

// Built from segment names so the policy's own vocabulary is not a path literal it would report.
const KERNEL_TREES = ["proc", "sys"] as const;
const TMP_TREE = "tmp";

function underRoot(text: string, tree: string): boolean {
  const root = `/${tree}`;
  return text === root || text.startsWith(`${root}/`);
}

export function isKernelPath(text: string): boolean {
  return KERNEL_TREES.some((tree) => underRoot(text, tree));
}

export function isTmpPath(text: string): boolean {
  return underRoot(text, TMP_TREE);
}

/** One POSIX env key and the Windows keys that must be set beside it. */
const ENV_TWINS: readonly { readonly key: string; readonly twins: readonly string[]; readonly case: OsNeutralCase }[] = [
  { key: "HOME", twins: ["USERPROFILE"], case: "home-without-userprofile" },
  { key: "TMPDIR", twins: ["TEMP", "TMP"], case: "tmpdir-without-temp" },
];

/** Each POSIX key in `keys` whose Windows twins are not all present, with the case it reports. */
export function missingEnvTwins(keys: ReadonlySet<string>): readonly { readonly key: string; readonly case: OsNeutralCase }[] {
  return ENV_TWINS.filter((row) => keys.has(row.key) && !row.twins.every((twin) => keys.has(twin))).map((row) => ({ key: row.key, case: row.case }));
}

/** The property name of an object-literal member: an identifier, a string key or a const-named computed key. */
export function objectMemberName(member: Node): string | undefined {
  if (MorphNode.isShorthandPropertyAssignment(member)) {
    return member.getName();
  }
  if (!MorphNode.isPropertyAssignment(member)) {
    return;
  }
  const name = member.getNameNode();
  if (MorphNode.isComputedPropertyName(name)) {
    return readStringConstant(name.getExpression());
  }
  return MorphNode.isStringLiteral(name) ? name.getLiteralValue() : name.getText();
}

/** The key of a `[key, value]` pair element, the shape `Object.fromEntries` takes. */
export function pairKey(element: Node): string | undefined {
  const pair = unwrapExpression(element);
  if (!MorphNode.isArrayLiteralExpression(pair) || pair.getElements().length !== 2) {
    return;
  }
  const [key] = pair.getElements();
  return key === undefined ? undefined : readStringConstant(key);
}

const NEWLINE = "\n";

export function isNewlineSeparator(node: Node): boolean {
  return readStringConstant(node) === NEWLINE;
}

/** The literal text of a string, a template without substitutions, or a template's head. */
export function literalText(node: Node): string | undefined {
  if (MorphNode.isStringLiteral(node) || MorphNode.isNoSubstitutionTemplateLiteral(node)) {
    return node.getLiteralText();
  }
  return node.isKind(SyntaxKind.TemplateHead) ? node.getLiteralText() : undefined;
}
