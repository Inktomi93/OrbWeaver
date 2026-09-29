// Links a main source's `host.ui` surface references across calls. A type links values inside one call; these
// checks read the literal ids and bindings the checker inferred and link them across separate statements.
// A reference the checker cannot resolve to literals is open and is never reported.
import ts from "typescript";

/** The `host.ui` member that owns a checked call. */
type LinkedUiMethod = "register" | "setState" | "openDialog";

const LINKED_UI_METHODS: ReadonlySet<string> = new Set<LinkedUiMethod>(["register", "setState", "openDialog"]);
const HOST_INTERFACE = "PluginHostV1";
const UI_NAMESPACE = "ui";
const DIALOG_ANCHOR = "dialog";
const STATIC_TIER = "static";
// A tool-card spec binds the tool call record, not state published through `setState`.
const TOOL_CARD_ANCHOR = "tool-card";
const STATE_PATH_SEPARATOR = ".";
// The only kinds known to hold no nested path. Every other kind the checker cannot enumerate stays open.
const CLOSED_LEAF_FLAGS: readonly ts.TypeFlags[] = [
  ts.TypeFlags.StringLike,
  ts.TypeFlags.NumberLike,
  ts.TypeFlags.BigIntLike,
  ts.TypeFlags.BooleanLike,
  ts.TypeFlags.ESSymbolLike,
  ts.TypeFlags.VoidLike,
  ts.TypeFlags.Null,
  ts.TypeFlags.Never,
];

/** A problem located at one node of the checked source. */
export interface SurfaceLinkProblem {
  readonly node: ts.Node;
  readonly message: string;
}

interface RegisteredSurface {
  readonly ids: readonly string[];
  readonly anchors: readonly string[] | undefined;
  readonly tiers: readonly string[] | undefined;
  readonly spec: ts.Type | undefined;
}

interface StatePublication {
  readonly ids: readonly string[];
  readonly state: ts.Type | undefined;
}

interface StateBinding {
  readonly path: string;
  readonly node: ts.Node;
}

interface LinkedCall {
  readonly method: LinkedUiMethod;
  readonly call: ts.CallExpression;
}

function isLinkedUiMethod(name: string): name is LinkedUiMethod {
  return LINKED_UI_METHODS.has(name);
}

function propertyName(node: ts.PropertyName): string | undefined {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : undefined;
}

function hasTypeFlag(type: ts.Type, flag: ts.TypeFlags): boolean {
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript TypeFlags is a compiler-owned bitfield.
  return (type.flags & flag) !== 0;
}

/** A property signature of the SDK's `PluginHostV1["ui"]` type literal, resolved through the checker so an
 *  aliased `const ui = host.ui` still links while an unrelated `setState` does not. */
function isHostUiMember(declaration: ts.Declaration | undefined): boolean {
  const literal = declaration?.parent;
  if (!(literal !== undefined && ts.isTypeLiteralNode(literal) && ts.isPropertySignature(literal.parent))) {
    return false;
  }
  const uiProperty = literal.parent;
  return propertyName(uiProperty.name) === UI_NAMESPACE && ts.isInterfaceDeclaration(uiProperty.parent) && uiProperty.parent.name.text === HOST_INTERFACE;
}

function linkedCall(checker: ts.TypeChecker, node: ts.Node): LinkedCall | undefined {
  if (!(ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression))) {
    return;
  }
  const method = node.expression.name.text;
  const linked = isLinkedUiMethod(method) && isHostUiMember(checker.getSymbolAtLocation(node.expression.name)?.declarations?.[0]);
  return linked ? { method, call: node } : undefined;
}

/** The string literals a type can hold, or `undefined` when any member is wider than a literal. */
function literalStrings(type: ts.Type): readonly string[] | undefined {
  const members = type.isUnion() ? type.types : [type];
  const literals: string[] = [];
  for (const member of members) {
    if (!member.isStringLiteral()) {
      return;
    }
    literals.push(member.value);
  }
  return literals;
}

// An inline initializer keeps its literal type; the object literal's own property type may be widened.
function propertyType(checker: ts.TypeChecker, argument: ts.Expression, name: string): ts.Type | undefined {
  if (ts.isObjectLiteralExpression(argument)) {
    const property = argument.properties.find((candidate) => candidate.name !== undefined && propertyName(candidate.name) === name);
    if (property !== undefined && ts.isPropertyAssignment(property)) {
      return checker.getTypeAtLocation(property.initializer);
    }
    return property === undefined ? undefined : checker.getTypeAtLocation(property);
  }
  const symbol = checker.getTypeAtLocation(argument).getProperty(name);
  return symbol === undefined ? undefined : checker.getTypeOfSymbolAtLocation(symbol, argument);
}

function literalProperty(checker: ts.TypeChecker, argument: ts.Expression, name: string): readonly string[] | undefined {
  const type = propertyType(checker, argument, name);
  return type === undefined ? undefined : literalStrings(type);
}

// The types one spec node contains: union members, array elements, or object property values.
function nestedTypes(checker: ts.TypeChecker, type: ts.Type): readonly ts.Type[] {
  if (type.isUnion()) {
    return type.types;
  }
  if (!hasTypeFlag(type, ts.TypeFlags.Object)) {
    return [];
  }
  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    return checker.getTypeArguments(type as ts.TypeReference);
  }
  return checker.getPropertiesOfType(type).map((property) => checker.getTypeOfSymbol(property));
}

/** Every `{ $state }` path a spec type declares, or `undefined` when one binding is not a literal path. */
function stateBindings(checker: ts.TypeChecker, spec: ts.Type): readonly StateBinding[] | undefined {
  const bindings: StateBinding[] = [];
  const seen = new Set<ts.Type>();
  const pending = [spec];
  for (let type = pending.pop(); type !== undefined; type = pending.pop()) {
    if (seen.has(type)) {
      continue;
    }
    seen.add(type);
    const binding = type.isUnion() ? undefined : type.getProperty("$state");
    if (binding === undefined) {
      pending.push(...nestedTypes(checker, type));
      continue;
    }
    const paths = literalStrings(checker.getTypeOfSymbol(binding));
    const node = binding.valueDeclaration;
    if (paths === undefined || node === undefined) {
      return;
    }
    bindings.push(...paths.map((path) => ({ path, node })));
  }
  return bindings;
}

/** Whether published state of `type` can hold `segments`. A type the checker cannot enumerate is open. */
function statePathResolves(checker: ts.TypeChecker, type: ts.Type, segments: readonly string[]): boolean {
  const [segment, ...rest] = segments;
  if (segment === undefined) {
    return true;
  }
  const value = checker.getNonNullableType(type);
  if (value.isUnionOrIntersection()) {
    return value.types.some((member) => statePathResolves(checker, member, segments));
  }
  if (hasTypeFlag(value, ts.TypeFlags.InstantiableNonPrimitive)) {
    // A type parameter, indexed access, conditional or substitution type holds what its constraint holds.
    const constraint = checker.getBaseConstraintOfType(value);
    return constraint === undefined || constraint === value || statePathResolves(checker, constraint, segments);
  }
  if (CLOSED_LEAF_FLAGS.some((flag) => hasTypeFlag(value, flag))) {
    return false;
  }
  if (!hasTypeFlag(value, ts.TypeFlags.Object) || checker.isArrayType(value) || checker.isTupleType(value) || value.getStringIndexType() !== undefined) {
    return true;
  }
  const property = value.getProperty(segment);
  return property !== undefined && statePathResolves(checker, checker.getTypeOfSymbol(property), rest);
}

function collectCalls(checker: ts.TypeChecker, source: ts.SourceFile): readonly LinkedCall[] {
  const calls: LinkedCall[] = [];
  const visit = (node: ts.Node): void => {
    const linked = linkedCall(checker, node);
    if (linked !== undefined) {
      calls.push(linked);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}

function registeredSurface(checker: ts.TypeChecker, argument: ts.Expression): RegisteredSurface | undefined {
  const ids = literalProperty(checker, argument, "id");
  if (ids === undefined) {
    return;
  }
  return {
    ids,
    anchors: literalProperty(checker, argument, "anchor"),
    tiers: literalProperty(checker, argument, "tier"),
    spec: propertyType(checker, argument, "spec"),
  };
}

function missingSurfaceProblems(calls: readonly LinkedCall[], checker: ts.TypeChecker, surfaces: readonly RegisteredSurface[]): readonly SurfaceLinkProblem[] {
  const problems: SurfaceLinkProblem[] = [];
  const registered = new Map(surfaces.flatMap((surface) => surface.ids.map((id) => [id, surface] as const)));
  for (const { method, call } of calls) {
    const target = call.arguments[0];
    const ids = method === "register" || target === undefined ? undefined : literalStrings(checker.getTypeAtLocation(target));
    for (const id of ids ?? []) {
      const surface = registered.get(id);
      if (surface === undefined) {
        problems.push({ node: call, message: `${method} names surface "${id}", which this plugin never registers with ui.register` });
      } else if (method === "openDialog" && surface.anchors !== undefined && !surface.anchors.includes(DIALOG_ANCHOR)) {
        problems.push({
          node: call,
          message: `openDialog names surface "${id}", which is registered at the ${surface.anchors.join(" or ")} anchor, not ${DIALOG_ANCHOR}`,
        });
      }
    }
  }
  return problems;
}

function publications(checker: ts.TypeChecker, calls: readonly LinkedCall[]): readonly StatePublication[] | undefined {
  const published: StatePublication[] = [];
  for (const { method, call } of calls) {
    const [target, state] = call.arguments;
    if (method !== "setState" || target === undefined) {
      continue;
    }
    const ids = literalStrings(checker.getTypeAtLocation(target));
    if (ids === undefined) {
      return;
    }
    published.push({ ids, state: state === undefined ? undefined : checker.getTypeAtLocation(state) });
  }
  return published;
}

function unpublishedBindingProblems(
  checker: ts.TypeChecker,
  surfaces: readonly RegisteredSurface[],
  published: readonly StatePublication[],
): readonly SurfaceLinkProblem[] {
  const problems: SurfaceLinkProblem[] = [];
  for (const surface of surfaces) {
    const [id, ...aliases] = surface.ids;
    const readsPublishedState =
      surface.tiers?.length === 1 && surface.tiers[0] === STATIC_TIER && surface.anchors !== undefined && !surface.anchors.includes(TOOL_CARD_ANCHOR);
    if (id === undefined || aliases.length > 0 || !readsPublishedState || surface.spec === undefined) {
      continue;
    }
    const bindings = stateBindings(checker, surface.spec) ?? [];
    const states = published.filter((publication) => publication.ids.includes(id)).map((publication) => publication.state);
    for (const binding of bindings) {
      const segments = binding.path.split(STATE_PATH_SEPARATOR);
      if (!states.some((state) => state === undefined || statePathResolves(checker, state, segments))) {
        problems.push({
          node: binding.node,
          message:
            states.length === 0
              ? `surface "${id}" binds $state "${binding.path}", but no ui.setState call publishes state for it`
              : `surface "${id}" binds $state "${binding.path}", which no ui.setState call for it publishes`,
        });
      }
    }
  }
  return problems;
}

/** Report `setState` and `openDialog` targets that name no registered surface, and static-spec `$state`
 *  paths that no `setState` for that surface can publish. */
export function surfaceLinkProblems(checker: ts.TypeChecker, source: ts.SourceFile): readonly SurfaceLinkProblem[] {
  const calls = collectCalls(checker, source);
  const surfaces: RegisteredSurface[] = [];
  for (const { method, call } of calls) {
    const [argument] = call.arguments;
    if (method !== "register" || argument === undefined) {
      continue;
    }
    const surface = registeredSurface(checker, argument);
    if (surface === undefined) {
      return [];
    }
    surfaces.push(surface);
  }
  const published = publications(checker, calls);
  return [...missingSurfaceProblems(calls, checker, surfaces), ...(published === undefined ? [] : unpublishedBindingProblems(checker, surfaces, published))];
}
