// An expected value is stated, never built by the production call the subject runs (Spine-Testing §9): when both
// sides of `expect(f(a)).toEqual(f(b))` come from `f`, a wrong `f` is wrong on both sides and the case passes.
// Three shapes stay legal, each because something outside `f`'s own output holds the claim:
//  • a round trip, where the subject is built from the expected binding itself (`build(parse(bytes))` against
//    `bytes`), the serde obligation of Spine-Testing §6;
//  • an equivalence of two inputs whose case also pins `f`'s output: a stated value or a `.not` comparison;
//  • a schema `parse` on both sides of a comparison of two real reads, where `parse` only normalizes and the
//    expected side's input is not stated data.
import type { RuleVisitor } from "@eslint/core";
import type { TSESTree } from "@typescript-eslint/utils";
import { AST_NODE_TYPES } from "@typescript-eslint/utils";
import type { OrbRule, OrbRuleContext, Source } from "./syntax.ts";
import { constInitOf, staticName, unwrapped } from "./test-derivation.ts";

const EQUALITY_MATCHERS = new Set(["toBe", "toEqual", "toStrictEqual", "toMatchObject"]);
const CASE_RUNNERS = new Set(["test", "it"]);
const HOOK_MEMBERS = new Set(["describe", "beforeEach", "beforeAll", "afterEach", "afterAll", "extend", "step", "use"]);
const NORMALIZER = "parse";
const BUILT_IN_METHODS: readonly object[] = [Array.prototype, String.prototype, Object.prototype, Map.prototype, Set.prototype];
// Test-side modules: the runners, the testkit and a suite's own `_`-prefixed helpers.
const TEST_SOURCE = /^(?:vitest|@playwright\/test|@orb\/testkit(?:\/|$)|\.{1,2}\/(?:\.\.\/)*_)/u;
const PRODUCTION_SOURCE = /^(?:@orb\/|#)|(?:^|\/)(?:packages|tooling\/src|scripts)\//u;

const message = (key: string): string =>
  `The expected value is built by \`${key}\`, the call the subject runs, so a wrong \`${key}\` is wrong on both sides and passes. State the expected value. An equivalence of two inputs also pins \`${key}\`'s output in the same case: a stated value or a \`.not\` comparison.`;

interface Assertion {
  readonly call: TSESTree.CallExpression;
  readonly matcher: string;
  readonly negated: boolean;
  readonly subject: TSESTree.Node;
  readonly expected: TSESTree.Node | undefined;
}

function isExpect(node: TSESTree.Node): node is TSESTree.CallExpression {
  if (node.type !== AST_NODE_TYPES.CallExpression) {
    return false;
  }
  const callee = unwrapped(node.callee);
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return callee.name === "expect";
  }
  if (callee.type !== AST_NODE_TYPES.MemberExpression || staticName(callee) !== "soft") {
    return false;
  }
  const root = unwrapped(callee.object);
  return root.type === AST_NODE_TYPES.Identifier && root.name === "expect";
}

const isNode = (value: unknown): value is TSESTree.Node => typeof value === "object" && value !== null && "type" in value;

function assertionOf(call: TSESTree.CallExpression): Assertion | undefined {
  const callee = unwrapped(call.callee);
  if (callee.type !== AST_NODE_TYPES.MemberExpression) {
    return undefined;
  }
  const matcher = staticName(callee);
  let negated = false;
  let target = unwrapped(callee.object);
  while (target.type === AST_NODE_TYPES.MemberExpression) {
    negated ||= staticName(target) === "not";
    target = unwrapped(target.object);
  }
  const [subject] = isExpect(target) ? target.arguments : [];
  const [expected] = call.arguments;
  return matcher === undefined || subject === undefined ? undefined : { call, matcher, negated, subject, expected };
}

/** Local names bound to a value import of production code. */
function productionImports(program: TSESTree.Program): ReadonlySet<string> {
  const names = new Set<string>();
  for (const statement of program.body) {
    const source = statement.type === AST_NODE_TYPES.ImportDeclaration ? statement.source.value : "";
    if (statement.type !== AST_NODE_TYPES.ImportDeclaration || statement.importKind === "type" || TEST_SOURCE.test(source) || !PRODUCTION_SOURCE.test(source)) {
      continue;
    }
    for (const specifier of statement.specifiers) {
      if (specifier.type !== AST_NODE_TYPES.ImportSpecifier || specifier.importKind !== "type") {
        names.add(specifier.local.name);
      }
    }
  }
  return names;
}

// `f`, `ns.f` or `schema.parse` rooted at a production import, spelled as the source spells it.
function calleeKey(callee: TSESTree.Node, imports: ReadonlySet<string>): string | undefined {
  const parts: string[] = [];
  let node = unwrapped(callee);
  while (node.type === AST_NODE_TYPES.MemberExpression) {
    const name = staticName(node);
    if (name === undefined) {
      return undefined;
    }
    parts.unshift(name);
    node = unwrapped(node.object);
  }
  const method = parts.at(-1);
  // `ROWS.map(...)` reads an imported value through a built-in; the binding is the value, not a call.
  if (method !== undefined && BUILT_IN_METHODS.some((prototype) => Object.hasOwn(prototype, method))) {
    return undefined;
  }
  return node.type === AST_NODE_TYPES.Identifier && imports.has(node.name) ? [node.name, ...parts].join(".") : undefined;
}

interface Head {
  readonly key: string;
  readonly call: TSESTree.CallExpression | TSESTree.NewExpression;
}

// The production call a value comes from: its outermost call, through wrappers, property reads, a chained call on
// another receiver, a lone spread and one `const` hop.
function headOf(sourceCode: Source, node: TSESTree.Node, imports: ReadonlySet<string>, hopped = false): Head | undefined {
  const value = unwrapped(node);
  switch (value.type) {
    case AST_NODE_TYPES.AwaitExpression:
      return headOf(sourceCode, value.argument, imports, hopped);
    case AST_NODE_TYPES.Identifier: {
      const init = hopped ? undefined : constInitOf(sourceCode, value)?.node;
      return init?.type === AST_NODE_TYPES.VariableDeclarator && init.id.type === AST_NODE_TYPES.Identifier && init.init !== null
        ? headOf(sourceCode, init.init, imports, true)
        : undefined;
    }
    case AST_NODE_TYPES.MemberExpression:
      return headOf(sourceCode, value.object, imports, hopped);
    case AST_NODE_TYPES.ArrayExpression: {
      const [only] = value.elements;
      return value.elements.length === 1 && only?.type === AST_NODE_TYPES.SpreadElement ? headOf(sourceCode, only.argument, imports, hopped) : undefined;
    }
    case AST_NODE_TYPES.CallExpression:
    case AST_NODE_TYPES.NewExpression: {
      const key = calleeKey(value.callee, imports);
      if (key !== undefined) {
        return { key, call: value };
      }
      const callee = unwrapped(value.callee);
      return callee.type === AST_NODE_TYPES.MemberExpression ? headOf(sourceCode, callee.object, imports, hopped) : undefined;
    }
    default:
      return undefined;
  }
}

// Data the test wrote out: a literal, an object or array of them, or a `const` bound to one.
function isStated(sourceCode: Source, node: TSESTree.Node | undefined, hopped = false): boolean {
  if (node === undefined) {
    return true;
  }
  const value = unwrapped(node);
  switch (value.type) {
    case AST_NODE_TYPES.Literal:
    case AST_NODE_TYPES.TemplateLiteral:
    case AST_NODE_TYPES.ObjectExpression:
    case AST_NODE_TYPES.ArrayExpression:
      return true;
    case AST_NODE_TYPES.Identifier: {
      const init = hopped ? undefined : constInitOf(sourceCode, value)?.node;
      return init?.type === AST_NODE_TYPES.VariableDeclarator && init.init !== null && isStated(sourceCode, init.init, true);
    }
    default:
      return false;
  }
}

function mentions(node: TSESTree.Node, name: string): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name === name;
  }
  return Object.entries(node).some(([field, child]: [string, unknown]) => {
    if (field === "parent") {
      return false;
    }
    const children: unknown[] = Array.isArray(child) ? child : [child];
    return children.some((item) => isNode(item) && mentions(item, name));
  });
}

// The subject is built from the expected binding: `build(parse(bytes))` against `bytes`.
function isRoundTrip(assertion: Assertion, head: Head): boolean {
  const expected = assertion.expected === undefined ? undefined : unwrapped(assertion.expected);
  return expected?.type === AST_NODE_TYPES.Identifier && head.call.arguments.some((argument) => mentions(argument, expected.name));
}

function isNormalizedRead(sourceCode: Source, key: string, expected: Head): boolean {
  return key.split(".").at(-1) === NORMALIZER && !expected.call.arguments.every((argument) => isStated(sourceCode, argument));
}

function caseOf(sourceCode: Source, node: TSESTree.Node): TSESTree.Node {
  const ancestors = sourceCode.getAncestors(node);
  for (const ancestor of ancestors.toReversed()) {
    if (ancestor.type !== AST_NODE_TYPES.CallExpression) {
      continue;
    }
    let root: TSESTree.Node = ancestor.callee;
    let member: string | undefined;
    while (root.type === AST_NODE_TYPES.MemberExpression || root.type === AST_NODE_TYPES.CallExpression) {
      if (root.type === AST_NODE_TYPES.MemberExpression) {
        member ??= staticName(root);
        root = root.object;
      } else {
        root = root.callee;
      }
    }
    if (root.type === AST_NODE_TYPES.Identifier && CASE_RUNNERS.has(root.name) && !(member !== undefined && HOOK_MEMBERS.has(member))) {
      return ancestor;
    }
  }
  return sourceCode.ast;
}

interface Judged {
  readonly assertion: Assertion;
  readonly key: string;
  readonly owner: TSESTree.Node;
  readonly derived: boolean;
  // Pins the binding's output: a negated comparison, or an expected value the binding did not build.
  readonly pins: boolean;
}

/** Refuse an equality whose expected value comes from the production call the subject runs. */
export const noSubjectDerivedExpectedRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const { sourceCode } = context;
    const imports = productionImports(sourceCode.ast);
    const judged: Judged[] = [];
    return {
      "CallExpression[callee]"(call: TSESTree.CallExpression): void {
        const assertion = imports.size === 0 ? undefined : assertionOf(call);
        const head = assertion === undefined ? undefined : headOf(sourceCode, assertion.subject, imports);
        if (assertion === undefined || head === undefined) {
          return;
        }
        const expected = assertion.expected === undefined ? undefined : headOf(sourceCode, assertion.expected, imports);
        const shared = expected?.key === head.key;
        const derived =
          shared &&
          !assertion.negated &&
          EQUALITY_MATCHERS.has(assertion.matcher) &&
          !isRoundTrip(assertion, head) &&
          !isNormalizedRead(sourceCode, head.key, expected);
        judged.push({
          assertion,
          key: head.key,
          owner: caseOf(sourceCode, call),
          derived,
          pins: assertion.negated || (assertion.expected !== undefined && !shared),
        });
      },
      "Program:exit"(): void {
        for (const entry of judged) {
          const pinned = judged.some((other) => other !== entry && other.owner === entry.owner && other.key === entry.key && other.pins);
          if (entry.derived && !pinned) {
            context.report({ node: entry.assertion.call, message: message(entry.key) });
          }
        }
      },
    };
  },
};
