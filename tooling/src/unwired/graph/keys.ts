// Keyed reads: `x[k]`, `T[K]`, `Pick<T, K>`, an arm selector's pattern, a lookup keyed by the enclosing function's
// parameter, a platform call or a `for…in` loop that reads every key of a value, and a published global's members read
// by name in script text.
//
// - `x[k]` takes the roles its position gives (roles.ts accessRoles: a store, a bump, a delete or a read) on each literal
//   `k` can be: a literal, a conditional of literals, or a key the checker types as literals (a template over a tuple's
//   members, a loop variable over one). A key that is the enclosing function's parameter names the keys its callers pass
//   (getSignatureUsage), through callers that hand their own parameter on; a caller that passes a wide value, or a
//   reference that is not a call, names every literal the parameter's own type allows, or the table whole for a wide
//   parameter, as any other computed key does.
// - A `keyof T` list asserted to a mutable string list (`fields as string[]`) needs T's constraint to keep a key, so the
//   member of a one-member constraint is a key use. A plain keyof use, another target, or a constraint with more
//   members, names none.
// - `T[K]`, `Pick`, `Omit`, `Extract` and `Exclude` name a member as a key, never as a data read.
// - A MiniSearch field option (library-names.ts MINISEARCH_FIELDS) reads each document member it names: MiniSearch
//   indexes, stores or keys by it. A literal in the option names a member of the index's document type. A key list our
//   own generic hands on from a parameter (`fields: args.fields as string[]`) names, at each caller that ends the
//   hand-off, the literals the caller's value holds at that path, on the type argument the path's `keyof T` binds. A
//   caller the walk cannot narrow reads nothing. A literal option of a generic index (`idField: "id"` on
//   `MiniSearch<T>`) names a member of each type the same index's handed key lists resolved to.
// - Script text (`page.evaluate(\`window.__orb.nav.go()\`)`) reads each member on the chain in the string's world;
//   a computed key after the chain reads the last type whole. Each such read is a dev-bridge door read (analyse.ts).
import type { Expression, Node, TypeNode } from "@typescript/native/ast";
import {
  isArrayLiteralExpression,
  isArrayTypeNode,
  isArrowFunction,
  isAsExpression,
  isBindingElement,
  isCallExpression,
  isExpression,
  isFunctionExpression,
  isIdentifier,
  isInterfaceDeclaration,
  isIntersectionTypeNode,
  isNewExpression,
  isNoSubstitutionTemplateLiteral,
  isObjectBindingPattern,
  isObjectLiteralExpression,
  isParameterDeclaration,
  isParenthesizedExpression,
  isParenthesizedTypeNode,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isPropertySignatureDeclaration,
  isSatisfiesExpression,
  isShorthandPropertyAssignment,
  isStringLiteral,
  isTemplateExpression,
  isTypeOperatorNode,
  isTypeReferenceNode,
  isUnionTypeNode,
  isVariableDeclaration,
  SyntaxKind,
} from "@typescript/native/ast";
import type { APIRequestGenerator, Symbol as NativeSymbol, Type } from "@typescript/native/sync";
import { SymbolFlags, TypeFlags } from "@typescript/native/sync";
import { formPath } from "../key-resolver.ts";
import { hasFlag, isFunctionLike } from "../native.ts";
import type { Flows } from "./flows.ts";
import { FORM_NAME, libraryNames, MINISEARCH_FIELDS, MINISEARCH_PACKAGE } from "./library-names.ts";
import { tracing } from "./options.ts";
import { answer, constituentsOf, symbolMemberName } from "./resolve.ts";
import type { Role } from "./roles.ts";
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
  /** What the access does to each member its key names: its position's roles. */
  readonly roles: readonly Role[];
}

// Each ask once per role of the access it came from.
const byRole = <T extends { readonly roles: readonly Role[] }>(asks: readonly T[]): readonly (readonly [Role, readonly T[]])[] =>
  [
    ...Map.groupBy(
      asks.flatMap((ask) => ask.roles.map((role) => ({ role, ask }))),
      ({ role }) => role,
    ),
  ].map(([role, entries]) => [role, entries.map(({ ask }) => ask)]);

// A key typed as a symbol (`built[Symbol.asyncDispose]`) names the one member declared under that symbol, never every
// member of the table.
const symbolKey = (type: Type | undefined): boolean => type !== undefined && hasFlag(type.flags, TypeFlags.ESSymbolLike);

export class Keys {
  readonly #state: GraphState;
  readonly #parameterKeyed: ParameterKeyed[] = [];
  readonly #scriptReads: (ScriptGlobalRead & { readonly file: string })[] = [];
  readonly #memo = new Map<string, ReadonlySet<string> | "whole">();

  constructor(state: GraphState) {
    this.#state = state;
  }

  file(sites: FileSites, flows: Flows): void {
    this.#elementKeys(sites);
    this.#sinkReads(sites, flows);
    this.#formPaths(sites);
    this.#keyTests(sites);
    this.#typeKeys(sites);
    this.#reflectiveReads(sites);
    this.#keyofAssertions(sites);
    this.#fieldOptions(sites);
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

  // `x[k]` takes its position's roles (roles.ts accessRoles) for each member its key names: a literal it can be, a literal
  // the checker types it as, the table whole for a wide key, or the one member a symbol key names.
  #elementKeys(sites: FileSites): void {
    const state = this.#state;
    const receivers = state.world.typedAt(sites.elementKeys, ({ receiver }) => receiver);
    const named = receivers.flatMap(({ item: { keys, receiver, roles }, type }) =>
      keys === null ? [] : keys.map((name) => ({ type, name, at: receiver.pos, roles })),
    );
    const computed = receivers.flatMap(({ item: site, type }) => (site.keys === null ? [{ ...site, type }] : []));
    const parameters = this.#parameterKeys(computed.map(({ argument }) => argument));
    const allKeyTypes = state.world.typesAt(computed.map(({ argument }) => argument));
    const allTypedKeys = state.batch(allKeyTypes.map((type) => literalValues(type)));
    const kept = computed.flatMap((site, y) => {
      const parameter = parameters[y];
      const keys = allTypedKeys[y] ?? null;
      if (parameter !== undefined) {
        this.#parameterKeyed.push({
          table: site.type,
          ...parameter,
          file: sites.file,
          at: site.receiver.pos,
          allowed: keys?.length === 0 ? null : keys,
          roles: site.roles,
        });
      }
      return parameter === undefined ? [{ site, keyType: allKeyTypes[y], keys }] : [];
    });
    const rest = kept.map(({ site }) => site);
    const keyTypes = kept.map(({ keyType }) => keyType);
    const typedKeys = kept.map(({ keys }) => keys);
    const typedNamed = rest.flatMap(({ type, receiver, roles }, z) => (typedKeys[z] ?? []).map((name) => ({ type, name, at: receiver.pos, roles })));
    for (const [role, asks] of byRole([...named, ...typedNamed])) {
      state.roleNamed(asks, role, sites.file);
    }
    const whole = rest
      .filter(({ type }, z) => (typedKeys[z]?.length ?? 0) === 0 && !isPrimitive(type) && !symbolKey(keyTypes[z]))
      .map(({ type, receiver, roles }) => ({ type, at: receiver.pos, roles }));
    for (const [role, wholes] of byRole(whole)) {
      state.roleWhole(wholes, role, sites.file);
    }
    const symbolic = rest.flatMap(({ type, receiver, roles }, z) => {
      const key = keyTypes[z];
      return key !== undefined && symbolKey(key) ? [{ type, key, at: receiver.pos, roles }] : [];
    });
    const keySymbols = state.batch(symbolic.map(({ key }) => key.getSymbol.gen()));
    const tableMembers = state.batch(symbolic.map(({ type }) => state.membersOf(type)));
    for (const [y, { at, roles }] of symbolic.entries()) {
      const symbol = keySymbols[y];
      const keyed = symbol === undefined ? [] : (tableMembers[y] ?? []).filter((member) => member.name === symbolMemberName(symbol));
      for (const role of roles) {
        state.roleAll(state.declarations(keyed).flat(), role, sites.file, at);
      }
    }
  }

  // `line["done"]` through a string-indexed type a typed value was handed into in this file: the access reaches that
  // value's members of the key's name, at any depth, with its position's roles (flows.ts holds the ruling).
  #sinkReads(sites: FileSites, flows: Flows): void {
    const state = this.#state;
    const literal = [...sites.literalKeyReads, ...sites.elementKeys.filter(({ keys }) => keys !== null && keys.length > 0)];
    if (literal.length === 0) {
      return;
    }
    const receivers = state.world.typedAt(literal, ({ receiver }) => receiver);
    const arms = state.batch(receivers.map(({ type }) => constituentsOf(type)));
    const asks = receivers.flatMap(({ item: { keys, receiver, roles } }, y) => {
      const values = flows.sunkInto(
        sites.file,
        (arms[y] ?? []).map(({ id }) => id),
      );
      return values.flatMap((value) => (keys ?? []).map((name) => ({ value, name, at: receiver.pos, roles })));
    });
    const found = state.batch(asks.map(({ value, name }) => this.#namedAtAnyDepth(value, name)));
    for (const [y, { at, roles }] of asks.entries()) {
      for (const role of roles) {
        state.roleAll(state.declarations(found[y] ?? []).flat(), role, sites.file, at);
      }
    }
  }

  // A TanStack Form field path, `form.setFieldValue("params.seed", v)`, `<form.Field name="title">` or a field bound by
  // a template over an index, `<form.AppField name={`items[${i}].title`}>`: each segment's member is written by a form
  // write method, read by any other path, and both read and written by a field component, which binds the member's
  // input (../key-resolver.ts formPath).
  #formPaths(sites: FileSites): void {
    const state = this.#state;
    const keys = [
      ...sites.keyArguments,
      ...sites.templatePaths,
      ...sites.jsxAttributes.flatMap(({ name, value }) => (name === FORM_NAME && value !== undefined ? [value] : [])),
    ].filter((key) => isStringLiteral(key) || isNoSubstitutionTemplateLiteral(key) || isTemplateExpression(key));
    const paths = state.batch(keys.map((key) => formPath(state.world, key)));
    for (const [y, key] of keys.entries()) {
      const path = paths[y];
      if (path !== null && path !== undefined) {
        const roles: readonly Role[] = path.binds ? ["read", "write"] : [path.role === "write" ? "write" : "read"];
        for (const role of roles) {
          state.roleAll(state.declarations(path.members).flat(), role, sites.file, key.pos);
        }
      }
    }
  }

  // The members named `name` a value holds, at any depth of the members the tree declares and of the lists' elements
  // among them: a parsed line's `message.calls[0].id` is as deep in the value as `message.content`.
  *#namedAtAnyDepth(start: Type, name: string): APIRequestGenerator<readonly NativeSymbol[]> {
    const state = this.#state;
    const { checker } = state.world;
    const found: NativeSymbol[] = [];
    const seen = new Set<number>();
    for (let level: readonly Type[] = [start]; level.length > 0; ) {
      const next: Type[] = [];
      for (const type of level.filter((candidate) => !(isPrimitive(candidate) || seen.has(candidate.id)))) {
        seen.add(type.id);
        const members = (yield* state.membersOf(type)).filter((member) => member.declarations.some((handle) => state.resolver.ours(handle)));
        found.push(...members.filter((member) => member.name === name));
        for (const member of members) {
          next.push(yield* checker.getTypeOfSymbol.gen(member));
        }
        for (const arm of yield* constituentsOf(type)) {
          if (arm.isTypeReference() && (yield* checker.isArrayLikeType.gen(arm))) {
            next.push(...(yield* checker.getTypeArguments.gen(arm)));
          }
        }
      }
      level = next;
    }
    return found;
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

  // `fields as string[]` over `readonly (keyof T & string)[]`: a readonly list asserts to a mutable one only when the two
  // compare, and an empty key set compares with no string list, so a constraint's lone member is a key use there. A
  // readonly or wider target compares with an empty key set too, and keys nothing.
  #keyofAssertions(sites: FileSites): void {
    const state = this.#state;
    const lists = sites.assertions.filter(({ type }) => isMutableStringList(type));
    const operands = state.world.typesAt(lists.map(({ expression }) => expression));
    const lone = state.batch(operands.map((type) => this.#loneKeyofMembers(type)));
    for (const [y, assertion] of lists.entries()) {
      state.roleAll(state.declarations(lone[y] ?? []).flat(), "key", sites.file, assertion.pos);
    }
  }

  // `new MiniSearch<Doc>({ fields: ["body"], idField: "name" })` reads Doc's members the option names; a key list handed
  // on from a parameter reads what each caller that ends the hand-off names (the header's ruling).
  #fieldOptions(sites: FileSites): void {
    const state = this.#state;
    const library = libraryNames(state.world);
    const options = sites.literalProperties.filter(
      ({ name, property, value }) => value !== undefined && MINISEARCH_FIELDS.has(name) && library.declaredBy(property.name, MINISEARCH_PACKAGE),
    );
    for (const [optionsLiteral, group] of Map.groupBy(options, (option) => option.literal)) {
      const index = optionsLiteral.parent;
      const [document] = isNewExpression(index) ? state.batch([this.#typeArgument(state.world.typesAt([index])[0], 0)]) : [];
      const spelled = group.flatMap(({ value, at }) => {
        const names = value === undefined ? null : optionLiterals(unwrapOption(value));
        return names === null ? [] : [{ names, at }];
      });
      const handed = group.flatMap(({ value }) =>
        value === undefined || optionLiterals(unwrapOption(value)) !== null ? [] : this.#handedFieldReads(value, [], new Set()),
      );
      state.roleNamed(handed, "read", sites.file);
      // a generic index's document is each type its handed key lists resolved to at their callers
      const documents = document === undefined || document.isTypeParameter() ? [...new Map(handed.map(({ type }) => [type.id, type])).values()] : [document];
      state.roleNamed(
        spelled.flatMap(({ names, at }) => documents.flatMap((type) => names.map((name) => ({ type, name, at })))),
        "read",
        sites.file,
      );
    }
  }

  // The members a key list names at the end of its hand-off: a parameter's path steps to each caller's argument, an
  // object literal on the path to the property it holds, and any other value names the literals its type holds at the
  // path, on the type argument the path's last member keys. The seen-set of functions ends a cycle of callers.
  #handedFieldReads(value: Node, path: readonly string[], seen: Set<string>): readonly { readonly type: Type; readonly name: string; readonly at: number }[] {
    const at = unwrapOption(value);
    const root = this.#parameterPath(at);
    if (root !== undefined) {
      const memo = this.#state.resolver.keyOf(root.fn);
      if (seen.has(memo)) {
        return [];
      }
      seen.add(memo);
      return this.#callers(root.fn).flatMap((call) => {
        const argument = argumentAt(call, root.index);
        return argument === undefined ? [] : this.#handedFieldReads(argument, [...root.path, ...path], seen);
      });
    }
    const [step, ...rest] = path;
    const held = isObjectLiteralExpression(at) && step !== undefined ? propertyValue(at, step) : undefined;
    if (held !== undefined && this.#parameterPath(unwrapOption(held)) !== undefined) {
      return this.#handedFieldReads(held, rest, seen);
    }
    const [found] = isExpression(at) ? this.#state.batch([this.#namedAtPath(at, path)]) : [];
    return found ?? [];
  }

  // A function's call sites, or none when one of its references is not a call.
  #callers(fn: Node): readonly Node[] {
    const state = this.#state;
    const declaration = (isArrowFunction(fn) || isFunctionExpression(fn)) && isVariableDeclaration(fn.parent) ? fn.parent : fn;
    const [usages = []] = state.batch([state.world.signatureUsage(declaration)]);
    const calls = state.batch(usages.map((usage) => (usage.call === undefined ? answer(undefined) : usage.call.resolve.gen())));
    return calls.some((call) => call === undefined) ? [] : calls.flatMap((call) => (call === undefined ? [] : [call]));
  }

  // The enclosing function's parameter a value is, or a member path off it: the parameter itself, `param.a.b`, or a
  // binding destructured from it (`const { fields } = args`).
  #parameterPath(value: Node): { readonly fn: Node; readonly index: number; readonly path: readonly string[] } | undefined {
    const steps: string[] = [];
    let at = value;
    while (isPropertyAccessExpression(at)) {
      steps.unshift(at.name.text);
      at = unwrapOption(at.expression);
    }
    if (!isIdentifier(at)) {
      return undefined;
    }
    const [symbol] = this.#state.world.symbolsAt([at]);
    const [handle] = symbol?.declarations ?? [];
    const [declaration] = this.#state.batch([handle === undefined ? answer(undefined) : handle.resolve.gen()]);
    const destructured = declaration === undefined ? undefined : destructuredFrom(declaration);
    if (destructured !== undefined) {
      const outer = this.#parameterPath(destructured.source);
      return outer === undefined ? undefined : { ...outer, path: [...outer.path, destructured.key, ...steps] };
    }
    return declaration !== undefined && isParameterDeclaration(declaration) && isIdentifier(declaration.name) && isFunctionLike(declaration.parent)
      ? { fn: declaration.parent, index: parameterIndex(declaration.parent, declaration), path: steps }
      : undefined;
  }

  // The literals a value's type holds at a member path (a list's elements, or a string), each on the type argument
  // that the path's last member, declared `keyof T`, takes from the value's contextual type.
  *#namedAtPath(
    value: Expression,
    path: readonly string[],
  ): APIRequestGenerator<readonly { readonly type: Type; readonly name: string; readonly at: number }[]> {
    const { checker } = this.#state.world;
    const held = yield* this.#typeAtPath(yield* checker.getTypeAtLocation.gen(value), path);
    const parent = yield* this.#typeAtPath(yield* checker.getContextualType.gen(value), path.slice(0, -1));
    const last = path.at(-1);
    const [member] = parent === undefined || last === undefined ? [] : yield* this.#state.propsOnSlot(parent, last);
    const [handle] = member?.declarations ?? [];
    const declaration = handle === undefined ? undefined : yield* handle.resolve.gen();
    const index = declaration === undefined ? undefined : keyofParameterIndex(declaration);
    const document = index === undefined ? undefined : yield* this.#typeArgument(parent, index);
    if (held === undefined || document === undefined) {
      return [];
    }
    const element = (yield* checker.isArrayLikeType.gen(held)) ? ((yield* held.getNumberIndexType.gen()) ?? held) : held;
    return ((yield* literalValues(element)) ?? []).map((name) => ({ type: document, name, at: value.pos }));
  }

  // A type's member type at the end of a member path, or undefined where the path leaves its members.
  *#typeAtPath(start: Type | undefined, path: readonly string[]): APIRequestGenerator<Type | undefined> {
    let at = start;
    for (const step of path) {
      const [member] = at === undefined ? [] : yield* this.#state.propsOnSlot(at, step);
      at = member === undefined ? undefined : yield* this.#state.world.checker.getTypeOfSymbol.gen(member);
    }
    return at;
  }

  // A generic type reference's type argument at an index.
  *#typeArgument(type: Type | undefined, index: number): APIRequestGenerator<Type | undefined> {
    return type?.isTypeReference() === true ? (yield* this.#state.world.checker.getTypeArguments.gen(type))[index] : undefined;
  }

  // The lone constraint member of each type parameter T a `keyof T` in the type (or its list's element) spells.
  *#loneKeyofMembers(type: Type): APIRequestGenerator<readonly NativeSymbol[]> {
    const { checker } = this.#state.world;
    const element = (yield* checker.isArrayLikeType.gen(type)) ? ((yield* type.getNumberIndexType.gen()) ?? type) : type;
    const parts = element.isUnionType() || element.isIntersectionType() ? yield* element.getTypes.gen() : [element];
    const out: NativeSymbol[] = [];
    for (const part of parts.filter((candidate) => candidate.isIndexType())) {
      const target = yield* part.getTarget.gen();
      const constraint = target.isTypeParameter() ? yield* target.getConstraint.gen() : undefined;
      const members = constraint === undefined ? [] : yield* this.#state.membersOf(constraint);
      if (members.length === 1) {
        out.push(...members);
      }
    }
    return out;
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
      state.count(names === null ? "parameter-keyed lookups read whole" : "parameter-keyed lookups narrowed");
      for (const role of keyed.roles) {
        if (names === null) {
          state.roleWhole([{ type: keyed.table, at: keyed.at }], role, keyed.file);
        } else {
          state.roleNamed(
            names.map((name) => ({ type: keyed.table, name, at: keyed.at })),
            role,
            keyed.file,
          );
        }
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

// An option's value through its parentheses and assertions: `fields as string[]` hands on `fields`.
function unwrapOption(node: Node): Node {
  let at = node;
  while (isParenthesizedExpression(at) || isAsExpression(at) || isSatisfiesExpression(at)) {
    at = at.expression;
  }
  return at;
}

// The names an option's literal value spells: one string, or a list of them.
function optionLiterals(value: Node): readonly string[] | null {
  if (!isArrayLiteralExpression(value)) {
    return keyLiterals(value);
  }
  const out: string[] = [];
  for (const element of value.elements) {
    const literals = keyLiterals(element);
    if (literals === null) {
      return null;
    }
    out.push(...literals);
  }
  return out;
}

// The value a binding destructures a named key from: `const { fields } = args` gives `args` and `fields`.
function destructuredFrom(declaration: Node): { readonly source: Node; readonly key: string } | undefined {
  if (!(isBindingElement(declaration) && isObjectBindingPattern(declaration.parent))) {
    return undefined;
  }
  const holder = declaration.parent.parent;
  const key = declaration.propertyName ?? declaration.name;
  return isVariableDeclaration(holder) && holder.initializer !== undefined && key !== undefined && isIdentifier(key)
    ? { source: unwrapOption(holder.initializer), key: key.text }
    : undefined;
}

// The value an object literal holds under a name.
function propertyValue(literal: Node, name: string): Node | undefined {
  if (!isObjectLiteralExpression(literal)) {
    return undefined;
  }
  for (const property of literal.properties) {
    if (isPropertyAssignment(property) && isIdentifier(property.name) && property.name.text === name) {
      return property.initializer;
    }
    if (isShorthandPropertyAssignment(property) && isIdentifier(property.name) && property.name.text === name) {
      return property.name;
    }
  }
  return undefined;
}

// The index, among its interface's type parameters, of the T a member declared as a list of `keyof T` keys.
function keyofParameterIndex(declaration: Node): number | undefined {
  if (!(isPropertySignatureDeclaration(declaration) && isInterfaceDeclaration(declaration.parent))) {
    return undefined;
  }
  const operand = keyofOperand(declaration.type);
  const name = operand !== undefined && isTypeReferenceNode(operand) && isIdentifier(operand.typeName) ? operand.typeName.text : undefined;
  const index = (declaration.parent.typeParameters ?? []).findIndex((parameter) => parameter.name.text === name);
  return index < 0 ? undefined : index;
}

// The operand of the `keyof` a key type spells, through a list, `readonly`, parentheses and an intersection or union.
function keyofOperand(type: TypeNode): TypeNode | undefined {
  if (isTypeOperatorNode(type)) {
    return type.operator === SyntaxKind.KeyOfKeyword ? type.type : keyofOperand(type.type);
  }
  if (isArrayTypeNode(type)) {
    return keyofOperand(type.elementType);
  }
  if (isParenthesizedTypeNode(type)) {
    return keyofOperand(type.type);
  }
  if (isIntersectionTypeNode(type) || isUnionTypeNode(type)) {
    return type.types.map(keyofOperand).find((operand) => operand !== undefined);
  }
  return undefined;
}

// `string[]`: the mutable string list an assertion of a readonly key list must compare with.
const isMutableStringList = (type: TypeNode): boolean => isArrayTypeNode(type) && type.elementType.kind === SyntaxKind.StringKeyword;

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
