// The ambient `process` declaration the `tooling-argv-front-door` family resolves the global-branch identity
// against. `@types/node` is what declares `process` on the real tree; the proof workspace has no
// node_modules, so without this plant a bare `process.argv` is an UNDECLARED identifier, which the shared
// global resolver refuses (`lib/reference-fact-global.ts#isAmbientGlobalDeclaration` trusts only
// `node_modules/typescript/lib/lib.*` and `node_modules/@types/` declaration files) and the policies report
// fail-closed as UNREADABLE — a row that would pass for the wrong reason (guide §4.8b).
//
// A REAL trusted door in the proof workspace, resolved by the same rule the live tree uses, so a proof
// exercises the ambient-global branch rather than the refusal. The shape matches what `@types/node` ships
// for the members these policies read: a script-global `declare var process` in a declaration file.
export const NODE_TYPES_HOME = "node_modules/@types/node/index.d.ts";

const PROCESS_GLOBAL = [
  "declare var process: {",
  "  readonly argv: readonly string[];",
  "  readonly env: Readonly<Record<string, string | undefined>>;",
  "  readonly pid: number;",
  "};",
  "",
].join("\n");

/** `@types/node`'s ambient `process` global, planted as the trusted declaration file it is on the live tree. */
export function nodeTypesProof(): Readonly<Record<string, string>> {
  return { [NODE_TYPES_HOME]: PROCESS_GLOBAL };
}

export const ARGV_LOOKALIKE_HOME = "node_modules/@types/argv-lookalike/index.d.ts";

/** A DIFFERENT trusted global carrying an `argv` member. Nothing but the resolved global NAME separates
 *  `lookalike.argv` from `process.argv` — that pair is the whole identity claim, and it is the only fixture
 *  that reaches the global-branch name comparison with a different answer (a member no trusted global
 *  declares is refused as unreadable before the comparison, so `console.argv` cannot play this part). */
export function argvLookalikeProof(): Readonly<Record<string, string>> {
  return { [ARGV_LOOKALIKE_HOME]: "declare var lookalike: { readonly argv: readonly string[] };\n" };
}
