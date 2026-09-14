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
// THE ESTIMATOR'S OWN HOME is excluded by the SYMBOL, never by a file-path pin (path-keyed gates die on
// rename) — but the symbol must be the CANONICAL one, not merely a name. A file whose exported
// `estimateTokens` resolves to the declaration in `packages/kit/src/tokens/index.ts` is the home (a
// re-export of the real estimator still is); a file that exports its OWN function of that name is not, and
// the first cut of this policy let exactly that silence every division in a feature file (reviewed
// 2026-09-06). The canonical home is located in the effective population and receipted, so its rename
// REFUSES the run — which is why `execution` is entire-population.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-manual-token-estimate` descriptor at a4ec5c1b6525da029b9d35bda2c3c4b7720e5c0a, the parent of the conversion
// `7ed48eca8` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,196 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 3,220 and final `population` admits 3,220. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `packages/contracts/src/assets/__cbbhr_out_index.ts` (virtual) rejected by both.
//
// FAMILY: a declared SINGLETON under its own id. `_shared/reference-fact.ts` (`readStaticNumber`,
// `resolveExportedDeclarations`), `lib/type-member-origin.ts` and `lib/origin-verdict.ts` are corpus-wide primitives;
// no sibling judges a hand-rolled token estimate.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readMemberReference, readStaticNumber, resolveExportedDeclarations } from "../../_shared/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { classifyOriginRefusal } from "../lib/origin-verdict.ts";
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
/** The estimator's ONE home — the file this policy's own message points every author at. */
const ESTIMATOR_HOME = "packages/kit/src/tokens/index.ts";
/** Every fixture map carries the canonical home: without it the receipt resolves zero members and the whole
 *  policy REFUSES, which is the behaviour the rename tripwire exists for and would make each row vacuous. */
const ESTIMATOR_PROOF = { [ESTIMATOR_HOME]: "export function estimateTokens(text: string): number {\n  return text.length / 4;\n}\n" };

const MESSAGE =
  "hand-rolled `.length / 4` token estimate — @orb/kit/tokens is the ONE estimator: import { estimateTokens } and call estimateTokens(text). A flat length/N undercounts CJK/emoji ~4x and silently overflows token budgets. This also catches the `.length / CHARS_PER_TOKEN` const dodge. See packages/kit/src/tokens/index.ts.";
const UNREADABLE =
  "this division reads a `.length` whose identity the checker cannot resolve, so whether it is a character count divided by a chars-per-token ratio CANNOT be established. Reported rather than passed: the spelling alone is not the identity.";

/** Every declaration this file's exported `estimateTokens` ultimately names, seen THROUGH a re-export
 *  (`export { estimateTokens } from "./impl.ts"` yields the implementation's declaration, not the specifier). */
function estimatorDeclarations(sourceFile: SourceFile): readonly MorphNode[] {
  const exports = resolveExportedDeclarations(sourceFile, ESTIMATOR);
  return exports.kind === "resolved" ? exports.value : [];
}

/** Is this file the estimator's own home — the one place the division IS the algorithm?
 *
 *  IDENTITY, NOT SPELLING. The first cut of this policy asked only "does the file export something NAMED
 *  estimateTokens", which is a self-exemption door with file scope: a feature file that exports its own
 *  `estimateTokens` silenced every division in it (reviewed 2026-09-06, reproduced at 0 findings vs 2 with
 *  the export renamed). The condition is now that the exported symbol RESOLVES to the canonical estimator
 *  declared in `packages/kit/src/tokens/index.ts` — which keeps the original rename-proof intent (the home
 *  is still a SYMBOL, not a path pin, and a re-export of the real one is still the home) while removing the
 *  door. The canonical file itself is located in the effective population and receipted, so a rename of the
 *  estimator's home REFUSES the run instead of silently exempting nobody. */
function isEstimatorHome(sourceFile: SourceFile, canonical: ReadonlySet<object>): boolean {
  const declarations = estimatorDeclarations(sourceFile);
  return declarations.length > 0 && declarations.every((declaration) => canonical.has(declaration.compilerNode));
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

/** The divided expression, unwrapped. */
function leftOperand(node: MorphNode): MorphNode {
  return Node.isBinaryExpression(node) ? node.getLeft() : node;
}

/** Is this `<something>.length / <banned ratio>` at all? The member name is read through the shared member
 *  reader rather than a `isPropertyAccessExpression` guard, so `text["length"] / 4` is the SAME candidate as
 *  the dotted form — a bracket spelling was a whole-expression escape while the dotted twin was a mustFlag. */
function isBannedRatio(node: MorphNode): boolean {
  if (!Node.isBinaryExpression(node) || node.getOperatorToken().getKind() !== SyntaxKind.SlashToken) {
    return false;
  }
  const read = readMemberReference(node.getLeft());
  return read.kind === "resolved" && read.value.name === LENGTH && isBannedDivisor(node.getRight());
}

export const gate = defineGate({
  id: "no-manual-token-estimate",
  family: "no-manual-token-estimate",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@client", "@ui", "@server", "@kit"], notNamed: ["*.test.ts", "*.test.tsx"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix:
    'import { estimateTokens } from "@orb/kit/tokens" and use it. A deliberate site is waived with ' +
    "`@orb-waive no-manual-token-estimate(<position>): <reason>` on the line above, where <position> is the " +
    "literal `length`.",
  create: (ctx) => {
    const candidates: MorphNode[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.BinaryExpression],
          visit: (node): void => {
            if (isBannedRatio(node)) {
              candidates.push(node);
            }
          },
        },
      ],
      evaluate: (): void => {
        const home = ctx.files.find((file) => ctx.relativePath(file) === ESTIMATOR_HOME);
        const canonical = new Set<object>((home === undefined ? [] : estimatorDeclarations(home)).map((declaration) => declaration.compilerNode));
        // ZERO members is a REFUSAL: the ONE estimator this policy points every author at was renamed or
        // moved, so the law's own destination no longer exists and no verdict here can be honest.
        ctx.receipt({ kind: "population", source: ESTIMATOR, members: canonical.size, unresolved: 0 });
        if (canonical.size === 0) {
          return;
        }
        for (const node of candidates) {
          if (isEstimatorHome(node.getSourceFile(), canonical)) {
            continue;
          }
          const verdict = lengthVerdict(leftOperand(node));
          if (verdict === "other") {
            continue;
          }
          // Anchored on `.length`, not on the receiver's own name: a waiver position must name the thing
          // being judged, and `ctx.report.node` would otherwise derive the token from whatever identifier
          // the expression happens to open with (`text`, `parts`, `buf`).
          ctx.report.node(node, {
            ...(verdict === "unreadable" ? { message: UNREADABLE } : {}),
            token: LENGTH,
            offset: Math.max(node.getText().indexOf(LENGTH), 0),
          });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: { ...ESTIMATOR_PROOF, "packages/server/src/domain/x/verb.ts": "export const g = (text: string): number => text.length / 4;\n" },
      expect: { count: 1, token: "length" },
      why: "the founding shape — a flat `.length / 4` character heuristic standing in for the one estimator",
    },
    {
      mode: "types",
      files: {
        ...ESTIMATOR_PROOF,
        "packages/server/src/domain/x/verb.ts": "export const g = (text: string): number => text.length / 4;\n",
        "packages/server/src/domain/x/verb.test.ts": "export const h = (text: string): number => text.length / 4;\n",
      },
      expect: { count: 1, token: "length" },
      why: 'THE POPULATION FENCE (`notNamed: ["*.test.ts", "*.test.tsx"]`), which nothing exercised: the SAME banned ratio is written twice, once in a judged module and once in a `*.test.ts` beside it, and the count stays ONE. Cut the subtraction and it becomes two. The judged file is the ANCHOR the fence needs — a falsifier holding only the subtracted file admits zero paths and comes back a `[population]` TOOL ERROR rather than a finding, which would prove nothing about the fence',
    },
    {
      mode: "types",
      files: {
        ...ESTIMATOR_PROOF,
        "packages/kit/src/foo/bar.ts": "const CHARS_PER_TOKEN = 4;\nexport const g = (text: string): number => text.length / CHARS_PER_TOKEN;\n",
      },
      expect: { count: 1 },
      why: "the CONST DODGE — the same estimate with the magic number moved into a char/token-named constant",
    },
    {
      mode: "types",
      files: {
        ...ESTIMATOR_PROOF,
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
        ...ESTIMATOR_PROOF,
        "packages/kit/src/foo/bar.ts":
          "const BASE = 4;\nconst CHARS_PER_TOKEN = BASE;\nexport const g = (text: string): number => text.length / CHARS_PER_TOKEN;\n",
      },
      expect: { count: 1 },
      why: "A CONST CHAIN is the same ratio one hop quieter — the shared reader has no hop cap, the legacy first-declaration lookup had one hop",
    },
    {
      mode: "types",
      files: { ...ESTIMATOR_PROOF, "packages/server/src/domain/x/verb.ts": "export const g = (parts: readonly string[]): number => parts.length / 4;\n" },
      expect: { count: 1 },
      why: "an ARRAY length is the same ambient character/element count heuristic — the identity is the ambient `length`, not the string type",
    },
    {
      mode: "types",
      files: { ...ESTIMATOR_PROOF, "packages/server/src/domain/x/verb.ts": 'export const g = (text: string): number => text["length"] / 4;\n' },
      expect: { count: 1, token: "length" },
      why: "the COMPUTED-LITERAL spelling of `.length` is the same character count — a bare `isPropertyAccessExpression` guard passed it while the dotted twin above was a finding, so the member name is read through the shared reader (#1506)",
    },
    {
      mode: "types",
      files: {
        ...ESTIMATOR_PROOF,
        "packages/client/src/features/hack/self-exempt.ts":
          "export function estimateTokens(text: string): number {\n  return text.length / 4;\n}\nexport const other = (t: string): number => t.length / 4;\n",
      },
      expect: { count: 2 },
      why: "THE SELF-EXEMPTION DOOR THIS ROW CLOSES (reviewed 2026-09-06): a feature file exporting its OWN function named `estimateTokens` silenced every division in it while the condition was 'exports something with that name'. The home is the CANONICAL symbol, so both divisions here are findings",
    },
    {
      mode: "types",
      files: {
        ...ESTIMATOR_PROOF,
        "packages/server/src/domain/x/verb.ts": "declare function opaque(): any;\nexport const g = (): number => opaque().length / 4;\n",
      },
      expect: { count: 1, token: "length", messageIncludes: "CANNOT be established" },
      why: "#1990/D1 — THE UNREADABLE ARM, PROVEN: `.length` is read off an opaque `any`-typed receiver, so whether it is the ambient string/array length CANNOT be established. `lengthVerdict` (:78-84) fail-closes through `classifyOriginRefusal`, and `isBannedRatio` (:109-115) still matches on the member NAME alone, so the division is reported rather than passed (#944)",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        ...ESTIMATOR_PROOF,
        "packages/server/src/domain/x/verb.ts":
          'import { estimateTokens } from "../../../../kit/src/tokens/index.ts";\nexport const g = (text: string): number => estimateTokens(text) / 4;\n',
      },
      why: "the official estimator this policy exists to drive traffic to. The row carries a DIVISION on purpose: without one it asserts nothing this policy could ever have flagged, and an inert mustPass is a row that cannot fail",
    },
    {
      mode: "types",
      files: {
        ...ESTIMATOR_PROOF,
        "packages/server/src/domain/x/embed.ts":
          "const APPROX_CHARS_PER_TOKEN = 4;\nexport const chars = (maxTokens: number): number => maxTokens * APPROX_CHARS_PER_TOKEN;\n",
      },
      why: "multiplication (tokens to chars budget) is the INVERSE and legal — the operator fence, kept as a written baseline",
    },
    {
      mode: "types",
      files: {
        [ESTIMATOR_HOME]: "const CHARS_PER_TOKEN = 4;\nexport function estimateTokens(text: string): number {\n  return text.length / CHARS_PER_TOKEN;\n}\n",
      },
      why: "THE ESTIMATOR HOME — a `/ CHARS_PER_TOKEN` division here IS the algorithm, and the home is the canonical exported SYMBOL rather than a path pin",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/tokens/impl.ts": "export function estimateTokens(text: string): number {\n  return text.length / 4;\n}\n",
        [ESTIMATOR_HOME]: 'export { estimateTokens } from "./impl.ts";\n',
      },
      why: "the estimator home reached through a RE-EXPORT is still the home, on BOTH sides: the canonical declaration lives in impl.ts and index.ts forwards it, so the aliased symbol resolves to the same declaration and neither file is accused",
    },
    {
      mode: "types",
      files: {
        ...ESTIMATOR_PROOF,
        "packages/kit/src/foo/paginate.ts": "const PAGE_SIZE = 4;\nexport const pages = (items: readonly unknown[]): number => items.length / PAGE_SIZE;\n",
      },
      why: "a non-char/token-named divisor is not a token estimate — the NAME fence is the only thing separating a page size from a chars-per-token ratio, so it is law and not laziness",
    },
    {
      mode: "types",
      files: {
        ...ESTIMATOR_PROOF,
        "packages/server/src/domain/x/verb.ts": "interface Buffer { length: number }\nexport const g = (buf: Buffer): number => buf.length / 4;\n",
      },
      why: "SAME NAME, NOT A CHARACTER COUNT: a `length` field declared by a project interface is not the ambient string/array length, so dividing it by 4 is not a token estimate. The legacy name-only check RED this",
    },
    {
      mode: "types",
      files: {
        ...ESTIMATOR_PROOF,
        "packages/kit/src/foo/bar.ts":
          "declare function ratio(): number;\nconst CHARS_PER_TOKEN = ratio();\nexport const g = (text: string): number => text.length / CHARS_PER_TOKEN;\n",
      },
      why: "A COMPUTED divisor is not a flat heuristic at all — the shared reader refuses to read it, and a value that changes at runtime is outside the ban this policy states",
    },
    {
      mode: "types",
      files: { ...ESTIMATOR_PROOF, "packages/server/src/domain/x/verb.ts": "export const g = (text: string): number => text.length / 5;\n" },
      why: "#1990/D5 — THE EXACT-DIVISOR FENCE, PINNED: an unnamed divisor must be literally 4 (:96); `/ 5` is a different ratio and passes. Cutting `value.value === LITERAL_DIVISOR` at :96 turns this red",
    },
    {
      mode: "types",
      files: {
        ...ESTIMATOR_PROOF,
        "packages/kit/src/foo/bar.ts": "const CHARS_PER_TOKEN = 40;\nexport const g = (text: string): number => text.length / CHARS_PER_TOKEN;\n",
      },
      why: "#1990/D5 — THE CHARS-PER-TOKEN RANGE FENCE, PINNED: a char/token-named constant outside 3..5 (:35-36) is not the banned ratio, however it is spelled. Cutting the `>= CHARS_PER_TOKEN_MIN && <= CHARS_PER_TOKEN_MAX` bound at :99 turns this red",
    },
    {
      mode: "types",
      files: { ...ESTIMATOR_PROOF, "packages/server/src/domain/x/verb.ts": "export const g = (text: string): number => text.length * 4;\n" },
      why: "#1990/D5 — THE OPERATOR FENCE, PINNED: multiplication is not the ban — only `/` is (:111). Cutting the `SlashToken` check at :111 turns this red",
    },
    {
      mode: "types",
      files: { ...ESTIMATOR_PROOF, "packages/server/src/domain/x/verb.ts": "export const g = (set: ReadonlySet<string>): number => set.size / 4;\n" },
      why: "#1990/D5 — THE MEMBER-NAME FENCE, PINNED: the left operand's name must resolve to `length` (:114), not any ambient numeric field — a `Set`'s `.size` is not the ambient character/element count. Cutting `read.value.name === LENGTH` at :114 turns this red",
    },
    {
      mode: "types",
      files: {
        ...ESTIMATOR_PROOF,
        "packages/server/src/domain/x/verb.ts":
          "// @orb-waive no-manual-token-estimate(length): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          "export const g = (text: string): number => text.length / 4;\n",
      },
      why: "POSITIONAL IDENTITY: the report anchors on the whole DIVISION but supplies `length` with an offset into that text (:162-166), so the position is the member being judged rather than the receiver name the derived token would have produced (`text`, `parts`, `buf`) — the module's own comment states that choice. The fixture is mustFlag[0] (:174, count 1) plus the marker line; the marker suppresses the finding that row proves this fixture produces, and it ends if that row changes. The estimator home carried in ESTIMATOR_PROOF divides too, but it is the home and never a finding",
    },
  ],
});
