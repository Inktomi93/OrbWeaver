import type { RuleVisitor } from "@eslint/core";
import type { TSESLint, TSESTree } from "@typescript-eslint/utils";
import { AMBIENT_GLOBAL_RECEIVERS } from "./native.ts";
import { isValueWrapper } from "./static-values.ts";
import type { ChildNode, OrbRule, OrbRuleContext, Source } from "./syntax.ts";
import { SESSION_CHANNEL_CONSTRUCTORS, SESSION_CHANNEL_MESSAGE } from "./syntax.ts";

const AMBIENT_ROOTS = new Set(["globalThis", "global", "self", "window"]);

const RAW_FETCH = "fetch";

const RAW_EGRESS_PACKAGES = /^(?:undici|node-fetch|cross-fetch)$/u;

const NODE_HTTP_CLIENT_DOORS = new Map([
  ["http", new Set(["request", "get"])],
  ["https", new Set(["request", "get"])],
  ["http2", new Set(["connect"])],
]);

const PROCESS_MODULE = /^(?:node:)?process$/u;

const PROCESS_GLOBAL = "process";

const ENV_MEMBER = "env";

const MODULE_DEFAULT = "default";

const REFLECT_GLOBAL = "Reflect";

const REFLECT_GET = "get";

export const SCRUBBER_FACTORY = "createHiddenSpanStreamScrubber";

const RAW_EGRESS_MESSAGE =
  "D61 B5a: server and inference egress goes through infra/network (`safeFetch` or the configured-endpoint capability); a raw fetch or HTTP client skips the scheme pin, host allowlist, resolve-validate-pin and deadline.";

const SOLE_ENV_MESSAGE =
  "Tier-2-Foundation.md invariant 1: foundation/env is the only process.env reader; take the parsed env record (`Env` from foundation/env/record) as a dependency and dot-access a typed key.";

function valueCarrier(node: ChildNode): ChildNode {
  let carrier = node;
  for (;;) {
    const { parent } = carrier;
    const wraps =
      (isValueWrapper(parent) && parent.expression === carrier) ||
      (parent.type === "ChainExpression" && parent.expression === carrier) ||
      (parent.type === "AwaitExpression" && parent.argument === carrier) ||
      (parent.type === "SequenceExpression" && parent.expressions.at(-1) === carrier) ||
      (parent.type === "ConditionalExpression" && parent.test !== carrier) ||
      parent.type === "LogicalExpression";
    if (!wraps) {
      return carrier;
    }
    carrier = parent;
  }
}

function staticSource(source: TSESTree.Node): string | null | undefined {
  if (source.type === "Literal" && typeof source.value === "string") {
    return source.value;
  }
  return source.type === "TemplateLiteral" && source.expressions.length === 0 ? (source.quasis[0] as TSESTree.TemplateElement).value.cooked : undefined;
}

function writtenKeyName(key: TSESTree.Node, computed: boolean): string | null | undefined {
  if (key.type === "Literal") {
    return String(key.value);
  }
  if (!computed) {
    return key.type === "Identifier" ? key.name : undefined;
  }
  return key.type === "TemplateLiteral" && key.expressions.length === 0 ? (key.quasis[0] as TSESTree.TemplateElement).value.cooked : undefined;
}

function memberKeyName(sourceCode: Source, member: TSESTree.MemberExpression): string | null | undefined {
  const written = writtenKeyName(member.property, member.computed);
  return written !== undefined || !member.computed ? written : constKeyName(sourceCode, member.property, new Set());
}

function constKeyName(sourceCode: Source, key: TSESTree.Node, seen: Set<TSESTree.Identifier>): string | null | undefined {
  if (key.type !== "Identifier" || seen.has(key)) {
    return;
  }
  const variable = referencedVariable(sourceCode, key);
  const [definition] = variable?.defs ?? [];
  // A pattern default (`const { K = "x" } = v`) takes the source's value first, so only `const K = …` names K.
  const direct = variable?.defs.length === 1 && definition?.type === "Variable" && definition.parent.kind === "const" && definition.node.id === definition.name;
  const value = direct && definition.node.init !== null ? unwrapValue(definition.node.init) : undefined;
  if (value === undefined) {
    return;
  }
  if (value.type === "Literal") {
    return typeof value.value === "string" ? value.value : undefined;
  }
  return value.type === "Identifier" ? constKeyName(sourceCode, value, new Set(seen).add(key)) : writtenKeyName(value, true);
}

function patternTakes(pattern: TSESTree.Node, name: string): boolean {
  return (
    pattern.type === "ObjectPattern" &&
    pattern.properties.some((property) => {
      if (property.type === "RestElement") {
        return true;
      }
      const key = writtenKeyName(property.key, property.computed);
      return key === undefined || key === name;
    })
  );
}

function isTypeofOperand(node: TSESTree.Node): boolean {
  return node.parent?.type === "UnaryExpression" && node.parent.operator === "typeof";
}

function inTypeQuery(node: TSESTree.Node): boolean {
  let parent = node.parent;
  while (parent?.type === "TSQualifiedName") {
    parent = parent.parent;
  }
  return parent?.type === "TSTypeQuery";
}

function declaredOnly(variable: TSESLint.Scope.Variable): boolean {
  return (
    variable.defs.length > 0 &&
    variable.defs.every(
      ({ node, parent }) => ("declare" in node && node.declare === true) || (parent !== null && "declare" in parent && parent.declare === true),
    )
  );
}

function isGlobalBinding(variable: TSESLint.Scope.Variable | null): boolean {
  return variable === null || variable.defs.length === 0 || declaredOnly(variable);
}

function ambientReferences(sourceCode: Source, names: ReadonlySet<string | null | undefined>): (TSESTree.Identifier | TSESTree.JSXIdentifier)[] {
  const { globalScope, scopes } = sourceCode.scopeManager;
  const references = globalScope.through.filter(({ identifier }) => names.has(identifier.name));
  for (const variable of scopes.flatMap((scope) => scope.variables)) {
    if (names.has(variable.name) && isGlobalBinding(variable)) {
      references.push(...variable.references.filter(({ isValueReference }) => isValueReference !== false));
    }
  }
  return references.map(({ identifier }) => identifier).filter((identifier) => !inTypeQuery(identifier));
}

function aliasReads(sourceCode: Source, declarator: TSESTree.Node): (TSESTree.Identifier | TSESTree.JSXIdentifier)[] {
  return sourceCode
    .getDeclaredVariables(declarator)
    .flatMap(({ references }) =>
      references
        .filter((reference) => reference.identifier !== (declarator as TSESTree.VariableDeclarator).id && reference.isRead())
        .map(({ identifier }) => identifier),
    );
}

function boundReads(sourceCode: Source, identifier: TSESTree.Identifier): (TSESTree.Identifier | TSESTree.JSXIdentifier)[] {
  for (let scope: TSESLint.Scope.Scope | null = sourceCode.getScope(identifier); scope !== null; scope = scope.upper) {
    const variable = scope.set.get(identifier.name);
    if (variable?.identifiers.includes(identifier) === true) {
      return variable.references.filter((reference) => reference.identifier !== identifier && reference.isRead()).map(({ identifier: read }) => read);
    }
  }
  return [];
}

function referencedVariable(sourceCode: Source, identifier: TSESTree.Identifier): TSESLint.Scope.Variable | null {
  for (let scope: TSESLint.Scope.Scope | null = sourceCode.getScope(identifier); scope !== null; scope = scope.upper) {
    const reference = scope.references.find((candidate) => candidate.identifier === identifier);
    if (reference !== undefined) {
      return reference.resolved;
    }
  }
  return null;
}

function assignedReads(sourceCode: Source, target: TSESTree.Identifier): (TSESTree.Identifier | TSESTree.JSXIdentifier)[] {
  const variable = referencedVariable(sourceCode, target);
  return (variable?.references ?? []).filter((reference) => reference.identifier !== target && reference.isRead()).map(({ identifier }) => identifier);
}

const DESTRUCTURES = new Set(["ObjectPattern", "ArrayPattern"]);

const ALIAS_ASSIGNMENTS = new Set(["=", "||=", "&&=", "??="]);

const FRESH_VALUES = new Set([
  "ArrayExpression",
  "ArrowFunctionExpression",
  "BinaryExpression",
  "ClassExpression",
  "FunctionExpression",
  "Literal",
  "NewExpression",
  "ObjectExpression",
  "TemplateLiteral",
  "UnaryExpression",
  "UpdateExpression",
]);

const OPAQUE_VALUES = new Set([
  "AwaitExpression",
  "CallExpression",
  "ConditionalExpression",
  "LogicalExpression",
  "NewExpression",
  "SequenceExpression",
  "TaggedTemplateExpression",
  "YieldExpression",
]);

function unwrapValue(node: TSESTree.Node): TSESTree.Node {
  let value = node;
  while (isValueWrapper(value) || value.type === "ChainExpression") {
    value = value.expression;
  }
  return value;
}

function patternNames(pattern: TSESTree.Node, name: string): boolean {
  return (
    pattern.type === "ObjectPattern" &&
    pattern.properties.some((property) => property.type === "Property" && writtenKeyName(property.key, property.computed) === name)
  );
}

function takesAmbientRoot(pattern: TSESTree.Node): boolean {
  return [...AMBIENT_ROOTS].some((root) => patternNames(pattern, root));
}

function unknowablyReassigned(variable: TSESLint.Scope.Variable | null): boolean {
  const writes = variable?.references.filter((reference) => reference.isWrite()) ?? [];
  if (writes.every((reference) => reference.init === true)) {
    return false;
  }
  return writes.some(({ identifier, writeExpr }) => {
    const { parent } = identifier;
    const direct =
      (parent.type === "VariableDeclarator" && parent.id === identifier) ||
      (parent.type === "AssignmentExpression" && parent.left === identifier && ALIAS_ASSIGNMENTS.has(parent.operator));
    return !direct || writeExpr === undefined || writeExpr === null || !FRESH_VALUES.has(unwrapValue(writeExpr).type);
  });
}

function unknowableValue(sourceCode: Source, expression: TSESTree.Node): boolean {
  const value = unwrapValue(expression);
  if (value.type === "Identifier") {
    const variable = referencedVariable(sourceCode, value);
    // The process and the global roots are followed precisely by the door judges.
    const ambient = isGlobalBinding(variable) && value.name !== PROCESS_GLOBAL && !AMBIENT_ROOTS.has(value.name);
    return ambient || unknowablyReassigned(variable);
  }
  if (value.type === "MemberExpression") {
    // An element index picks one of many values; only a named property is a static path.
    const { property } = value;
    const named =
      (property.type === "Literal" && typeof property.value === "string") || (property.type === "TemplateLiteral" && property.expressions.length === 0);
    return (value.computed && !named) || unknowableValue(sourceCode, value.object);
  }
  const namedModule = value.type === "AwaitExpression" && value.argument.type === "ImportExpression" && staticSource(value.argument.source) !== undefined;
  return OPAQUE_VALUES.has(value.type) && !namedModule;
}

function isReflectGet(sourceCode: Source, node: TSESTree.Node, target: TSESTree.Node): boolean {
  const callee = node.type === "CallExpression" && node.arguments[0] === target ? node.callee : undefined;
  return (
    callee?.type === "MemberExpression" &&
    callee.object.type === "Identifier" &&
    callee.object.name === REFLECT_GLOBAL &&
    isGlobalBinding(referencedVariable(sourceCode, callee.object)) &&
    memberKeyName(sourceCode, callee) === REFLECT_GET
  );
}

function reflectKeyName(sourceCode: Source, call: TSESTree.CallExpression): string | null | undefined {
  const [, key] = call.arguments;
  return key === undefined ? undefined : (writtenKeyName(key, true) ?? constKeyName(sourceCode, key, new Set()));
}

const CONSUMING_PARENTS = new Set([
  "BinaryExpression",
  "DoWhileStatement",
  "ExpressionStatement",
  "ForStatement",
  "IfStatement",
  "SwitchCase",
  "SwitchStatement",
  "UnaryExpression",
  "UpdateExpression",
  "WhileStatement",
]);

function consumesValue(carrier: ChildNode): boolean {
  const { parent } = carrier;
  return (
    CONSUMING_PARENTS.has(parent.type) ||
    (parent.type === "ConditionalExpression" && parent.test === carrier) ||
    (parent.type === "SequenceExpression" && parent.expressions.at(-1) !== carrier) ||
    (parent.type === "TemplateLiteral" && parent.parent.type !== "TaggedTemplateExpression")
  );
}

function flowOf(sourceCode: Source, carrier: ChildNode): DoorFlow {
  const { parent } = carrier;
  if (parent.type === "MemberExpression") {
    return parent.object === carrier ? { member: parent, name: memberKeyName(sourceCode, parent) } : {};
  }
  if (isReflectGet(sourceCode, parent, carrier)) {
    return { member: parent as TSESTree.CallExpression, name: reflectKeyName(sourceCode, parent as TSESTree.CallExpression) };
  }
  if (parent.type === "AssignmentExpression") {
    return parent.left === carrier ? {} : assignmentFlow(sourceCode, parent);
  }
  if (parent.type === "VariableDeclarator") {
    return declaratorFlow(sourceCode, parent);
  }
  if (parent.type === "AssignmentPattern" && parent.right === carrier) {
    return targetFlow(sourceCode, parent, parent.left, boundReads);
  }
  return inTypeQuery(carrier) || consumesValue(carrier) ? {} : { escape: parent };
}

function assignmentFlow(sourceCode: Source, assignment: TSESTree.AssignmentExpression): DoorFlow {
  return ALIAS_ASSIGNMENTS.has(assignment.operator) ? targetFlow(sourceCode, assignment, assignment.left, assignedReads) : {};
}

function targetFlow(
  sourceCode: Source,
  parent: TSESTree.Node,
  target: TSESTree.Node,
  readsOf: (sourceCode: Source, identifier: TSESTree.Identifier) => (TSESTree.Identifier | TSESTree.JSXIdentifier)[],
): DoorFlow {
  if (DESTRUCTURES.has(target.type)) {
    return { pattern: target };
  }
  return target.type === "Identifier" ? { aliases: readsOf(sourceCode, target) } : { escape: parent };
}

function declaratorFlow(sourceCode: Source, declarator: TSESTree.VariableDeclarator): DoorFlow {
  if (DESTRUCTURES.has(declarator.id.type)) {
    return { pattern: declarator.id };
  }
  if (declarator.parent.parent.type === "ExportNamedDeclaration") {
    return { escape: declarator };
  }
  return { aliases: declarator.id.type === "Identifier" ? aliasReads(sourceCode, declarator) : [] };
}

function judgeDoorUses(sourceCode: Source, start: ChildNode, judge: DoorJudge): void {
  const seen = new Set();
  const visit = (node: ChildNode): void => {
    if (seen.has(node)) {
      return;
    }
    seen.add(node);
    const flow = flowOf(sourceCode, valueCarrier(node));
    if (flow.member !== undefined) {
      judge.member(flow.member, flow.name);
    }
    if (flow.pattern !== undefined) {
      judge.pattern(flow.pattern);
    }
    if (flow.escape !== undefined) {
      judge.escape(flow.escape);
    }
    for (const alias of flow.aliases ?? []) {
      visit(alias);
    }
  };
  visit(start);
}

function reportOnce(context: OrbRuleContext, message: string) {
  const reported = new Set();
  return (node: TSESTree.Node): void => {
    if (!reported.has(node)) {
      reported.add(node);
      context.report({ node, message });
    }
  };
}

export const browserNoNodeGlobalsRule = (browserNodeGlobals: ReadonlySet<string | null | undefined>): OrbRule => ({
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const { sourceCode } = context;
    const report = reportOnce(context, "Browser source cannot use Node globals, including global-object members and aliases; use browser APIs.");
    const fromGlobal: DoorJudge = {
      member(member: TSESTree.MemberExpression | TSESTree.CallExpression, name: string | null | undefined): void {
        if (browserNodeGlobals.has(name)) {
          report(member);
        } else if (AMBIENT_ROOTS.has(name as string)) {
          judgeDoorUses(sourceCode, member, fromGlobal);
        }
      },
      pattern(pattern: TSESTree.Node): void {
        if ([...browserNodeGlobals].some((name) => patternNames(pattern, name as string)) || takesAmbientRoot(pattern)) {
          report(pattern);
        }
      },
      escape(): void {
        // Passing the browser global object alone does not name a Node capability.
      },
    };
    return {
      "Program:exit"(): void {
        for (const reference of ambientReferences(sourceCode, browserNodeGlobals)) {
          report(reference);
        }
        for (const root of ambientReferences(sourceCode, AMBIENT_ROOTS)) {
          judgeDoorUses(sourceCode, root, fromGlobal);
        }
      },
    };
  },
});

function moduleExportName(node: TSESTree.Identifier | TSESTree.StringLiteral): string {
  return node.type === "Identifier" ? node.name : node.value;
}

function httpClientDoors(source: string): Set<string> | undefined {
  return NODE_HTTP_CLIENT_DOORS.get(source.replace(/^node:/u, ""));
}

function namesFetch(specifier: TSESTree.ImportClause): boolean {
  return specifier.local.name === RAW_FETCH || (specifier.type === "ImportSpecifier" && moduleExportName(specifier.imported) === RAW_FETCH);
}

function egressImportDoors(node: TSESTree.ImportDeclaration): TSESTree.ImportClause[] | TSESTree.ImportDeclaration[] {
  const values = node.specifiers.filter((specifier) => specifier.type !== "ImportSpecifier" || specifier.importKind !== "type");
  if (RAW_EGRESS_PACKAGES.test(node.source.value)) {
    return node.specifiers.length === 0 || values.length > 0 ? [node] : [];
  }
  return values.filter(namesFetch);
}

function processImportBindings(node: TSESTree.ImportDeclaration): {
  env: TSESTree.ImportClause[];
  process: TSESTree.ImportClause[];
  namespace: TSESTree.ImportNamespaceSpecifier[];
} {
  const values = node.specifiers.filter((specifier) => specifier.type !== "ImportSpecifier" || specifier.importKind !== "type");
  const exportOf = (specifier: TSESTree.ImportClause): string => (specifier.type === "ImportSpecifier" ? moduleExportName(specifier.imported) : MODULE_DEFAULT);
  return {
    env: values.filter((specifier) => exportOf(specifier) === ENV_MEMBER),
    process: values.filter((specifier) => specifier.type !== "ImportNamespaceSpecifier" && exportOf(specifier) === MODULE_DEFAULT),
    namespace: values.filter((specifier) => specifier.type === "ImportNamespaceSpecifier"),
  };
}

function reExportsDoor(node: TSESTree.ExportNamedDeclaration | TSESTree.ExportAllDeclaration, doors: ReadonlySet<string | null | undefined>): boolean {
  if (node.exportKind === "type") {
    return false;
  }
  if (node.type === "ExportAllDeclaration") {
    return true;
  }
  return node.specifiers.some(
    ({ exportKind, local }) => exportKind !== "type" && (doors.has(moduleExportName(local)) || moduleExportName(local) === MODULE_DEFAULT),
  );
}

export const rawEgressRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const { sourceCode } = context;
    const report = reportOnce(context, RAW_EGRESS_MESSAGE);
    const fromGlobal: DoorJudge = {
      member: (member: TSESTree.MemberExpression | TSESTree.CallExpression, name: string | null | undefined) => {
        if (AMBIENT_ROOTS.has(name as string)) {
          judgeDoorUses(sourceCode, member, fromGlobal);
        } else if (name === undefined || (name === RAW_FETCH && !isTypeofOperand(member))) {
          report(member);
        }
      },
      pattern: (pattern: TSESTree.Node) => {
        if (patternTakes(pattern, RAW_FETCH) || takesAmbientRoot(pattern)) {
          report(pattern);
        }
      },
      escape: report,
    };
    return {
      "ImportDeclaration[importKind!='type']"(node: TSESTree.ImportDeclaration): void {
        for (const door of egressImportDoors(node)) {
          report(door);
        }
      },
      "ExportNamedDeclaration[source], ExportAllDeclaration"(
        node: (TSESTree.ExportNamedDeclaration | TSESTree.ExportAllDeclaration) & { source: TSESTree.StringLiteral },
      ): void {
        const forwardsPackage = RAW_EGRESS_PACKAGES.test(node.source.value);
        const forwardsFetch = node.type === "ExportNamedDeclaration" && node.specifiers.some(({ local }) => moduleExportName(local) === RAW_FETCH);
        if (node.exportKind !== "type" && (forwardsPackage || forwardsFetch)) {
          report(node);
        }
      },
      "ImportExpression[source]"(node: TSESTree.ImportExpression): void {
        if (RAW_EGRESS_PACKAGES.test(staticSource(node.source) ?? "")) {
          report(node);
        }
      },
      "Program:exit"(): void {
        for (const reference of ambientReferences(sourceCode, new Set([RAW_FETCH]))) {
          if (!isTypeofOperand(reference)) {
            report(reference);
          }
        }
        for (const root of ambientReferences(sourceCode, AMBIENT_ROOTS)) {
          judgeDoorUses(sourceCode, root, fromGlobal);
        }
        for (const read of reassignedFetchReads(sourceCode)) {
          report(read);
        }
      },
    };
  },
};

function reassignedFetchReads(sourceCode: Source): (TSESTree.Identifier | TSESTree.JSXIdentifier)[] {
  return sourceCode.scopeManager.scopes
    .flatMap(({ variables }) => variables)
    .filter((variable) => variable.name === RAW_FETCH && unknowablyReassigned(variable))
    .flatMap(({ references }) => references.filter((reference) => reference.isRead() && !isTypeofOperand(reference.identifier)))
    .map(({ identifier }) => identifier);
}

export const rawHttpClientRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const report = reportOnce(context, RAW_EGRESS_MESSAGE);
    return {
      "ImportDeclaration[importKind!='type']"(node: TSESTree.ImportDeclaration): void {
        const doors = httpClientDoors(node.source.value);
        const values = node.specifiers.filter((specifier) => specifier.type !== "ImportSpecifier" || specifier.importKind !== "type");
        for (const door of doors === undefined
          ? []
          : values.filter((specifier) => specifier.type !== "ImportSpecifier" || doors.has(moduleExportName(specifier.imported)))) {
          report(door);
        }
      },
      "ExportNamedDeclaration[source], ExportAllDeclaration"(
        node: (TSESTree.ExportNamedDeclaration | TSESTree.ExportAllDeclaration) & { source: TSESTree.StringLiteral },
      ): void {
        const doors = httpClientDoors(node.source.value);
        if (doors !== undefined && reExportsDoor(node, doors)) {
          report(node);
        }
      },
      "ImportExpression[source]"(node: TSESTree.ImportExpression): void {
        if (httpClientDoors(staticSource(node.source) ?? "") !== undefined) {
          report(node);
        }
      },
    };
  },
};

function destructureParts(
  target: TSESTree.Node,
  parts: { envKeys: TSESTree.Property[]; bound: TSESTree.Identifier[] } = { envKeys: [], bound: [] },
): { envKeys: TSESTree.Property[]; bound: TSESTree.Identifier[] } {
  if (target.type === "Identifier") {
    parts.bound.push(target);
  } else if (target.type === "Property" && writtenKeyName(target.key, target.computed) === ENV_MEMBER) {
    parts.envKeys.push(target);
  } else {
    let children: TSESTree.Node[];
    switch (target.type) {
      case "AssignmentPattern":
        children = [target.left];
        break;
      case "RestElement":
        children = [target.argument];
        break;
      case "ArrayPattern":
        children = target.elements.filter((element) => element !== null);
        break;
      case "ObjectPattern":
        children = target.properties;
        break;
      case "Property":
        children = [target.value];
        break;
      default:
        children = [];
    }
    for (const child of children) {
      destructureParts(child, parts);
    }
  }
  return parts;
}

function importedValueJudge(sourceCode: Source, report: (node: TSESTree.Node) => void): DoorJudge {
  const judge: DoorJudge = {
    member: (member: TSESTree.MemberExpression | TSESTree.CallExpression, name: string | null | undefined) => {
      if (name === ENV_MEMBER) {
        report(member);
      } else {
        judgeDoorUses(sourceCode, member, judge);
      }
    },
    pattern: (pattern: TSESTree.Node) => {
      const parts = destructureParts(pattern);
      for (const property of parts.envKeys) {
        report(property);
      }
      for (const target of parts.bound) {
        for (const { identifier } of referencedVariable(sourceCode, target)?.references ?? []) {
          if (identifier !== target) {
            judgeDoorUses(sourceCode, identifier, judge);
          }
        }
      }
    },
    // Exporting it onward is judged where it is read.
    escape: () => undefined,
  };
  return judge;
}

const PROCESS_EXPORT_DOORS = new Set([ENV_MEMBER]);

export const soleEnvReaderRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const { sourceCode } = context;
    const report = reportOnce(context, SOLE_ENV_MESSAGE);
    const fromImported = importedValueJudge(sourceCode, report);
    const fromProcess: DoorJudge = {
      member: (member: TSESTree.MemberExpression | TSESTree.CallExpression, name: string | null | undefined) => {
        if (name === undefined || name === ENV_MEMBER) {
          report(member);
        }
      },
      pattern: (pattern: TSESTree.Node) => {
        if (patternTakes(pattern, ENV_MEMBER)) {
          report(pattern);
        }
      },
      escape: report,
    };
    // `import * as proc from "node:process"`: `proc.env` is the bag and `proc.default` is the process.
    const fromNamespace: DoorJudge = {
      member: (member: TSESTree.MemberExpression | TSESTree.CallExpression, name: string | null | undefined) => {
        if (name === MODULE_DEFAULT) {
          judgeDoorUses(sourceCode, member, fromProcess);
        } else {
          fromProcess.member(member, name);
        }
      },
      pattern: (pattern: TSESTree.Node) => {
        if (patternTakes(pattern, ENV_MEMBER) || patternNames(pattern, MODULE_DEFAULT)) {
          report(pattern);
        }
      },
      escape: report,
    };
    // `globalThis.process` is the same object as the bare global; any other member may be a global another
    // module assigned, so it is judged like an imported value.
    const fromGlobal: DoorJudge = {
      member: (member: TSESTree.MemberExpression | TSESTree.CallExpression, name: string | null | undefined) => {
        if (name === PROCESS_GLOBAL) {
          judgeDoorUses(sourceCode, member, fromProcess);
        } else if (AMBIENT_ROOTS.has(name as string)) {
          judgeDoorUses(sourceCode, member, fromGlobal);
        } else {
          fromImported.member(member, name);
        }
      },
      pattern: (pattern: TSESTree.Node) => {
        if (patternTakes(pattern, PROCESS_GLOBAL) || takesAmbientRoot(pattern)) {
          report(pattern);
        }
      },
      escape: report,
    };
    return {
      "ImportDeclaration[importKind!='type']"(node: TSESTree.ImportDeclaration): void {
        if (!PROCESS_MODULE.test(node.source.value)) {
          const values = node.specifiers.filter((specifier) => specifier.type !== "ImportSpecifier" || specifier.importKind !== "type");
          for (const read of values.flatMap((specifier) => aliasReads(sourceCode, specifier))) {
            judgeDoorUses(sourceCode, read, fromImported);
          }
          return;
        }
        const bindings = processImportBindings(node);
        for (const specifier of bindings.env) {
          report(specifier);
        }
        for (const read of bindings.process.flatMap((specifier) => aliasReads(sourceCode, specifier))) {
          judgeDoorUses(sourceCode, read, fromProcess);
        }
        for (const read of bindings.namespace.flatMap((specifier) => aliasReads(sourceCode, specifier))) {
          judgeDoorUses(sourceCode, read, fromNamespace);
        }
      },
      "ExportNamedDeclaration[source], ExportAllDeclaration"(
        node: (TSESTree.ExportNamedDeclaration | TSESTree.ExportAllDeclaration) & { source: TSESTree.StringLiteral },
      ): void {
        if (PROCESS_MODULE.test(node.source.value) && reExportsDoor(node, PROCESS_EXPORT_DOORS)) {
          report(node);
        }
      },
      "ImportExpression[source]"(node: TSESTree.ImportExpression): void {
        if (PROCESS_MODULE.test(staticSource(node.source) ?? "")) {
          report(node);
        } else {
          judgeDoorUses(sourceCode, node, fromImported);
        }
      },
      // Fail closed on an `env` key taken off a value whose identity the rule cannot follow.
      "VariableDeclarator[id.type='ObjectPattern'][init], AssignmentExpression[left.type='ObjectPattern']"(
        node: (TSESTree.VariableDeclarator & { init: TSESTree.Expression }) | TSESTree.AssignmentExpression,
      ): void {
        const [pattern, source] = node.type === "VariableDeclarator" ? [node.id, node.init] : [node.left, node.right];
        if (patternNames(pattern, ENV_MEMBER) && unknowableValue(sourceCode, source)) {
          report(pattern);
        }
      },
      [`MemberExpression[property.name='${ENV_MEMBER}'], MemberExpression[property.value='${ENV_MEMBER}'], MemberExpression[property.type='TemplateLiteral'], MemberExpression[computed=true][property.type='Identifier']`](
        node: TSESTree.MemberExpression,
      ): void {
        if (memberKeyName(sourceCode, node) === ENV_MEMBER && unknowableValue(sourceCode, node.object)) {
          report(node);
        }
      },
      "Program:exit"(): void {
        for (const reference of ambientReferences(sourceCode, new Set([PROCESS_GLOBAL]))) {
          judgeDoorUses(sourceCode, reference, fromProcess);
        }
        for (const root of ambientReferences(sourceCode, AMBIENT_ROOTS)) {
          judgeDoorUses(sourceCode, root, fromGlobal);
        }
      },
    };
  },
};

export const sessionChannelBoundaryRule: OrbRule = {
  meta: { type: "problem", schema: [] },
  create(context: OrbRuleContext): RuleVisitor {
    const { sourceCode } = context;
    const report = reportOnce(context, SESSION_CHANNEL_MESSAGE);
    return {
      MemberExpression: (node: TSESTree.MemberExpression) => {
        const receiver = unwrapValue(node.object);
        if (
          receiver.type === "Identifier" &&
          AMBIENT_GLOBAL_RECEIVERS.has(receiver.name) &&
          isGlobalBinding(referencedVariable(sourceCode, receiver)) &&
          SESSION_CHANNEL_CONSTRUCTORS.has(memberKeyName(sourceCode, node) as string)
        ) {
          report(node);
        }
      },
      "Program:exit"(): void {
        for (const reference of ambientReferences(sourceCode, SESSION_CHANNEL_CONSTRUCTORS)) {
          report(reference);
        }
      },
    };
  },
};

interface DoorFlow {
  member?: TSESTree.MemberExpression | TSESTree.CallExpression;
  name?: string | null | undefined;
  pattern?: TSESTree.Node;
  escape?: TSESTree.Node;
  aliases?: (TSESTree.Identifier | TSESTree.JSXIdentifier)[];
}
interface DoorJudge {
  member: (node: TSESTree.MemberExpression | TSESTree.CallExpression, name: string | null | undefined) => void;
  pattern: (node: TSESTree.Node) => void;
  escape: (node: TSESTree.Node) => void;
}
