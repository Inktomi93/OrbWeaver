// The ambient `process` declaration every process-reading policy resolves its global-branch identity against
// (`tooling-argv-front-door`'s argv readers, `sole-env-reader`'s env readers).
//
// WHY THIS FILE EXISTS (#2030, design §4.8b). `@types/node` is what declares `process` on the real tree; the
// proof workspace has no node_modules, so without this plant a bare `process.argv` / `process.env` is an
// UNDECLARED identifier, which the shared global resolver refuses
// (`lib/reference-fact-global.ts#isAmbientGlobalDeclaration` trusts only `node_modules/typescript/lib/lib.*`
// and `node_modules/@types/` declaration files) and the policies report fail-closed as UNREADABLE — a row
// that would pass for the wrong reason, with the same finding count and the same message as the precise
// branch. Planting is the fix: widening the trust rule to make a fixture resolve would weaken a real identity
// fence for test convenience. NOTE the asymmetry that makes this Node-specific: the proof workspace DOES load
// TypeScript's own lib files, which ARE a trusted home, so `window` / `localStorage` / `Math` / `Intl` /
// `matchMedia` fixtures reach the precise branch unaided. Only NODE globals need a plant.
//
// THE SHAPE IS THE PACKAGE'S, NOT A CONVENIENT ONE (#2037). `@types/node@26.1.1` declares the global inside a
// `declare module` body via a `global` augmentation, and never as a bare script-global:
// `@types/node/process.d.ts:1` `declare module "node:process" {`, `:139` `global {`, `:140`
// `var process: NodeJS.Process;`, `:2212` `export = process;`, `:2214` `declare module "process" {`. That
// distinction is load-bearing here, because `isAmbientGlobalDeclaration` has TWO acceptance branches — a
// script-global declaration file, and a `global` augmentation — and a plant that resolves through the
// script-global branch proves nothing about the branch the live tree actually takes. The subject below is
// therefore the augmentation, which also serves the `node:process` / `process` MODULE doors from one plant.
//
// The LOOKALIKES are deliberately script-global: they mimic no shipped package, their whole job is to differ
// from the subject in the resolved NAME, and keeping them on the other acceptance branch means both branches
// of `isAmbientGlobalDeclaration` are exercised by this corpus rather than one.
export const NODE_TYPES_HOME = "node_modules/@types/node/index.d.ts";
/** A SECOND trusted ambient global carrying an `env` bag under a different NAME — the same-shape/different-name
 *  twin that pins a policy's `globalName` comparison on the env door. */
export const NODE_LOOKALIKE_HOME = "node_modules/@types/node-lookalike/index.d.ts";
export const ARGV_LOOKALIKE_HOME = "node_modules/@types/argv-lookalike/index.d.ts";

const PROCESS_SURFACE = [
  'declare module "node:process" {',
  "  global {",
  "    var process: NodeJS.Process;",
  "    namespace NodeJS {",
  "      interface ProcessEnv {",
  "        [key: string]: string | undefined;",
  "      }",
  "      interface Process {",
  "        env: ProcessEnv;",
  "        argv: string[];",
  "        pid: number;",
  "        hrtime: { (time?: [number, number]): [number, number]; bigint(): bigint };",
  "      }",
  "    }",
  "  }",
  "  export = process;",
  "}",
  'declare module "process" {',
  '  import process = require("node:process");',
  "  export = process;",
  "}",
  "",
].join("\n");

const ENV_LOOKALIKE_SURFACE = ["declare var procezz: {", "  env: { [key: string]: string | undefined };", "  argv: string[];", "};", ""].join("\n");

/** `@types/node`'s ambient `process` global, planted with the package's own structure: a `global`
 *  augmentation inside the `node:process` module declaration, which also serves the module doors. */
export function nodeTypesProof(): Readonly<Record<string, string>> {
  return { [NODE_TYPES_HOME]: PROCESS_SURFACE };
}

/** A DIFFERENT trusted ambient global with the same `env` shape under a different name. */
export function nodeLookalikeProof(): Readonly<Record<string, string>> {
  return { [NODE_LOOKALIKE_HOME]: ENV_LOOKALIKE_SURFACE };
}

/** A DIFFERENT trusted global carrying an `argv` member. Nothing but the resolved global NAME separates
 *  `lookalike.argv` from `process.argv` — that pair is the whole identity claim, and it is the only fixture
 *  that reaches the global-branch name comparison with a different answer (a member no trusted global
 *  declares is refused as unreadable before the comparison, so `console.argv` cannot play this part). */
export function argvLookalikeProof(): Readonly<Record<string, string>> {
  return { [ARGV_LOOKALIKE_HOME]: "declare var lookalike: { readonly argv: readonly string[] };\n" };
}
