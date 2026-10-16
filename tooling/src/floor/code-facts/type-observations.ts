// Raw native questions close inside one admitted owner; only scalar facts and declaration spans leave it.
import type { Node as MorphNode, Symbol as MorphSymbol, SourceFile, Type, ts } from "ts-morph";
import { Node } from "ts-morph";
import { readAssignabilityChecker, readNativeTypeRelation } from "./assignability.ts";
import { symbolDeclarations, ultimateSymbol } from "./symbol-identity.ts";
import { firstOwnedTypeParameter } from "./type-dependence.ts";
import { observeAuthoredTypeSlots } from "./type-observation-profile.ts";
import type {
  NativeObservedDependency,
  NativeObservedNode,
  NativeObservedSignature,
  NativeObservedSymbol,
  NativeObservedType,
  NativeTypeObservations,
  ObservedProperty,
  ObservedReference,
  TypeObservationCapture,
  TypeObservationCaptureOwner,
  TypeObservationDemand,
} from "./type-observations-contract.ts";
import { assertTypeObservationCoverage } from "./type-observations-coverage.ts";
import { readTypeObservations } from "./type-observations-read.ts";
import { captureScalarTypeSelections, readNativeSignatureSlots, readNativeTypeSelection, readNativeTypeSelectionStep } from "./type-projection.ts";
import type { NativeTypeSelector } from "./type-projection-contract.ts";

/** Native/isolated defaults and persisted capture ask the same finite primitive questions. */
export function createTypeObservationCapture(owner: TypeObservationCaptureOwner, rawSlots = false): TypeObservationCapture {
  const scope = {};
  let capturedProgram: ts.Program | undefined = owner.anchor.getProject().getProgram().compilerObject;
  const admittedSources = new Map<SourceFile, SourceFile["compilerNode"]>();
  const admit = (node: MorphNode): void => {
    owner.admit(node);
    const source = node.getSourceFile();
    if (
      capturedProgram === undefined ||
      node.wasForgotten() ||
      source.wasForgotten() ||
      owner.anchor.getProject().getProgram().compilerObject !== capturedProgram ||
      node.getProject() !== owner.anchor.getProject() ||
      capturedProgram.getSourceFile(source.getFilePath()) !== source.compilerNode
    ) {
      throw new Error("native type observation owner/source epoch is foreign or changed");
    }
    admittedSources.set(source, source.compilerNode);
  };

  const nodeIds = new Map<MorphNode, number>();
  const nodeId = (node: MorphNode): number => {
    admit(node);
    let value = nodeIds.get(node);
    if (value === undefined) {
      value = nodeIds.size;
      nodeIds.set(node, value);
    }
    return value;
  };
  const selectorKey = (selector: NativeTypeSelector): string =>
    JSON.stringify({
      ...selector,
      base: selector.base.kind === "schema-column" ? selector.base : { ...selector.base, node: nodeId(selector.base.node) },
      steps: selector.steps.map((step) => (step.kind === "property" || step.kind === "signature-parameter" ? { ...step, at: nodeId(step.at) } : step)),
      displayAt: selector.displayAt === null ? null : nodeId(selector.displayAt),
    });
  const selectors: NativeTypeSelector[] = [];
  const selected: (Type | undefined)[] = [];
  const selectorIds = new Map<string, number>();
  const symbols: NativeObservedSymbol[] = [];
  const symbolIds = new Map<object, number>();
  const nativeSymbols: MorphSymbol[] = [];
  const symbolKeys: object[] = [];
  const typeKeys = new Map<object, object>();
  const types: (NativeObservedType | null)[] = [];
  const nodes = new Map<MorphNode, NativeObservedNode>();
  const functionExports = new Map<MorphNode, boolean>();
  const properties = new Map<string, NativeTypeObservations["properties"][number]>();
  const unions = new Map<number, NativeTypeObservations["unions"][number]>();
  const unionTypes = new Map<object, readonly number[]>();
  const propertyTypes = new Map<object, Map<MorphNode, NativeTypeObservations["properties"][number]["values"]>>();
  const callReturns = new Map<MorphNode, NativeTypeObservations["callReturns"][number]>();
  const signatures = new Map<MorphNode, NativeObservedSignature>();
  const nativeSignatures = new Map<MorphNode, ReturnType<typeof readNativeSignatureSlots>>();
  const signatureSlots = (call: MorphNode): ReturnType<typeof readNativeSignatureSlots> => {
    admit(call);
    if (!nativeSignatures.has(call)) {
      nativeSignatures.set(call, readNativeSignatureSlots(call));
    }
    return nativeSignatures.get(call);
  };
  const dependencies = new Map<string, NativeObservedDependency>();
  const exports = new Map<SourceFile, NativeTypeObservations["exports"][number]>();
  const locals = new Map<MorphNode, number | null>();
  const computed = new Map<number, NativeTypeObservations["computedNames"][number]>();
  const definitions = new Map<MorphNode, readonly MorphNode[]>();
  const callParameters = new Map<MorphNode, NonNullable<NativeTypeObservations["callParameters"]>[number]>();
  const signatureParameters: NonNullable<NativeTypeObservations["signatureParameters"]>[number][] = [];
  const pairs: { left: number; right: number }[] = [];
  const pairIds = new Map<string, number>();
  const typeRef = (index: number): ObservedReference<"type"> => ({ kind: "type", scope, index });
  const symbolRef = (index: number): ObservedReference<"symbol"> => ({ kind: "symbol", scope, index });
  const requireRef = (reference: ObservedReference, kind: ObservedReference["kind"]): number => {
    admit(owner.anchor);
    if (reference.scope !== scope || reference.kind !== kind) {
      throw new Error("native type observation reference belongs to another capture");
    }
    return reference.index;
  };
  const symbolOf = (symbol: MorphSymbol | undefined): number | null => {
    if (symbol === undefined) {
      return null;
    }
    const previous = symbolIds.get(symbol.compilerSymbol);
    if (previous !== undefined) {
      return previous;
    }
    const index = symbols.length;
    symbolIds.set(symbol.compilerSymbol, index);
    nativeSymbols.push(symbol);
    symbolKeys.push({});
    const declarations = symbolDeclarations(symbol);
    declarations.forEach(admit);
    symbols.push({ name: symbol.getName(), declarations, canonical: index });
    const canonical = ultimateSymbol(symbol);
    const target = canonical === symbol ? index : symbolOf(canonical);
    if (target === null) {
      throw new Error("native symbol lost its canonical identity");
    }
    symbols[index] = { name: symbol.getName(), declarations, canonical: target };
    return index;
  };
  const read = (selector: NativeTypeSelector): number => {
    const key = selectorKey(selector);
    const previous = selectorIds.get(key);
    if (previous !== undefined) {
      return previous;
    }
    let value: Type | undefined;
    if (selector.displayAt !== null) {
      value = selected[read({ ...selector, displayAt: null })];
    } else if (selector.steps.length > 0) {
      const step = selector.steps.at(-1);
      const parent = selected[read({ ...selector, steps: selector.steps.slice(0, -1) })];
      value = parent === undefined || step === undefined ? undefined : readNativeTypeSelectionStep(parent, step);
    } else if (selector.base.kind === "resolved-parameter") {
      value = signatureSlots(selector.base.node)?.parameters[selector.base.index]?.getType();
    } else {
      value = readNativeTypeSelection(selector, undefined);
    }
    const index = selectors.length;
    selectorIds.set(key, index);
    selectors.push(selector);
    selected.push(value);
    types.push(
      value === undefined
        ? null
        : {
            symbol: symbolOf(value.getSymbol()),
            aliasSymbol: symbolOf(value.getAliasSymbol()),
            never: value.isNever(),
            typeParameter: value.isTypeParameter(),
            unionCount: value.getUnionTypes().length,
            tupleCount: value.getTupleElements().length,
          },
    );
    return index;
  };
  const selectorAt = (index: number): NativeTypeSelector => {
    const value = selectors[index];
    if (value === undefined) {
      throw new Error("native Type selector reference is missing");
    }
    return value;
  };
  const valueAt = (index: number): Type => {
    const value = selected[index];
    if (value === undefined) {
      throw new Error("native selected Type is absent or unrequested");
    }
    return value;
  };
  const nodeType = (node: MorphNode): number => read({ base: { kind: "node", node }, steps: [], displayAt: null });
  const symbolAt = (node: MorphNode): number | null => {
    admit(node);
    const previous = nodes.get(node);
    if (previous !== undefined) {
      return previous.symbol;
    }
    const symbol = symbolOf(node.getSymbol());
    nodes.set(node, { node, symbol, type: nodeType(node), contextual: { kind: "unrequested" } });
    return symbol;
  };
  const exportLocalTargets = (source: SourceFile): readonly number[] => {
    const localTargets: number[] = [];
    for (const symbol of source.getExportSymbols()) {
      for (const declaration of symbolDeclarations(symbol)) {
        if (Node.isExportSpecifier(declaration)) {
          const target = symbolOf(declaration.getLocalTargetSymbol());
          locals.set(declaration, target);
          if (target !== null) {
            localTargets.push(target);
          }
        }
      }
    }
    return localTargets;
  };
  const exportOf = (source: SourceFile): NativeTypeObservations["exports"][number] => {
    const previous = exports.get(source);
    if (previous !== undefined) {
      return previous;
    }
    admit(source);
    const entries = source.getExportSymbols().map((symbol) => symbolOf(symbol));
    const localTargets = exportLocalTargets(source);
    const result = {
      source,
      symbols: entries.filter((index): index is number => index !== null),
      default: symbolOf(source.getDefaultExportSymbol()),
      localTargets,
    };
    exports.set(source, result);
    return result;
  };
  const reader: TypeObservationCapture["reader"] = {
    defaultDisplay: (selector) => {
      const index = read(selector);
      const metadata = types[index];
      if (!rawSlots || metadata === null || metadata === undefined) {
        throw new Error("native default Type display is unavailable");
      }
      const value = metadata.defaultDisplay ?? valueAt(index).getText();
      types[index] = { ...metadata, defaultDisplay: value };
      return value;
    },
    literalValue: (selector) => {
      const index = read(selector);
      const metadata = types[index];
      if (!rawSlots || metadata === null || metadata === undefined) {
        throw new Error("native literal value is unavailable");
      }
      const value = valueAt(index).getLiteralValue();
      types[index] = { ...metadata, literalValue: value === undefined ? { kind: "absent" } : { kind: "value", value } };
      return value;
    },
    typeArguments: (selector) => {
      const index = read(selector);
      const metadata = types[index];
      if (!rawSlots || metadata === null || metadata === undefined) {
        throw new Error("native Type arguments are unavailable");
      }
      const values =
        metadata.typeArguments ??
        valueAt(index)
          .getTypeArguments()
          .map((_argument, at) => read({ ...selector, steps: [...selector.steps, { kind: "type-argument", index: at }] }));
      types[index] = { ...metadata, typeArguments: values, typeArgumentCount: valueAt(index).getTypeArguments().length };
      return values.map(selectorAt);
    },
    functionExport: (node) => {
      admit(node);
      if (!(rawSlots && Node.isFunctionDeclaration(node))) {
        throw new Error("native function export question is not an admitted function");
      }
      const value = functionExports.get(node) ?? node.isExported();
      functionExports.set(node, value);
      return value;
    },
    select: (selector) => {
      const index = read(selector);
      if (selector.base.kind === "contextual") {
        const node = selector.base.node;
        symbolAt(node);
        const row = nodes.get(node);
        if (row === undefined) {
          throw new Error("native contextual node is missing");
        }
        const base = selectorIds.get(selectorKey({ ...selector, steps: [], displayAt: null }));
        if (base === undefined) {
          throw new Error("native contextual base selector was not captured");
        }
        nodes.set(node, { ...row, contextual: selected[base] === undefined ? { kind: "absent" } : { kind: "value", value: base } });
      }
      return selected[index] === undefined ? null : typeRef(index);
    },
    type: (reference) => {
      const index = requireRef(reference, "type");
      const value = valueAt(index);
      let key = typeKeys.get(value.compilerType);
      if (key === undefined) {
        key = {};
        typeKeys.set(value.compilerType, key);
      }
      return {
        key,
        any: value.isAny(),
        unknown: value.isUnknown(),
        never: value.isNever(),
        typeParameter: value.isTypeParameter(),
        unionCount: value.getUnionTypes().length,
        tupleCount: value.getTupleElements().length,
        symbol: types[index]?.symbol === null || types[index]?.symbol === undefined ? null : symbolRef(types[index].symbol),
        aliasSymbol: types[index]?.aliasSymbol === null || types[index]?.aliasSymbol === undefined ? null : symbolRef(types[index].aliasSymbol),
      };
    },
    symbol: (node) => {
      const index = symbolAt(node);
      return index === null ? null : symbolRef(index);
    },
    symbolData: (reference) => {
      const index = requireRef(reference, "symbol");
      const value = symbols[index];
      const key = symbolKeys[index];
      if (value === undefined || key === undefined) {
        throw new Error("native symbol observation is missing");
      }
      return { ...value, key, canonical: symbolRef(value.canonical) };
    },
    exports: (source) => exportOf(source).symbols.map(symbolRef),
    defaultExport: (source) => {
      const index = exportOf(source).default;
      return index === null ? null : symbolRef(index);
    },
    localTarget: (node) => {
      admit(node);
      if (!Node.isExportSpecifier(node)) {
        throw new Error("native local export target query is not an export specifier");
      }
      const index = symbolOf(node.getLocalTargetSymbol());
      locals.set(node, index);
      return index === null ? null : symbolRef(index);
    },
    properties: (selector, at): readonly ObservedProperty[] => {
      const index = read(selector);
      admit(at);
      const key = `${index}:${nodeId(at)}`;
      const previous = properties.get(key);
      if (previous !== undefined) {
        return previous.values.map((entry) => ({ name: entry.name, symbol: symbolRef(entry.symbol), selector: selectorAt(entry.type) }));
      }
      const value = valueAt(index);
      let byLocation = propertyTypes.get(value.compilerType);
      if (byLocation === undefined) {
        byLocation = new Map();
        propertyTypes.set(value.compilerType, byLocation);
      }
      const shared = byLocation.get(at);
      if (shared !== undefined) {
        properties.set(key, { selector: index, at, values: shared });
        return shared.map((entry) => ({ name: entry.name, symbol: symbolRef(entry.symbol), selector: selectorAt(entry.type) }));
      }
      const rows = value.getProperties().map((property) => {
        const symbol = symbolOf(property);
        if (symbol === null) {
          throw new Error("native property has no symbol");
        }
        const child = { ...selector, steps: [...selector.steps, { kind: "property" as const, name: property.getName(), at }] };
        return { name: property.getName(), symbol, type: read(child) };
      });
      byLocation.set(at, rows);
      properties.set(key, { selector: index, at, values: rows });
      return rows.map((entry) => ({ name: entry.name, symbol: symbolRef(entry.symbol), selector: selectorAt(entry.type) }));
    },
    unions: (selector) => {
      const index = read(selector);
      const previous = unions.get(index);
      if (previous !== undefined) {
        return previous.values.map(selectorAt);
      }
      const value = valueAt(index);
      let children = unionTypes.get(value.compilerType);
      if (children === undefined) {
        children = value.getUnionTypes().map((_part, part) => read({ ...selector, steps: [...selector.steps, { kind: "union-part", index: part }] }));
        unionTypes.set(value.compilerType, children);
      }
      unions.set(index, { selector: index, values: children });
      return children.map(selectorAt);
    },
    callReturns: (node) => {
      const previous = callReturns.get(node);
      if (previous !== undefined) {
        return previous.values.map((index) => selectorAt(index));
      }
      const values = valueAt(nodeType(node))
        .getCallSignatures()
        .map((_signature, index) => read({ base: { kind: "node", node }, steps: [{ kind: "call-return", index }], displayAt: null }));
      callReturns.set(node, { node, values });
      return values.map((index) => selectorAt(index));
    },
    signature: (call) => {
      admit(call);
      if (!Node.isCallExpression(call)) {
        throw new Error("native signature query is not a call");
      }
      const declaration = signatureSlots(call)?.declaration;
      if (declaration === undefined) {
        signatures.set(call, { call, fact: { kind: "absent" } });
        return null;
      }
      admit(declaration);
      const parameters = Node.isFunctionLikeDeclaration(declaration)
        ? declaration.getParameters().map((_parameter, index) => read({ base: { kind: "resolved-parameter", node: call, index }, steps: [], displayAt: null }))
        : [];
      signatures.set(call, { call, fact: { kind: "value", value: { declaration, parameters } } });
      return { declaration, parameters: parameters.map((index) => selectorAt(index)) };
    },
    depends: (selector, declaration, at) => {
      const index = read(selector);
      admit(declaration);
      admit(at);
      const key = `${index}:${nodeId(declaration)}:${nodeId(at)}`;
      const previous = dependencies.get(key);
      if (previous !== undefined) {
        return previous.witness;
      }
      const witness = firstOwnedTypeParameter(valueAt(index), declaration, at) ?? null;
      if (witness !== null) {
        admit(witness);
      }
      dependencies.set(key, { type: index, owner: declaration, at, witness });
      return witness;
    },
    relation: (left, right) => {
      const a = read(left);
      const b = read(right);
      const x = selected[a];
      const y = selected[b];
      const key = `${a}:${b}`;
      if (!pairIds.has(key)) {
        pairIds.set(key, pairs.length);
        pairs.push({ left: a, right: b });
      }
      if (x === undefined || y === undefined) {
        return null;
      }
      const checker = readAssignabilityChecker(owner.anchor.getProject().getTypeChecker());
      if (checker === undefined) {
        throw new Error("native Type relation primitive is unavailable");
      }
      return readNativeTypeRelation(checker, x, y);
    },
    display: (selector, at) => {
      admit(at);
      const value = selected[read({ ...selector, displayAt: at })];
      return value?.getText(at) ?? null;
    },
    computedNames: (selector) => {
      const index = read(selector);
      const previous = computed.get(index);
      if (previous !== undefined) {
        return previous.values;
      }
      const value = valueAt(index);
      const parts = value.isIntersection() ? value.getIntersectionTypes() : [value];
      const values = parts.flatMap((part) =>
        part.getProperties().flatMap((property) =>
          property.getDeclarations().flatMap((declaration) => {
            if (!(Node.isPropertySignature(declaration) || Node.isPropertyDeclaration(declaration))) {
              return [];
            }
            const name = declaration.getNameNode();
            if (!Node.isComputedPropertyName(name)) {
              return [];
            }
            const names = name.getExpression().getSymbol()?.getDeclarations() ?? [];
            admit(declaration);
            names.forEach(admit);
            return [{ declaration, names }];
          }),
        ),
      );
      computed.set(index, { selector: index, values });
      return values;
    },
    definitions: (node) => {
      admit(node);
      if (!Node.isIdentifier(node)) {
        throw new Error("native definition-node query is not an identifier");
      }
      let values = definitions.get(node);
      if (values === undefined) {
        values = node.getDefinitionNodes();
        values.forEach(admit);
        definitions.set(node, values);
      }
      return values;
    },
    callParameters: (call) => {
      admit(call);
      if (!Node.isCallExpression(call)) {
        throw new Error("native instantiated parameter query is not a call");
      }
      if (!callParameters.has(call)) {
        const signature = call.getProject().getTypeChecker().getResolvedSignature(call);
        const parameters = signature?.getParameters();
        callParameters.set(call, {
          call,
          parameterCount: parameters?.length ?? null,
          values:
            parameters === undefined
              ? null
              : parameters.map((_parameter, index) => read({ base: { kind: "call-parameter", node: call, index }, steps: [], displayAt: null })),
        });
      }
      return callParameters.get(call)?.values?.map(selectorAt) ?? null;
    },
    signatureParameters: (selector, at) => {
      const index = read(selector);
      admit(at);
      let row = signatureParameters.find((entry) => entry.selector === index && entry.at === at);
      if (row === undefined) {
        const parameters = valueAt(index)
          .getCallSignatures()
          .map((signature) => signature.getParameters());
        row = {
          selector: index,
          at,
          parameterCounts: parameters.map((values) => values.length),
          values: parameters.map((values, signatureIndex) =>
            values.map((_parameter, parameterIndex) =>
              read({ ...selector, steps: [...selector.steps, { kind: "signature-parameter", signature: signatureIndex, index: parameterIndex, at }] }),
            ),
          ),
        };
        signatureParameters.push(row);
      }
      return row.values.map((parameters) => parameters.map(selectorAt));
    },
    literal: (selector) => {
      const index = read(selector);
      const value = types[index];
      if (!rawSlots || value === undefined || value === null) {
        throw new Error("native string literal question was not captured");
      }
      if (value.stringLiteral === undefined) {
        const literal = valueAt(index).getLiteralValue();
        const answer = typeof literal === "string" ? literal : null;
        types[index] = { ...value, stringLiteral: answer };
        return answer;
      }
      return value.stringLiteral;
    },
    valueDeclaration: (reference) => {
      const index = requireRef(reference, "symbol");
      const value = symbols[index];
      const symbol = nativeSymbols[index];
      if (!rawSlots || value === undefined || symbol === undefined) {
        throw new Error("native symbol value declaration was not captured");
      }
      if (value.valueDeclaration === undefined) {
        const declaration = symbol.getValueDeclaration() ?? null;
        if (declaration !== null) {
          admit(declaration);
        }
        symbols[index] = { ...value, valueDeclaration: declaration };
        return declaration;
      }
      return value.valueDeclaration;
    },
  };
  const admitValueProfiles = (values: NativeTypeObservations["valueProfiles"]): void => {
    for (const value of values ?? []) {
      admit(value.node);
    }
  };
  const capturedFunctionExports = (demand: TypeObservationDemand): Pick<NativeTypeObservations, "functionExports"> =>
    demand.questions?.some((question) => question.kind === "function-exports") === true
      ? { functionExports: [...functionExports].map(([node, value]) => ({ node, value })) }
      : {};
  return {
    reader,
    finish: (demand: TypeObservationDemand, valueProfiles): NativeTypeObservations => {
      admit(owner.anchor);
      admitValueProfiles(valueProfiles);
      for (const node of demand.sources) {
        if (!Node.isSourceFile(node)) {
          throw new Error("native type export source is not a SourceFile");
        }
        exportOf(node);
      }
      const anchor = owner.anchor;
      const program = capturedProgram;
      if (program === undefined) {
        throw new Error("native type observation capture is disposed");
      }
      const selections = selectors.length === 0 ? null : captureScalarTypeSelections({ selectors, relations: pairs }, { program, selectors, values: selected });
      const epochs = new Map(admittedSources);
      const result: NativeTypeObservations = {
        anchor,
        demand,
        ...(valueProfiles === undefined ? {} : { valueProfiles }),
        assertNode: (node): void => {
          for (const [source, epoch] of epochs) {
            if (source.wasForgotten() || source.compilerNode !== epoch) {
              throw new Error("native type observation source epoch is stale");
            }
          }
          const source = node.getSourceFile();
          if (node.wasForgotten() || !epochs.has(source) || node.getProject() !== anchor.getProject()) {
            throw new Error("native type observation source is foreign or stale");
          }
        },
        symbols,
        nodes: [...nodes.values()],
        types,
        unions: [...unions.values()],
        properties: [...properties.values()],
        callReturns: [...callReturns.values()],
        computedNames: [...computed.values()],
        ...(rawSlots
          ? {
              definitions: [...definitions].map(([node, values]) => ({ node, values })),
              callParameters: [...callParameters.values()],
              signatureParameters,
              ...capturedFunctionExports(demand),
            }
          : {}),
        localTargets: [...locals].map(([node, symbol]) => ({ node, symbol })),
        signatures: [...signatures.values()],
        dependencies: [...dependencies.values()],
        exports: [...exports.values()],
        selections,
      };
      capturedProgram = undefined;
      selected.length = 0;
      symbolIds.clear();
      nativeSymbols.length = 0;
      typeKeys.clear();
      nativeSignatures.clear();
      propertyTypes.clear();
      unionTypes.clear();
      return result;
    },
  };
}

/** One complete fixed profile, captured and checked before the native factory releases its owner. */
export function captureTypeObservations(demand: TypeObservationDemand, owner: TypeObservationCaptureOwner): NativeTypeObservations {
  const capture = createTypeObservationCapture(owner, demand.questions !== undefined);
  const values = new Map<MorphNode, Set<NonNullable<NonNullable<TypeObservationDemand["questions"]>[number]["valueFacets"]>[number]>>();
  observeAuthoredTypeSlots(
    demand,
    capture.reader,
    (node, facets) => {
      if (owner.profile === undefined) {
        throw new Error("native value-profile demand has no captured owner");
      }
      owner.admit(node);
      owner.profile(node, facets);
      const requested = values.get(node) ?? new Set();
      for (const facet of facets) {
        requested.add(facet);
      }
      values.set(node, requested);
    },
    owner.references,
  );
  const facts = capture.finish(
    demand,
    demand.questions?.some((q) => q.valueFacets !== undefined) === true ? [...values].map(([node, facets]) => ({ node, facets: [...facets] })) : undefined,
  );
  assertTypeObservationCoverage(
    facts,
    (node) => JSON.stringify([node.getSourceFile().getFilePath(), node.getStart(), node.getEnd(), node.getKind()]),
    (node) => node.getKind(),
  );
  readTypeObservations(facts, owner.references);
  return facts;
}
