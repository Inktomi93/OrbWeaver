// The slot a branded value is handed to, named the way a reader finds it, and how close that slot sits to a wire.
import type { Node } from "@typescript/native/ast";
import {
  isBinaryExpression,
  isCallExpression,
  isJsxAttribute,
  isNewExpression,
  isObjectLiteralExpression,
  isPropertyAssignment,
  isShorthandPropertyAssignment,
  isVariableDeclaration,
} from "@typescript/native/ast";
import type { APIRequestGenerator, NodeHandle } from "@typescript/native/sync";
import { all } from "@typescript/native/sync";
import type { NativeWorld } from "../unwired/index.ts";
import { propertiesNamed } from "../unwired/index.ts";
import type { DeclInfo } from "./decl.ts";
import { calleeInfo, declInfo, NO_DECL, siteKey, symbolInfo } from "./decl.ts";
import { declaredAs } from "./declared.ts";
import type { Handed, StateDeclaration } from "./syntax.ts";
import { calleeName, enclosingFunction, nameOf, ownerOf, rootNames } from "./syntax.ts";
import type { Layer, Slot, SlotKind } from "./types.ts";

const TEXT_WIDTH = 72;
const KEYED_LIBRARY: ReadonlySet<string> = new Set(["Map", "ReadonlyMap", "Set", "ReadonlySet", "WeakMap", "WeakSet"]);
// A shape declared in a contract, in any module's `contract/` directory, or in the transport layer that parses one off the wire.
const WIRE_FILE = /^packages\/(?:contracts\/|server\/src\/transport\/|[^/]+\/src\/(?:[^/]+\/)*contract\/)/u;
// A port is named for what it is: a `*Port` or `*Ports` type, or a file under a `ports` directory.
const PORT_FILE = /(?:^|\/)ports?(?:\/|\.ts$)|-port\.ts$/u;
const PORT_OWNER = /Ports?$/u;

/** The `useState` pairs of a world, so a call into a setter lands on its state. */
export interface StateIndex {
  /** A setter's declaration site, to the state's. */
  readonly setters: ReadonlyMap<string, string>;
  /** A `useState` call, to its declaration. */
  readonly calls: ReadonlyMap<Node, StateDeclaration>;
}

export function stateIndex(world: NativeWorld, states: readonly StateDeclaration[]): StateIndex {
  const setters = new Map<string, string>();
  for (const { setter, state } of states) {
    if (setter !== undefined) {
      setters.set(siteKey(world, setter), siteKey(world, state));
    }
  }
  return { setters, calls: new Map(states.map((state) => [state.call, state])) };
}

function* slotFrom(world: NativeWorld, kind: SlotKind, name: string, info: DeclInfo): APIRequestGenerator<Slot> {
  return { kind, name, owner: info.owner, declSite: info.site, declFile: info.file, lib: info.lib, declared: yield* declaredAs(world, info) };
}

// A state the developer declared as a string: the slot is plain by its own hook.
const stateSlot = (name: string, declSite: string): Slot => ({ kind: "state", name, owner: null, declSite, declFile: null, lib: false, declared: "plain" });

function* argumentSlot(world: NativeWorld, handed: Handed, states: StateIndex): APIRequestGenerator<Slot> {
  const { container, index } = handed;
  const name = (calleeName(container) ?? container.getText()).slice(0, TEXT_WIDTH);
  const use = states.calls.get(container);
  if (use !== undefined) {
    return stateSlot(`useState<string> ${use.state.getText()}`, siteKey(world, use.state));
  }
  const signature = yield* world.checker.getResolvedSignature.gen(container);
  const parameters = yield* signature.getParameters.gen();
  const parameter = parameters[Math.min(index, parameters.length - 1)];
  const callee = isCallExpression(container) || isNewExpression(container) ? container.expression : undefined;
  const [info, called, owner] = yield* all(
    declInfo(world, parameter),
    calleeInfo(world, callee === undefined ? undefined : rootNames(callee)[0]),
    declarationOwner(signature.declaration),
  );
  const state = called.site === null ? undefined : states.setters.get(called.site);
  if (state !== undefined) {
    return stateSlot(`${name} (useState<string> setter)`, state);
  }
  const keyed = info.lib && KEYED_LIBRARY.has(owner ?? "");
  return yield* slotFrom(world, keyed ? "collection-key" : "argument", `${name}(${parameter?.name ?? index})`, { ...info, owner: info.owner ?? owner });
}

// The interface a library method is declared in: `Map` for `Map.get`.
function* declarationOwner(handle: NodeHandle | undefined): APIRequestGenerator<string | null> {
  const node = handle === undefined ? undefined : yield* handle.resolve.gen();
  return node === undefined ? null : ownerOf(node);
}

// A returned value lands in the function's own return type; a function the developer wrote is a plain slot.
function returnSlot(world: NativeWorld, handed: Handed): Slot {
  const named = enclosingFunction(handed.container)?.name;
  return {
    kind: "return",
    name: `${named === undefined ? "(anonymous)" : named.getText()}() return`,
    owner: null,
    declSite: named === undefined ? null : siteKey(world, named),
    declFile: named === undefined ? null : world.siteOf(named).file,
    lib: false,
    declared: "plain",
  };
}

function* propertySlot(world: NativeWorld, { container }: Handed): APIRequestGenerator<Slot> {
  const key = isPropertyAssignment(container) || isShorthandPropertyAssignment(container) ? container.name.getText() : "";
  const literal = container.parent;
  const contextual = isObjectLiteralExpression(literal) ? yield* world.checker.getContextualType.gen(literal) : undefined;
  const [property] = contextual === undefined ? [] : yield* propertiesNamed(world.checker, contextual, key);
  const info = yield* declInfo(world, property);
  return yield* slotFrom(world, "property", `${info.owner ?? "{…}"}.${key}`, info);
}

function* jsxSlot(world: NativeWorld, { container }: Handed): APIRequestGenerator<Slot> {
  const attribute = isJsxAttribute(container) ? container : undefined;
  const tag = (attribute?.parent.parent as (Node & { readonly tagName?: Node }) | undefined)?.tagName?.getText() ?? "?";
  const info = attribute === undefined ? NO_DECL : yield* symbolInfo(world, attribute.name);
  return yield* slotFrom(world, "jsx-prop", `<${tag} ${attribute?.name.getText() ?? "?"}>`, info);
}

// A named variable or assigned target: the declaration the name resolves to.
function* targetSlot(world: NativeWorld, { container }: Handed): APIRequestGenerator<Slot> {
  const declaration = isVariableDeclaration(container) ? container : undefined;
  const left = isBinaryExpression(container) ? container.left : undefined;
  const info =
    declaration === undefined ? yield* calleeInfo(world, left === undefined ? undefined : rootNames(left)[0]) : yield* symbolInfo(world, nameOf(declaration));
  const name = declaration?.name.getText() ?? left?.getText() ?? "?";
  return yield* slotFrom(world, "variable", name.slice(0, TEXT_WIDTH), info);
}

/** The slot a handed value lands in. */
export function* slotOf(world: NativeWorld, handed: Handed, states: StateIndex): APIRequestGenerator<Slot> {
  switch (handed.kind) {
    case "argument":
      return yield* argumentSlot(world, handed, states);
    case "return":
      return returnSlot(world, handed);
    case "property":
      return yield* propertySlot(world, handed);
    case "jsx-prop":
      return yield* jsxSlot(world, handed);
    case "assign":
    case "variable":
      return yield* targetSlot(world, handed);
    case "element":
      return yield* slotFrom(world, "element", "[…] element", NO_DECL);
  }
}

/** How close a slot sits to a wire or a port, judged from its own declaration. A brand-schema slot and a slot with no
 *  readable declaration are named for what they are and never counted as a layer's defect. */
export function layerOf(slot: Slot, file: string): Layer {
  if (slot.kind === "state") {
    return "client-state";
  }
  if (slot.lib) {
    return "library";
  }
  if (slot.declared === "brand-schema") {
    return "schema-input";
  }
  if (slot.declared === "unknown") {
    return "unknown";
  }
  if (PORT_FILE.test(slot.declFile ?? "") || PORT_OWNER.test(slot.owner ?? "")) {
    return "port";
  }
  if (WIRE_FILE.test(slot.declFile ?? "")) {
    return "contract";
  }
  const clientState = slot.declFile?.startsWith("packages/client/src/state/") === true || (file.startsWith("packages/client/") && slot.kind === "variable");
  return clientState ? "client-state" : "local";
}
