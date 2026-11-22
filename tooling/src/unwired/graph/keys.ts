// Keyed reads: `x[k]`, `T[K]`, `Pick<T, K>`, an arm selector's pattern, a lookup keyed by the enclosing function's
// parameter, and a published global's members read by name in script text.
//
// - `x[k]` reads each literal `k` can be: a literal, a conditional of literals, or a key the checker types as literals
//   (a template over a tuple's members, a loop variable over one). A key that is the enclosing function's parameter
//   reads the keys its callers pass (getSignatureUsage), through callers that hand their own parameter on; a caller
//   that passes a wide value, or a reference that is not a call, reads the table whole, as any other computed key does.
// - `T[K]`, `Pick`, `Omit`, `Extract` and `Exclude` name a member as a key, never as a data read.
// - Script text (`page.evaluate(\`window.__orb.nav.go()\`)`) reads each member on the chain in the string's world;
//   a computed key after the chain reads the last type whole.
import type { Node } from "@typescript/native/ast";
import {
  isArrowFunction,
  isCallExpression,
  isFunctionExpression,
  isIdentifier,
  isNewExpression,
  isParameterDeclaration,
  isVariableDeclaration,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol, Type } from "@typescript/native/sync";
import { SymbolFlags } from "@typescript/native/sync";
import { isFunctionLike } from "../native.ts";
import type { Flows } from "./flows.ts";
import { tracing } from "./options.ts";
import { answer } from "./resolve.ts";
import { sameNode } from "./roles.ts";
import type { FileSites, ScriptGlobalRead } from "./sites.ts";
import { keyLiterals } from "./sites.ts";
import type { GraphState } from "./state.ts";
import { isPrimitive, literalValues } from "./state.ts";

// A caller that hands its own parameter on is asked in turn, this many callers deep; deeper reads the table whole.
const PARAMETER_KEY_DEPTH = 4;

/** A table read through a key that is a function's parameter: resolved at the end of the build through the callers. */
interface ParameterKeyed {
  readonly table: Type;
  readonly fn: Node;
  readonly index: number;
  readonly file: string;
}

export class Keys {
  readonly #state: GraphState;
  readonly #parameterKeyed: ParameterKeyed[] = [];
  readonly #scriptReads: (ScriptGlobalRead & { readonly file: string })[] = [];
  readonly #memo = new Map<string, ReadonlySet<string> | "whole">();

  constructor(state: GraphState) {
    this.#state = state;
  }

  file(sites: FileSites): void {
    this.#elementKeys(sites);
    this.#typeKeys(sites);
    this.#state.roleAll(sites.armSelectorMembers, "key", sites.file, 0);
    this.#scriptReads.push(...sites.scriptGlobalReads.map((read) => ({ ...read, file: sites.file })));
  }

  #elementKeys(sites: FileSites): void {
    const state = this.#state;
    const receivers = state.world.typedAt(sites.elementKeys, ({ receiver }) => receiver);
    const named = receivers.flatMap(({ item: { keys }, type }) => (keys === null ? [] : keys.map((name) => ({ type, name }))));
    state.roleAll(state.slotMembers(named).flat(), "read", sites.file, 0);
    const computed = receivers.flatMap(({ item: site, type }) => (site.keys === null ? [{ ...site, type }] : []));
    const parameters = this.#parameterKeys(computed.map(({ argument }) => argument));
    const rest = computed.filter((site, y) => {
      const parameter = parameters[y];
      if (parameter !== undefined) {
        this.#parameterKeyed.push({ table: site.type, ...parameter, file: sites.file });
      }
      return parameter === undefined;
    });
    const keyTypes = state.world.typesAt(rest.map(({ argument }) => argument));
    const typedKeys = state.batch(keyTypes.map((type) => literalValues(type)));
    const typedNamed = rest.flatMap(({ type }, z) => (typedKeys[z] ?? []).map((name) => ({ type, name })));
    state.roleAll(state.slotMembers(typedNamed).flat(), "read", sites.file, 0);
    const whole = rest.filter(({ type }, z) => (typedKeys[z]?.length ?? 0) === 0 && !isPrimitive(type)).map(({ type }) => type);
    state.roleAll(state.memberDeclarations(whole).flat(), "read", sites.file, 0);
  }

  // For each key expression that is the enclosing function's own parameter, that function and the parameter's index.
  #parameterKeys(arguments_: readonly Node[]): readonly ({ readonly fn: Node; readonly index: number } | undefined)[] {
    const state = this.#state;
    const identifiers = arguments_.map((argument) => (isIdentifier(argument) ? argument : undefined));
    const symbols = state.world.symbolsAt(identifiers.flatMap((identifier) => (identifier === undefined ? [] : [identifier])));
    let at = 0;
    const handles = identifiers.map((identifier) =>
      identifier === undefined ? undefined : symbols[at++]?.declarations.find((handle) => handle.kind === SyntaxKind.Parameter),
    );
    const nodes = state.batch(handles.map((handle) => (handle === undefined ? answer(undefined) : handle.resolve.gen())));
    return nodes.map((node) =>
      node !== undefined && isParameterDeclaration(node) && isIdentifier(node.name) && isFunctionLike(node.parent)
        ? { fn: node.parent, index: parameterIndex(node.parent, node) }
        : undefined,
    );
  }

  #typeKeys(sites: FileSites): void {
    const state = this.#state;
    const objects = state.world.typedAt(sites.indexedKeys, ({ object }) => object);
    const named = objects.flatMap(({ item: { keys }, type }) => keys.map((name) => ({ type, name })));
    state.roleAll(state.slotMembers(named).flat(), "key", sites.file, 0);
    // a generic or union key reads T as a dispatch table, every member keyed
    const whole = objects.flatMap(({ item: { keys, index }, type }) =>
      keys.length === 0 && index.kind !== SyntaxKind.NumberKeyword && index.kind !== SyntaxKind.LiteralType && !isPrimitive(type) ? [type] : [],
    );
    state.roleAll(state.memberDeclarations(whole).flat(), "key", sites.file, 0);
    const picked = state.world.typedAt(sites.pickKeys, ({ target }) => target).flatMap(({ item: { keys }, type }) => keys.map((name) => ({ type, name })));
    state.roleAll(state.slotMembers(picked).flat(), "key", sites.file, 0);
  }

  /** Settle the parameter-keyed lookups and the script reads, once every file is walked. */
  finish(flows: Flows): void {
    const state = this.#state;
    for (const keyed of this.#parameterKeyed) {
      const keys = this.#keysOf(keyed.fn, keyed.index, 0);
      if (keys === "whole") {
        this.#traceWhole(keyed);
        state.count("parameter-keyed lookups read whole");
        state.roleAll(state.memberDeclarations([keyed.table]).flat(), "read", keyed.file, 0);
      } else {
        state.count("parameter-keyed lookups narrowed");
        state.roleAll(state.slotMembers([...keys].map((name) => ({ type: keyed.table, name }))).flat(), "read", keyed.file, 0);
      }
    }
    this.#scriptGlobals(flows);
  }

  // `--trace=param-key`: a lookup its callers could not narrow, at the function that keys it.
  #traceWhole(keyed: ParameterKeyed): void {
    const state = this.#state;
    const trace = tracing(state.session.options, "param-key");
    const source = keyed.fn.getSourceFile();
    const file = state.world.fileOfSource(source);
    if (trace === undefined || !(trace.file === null || file.startsWith(trace.file))) {
      return;
    }
    // An arrow or function expression is named by the variable that holds it.
    const holder = isVariableDeclaration(keyed.fn.parent) ? keyed.fn.parent : keyed.fn;
    const name = state.decls.get(state.resolver.keyOf(holder))?.name ?? "(anonymous)";
    const line = source.getLineAndCharacterOfPosition(keyed.fn.getStart(source)).line + 1;
    state.session.log(`trace param-key ${file}:${String(line)} ${name} reads parameter ${String(keyed.index)}'s table whole`);
  }

  // The keys a function's parameter takes across its callers.
  #keysOf(fn: Node, index: number, depth: number): ReadonlySet<string> | "whole" {
    const memo = `${this.#state.resolver.keyOf(fn)}:${String(index)}`;
    const known = this.#memo.get(memo);
    if (known !== undefined) {
      return known;
    }
    this.#memo.set(memo, "whole");
    if (depth > PARAMETER_KEY_DEPTH) {
      return "whole";
    }
    const keys = this.#callerKeys(fn, index, depth);
    this.#memo.set(memo, keys);
    return keys;
  }

  #callerKeys(fn: Node, index: number, depth: number): ReadonlySet<string> | "whole" {
    const state = this.#state;
    const declaration = (isArrowFunction(fn) || isFunctionExpression(fn)) && isVariableDeclaration(fn.parent) ? fn.parent : fn;
    const [usages = []] = state.batch([state.world.signatureUsage(declaration)]);
    const calls = state.batch(usages.map((usage) => (usage.call === undefined ? answer(undefined) : usage.call.resolve.gen())));
    if (calls.length === 0 || calls.some((call) => call === undefined)) {
      return "whole";
    }
    const keys = new Set<string>();
    for (const call of calls) {
      const argument = argumentAt(call, index);
      const found = argument === undefined ? "whole" : this.#argumentKeys(argument, depth);
      if (found === "whole") {
        return "whole";
      }
      for (const key of found) {
        keys.add(key);
      }
    }
    return keys;
  }

  #argumentKeys(argument: Node, depth: number): ReadonlySet<string> | "whole" {
    const state = this.#state;
    const literals = keyLiterals(argument);
    if (literals !== null) {
      return new Set(literals);
    }
    if (isIdentifier(argument)) {
      const [parameter] = this.#parameterKeys([argument]);
      if (parameter !== undefined) {
        return this.#keysOf(parameter.fn, parameter.index, depth + 1);
      }
    }
    const [typed] = state.batch([literalValues(state.world.typesAt([argument])[0])]);
    return typed === null || typed === undefined ? "whole" : new Set(typed);
  }

  #scriptGlobals(flows: Flows): void {
    const state = this.#state;
    const { checker } = state.world;
    const [anchor] = state.world.files;
    if (anchor === undefined || this.#scriptReads.length === 0) {
      return;
    }
    const names = [...new Set(this.#scriptReads.map(({ global }) => global))];
    const symbols = state.batch(names.map((name) => checker.resolveName.gen(name, SymbolFlags.Value, anchor, false)));
    const ours = names.flatMap((name, at) => {
      const symbol = symbols[at];
      return symbol?.declarations.some((handle) => state.resolver.ours(handle)) === true ? [{ name, symbol }] : [];
    });
    const types = state.slotTypes(state.batch(ours.map(({ symbol }) => checker.getTypeOfSymbol.gen(symbol))));
    const typeOf = new Map(ours.map(({ name }, at) => [name, types[at]]));
    for (const read of this.#scriptReads) {
      const end = this.#readChain(typeOf.get(read.global), read);
      if (end !== undefined && read.dynamic) {
        flows.deepMembers(end, true);
        state.roleAll(state.memberDeclarations([end]).flat(), "read", read.file, 0);
      }
    }
  }

  // Read each named member on a chain; the type the chain ends at, or undefined where it leaves the types.
  #readChain(start: Type | undefined, read: ScriptGlobalRead & { readonly file: string }): Type | undefined {
    const state = this.#state;
    let at = start;
    for (const step of read.chain) {
      if (at === undefined) {
        return undefined;
      }
      const [members = []] = state.batch([state.propsOnSlot(at, step)]);
      state.roleAll(state.declarations(members).flat(), "read", read.file, 0);
      at = this.#stepType(members[0]);
    }
    return at;
  }

  // A member's type, through a call to what the call returns (awaited), with undefined and null removed.
  #stepType(member: NativeSymbol | undefined): Type | undefined {
    const state = this.#state;
    const { checker } = state.world;
    if (member === undefined) {
      return undefined;
    }
    const [type] = state.batch([checker.getTypeOfSymbol.gen(member)]);
    if (type === undefined) {
      return undefined;
    }
    const [resolved] = state.batch([
      (function* (): APIRequestGenerator<Type | undefined> {
        const [signature] = yield* type.getCallSignatures.gen();
        if (signature === undefined) {
          return type;
        }
        const returned = yield* signature.getReturnType.gen();
        return (yield* checker.getAwaitedType.gen(returned)) ?? returned;
      })(),
    ]);
    return resolved === undefined ? undefined : state.slotTypes([resolved])[0];
  }
}

const argumentAt = (call: Node | undefined, index: number): Node | undefined =>
  call !== undefined && (isCallExpression(call) || isNewExpression(call)) ? call.arguments?.[index] : undefined;

function parameterIndex(fn: Node, parameter: Node): number {
  let found = -1;
  let at = 0;
  fn.forEachChild((child) => {
    if (isParameterDeclaration(child)) {
      if (sameNode(child, parameter)) {
        found = at;
      }
      at++;
    }
  });
  return found;
}
