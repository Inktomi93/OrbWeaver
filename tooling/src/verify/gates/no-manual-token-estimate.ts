// `@orb/kit/tokens` is the ONE token estimator. A hand-rolled `text.length / 4` undercounts CJK/emoji ~4x
// and silently overflows token budgets, and the `.length / CHARS_PER_TOKEN` const is the same estimate with
// the magic number moved.
//
// TWO IDENTITIES the legacy gate asserted by spelling and this one resolves:
//   · `.length` — the legacy check was `left.getName() === "length"`, so `config.length / 4` on any object
//     with a `length` field was a token estimate. The subject is the AMBIENT `length` of a string or array,
//     which is what makes `x.length / 4` a character-count heuristic at all.
//   · the DIVISOR — the legacy check read `symbol.getDeclarations()[0]` and required a literal initializer,
//     so an aliased or re-exported constant escaped. `readStaticNumber` resolves the authored value through
//     const chains, imports, wrappers and unary signs, and REFUSES a mutable or computed one.
//
// The name fence on the const arm is LAW, not spelling laziness: `items.length / PAGE_SIZE` where PAGE_SIZE
// is 4 is not a token estimate, and only the divisor's NAME distinguishes a chars-per-token ratio from a
// page size. It stays, with its own mustPass row.
//
// THE ESTIMATOR'S OWN HOME is excluded structurally by the symbol it EXPORTS, never by a file-path pin
// (path-keyed gates die on rename): any file exporting `estimateTokens` is the home, and inside it the
// division IS the algorithm.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyOriginRefusal } from "../lib/origin-verdict.ts";
import { readStaticNumber } from "../lib/reference-fact.ts";
import { declaredByPackage, resolveTypeMemberOrigin } from "../lib/type-member-origin.ts";

const LENGTH = "length";
const ESTIMATOR = "estimateTokens";
const LITERAL_DIVISOR = 4;
const CHARS_PER_TOKEN_MIN = 3;
const CHARS_PER_TOKEN_MAX = 5;
const CHARS_PER_TOKEN_NAME = /CHAR|TOKEN/iu;
/** TypeScript's own `node_modules` directory: `String#length` / `Array#length` are declared in its bundled
 *  `lib.*.d.ts`, and that is the whole identity claim behind "this is a character count". */
const AMBIENT_HOME = "typescript";

const MESSAGE =
  "hand-rolled `.length / 4` token estimate — @orb/kit/tokens is the ONE estimator: import { estimateTokens } and call estimateTokens(text). A flat length/N undercounts CJK/emoji ~4x and silently overflows token budgets. This also catches the `.length / CHARS_PER_TOKEN` const dodge. See packages/kit/src/tokens/index.ts.";
const UNREADABLE =
  "this division reads a `.length` whose identity the checker cannot resolve, so whether it is a character count divided by a chars-per-token ratio CANNOT be established. Reported rather than passed: the spelling alone is not the identity.";

/** The estimator's one home, derived from what the file EXPORTS. `getExportSymbols` sees `export function`,
 *  `export const`, `export { estimateTokens }` and a re-export alike — the legacy two-lookup version saw
 *  only the first two. */
function exportsEstimator(sourceFile: SourceFile): boolean {
  return sourceFile.getExportSymbols().some((symbol) => symbol.getName() === ESTIMATOR);
}

type LengthVerdict = "ambient" | "other" | "unreadable";

/** Is the left operand the AMBIENT `.length` of a string or array? */
function lengthVerdict(left: MorphNode): LengthVerdict {
  const origin = resolveTypeMemberOrigin(left);
  if (origin.kind === "unresolved") {
    return classifyOriginRefusal(origin.reason, left);
  }
  return declaredByPackage(origin.value.declarations, AMBIENT_HOME) ? "ambient" : "other";
}

/** Is the divisor the banned ratio? A bare authored `4`, or a NAMED constant in the chars-per-token range
 *  whose name reads like a char/token ratio. A divisor whose value cannot be read at all is not the dodge —
 *  the `.length` arm already carries the fail-closed half, and a computed divisor is not a flat heuristic. */
function isBannedDivisor(right: MorphNode): boolean {
  const value = readStaticNumber(right);
  if (value.kind === "unresolved") {
    return false;
  }
  const named = Node.isIdentifier(right) || Node.isPropertyAccessExpression(right) || Node.isElementAccessExpression(right);
  if (!named) {
    return value.value === LITERAL_DIVISOR;
  }
  return CHARS_PER_TOKEN_NAME.test(right.getText()) && value.value >= CHARS_PER_TOKEN_MIN && value.value <= CHARS_PER_TOKEN_MAX;
}

export const gate = defineGate({
  id: "no-manual-token-estimate",
  family: "no-manual-token-estimate",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@client", "@ui", "@server", "@kit"], notNamed: ["*.test.ts", "*.test.tsx"] },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: 'import { estimateTokens } from "@orb/kit/tokens" and use it',
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.BinaryExpression],
        visit: (node, sourceFile): void => {
          if (!Node.isBinaryExpression(node) || node.getOperatorToken().getKind() !== SyntaxKind.SlashToken) {
            return;
          }
          const left = node.getLeft();
          const leafName = Node.isPropertyAccessExpression(left) ? left.getName() : undefined;
          if (leafName !== LENGTH || !isBannedDivisor(node.getRight())) {
            return;
          }
          // The estimator's own home is where this division IS the algorithm.
          if (exportsEstimator(sourceFile)) {
            return;
          }
          const verdict = lengthVerdict(left);
          if (verdict === "other") {
            return;
          }
          ctx.report.node(node, { ...(verdict === "unreadable" ? { message: UNREADABLE } : {}) });
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: { "packages/server/src/domain/x/verb.ts": "export const g = (text: string): number => text.length / 4;\n" },
      expect: { count: 1 },
      why: "the founding shape — a flat `.length / 4` character heuristic standing in for the one estimator",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/foo/bar.ts": "const CHARS_PER_TOKEN = 4;\nexport const g = (text: string): number => text.length / CHARS_PER_TOKEN;\n",
      },
      expect: { count: 1 },
      why: "the CONST DODGE — the same estimate with the magic number moved into a char/token-named constant",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/foo/ratio.ts": "export const CHARS_PER_TOKEN = 4;\n",
        "packages/kit/src/foo/bar.ts":
          'import { CHARS_PER_TOKEN } from "./ratio.ts";\nexport const g = (text: string): number => text.length / CHARS_PER_TOKEN;\n',
      },
      expect: { count: 1 },
      why: "AN IMPORTED RATIO: the legacy reader took `symbol.getDeclarations()[0]` and required a numeric-literal initializer on THAT declaration, so moving the constant one module away was a silent escape. The shared static-number reader follows the import",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/foo/bar.ts":
          "const BASE = 4;\nconst CHARS_PER_TOKEN = BASE;\nexport const g = (text: string): number => text.length / CHARS_PER_TOKEN;\n",
      },
      expect: { count: 1 },
      why: "A CONST CHAIN is the same ratio one hop quieter — the shared reader has no hop cap, the legacy first-declaration lookup had one hop",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/x/verb.ts": "export const g = (parts: readonly string[]): number => parts.length / 4;\n" },
      expect: { count: 1 },
      why: "an ARRAY length is the same ambient character/element count heuristic — the identity is the ambient `length`, not the string type",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/verb.ts":
          'import { estimateTokens } from "@orb/kit/tokens";\nexport const g = (text: string): number => estimateTokens(text);\n',
      },
      why: "the official estimator this policy exists to drive traffic to",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/embed.ts":
          "const APPROX_CHARS_PER_TOKEN = 4;\nexport const chars = (maxTokens: number): number => maxTokens * APPROX_CHARS_PER_TOKEN;\n",
      },
      why: "multiplication (tokens to chars budget) is the INVERSE and legal — the operator fence, kept as a written baseline",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/tokens/index.ts":
          "const CHARS_PER_TOKEN = 4;\nexport function estimateTokens(text: string): number {\n  return text.length / CHARS_PER_TOKEN;\n}\n",
      },
      why: "THE ESTIMATOR HOME — a `/ CHARS_PER_TOKEN` division here IS the algorithm, and the home is identified by the symbol the file exports rather than by its path",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/tokens/impl.ts": "export function estimateTokens(text: string): number {\n  return text.length / 4;\n}\n",
        "packages/kit/src/tokens/index.ts": 'export { estimateTokens } from "./impl.ts";\n',
      },
      why: "the estimator home reached through a RE-EXPORT is still the home — `getExportSymbols` sees the forwarded symbol, where the legacy `getFunction`/`getVariableDeclaration` pair saw neither",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/foo/paginate.ts": "const PAGE_SIZE = 4;\nexport const pages = (items: readonly unknown[]): number => items.length / PAGE_SIZE;\n",
      },
      why: "a non-char/token-named divisor is not a token estimate — the NAME fence is the only thing separating a page size from a chars-per-token ratio, so it is law and not laziness",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/verb.ts": "interface Buffer { length: number }\nexport const g = (buf: Buffer): number => buf.length / 4;\n",
      },
      why: "SAME NAME, NOT A CHARACTER COUNT: a `length` field declared by a project interface is not the ambient string/array length, so dividing it by 4 is not a token estimate. The legacy name-only check RED this",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/foo/bar.ts":
          "declare function ratio(): number;\nconst CHARS_PER_TOKEN = ratio();\nexport const g = (text: string): number => text.length / CHARS_PER_TOKEN;\n",
      },
      why: "A COMPUTED divisor is not a flat heuristic at all — the shared reader refuses to read it, and a value that changes at runtime is outside the ban this policy states",
    },
  ],
});
