import type { RuleContext, RuleDefinition, RuleVisitor, TextSourceCode } from "@eslint/core";
import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import type { Linter } from "eslint";

export const ROOT_SPAN_OPENERS = ["withRequestSpan", "superviseDetached", "superviseSettled"];

export const memberNamed = (name: string, prefix = ""): string =>
  `:matches([${prefix}computed=false][${prefix}property.name='${name}'], [${prefix}computed=true][${prefix}property.type='Literal'][${prefix}property.value='${name}'], [${prefix}computed=true][${prefix}property.type='TemplateLiteral'][${prefix}property.expressions.length=0][${prefix}property.quasis.0.value.cooked='${name}'])`;

export const alternation = (names: readonly string[]): string => `/^(${names.join("|")})$/`;

export const TANSTACK_FORM_MINTS = ["useForm", "createFormHook", "createFormHookContexts"];

export const MATCH_MEDIA = "matchMedia";

export const SESSION_CHANNEL_CONSTRUCTORS = new Set(["BroadcastChannel"]);

export const SESSION_CHANNEL_MESSAGE =
  "A BroadcastChannel outside packages/client/src/lib/session-channel.ts: cross-tab messaging has one typed home that carries session lifecycle and durable-local pokes, never server truth (D138). Add the message kind to SessionMessage and post it through postSessionMessage.";

export const FIREHOSE_SYMBOL = "subscribeAllChatEvents";

export const DIRECT_CLASS_LITERAL_TEMPLATE =
  "JSXAttribute[name.name=/^class(Name)?$/] > JSXExpressionContainer > TemplateLiteral[expressions.length=1][expressions.0.type='Literal'][expressions.0.value=type(string)]";

export function restrictionRule({
  selectors = [],
  globals = [],
}: {
  id?: string;
  selectors?: readonly { selector: string; message: string }[];
  globals?: readonly { name: string; message: string }[];
}): OrbRule {
  return {
    meta: { type: "problem", schema: [] },
    create(context: OrbRuleContext): RuleVisitor {
      const listeners: RuleVisitor = Object.fromEntries(
        selectors.map(({ selector, message }): [string, TSESLint.RuleFunction<TSESTree.Node>] => [
          selector,
          (node: TSESTree.Node): void => context.report({ node, message }),
        ]),
      );
      if (globals.length > 0) {
        listeners["Program:exit"] = (program: TSESTree.Program): void => {
          const globalScope = context.sourceCode.getScope(program);
          // typescript-eslint declares lib classes such as BroadcastChannel as source-less global variables, so
          // their references resolve there and never reach `through`.
          const libReferences = globalScope.variables.filter(({ defs }) => defs.length === 0).flatMap(({ references }) => references);
          for (const reference of [...globalScope.through, ...libReferences]) {
            const banned = globals.find(({ name }) => name === reference.identifier.name);
            if (banned !== undefined && reference.isValueReference !== false) {
              context.report({ node: reference.identifier, message: banned.message });
            }
          }
        };
      }
      return listeners;
    },
  };
}

export type Source = Pick<
  TSESLint.SourceCode,
  | "ast"
  | "getAllComments"
  | "getAncestors"
  | "getDeclaredVariables"
  | "getFirstToken"
  | "getLocFromIndex"
  | "getScope"
  | "getText"
  | "getTokenAfter"
  | "getTokenBefore"
  | "parserServices"
> &
  TextSourceCode & { scopeManager: TSESLint.Scope.ScopeManager & { globalScope: TSESLint.Scope.Scope } };
interface RuleTypes {
  LangOptions: Linter.LanguageOptions;
  Code: Source;
  RuleOptions: [];
  Node: TSESTree.Node;
  MessageIds: string;
  Visitor: RuleVisitor;
  ExtRuleDocs: object;
}
export type OrbRule = RuleDefinition<RuleTypes> & Required<Pick<RuleDefinition<RuleTypes>, "meta">>;
export type OrbRuleContext = RuleContext<RuleTypes>;

export type ChildNode = Exclude<TSESTree.Node, TSESTree.Program>;
