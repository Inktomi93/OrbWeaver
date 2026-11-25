// Resolves a call to the SDK host member it invokes. The checker's resolved signature names the member, so
// `host.ui.register(x)`, `const { register } = host.ui; register(x)`, `host.ui["register"](x)` and an aliased
// `const add = host.ui.register` are one call, not four syntaxes the checks would each have to learn.
import ts from "typescript";

const HOST_INTERFACE = "PluginHostV1";
const UI_INTERFACE = "PluginUiV1";
// The scripted-UI realm proxies the admitted subset of host calls under `orb.ui(1).host`.
const UI_HOST_MEMBER = "host";
const PATH_SEPARATOR = ".";

/** One call to a member of the host object, named by its dotted path below it (`ui.register`). */
export interface HostCall {
  readonly path: string;
  readonly call: ts.CallExpression;
}

export function propertyName(node: ts.PropertyName): string | undefined {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : undefined;
}

// The SDK declares host functions as `name: (args) => result` properties, so the signature's declaration is
// the function type node and its parent is the member.
function sdkMember(declaration: ts.Node | undefined): ts.PropertySignature | undefined {
  return declaration !== undefined && ts.isFunctionTypeNode(declaration) && ts.isPropertySignature(declaration.parent) ? declaration.parent : undefined;
}

// Walk member -> enclosing type literal -> its property, up to the interface that owns the whole host object.
function memberPath(member: ts.PropertySignature): { readonly owner: string; readonly names: readonly string[] } | undefined {
  const names: string[] = [];
  let current: ts.Node = member;
  while (ts.isPropertySignature(current)) {
    const name = propertyName(current.name);
    if (name === undefined) {
      return;
    }
    names.unshift(name);
    const container: ts.Node = current.parent;
    if (ts.isInterfaceDeclaration(container)) {
      return { owner: container.name.text, names };
    }
    current = container.parent;
  }
  return undefined;
}

function hostCall(checker: ts.TypeChecker, node: ts.Node): HostCall | undefined {
  if (!ts.isCallExpression(node)) {
    return;
  }
  const member = sdkMember(checker.getResolvedSignature(node)?.declaration);
  const located = member === undefined ? undefined : memberPath(member);
  if (located === undefined) {
    return;
  }
  if (located.owner === HOST_INTERFACE) {
    return { path: located.names.join(PATH_SEPARATOR), call: node };
  }
  const [first, ...rest] = located.names;
  return located.owner === UI_INTERFACE && first === UI_HOST_MEMBER ? { path: rest.join(PATH_SEPARATOR), call: node } : undefined;
}

/** Every call in `source` that invokes a host member. */
export function collectHostCalls(checker: ts.TypeChecker, source: ts.SourceFile): readonly HostCall[] {
  const calls: HostCall[] = [];
  const visit = (node: ts.Node): void => {
    const found = hostCall(checker, node);
    if (found !== undefined) {
      calls.push(found);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return calls;
}
