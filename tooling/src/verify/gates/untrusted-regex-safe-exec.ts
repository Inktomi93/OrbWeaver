// Policy: untrusted-regex-safe-exec (D53; the world-info regex-key watchdog)
// — the chat composition seam's `testRegexKey` must be the
// `createRegexTest()` watchdog. A world-info KEY is user-authored, so a hand-rolled native `.test` at this
// boundary lets a catastrophic pattern run on the server event loop with no deadline.
//
// AUTHORITY IS hard and the module is NOT split, a deliberate deviation from the census row ("split
// unsafe-regex policy and subject-health"). Both arms are `hard`/`error`; what forced the split under the
// legacy runtime was the EXECUTION axis, and the health arm is no longer a finding at all: zero measured
// composition seams is a POPULATION RECEIPT of zero, which the runtime refuses as a tool error. A gate that
// has lost its subject now fails the run rather than emitting a finding someone can shrug at.
//
// IDENTITY, NOT SPELLING: the watchdog factory is the EXPORTED DECLARATION in `server/src/kit/regex`,
// resolved through the shared sealed-origin reader, so an alias, a namespace member or a re-export all
// prove the same composition while a same-named local helper does not. Legacy asked two text questions —
// is the initializer's callee text `createRegexTest`, and does this file carry an import declaration whose
// specifier is literally `#kit/regex` with that named import — either of which a rename or a barrel hop
// would have answered wrongly in both directions.
//
// DELIBERATELY NARROW (its own mustPass row): dynamic `RegExp` construction elsewhere is not evidence that
// user-authored input runs without a deadline, and it is not this policy's subject.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `untrusted-regex-safe-exec` descriptor at 5dd83aaa42c85c361d321fe56bf13063c93edf17, the parent of the conversion
// `4885cde80` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,263 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 34 and final `population` admits 34. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/server/src/entry/compose/__cbbhr_in_admin.ts` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
//
// FAMILY: a declared SINGLETON under its own id. `lib/sealed-origin.ts#readSealedOrigin` is a shared primitive five
// seals use; no sibling judges the world-info regex watchdog.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readSealedOrigin } from "../lib/sealed-origin.ts";

const COMPOSE_DIR = "packages/server/src/entry/compose/";
const COMPOSE_ANCHOR = `${COMPOSE_DIR}chat.ts`;
const PROPERTY = "testRegexKey";
const FACTORY = "createRegexTest";
const SEAM_POPULATION = "world-info regex-key composition seam";
/** The watchdog's implementation home — an absolute-path infix, because the declaration lives OUTSIDE this
 *  policy's population (`entry/compose/**`), where `ctx.relativePath` refuses by contract. */
const REGEX_KIT_HOME = { pathInfix: "/packages/server/src/kit/regex/", exportedNames: new Set([FACTORY]) };

const MESSAGE =
  "the canonical world-info regex-key execution seam is not composed with `createRegexTest()` from the " +
  "server regex kit — a user-authored key can then execute on the server event loop with no node:vm " +
  "deadline. See D53 and packages/server/src/kit/regex/index.ts";
const FIX = `compose \`${PROPERTY}: ${FACTORY}()\` from the server regex kit; never hand-roll a native \`.test\` at this boundary.`;

export const gate = defineGate({
  id: "untrusted-regex-safe-exec",
  family: "untrusted-regex-safe-exec",
  authority: "hard",
  severity: "error",
  population: { in: ["@server"], under: [`${COMPOSE_DIR}**`] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    let seams = 0;
    return {
      visitors: [
        {
          kinds: [SyntaxKind.PropertyAssignment],
          visit: (node, sourceFile): void => {
            if (!Node.isPropertyAssignment(node) || node.getName() !== PROPERTY || ctx.relativePath(sourceFile) !== COMPOSE_ANCHOR) {
              return;
            }
            seams += 1;
            const initializer = node.getInitializer();
            const callee = initializer !== undefined && Node.isCallExpression(initializer) ? initializer.getExpression() : undefined;
            const safe = callee !== undefined && readSealedOrigin(callee, REGEX_KIT_HOME).kind === "sealed";
            if (!safe) {
              ctx.report.node(node, { token: PROPERTY, offset: 0, message: MESSAGE, fix: FIX });
            }
          },
        },
      ],
      evaluate: (): void => {
        // THE BLINDNESS ARM, as a receipt rather than a finding: the canonical property disappearing means
        // this policy has no execution boundary left to judge, and a zero-member receipt REFUSES the run.
        ctx.receipt({ kind: "population", source: SEAM_POPULATION, members: seams, unresolved: 0 });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        [COMPOSE_ANCHOR]: "export const chat = { testRegexKey: (regex: RegExp, haystack: string): boolean => regex.test(haystack) };\n",
      },
      expect: { count: 1, token: PROPERTY },
      why: "the founding regression: the live composition seam falls back to a native `.test` with no deadline",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/kit/regex/index.ts":
          "export declare function createRegexTest(timeoutMs?: number): (regex: RegExp, haystack: string) => boolean;\n",
        "packages/server/src/entry/compose/local-regex.ts":
          "export function createRegexTest(): (regex: RegExp, haystack: string) => boolean {\n  return (regex, haystack) => regex.test(haystack);\n}\n",
        [COMPOSE_ANCHOR]: 'import { createRegexTest } from "./local-regex.ts";\nexport const chat = { testRegexKey: createRegexTest() };\n',
      },
      expect: { count: 1, token: PROPERTY },
      why: "THE COUNTERFACTUAL: a LOCAL function with the watchdog's name, composed at the canonical property. The text is identical to the safe shape — the legacy check compared exactly that text plus an import-specifier string — and it runs with no deadline at all",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/server/src/kit/regex/index.ts":
          "export declare function createRegexTest(timeoutMs?: number): (regex: RegExp, haystack: string) => boolean;\n",
        [COMPOSE_ANCHOR]: 'import { createRegexTest } from "../../kit/regex/index.ts";\nexport const chat = { testRegexKey: createRegexTest() };\n',
      },
      why: "the live shape: the canonical watchdog factory at the canonical property is the safe execution boundary",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/kit/regex/index.ts":
          "export declare function createRegexTest(timeoutMs?: number): (regex: RegExp, haystack: string) => boolean;\n",
        [COMPOSE_ANCHOR]:
          'import { createRegexTest } from "../../kit/regex/index.ts";\nexport const chat = {\n  testRegexKey: createRegexTest(),\n  matchLabel: (regex: RegExp, haystack: string): boolean => regex.test(haystack),\n};\n',
      },
      why: "THE CANONICAL-PROPERTY FENCE (`node.getName() !== PROPERTY`), which nothing exercised: a SECOND property on the same composed object, at the same anchor file, whose initializer is a bare native `.test` with no deadline — the exact shape `mustFlag[0]` reports when it sits at `testRegexKey`. Only the property NAME separates them, and this law's subject is the ONE named execution boundary, not every predicate composed beside it. Cut the name test and this row flags. NOTE what is NOT under test here: the `safe` verdict's ACQUITTING polarity (`readSealedOrigin(callee, REGEX_KIT_HOME).kind === \"sealed\"`) is deliberate on a hard security-adjacent policy — only a PROVEN sealed origin acquits, and an unreadable callee REPORTS, which `mustFlag[1]` pins. Scoping that refusal would weaken the policy, so it stays exactly as written",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/kit/regex/index.ts":
          "export declare function createRegexTest(timeoutMs?: number): (regex: RegExp, haystack: string) => boolean;\n",
        [COMPOSE_ANCHOR]: 'import { createRegexTest as guarded } from "../../kit/regex/index.ts";\nexport const chat = { testRegexKey: guarded() };\n',
      },
      why: "THE ALIAS: the same declaration under another local name is the same watchdog. The legacy reader required the callee text AND an import declaration naming `#kit/regex` with that exact named import, so this safe composition would have RED",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/kit/regex/index.ts":
          "export declare function createRegexTest(timeoutMs?: number): (regex: RegExp, haystack: string) => boolean;\n",
        "packages/server/src/kit/regex/barrel.ts": 'export { createRegexTest } from "./index.ts";\n',
        [COMPOSE_ANCHOR]: 'import { createRegexTest } from "../../kit/regex/barrel.ts";\nexport const chat = { testRegexKey: createRegexTest() };\n',
      },
      why: "a name-preserving RE-EXPORT resolves to the same canonical declaration — a barrel hop is not a different watchdog",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/kit/regex/index.ts":
          "export declare function createRegexTest(timeoutMs?: number): (regex: RegExp, haystack: string) => boolean;\n",
        [COMPOSE_ANCHOR]: 'import { createRegexTest } from "../../kit/regex/index.ts";\nexport const chat = { testRegexKey: createRegexTest() };\n',
        [`${COMPOSE_DIR}other.ts`]: 'export const matcher = (pattern: string): RegExp => new RegExp(pattern, "u");\n',
      },
      why: "DELIBERATELY NARROW: dynamic RegExp construction outside the canonical seam is not evidence that user-authored input runs without a deadline",
    },
  ],
});
