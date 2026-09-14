// The TRUSTED AMBIENT DECLARATIONS the server-plane policies resolve their global-branch identity against:
// node's own `process` (`tooling-argv-front-door`'s argv readers, `sole-env-reader`'s env readers), plus the
// different-name and different-ORIGIN-KIND lookalikes that pin each policy's global-branch comparison.
//
// WHY THIS FILE EXISTS (#2030, design §4.8b). `@types/node` is what declares `process` on the real tree; the
// proof workspace has no node_modules, so without this plant a bare `process.argv` / `process.env` is an
// UNDECLARED identifier, which the shared global resolver refuses
// (`_shared/reference-fact-global.ts#isAmbientGlobalDeclaration` trusts only `node_modules/typescript/lib/lib.*`
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
// The LOOKALIKES are deliberately script-global: they mimic no shipped package, and their whole job is to
// differ from the subject in the resolved NAME.
//
// WHAT THIS PLANT DOES **NOT** PROVE, corrected 2026-09-12 (#2037, cb-v-instruments). An earlier version of
// this header claimed the lookalikes kept "both branches of `isAmbientGlobalDeclaration` exercised". THAT IS
// FALSE. The predicate is `trusted && isDeclFile && (scriptGlobal || isGlobalAugmentation)` and `||`
// SHORT-CIRCUITS — and the subject above, both lookalikes AND the installed `@types/node/process.d.ts` all
// have ZERO TOP-LEVEL import/export declarations (the package's imports sit inside `declare module`), so
// `scriptGlobal` is true for every one of them and the augmentation branch is never evaluated here. The plant
// still matches the package byte-for-byte, which is what §4.8b actually requires; the branch claim was the
// error. A declaration file can only reach the augmentation branch when a TOP-LEVEL import makes it a module,
// and that fixture is pinned where the claim belongs — on the READER, at
// `tests/tooling/_shared/reference-fact-origin.suite.test.ts`. Reach for the top-level-import form if you
// ever need that branch from a proof row; the simpler script-global spelling takes the branch the live tree
// never uses, which is #2037 repeating.
export const NODE_TYPES_HOME = "node_modules/@types/node/index.d.ts";
/** A SECOND trusted ambient global carrying an `env` bag under a different NAME — the same-shape/different-name
 *  twin that pins a policy's `globalName` comparison on the env door. */
export const NODE_LOOKALIKE_HOME = "node_modules/@types/node-lookalike/index.d.ts";
const ARGV_LOOKALIKE_HOME = "node_modules/@types/argv-lookalike/index.d.ts";
/** A trusted ambient global named exactly like a MODULE export a policy seals — the twin that differs in the
 *  resolved origin's KIND rather than in its name, so a policy whose arm keys on `target.kind === "module"`
 *  has a fixture that actually reaches that comparison. */
export const EMITTER_GLOBAL_HOME = "node_modules/@types/emitter-global-lookalike/index.d.ts";

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

/** A trusted AMBIENT GLOBAL constructor spelled `EventEmitter`. Nothing but the resolved origin's KIND
 *  separates it from `node:events`' module export: the candidate name prefilter admits it, the origin
 *  resolves cleanly, and only a `target.kind === "module"` comparison rejects it. It is deliberately
 *  script-global (the other acceptance branch of `isAmbientGlobalDeclaration`) and deliberately NOT node's
 *  real shape — node ships `EventEmitter` as a module export and declares no such global, which is exactly
 *  why it is filed here as a LOOKALIKE rather than as a subject plant. */
export function emitterGlobalLookalikeProof(): Readonly<Record<string, string>> {
  return { [EMITTER_GLOBAL_HOME]: "declare var EventEmitter: { new (): { on(): void } };\n" };
}
