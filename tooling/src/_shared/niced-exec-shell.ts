// The pure win32-shell decision and quoting `niced-exec.ts` uses, split out so a unit test can import them
// without also running that file's top-level launcher (it spawns on import).

/** win32 ONLY: a `.cmd`/`.bat` npm-bin shim is a batch script the OS cannot `CreateProcess` directly —
 *  Windows itself routes it through `cmd.exe` even with `shell: false`, so the shell has to be asked for
 *  explicitly there. A real `.exe` (or a bare unresolved name that isn't a shim) needs no shell, and a
 *  POSIX shell would reopen the unescaped-argv injection door this launcher exists to avoid — so this is
 *  `false` on every other platform and for every other win32 `cmd`. */
export function needsWindowsShell(cmd: string, platform: NodeJS.Platform): boolean {
  return platform === "win32" && /\.(?:cmd|bat)$/iu.test(cmd);
}

/** Quote one argv element for `cmd.exe` — the CreateProcessW/CommandLineToArgvW backslash-before-quote
 *  rule, then a caret-escape pass over cmd.exe's OWN metacharacters (mirrors the algorithm `cross-spawn`
 *  ships, https://qntm.org/cmd): without the second pass, an operator argument such as `-g "a|b" & del`
 *  reaches cmd.exe's PARSER before the target program ever sees it, and `|`/`&`/`<`/`>` there open a
 *  second command — the exact vulnerability class `shell: true` on Windows is known for. */
export function quoteWindowsShellArg(arg: string): string {
  if (arg === "") {
    return '""';
  }
  if (!/[\s"^&|<>%!()]/u.test(arg)) {
    return arg;
  }
  let escaped = arg.replace(/(\\*)"/gu, '$1$1\\"');
  escaped = escaped.replace(/(\\+)$/u, "$1$1");
  escaped = `"${escaped}"`;
  return escaped.replace(/([()%!^"<>&|])/gu, "^$1");
}
