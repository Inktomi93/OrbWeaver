// Keyed reads: `x[k]`, `T[K]`, `Pick<T, K>`, an arm selector's pattern, a lookup keyed by the enclosing function's
// parameter, a platform call or a `for…in` loop that reads every key of a value, and a published global's members read
// by name in script text.
//
// - `x[k]` reads each literal `k` can be: a literal, a conditional of literals, or a key the checker types as literals
//   (a template over a tuple's members, a loop variable over one). A key that is the enclosing function's parameter
//   reads the keys its callers pass (getSignatureUsage), through callers that hand their own parameter on; a caller
//   that passes a wide value, or a reference that is not a call, reads every literal the parameter's own type allows,
//   or the table whole for a wide parameter, as any other computed key does.
// - `T[K]`, `Pick`, `Omit`, `Extract` and `Exclude` name a member as a key, never as a data read.
// - Script text (`page.evaluate(\`window.__orb.nav.go()\`)`) reads each member on the chain in the string's world;
//   a computed key after the chain reads the last type whole. Each such read is a dev-bridge door read (analyse.ts).
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
import { SymbolFlags, TypeFlags } from "@typescript/native/sync";
import { hasFlag, isFunctionLike } from "../native.ts";
import type { Flows } from "./flows.ts";
import { tracing } from "./options.ts";
import { answer } from "./resolve.ts";
import { sameNode } from "./roles.ts";
import type { FileSites, ScriptGlobalRead } from "./sites.ts";
import { keyLiterals } from "./sites.ts";
import type { GraphState } from "./state.ts";
import { isPrimitive, literalValues } from "./state.ts";

/** A table read through a key that is a function's parameter: resolved at the end of the build through the callers. */
interface ParameterKeyed {
  readonly table: Type;
  readonly fn: Node;
  readonly index: number;
  readonly file: string;
  /** The position of the keyed read. */
  readonly at: number;
  /** The literals the key's own type allows, or null for a wide key: a lookup the callers cannot narrow reads only these. */
  readonly allowed: readonly string[] | null;
}

// A key typed as a symbol (`built[Symbol.asyncDispose]`) names the one member declared under that symbol, never every
// member of the table.
const symbolKey = (type: Type | undefined): boolean => type !== undefined && hasFlag(type.flags, TypeFlags.ESSymbolLike);
// The checker's name for a member declared under a unique symbol: `__@` and the symbol's name and id.
const symbolMemberName = (symbol: NativeSymbol): string => `__@${symbol.name}@${String(symbol.id)}`;

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
    this.#keyTests(sites);
    this.#typeKeys(sites);
    this.#reflectiveReads(sites);
    for (const { key, at } of sites.armSelectorMembers) {
      this.#state.role(key, "key", sites.file, at);
    }
    this.#scriptReads.push(...sites.scriptGlobalReads.map((read) => ({ ...read, file: sites.file })));
  }

  // A key test's literal, or each literal its key's type can be, touches that member of the tested value as a key use.
  #keyTests(sites: FileSites): void {
    const state = this.#state;
    const receivers = state.world.typedAt(sites.keyTests, ({ receiver }) => receiver);
    const computed = receivers.filter(({ item }) => item.keys === null);
    const typedKeys = state.batch(state.world.typesAt(computed.map(({ item }) => item.argument)).map((type) => literalValues(type)));
    const named = [
      ...receivers.flatMap(({ item: { keys, argument }, type }) => (keys ?? []).map((name) => ({ type, name, at: argument.pos }))),
      ...computed.flatMap(({ item: { argument }, type }, y) => (typedKeys[y] ?? []).map((name) => ({ type, name, at: argument.pos }))),
    ];
    state.roleNamed(named, "key", sites.file);
  }

  #elementKeys(sites: FileSites): void {
    const state = this.#state;
    const receivers = state.world.typedAt(sites.elementKeys, ({ receiver }) => receiver);
    const named = receivers.flatMap(({ item: { keys, receiver }, type }) => (keys === null ? [] : keys.map((name) => ({ type, name, at: receiver.pos }))));
    state.roleNamed(named, "read", sites.file);
    const computed = receivers.flatMap(({ item: site, type }) => (site.keys === null ? [{ ...site, type }] : []));
    const parameters = this.#parameterKeys(computed.map(({ argument }) => argument));
    const allKeyTypes = state.world.typesAt(computed.map(({ argument }) => argument));
    const allTypedKeys = state.batch(allKeyTypes.map((type) => literalValues(type)));
    const kept = computed.flatMap((site, y) => {
      const parameter = parameters[y];
      const keys = allTypedKeys[y] ?? null;
      if (parameter !== undefined) {
        this.#parameterKeyed.push({ table: site.type, ...parameter, file: sites.file, at: site.receiver.pos, allowed: keys?.length === 0 ? null : keys });
      }
      return parameter === undefined ? [{ site, keyType: allKeyTypes[y], keys }] : [];
    });
    const rest = kept.map(({ site }) => site);
    const keyTypes = kept.map(({ keyType }) => keyType);
    const typedKeys = kept.map(({ keys }) => keys);
    const typedNamed = rest.flatMap(({ type, receiver }, z) => (typedKeys[z] ?? []).map((name) => ({ type, name, at: receiver.pos })));
    state.roleNamed(typedNamed, "read", sites.file);
    const whole = rest
      .filter(({ type }, z) => (typedKeys[z]?.length ?? 0) === 0 && !isPrimitive(type) && !symbolKey(keyTypes[z]))
      .map(({ type, receiver }) => ({ type, at: receiver.pos }));
    state.roleWhole(whole, "read", sites.file);
    const symbolic = rest.flatMap(({ type, receiver }, z) => {
      const key = keyTypes[z];
      return key !== undefined && symbolKey(key) ? [{ type, key, at: receiver.pos }] : [];
    });
    const keySymbols = state.batch(symbolic.map(({ key }) => key.getSymbol.gen()));
    const tableMembers = state.batch(symbolic.map(({ type }) => state.membersOf(type)));
    for (const [y, { at }] of symbolic.entries()) {
      const symbol = keySymbols[y];
      const keyed = symbol === undefined ? [] : (tableMembers[y] ?? []).filter((member) => member.name === symbolMemberName(symbol));
      state.roleAll(state.declarations(keyed).flat(), "read", sites.file, at);
    }
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

  // `Object.entries(x)`, `structuredClone(x)`: the platform reads every member of the value; `Object.keys(x)` and
  // `for (k in x)` use each member's name. A callee the tree declares is our own function.
  #reflectiveReads(sites: FileSites): void {
    const state = this.#state;
    const callees = state.world.symbolsAt(sites.reflectiveReads.flatMap(({ callee }) => (callee === null ? [] : [callee])));
    let at = 0;
    const platform = sites.reflectiveReads.filter(({ callee }) => {
      if (callee === null) {
        return true;
      }
      const symbol = callees[at++];
      return symbol !== undefined && !symbol.declarations.some((handle) => state.resolver.ours(handle));
    });
    const values = state.world.typedAt(platform, ({ value }) => value);
    for (const role of ["read", "key"] as const) {
      const taken = values.filter(({ item }) => item.role === role);
      state.roleWhole(
        taken.map(({ item: { value }, type }) => ({ type, at: value.pos })),
        role,
        sites.file,
      );
    }
  }

  #typeKeys(sites: FileSites): void {
    const state = this.#state;
    const objects = state.world.typedAt(sites.indexedKeys, ({ object }) => object);
    const named = objects.flatMap(({ item: { keys, object }, type }) => keys.map((name) => ({ type, name, at: object.pos })));
    state.roleNamed(named, "key", sites.file);
    // a generic or union key reads T as a dispatch table, every member keyed
    const whole = objects.flatMap(({ item: { keys, index, object }, type }) =>
      keys.length === 0 && index.kind !== SyntaxKind.NumberKeyword && index.kind !== SyntaxKind.LiteralType && !isPrimitive(type)
        ? [{ type, at: object.pos }]
        : [],
    );
    state.roleWhole(whole, "key", sites.file);
    const picked = state.world
      .typedAt(sites.pickKeys, ({ target }) => target)
      .flatMap(({ item: { keys, target }, type }) => keys.map((name) => ({ type, name, at: target.pos })));
    state.roleNamed(picked, "key", sites.file);
  }

  /** Settle the parameter-keyed lookups and the script reads, once every file is walked. */
  finish(flows: Flows): void {
    const state = this.#state;
    for (const keyed of this.#parameterKeyed) {
      const keys = this.#keysOf(keyed.fn, keyed.index);
      // the callers narrow the key; failing that, the key's own literal type does
      const names = keys === "whole" ? keyed.allowed : [...keys];
      if (keys === "whole") {
        this.#traceUnnarrowed(keyed);
      }
      if (names === null) {
        state.count("parameter-keyed lookups read whole");
        state.roleWhole([{ type: keyed.table, at: keyed.at }], "read", keyed.file);
      } else {
        state.count("parameter-keyed lookups narrowed");
        state.roleNamed(
          names.map((name) => ({ type: keyed.table, name, at: keyed.at })),
          "read",
          keyed.file,
        );
      }
    }
    this.#scriptGlobals(flows);
  }

  // `--trace=param-key`: a lookup its callers could not narrow, at the function that keys it, with what it reads instead.
  #traceUnnarrowed(keyed: ParameterKeyed): void {
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
    const reads = keyed.allowed === null ? "its table whole" : `what its key type names: ${keyed.allowed.join(", ")}`;
    state.session.log(`trace param-key ${file}:${String(line)} ${name} keyed by parameter ${String(keyed.index)} reads ${reads}`);
  }

  // The keys a function's parameter takes across its callers.
  // The memo is the walk's seen-set: a function already asked answers what it found, and one still being asked (a cycle
  // of callers) answers "whole".
  #keysOf(fn: Node, index: number): ReadonlySet<string> | "whole" {
    const memo = `${this.#state.resolver.keyOf(fn)}:${String(index)}`;
    const known = this.#memo.get(memo);
    if (known !== undefined) {
      return known;
    }
    this.#memo.set(memo, "whole");
    const keys = this.#callerKeys(fn, index);
    this.#memo.set(memo, keys);
    return keys;
  }

  #callerKeys(fn: Node, index: number): ReadonlySet<string> | "whole" {
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
      const found = argument === undefined ? "whole" : this.#argumentKeys(argument);
      if (found === "whole") {
        return "whole";
      }
      for (const key of found) {
        keys.add(key);
      }
    }
    return keys;
  }

  #argumentKeys(argument: Node): ReadonlySet<string> | "whole" {
    const state = this.#state;
    const literals = keyLiterals(argument);
    if (literals !== null) {
      return new Set(literals);
    }
    if (isIdentifier(argument)) {
      const [parameter] = this.#parameterKeys([argument]);
      if (parameter !== undefined) {
        return this.#keysOf(parameter.fn, parameter.index);
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
        state.roleWhole([{ type: end, at: read.at }], "read", read.file);
        state.doorRead(state.memberDeclarations([end]).flat(), read.file);
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
      const stepped = state.declarations(members).flat();
      state.roleAll(stepped, "read", read.file, read.at);
      state.doorRead(stepped, read.file);
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
