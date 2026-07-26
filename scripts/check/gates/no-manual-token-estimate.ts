import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const MESSAGE =
  "hand-rolled `.length / 4` token estimate — @orb/kit/tokens is the ONE estimator: import { estimateTokens } and call estimateTokens(text). A flat length/N undercounts CJK/emoji ~4× and silently overflows token budgets. This also catches the `.length / CHARS_PER_TOKEN` const dodge. See packages/kit/src/tokens/index.ts.";

// The chars-per-token divisor a dodge hides behind: a small const (3–5, the ASCII heuristic range)
// whose name reads like a char/token ratio. Multiplication (tokens→chars budget, embed-text.ts) is
// the INVERSE and legal — the SlashToken reader never matches it.
const CHARS_PER_TOKEN_MIN = 3;
const CHARS_PER_TOKEN_MAX = 5;
const CHARS_PER_TOKEN_NAME = /CHAR|TOKEN/i;

/** The estimator's own home is where a `/ CHARS_PER_TOKEN` division is CORRECT (it IS the algorithm).
 *  Excluded structurally by the symbol it exports — never by a file-path pin (path-keyed gates die on
 *  rename). Any file exporting `estimateTokens` is the home. */
function exportsEstimator(sf: SourceFile): boolean {
  return Boolean(sf.getFunction("estimateTokens")?.isExported() ?? sf.getVariableDeclaration("estimateTokens")?.isExported());
}

/** Is `node` an Identifier resolving to a const declaration with a numeric-literal initializer in the
 *  char/token range and a char/token-shaped name? The `.length / CHARS_PER_TOKEN` dodge. */
function isCharsPerTokenConst(node: Node): boolean {
  if (!Node.isIdentifier(node)) {
    return false;
  }
  if (!CHARS_PER_TOKEN_NAME.test(node.getText())) {
    return false;
  }
  const decl = node.getSymbol()?.getDeclarations()?.[0];
  if (decl === undefined || !Node.isVariableDeclaration(decl)) {
    return false;
  }
  const init = decl.getInitializer();
  if (init === undefined || !Node.isNumericLiteral(init)) {
    return false;
  }
  const value = init.getLiteralValue();
  return value >= CHARS_PER_TOKEN_MIN && value <= CHARS_PER_TOKEN_MAX;
}

export const gate: GateDescriptor = {
  name: "no-manual-token-estimate",
  docRow: "packages/kit/src/tokens/index.ts",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: 'import { estimateTokens } from "@orb/kit/tokens" and use it',
  scanRoot: (p) => {
    if (p.includes("/tests/") || p.endsWith(".test.ts") || p.endsWith(".test.tsx")) {
      return false;
    }
    return p.includes("packages/client/src/") || p.includes("packages/ui/src/") || p.includes("packages/server/src/") || p.includes("packages/kit/src/");
  },
  kinds: [SyntaxKind.BinaryExpression],
  visit: (node, sf, ctx) => {
    if (!Node.isBinaryExpression(node)) {
      return;
    }
    if (node.getOperatorToken().getKind() !== SyntaxKind.SlashToken) {
      return;
    }

    const left = node.getLeft();
    if (!Node.isPropertyAccessExpression(left) || left.getName() !== "length") {
      return;
    }

    const right = node.getRight();
    const literalFour = right.getKind() === SyntaxKind.NumericLiteral && right.getText() === "4";
    // The const dodge is the estimator's own algorithm inside its home file — exempt only there.
    const constDodge = isCharsPerTokenConst(right) && !exportsEstimator(sf);

    if (literalFour || constDodge) {
      ctx.report(node);
    }
  },
  mustFlag: [
    {
      files: "export const G = text.length / 4;\n",
      at: "packages/server/src/domain/x/verb.ts",
      expect: { count: 1 },
      why: ".length / 4 literal used",
    },
    {
      files: "const CHARS_PER_TOKEN = 4;\nexport const g = (text: string): number => text.length / CHARS_PER_TOKEN;\n",
      at: "packages/kit/src/foo/bar.ts",
      expect: { count: 1 },
      why: ".length / CHARS_PER_TOKEN const dodge in kit",
    },
  ],
  mustPass: [
    {
      files: "export const G = estimateTokens(text);\n",
      at: "packages/server/src/domain/x/verb.ts",
      why: "using the official estimator",
    },
    {
      files: "const APPROX_CHARS_PER_TOKEN = 4;\nexport const chars = (maxTokens: number): number => maxTokens * APPROX_CHARS_PER_TOKEN;\n",
      at: "packages/server/src/domain/x/embed.ts",
      why: "multiplication (tokens→chars budget) is the inverse — the reader never matches `*`",
    },
    {
      files: "const CHARS_PER_TOKEN = 4;\nexport function estimateTokens(text: string): number {\n  return text.length / CHARS_PER_TOKEN;\n}\n",
      at: "packages/kit/src/tokens/index.ts",
      why: "the estimator home — a `/ CHARS_PER_TOKEN` division here IS the algorithm",
    },
    {
      files: "const PAGE_SIZE = 4;\nexport const pages = (items: unknown[]): number => items.length / PAGE_SIZE;\n",
      at: "packages/kit/src/foo/paginate.ts",
      why: "a non-char/token-named divisor is not a token estimate",
    },
  ],
};
