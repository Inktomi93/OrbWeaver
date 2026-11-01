// Tests derive values from production (Spine-Testing §3, §9): these rules refuse the hand-typed copy, the refusal that
// never names its reason, the ambient id, the case table that can come up empty and the capture copied past custody.
import type { RuleVisitor } from "@eslint/core";
import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import type { OrbRule, OrbRuleContext, Source } from "./syntax.ts";

const TITLED_CALLEES = new Set(["test", "it", "describe", "suite", "bench"]);
const CASE_TABLE_ROOTS = new Set(["test", "it", "describe", "suite"]);
const CASE_TABLE_METHODS = new Set(["for", "each"]);
const THROW_MATCHERS = new Set(["toThrow", "toThrowError"]);
const EMPTY_REJECTION_MATCHERS = new Set(["toBeDefined", "toBeTruthy"]);
const INSTANCE_MATCHER = "toBeInstanceOf";
const REJECTS = "rejects";
// `DomainOperationError` is the base of every coded refusal, so naming it alone proves no reason.
const REASONLESS_CLASSES = new Set(["Error", "DomainOperationError"]);
const NEGATION = "not";
const EXPECT = "expect";

function staticName(member: TSESTree.MemberExpression): string | undefined {
  const { computed, property } = member;
  if (!computed) {
    return property.type === "Identifier" ? property.name : undefined;
  }
  if (property.type === "Literal" && typeof property.value === "string") {
    return property.value;
  }
  return property.type === "TemplateLiteral" && property.expressions.length === 0 ? (property.quasis[0]?.value.cooked ?? undefined) : undefined;
}

// `a?.b`, `a!.b`, `a as T` and `a satisfies T` read the same value as `a`.
function unwrapped(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  while (
    current.type === "ChainExpression" ||
    current.type === "TSNonNullExpression" ||
    current.type === "TSAsExpression" ||
    current.type === "TSSatisfiesExpression"
  ) {
    current = current.expression;
  }
  return current;
}

function rootName(callee: TSESTree.Node): string | undefined {
  let node = unwrapped(callee);
  while (node.type === "MemberExpression" || node.type === "CallExpression") {
    node = unwrapped(node.type === "MemberExpression" ? node.object : node.callee);
  }
  return node.type === "Identifier" ? node.name : undefined;
}

function constInitOf(sourceCode: Source, identifier: TSESTree.Identifier): TSESLint.Scope.Definition | undefined {
  for (let scope: TSESLint.Scope.Scope | null = sourceCode.getScope(identifier); scope !== null; scope = scope.upper) {
    const variable = scope.set.get(identifier.name);
    if (variable !== undefined) {
      const [definition] = variable.defs;
      return variable.defs.length === 1 && definition?.type === "Variable" && definition.parent.kind === "const" ? definition : undefined;
    }
  }
  return undefined;
}

const stringOf = (node: TSESTree.Literal): string | undefined => (typeof node.value === "string" ? node.value : undefined);

/** The production spelling tests read: `TOKENS` custom properties by name, `MEDIA_QUERIES` conditions by value. */
export interface CssVocabulary {
  /** Custom property → its `TOKENS` key. */
  readonly tokens: ReadonlyMap<string, string>;
  /** Media condition → its `MEDIA_QUERIES` key. */
  readonly media: ReadonlyMap<string, string>;
}

// A brace marks stylesheet text or a token-reference placeholder: the input of a parser, not a read of a token.
const CSS_TEXT = /[{}]/u;
// A Tailwind arbitrary value stays one literal so the class scanner can see it.
const ARBITRARY_VALUE = /\[[^\]\s]*var\(/u;
const VAR_READ = /var\(\s*(--[\w-]+)(?=\s*[,)])/gu;
// `--name: value` outside a block; a class string's `[--name:value]` stays one literal for the scanner.
const DECLARED_NAME = /(?<![\w[-])(--[a-z][a-z0-9-]*)\s*:/gu;
const NAME_HEAD = /(?<![\w-])(--[a-z][a-z0-9-]*-)$/u;
const MEDIA_CONDITION = /\((?:any-)?(?:hover|pointer)\s*:[^()]*\)|\((?:min-|max-)?(?:width|height)\s*[:<>][^()]*\)/gu;

const tokenMessage = (name: string, key: string): string =>
  `"${name}" is a hand-typed copy of a design token; read \`TOKENS["${key}"].cssVar\` from \`@orb/ui/tokens\` so the test follows the token.`;
const familyMessage = (head: string): string =>
  `"${head}" builds a design token name by hand; read \`TOKENS[...].cssVar\` from \`@orb/ui/tokens\` so the test follows the token.`;
const mediaMessage = (condition: string, key: string | undefined): string =>
  key === undefined
    ? `"${condition}" is a hand-typed media condition no \`MEDIA_QUERIES\` entry names; read one from \`@orb/ui/tokens\`, or add the entry where production uses the condition.`
    : `"${condition}" is a hand-typed media condition; read \`MEDIA_QUERIES["${key}"]\` from \`@orb/ui/tokens\`.`;

// `expect(value, "message")` and `expect.soft(value, "message")`; the arguments of a matcher chained on it are values.
function isExpectCall(call: TSESTree.CallExpression): boolean {
  const callee = unwrapped(call.callee);
  if (callee.type === "Identifier") {
    return callee.name === EXPECT;
  }
  return (
    callee.type === "MemberExpression" && staticName(callee) === "soft" && rootName(callee.object) === EXPECT && unwrapped(callee.object).type === "Identifier"
  );
}

function isNarration(node: TSESTree.Node): boolean {
  const call = node.parent;
  if (call?.type !== "CallExpression") {
    return false;
  }
  const index = call.arguments.indexOf(node as TSESTree.CallExpressionArgument);
  return index === 1 ? isExpectCall(call) : index === 0 && TITLED_CALLEES.has(rootName(call.callee) ?? "");
}

function textFindings(text: string, { tokens, media }: CssVocabulary): readonly string[] {
  if (CSS_TEXT.test(text)) {
    return [];
  }
  const exact = tokens.get(text.trim());
  if (exact !== undefined) {
    return [tokenMessage(text.trim(), exact)];
  }
  const reads = ARBITRARY_VALUE.test(text) ? [] : [...text.matchAll(VAR_READ)].flatMap((match) => match[1] ?? []);
  const names = [...reads, ...[...text.matchAll(DECLARED_NAME)].flatMap((match) => match[1] ?? [])];
  const found = names.flatMap((name) => {
    const key = tokens.get(name);
    return key === undefined ? [] : [tokenMessage(name, key)];
  });
  const conditions = new Set([...text.matchAll(MEDIA_CONDITION)].map(([match]) => match));
  for (const condition of media.keys()) {
    if (text.includes(condition)) {
      conditions.add(condition);
    }
  }
  return [...found, ...[...conditions].map((condition) => mediaMessage(condition, media.get(condition)))];
}

// A quasi ending in a family head, followed by an expression, finishes a token name at runtime: `--color-${tone}`.
function familyHead(element: TSESTree.TemplateElement, { tokens }: CssVocabulary): string | undefined {
  const head = element.tail ? undefined : NAME_HEAD.exec(element.value.cooked ?? "")?.[1];
  return head !== undefined && [...tokens.keys()].some((name) => name.startsWith(head)) ? head : undefined;
}

/** Refuse a string or template that spells a design token or media condition production already exports. */
export function noHandTypedCssTokenRule(vocabulary: CssVocabulary): OrbRule {
  return {
    meta: { type: "problem", schema: [] },
    create(context: OrbRuleContext): RuleVisitor {
      const report = (node: TSESTree.Node, messages: readonly string[]): void => {
        for (const message of messages) {
          context.report({ node, message });
        }
      };
      return {
        "Literal[value]"(node: TSESTree.Literal): void {
          const text = stringOf(node);
          if (text !== undefined && node.parent.type !== "TSLiteralType" && !isNarration(node)) {
            report(node, textFindings(text, vocabulary));
          }
        },
        "TemplateLiteral[quasis]"(node: TSESTree.TemplateLiteral): void {
          const texts = node.quasis.map((quasi) => quasi.value.cooked ?? "");
          if (isNarration(node) || texts.some((text) => CSS_TEXT.test(text))) {
            return;
          }
          for (const quasi of node.quasis) {
            const head = familyHead(quasi, vocabulary);
            report(quasi, [...textFindings(quasi.value.cooked ?? "", vocabulary), ...(head === undefined ? [] : [familyMessage(head)])]);
          }
        },
      };
    },
  };
}

const BARE_THROW_MESSAGE =
  "A bare refusal passes on any error, an unrelated ENOENT or TypeError included. Name the reason: the production error class, `toThrowTRPCError(code)`, `rejects.toMatchObject({ code })`, or a message pattern.";
const REASONLESS_CLASS_MESSAGE = "`expect.any(Error)` matches any failure. Name the reason: the production error class, its `code`, or a message pattern.";
const MATCH_ALL_PATTERNS = new Set(["", ".", ".*", ".+", "(?:)", "[\\s\\S]*"]);

function isAsymmetric(node: TSESTree.CallExpression, name: string): boolean {
  const callee = unwrapped(node.callee);
  return (
    callee.type === "MemberExpression" && staticName(callee) === name && unwrapped(callee.object).type === "Identifier" && rootName(callee.object) === EXPECT
  );
}

function isReasonlessClass(node: TSESTree.Node | undefined): boolean {
  return node?.type === "Identifier" && REASONLESS_CLASSES.has(node.name);
}

function isReasonlessExpected(node: TSESTree.CallExpressionArgument): boolean {
  if (node.type === "Identifier") {
    return node.name === "undefined" || isReasonlessClass(node);
  }
  if (node.type === "Literal") {
    return node.value === "" || ("regex" in node && MATCH_ALL_PATTERNS.has(node.regex.pattern));
  }
  if (node.type === "TemplateLiteral") {
    return node.expressions.length === 0 && node.quasis[0]?.value.cooked === "";
  }
  return node.type === "CallExpression" && (isAsymmetric(node, "anything") || (isAsymmetric(node, "any") && isReasonlessClass(node.arguments[0])));
}

function isBareRefusal(args: readonly TSESTree.CallExpressionArgument[]): boolean {
  const [first] = args;
  return first === undefined || (args.length === 1 && isReasonlessExpected(first));
}

// The chain a matcher hangs on: `{ expected, rejected }` for `expect(x).rejects.toThrow`, undefined for another root or a negation.
function expectChain(member: TSESTree.MemberExpression): { readonly rejected: boolean } | undefined {
  let rejected = false;
  let node = unwrapped(member.object);
  while (node.type === "MemberExpression") {
    if (staticName(node) === NEGATION) {
      return undefined;
    }
    rejected ||= staticName(node) === REJECTS;
    node = unwrapped(node.object);
  }
  return node.type === "CallExpression" && rootName(node.callee) === EXPECT ? { rejected } : undefined;
}

function isEmptyRejection(name: string, args: readonly TSESTree.CallExpressionArgument[]): boolean {
  return EMPTY_REJECTION_MATCHERS.has(name) || (name === INSTANCE_MATCHER && isReasonlessClass(args[0]));
}

/** Refuse a refusal that names no reason: `toThrow()`, `toThrow(Error)`, a match-all expectation, the `DomainOperationError` base
 *  alone, `rejects.toBeDefined()` and the like. A chain rooted at another helper stays that helper's assertion. */
export const noBareThrowAssertionRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    return {
      "CallExpression[callee]"(call: TSESTree.CallExpression): void {
        const callee = unwrapped(call.callee);
        if (
          isAsymmetric(call, "any") &&
          call.arguments[0]?.type === "Identifier" &&
          call.arguments[0].name === "Error" &&
          !THROW_MATCHERS.has(calledName(parentCallee(call)) ?? "")
        ) {
          context.report({ node: call, message: REASONLESS_CLASS_MESSAGE });
          return;
        }
        if (callee.type !== "MemberExpression") {
          return;
        }
        const name = staticName(callee) ?? "";
        const chain = expectChain(callee);
        if (
          chain !== undefined &&
          ((THROW_MATCHERS.has(name) && isBareRefusal(call.arguments)) || (chain.rejected && isEmptyRejection(name, call.arguments)))
        ) {
          context.report({ node: call, message: BARE_THROW_MESSAGE });
        }
      },
    };
  },
};

const UNSEEDED_ID_MESSAGE =
  "`mintTypeId(prefix)` draws an ambient uuidv7, so the run differs each time (Spine-Testing §3). Use `ids.typeId(prefix)` from the fixture or `createSeededIds(FIXTURE_ID_CURSOR)` (`@orb/testkit/iso`), or `root.idSource.typeId(prefix)`.";

function parentCallee(call: TSESTree.CallExpression): TSESTree.Node {
  return call.parent.type === "CallExpression" ? call.parent.callee : call.parent;
}

function calledName(callee: TSESTree.Node): string | undefined {
  const value = unwrapped(callee);
  if (value.type === "MemberExpression") {
    return staticName(value);
  }
  return value.type === "Identifier" ? value.name : undefined;
}

/** Refuse a `mintTypeId` call with no generator. */
export const noUnseededTypeIdRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    return {
      "CallExpression[callee]"(call: TSESTree.CallExpression): void {
        const generator = call.arguments[1];
        if (calledName(call.callee) === "mintTypeId" && (generator === undefined || (generator.type === "Identifier" && generator.name === "undefined"))) {
          context.report({ node: call, message: UNSEEDED_ID_MESSAGE });
        }
      },
    };
  },
};

const FILTERED_TABLE_MESSAGE =
  "A filtered case table can come up empty, and an empty table registers no case and stays green. Register through `forEachNonEmpty` from `@orb/testkit/iso`.";

function holdsFilter(sourceCode: Source, node: TSESTree.Node, seen: Set<TSESTree.Node> = new Set()): boolean {
  const value = unwrapped(node);
  if (seen.has(value)) {
    return false;
  }
  seen.add(value);
  if (value.type === "Identifier") {
    const init = constInitOf(sourceCode, value)?.node;
    return init?.type === "VariableDeclarator" && init.id.type === "Identifier" && init.init !== null && holdsFilter(sourceCode, init.init, seen);
  }
  if (value.type !== "CallExpression") {
    return false;
  }
  const callee = unwrapped(value.callee);
  return callee.type === "MemberExpression" && (staticName(callee) === "filter" || holdsFilter(sourceCode, callee.object, seen));
}

const TEST_MEMBERS_THAT_REGISTER_NOTHING = new Set(["step", "info", "use", "setTimeout", "slow", "beforeEach", "beforeAll", "afterEach", "afterAll"]);

function isCaseRegistration(call: TSESTree.CallExpression): boolean {
  return CASE_TABLE_ROOTS.has(rootName(call.callee) ?? "") && !TEST_MEMBERS_THAT_REGISTER_NOTHING.has(calledName(call.callee) ?? "");
}

// Direct statements only: a function body runs later, so a loop inside a case asserts rather than registers.
function registersCases(statement: TSESTree.Statement): boolean {
  switch (statement.type) {
    case "BlockStatement":
      return statement.body.some(registersCases);
    case "ForOfStatement":
      return registersCases(statement.body);
    case "IfStatement":
      return registersCases(statement.consequent) || (statement.alternate !== null && registersCases(statement.alternate));
    case "ExpressionStatement":
      return statement.expression.type === "CallExpression" && isCaseRegistration(statement.expression);
    default:
      return false;
  }
}

/** Refuse a `test.for`, `test.each` or registering `for...of` table that a `.filter()` call produced. */
export const noFilteredCaseTableRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    return {
      "ForOfStatement[await=false]"(loop: TSESTree.ForOfStatement): void {
        if (holdsFilter(context.sourceCode, loop.right) && registersCases(loop.body)) {
          context.report({ node: loop.right, message: FILTERED_TABLE_MESSAGE });
        }
      },
      "CallExpression[callee]"(call: TSESTree.CallExpression): void {
        const callee = unwrapped(call.callee);
        const [table] = call.arguments;
        if (
          table !== undefined &&
          callee.type === "MemberExpression" &&
          CASE_TABLE_METHODS.has(staticName(callee) ?? "") &&
          CASE_TABLE_ROOTS.has(rootName(callee) ?? "") &&
          holdsFilter(context.sourceCode, table)
        ) {
          context.report({ node: table, message: FILTERED_TABLE_MESSAGE });
        }
      },
    };
  },
};

const SPREAD_CAPTURE_MESSAGE =
  "A spread corpus capture is a raw copy past playback custody, so it cannot answer playback and its data goes stale. Use `serveCorpusProcedures` for changing state or a new request, or `captureCorpusRead` for a new finite read.";

const CAPTURE_SET = "reads";

// `x.reads[path]`, `x.reads.path` and either of them with an index.
function isCaptureRead(node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  if (value.type !== "MemberExpression") {
    return false;
  }
  const object = unwrapped(value.object);
  if (object.type === "MemberExpression" && staticName(object) === CAPTURE_SET) {
    return true;
  }
  const indexed = value.computed && value.property.type === "Literal" && typeof value.property.value === "number";
  return indexed && isCaptureRead(object);
}

function isCapture(sourceCode: Source, node: TSESTree.Node): boolean {
  const value = unwrapped(node);
  if (value.type !== "Identifier") {
    return isCaptureRead(value);
  }
  const declarator = constInitOf(sourceCode, value)?.node;
  return declarator?.type === "VariableDeclarator" && declarator.init !== null && declarator.id.type !== "ObjectPattern" && isCaptureRead(declarator.init);
}

/** Refuse `{ ...corpus.reads[path] }`, and the same spread through a `const` holding the capture. */
export const noSpreadCorpusCaptureRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    return {
      "ObjectExpression > SpreadElement"(spread: TSESTree.SpreadElement): void {
        if (isCapture(context.sourceCode, spread.argument)) {
          context.report({ node: spread, message: SPREAD_CAPTURE_MESSAGE });
        }
      },
    };
  },
};
