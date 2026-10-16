// Delivered selectors answer only one closed capture; scalar identity never grants another world's meaning.
import type { Node, SourceFile } from "ts-morph";
import { observeAuthoredTypeSlots } from "./type-observation-profile.ts";
import type { NativeTypeObservations, ObservedReference, TypeObservationReader } from "./type-observations-contract.ts";
import { assertRawParameterCoverage } from "./type-observations-coverage.ts";
import type { NativeTypeSelector } from "./type-projection-contract.ts";
import { selectedTypeRelation, typeSelectorIndex } from "./type-projection-contract.ts";

export function readTypeObservations(facts: NativeTypeObservations): TypeObservationReader {
  const scope = {};
  const selectedIndex = facts.selections === null ? undefined : typeSelectorIndex(facts.selections.plan);
  const typeKeys = new Map<number, object>();
  const symbolKeys = facts.symbols.map(() => ({}));
  const nodes = new Map(facts.nodes.map((entry) => [entry.node, entry]));
  const exports = new Map(facts.exports.map((entry) => [entry.source, entry]));
  const returns = new Map(facts.callReturns.map((entry) => [entry.node, entry]));
  const signatures = new Map(facts.signatures.map((entry) => [entry.call, entry]));
  const locals = new Map(facts.localTargets.map((entry) => [entry.node, entry]));
  const typeRef = (index: number): ObservedReference<"type"> => ({ kind: "type", scope, index });
  const symbolRef = (index: number): ObservedReference<"symbol"> => ({ kind: "symbol", scope, index });
  const assertLive = (): void => {
    facts.assertNode(facts.anchor);
  };
  const requireRef = (reference: ObservedReference, kind: ObservedReference["kind"]): number => {
    assertLive();
    if (reference.scope !== scope || reference.kind !== kind) {
      throw new Error("native type observation reference belongs to another capture/world/generation");
    }
    return reference.index;
  };
  const selections = (): NonNullable<NativeTypeObservations["selections"]> => {
    assertLive();
    if (facts.selections === null) {
      throw new Error("native type observation cohort has no registered selectors");
    }
    return facts.selections;
  };
  const selectorAt = (index: number): NativeTypeSelector => {
    const value = selections().plan.selectors[index];
    if (value === undefined) {
      throw new Error("native selected-Type selector is missing");
    }
    return value;
  };
  const indexOf = (selector: NativeTypeSelector): number => {
    if (selector.base.kind !== "schema-column") {
      facts.assertNode(selector.base.node);
    }
    for (const step of selector.steps) {
      if (step.kind === "property" || step.kind === "signature-parameter") {
        facts.assertNode(step.at);
      }
    }
    if (selector.displayAt !== null) {
      facts.assertNode(selector.displayAt);
    }
    selections();
    if (selectedIndex === undefined) {
      throw new Error("native type observation cohort has no registered selectors");
    }
    return selectedIndex(selector);
  };
  const nodeOf = (node: Node): NativeTypeObservations["nodes"][number] => {
    facts.assertNode(node);
    const value = nodes.get(node);
    if (value === undefined) {
      throw new Error(`native symbol/node observation was not captured: ${node.getKindName()} ${node.getSourceFile().getFilePath()}:${node.getStart()}`);
    }
    return value;
  };
  const exportOf = (source: SourceFile): NativeTypeObservations["exports"][number] => {
    facts.assertNode(source);
    const value = exports.get(source);
    if (value === undefined) {
      throw new Error("native export-symbol roster was not registered");
    }
    return value;
  };
  const reader: TypeObservationReader = {
    select: (selector) => {
      const index = indexOf(selector);
      const value = selections().values[index];
      if (value === undefined) {
        throw new Error("native selected-Type answer is missing");
      }
      return value === null ? null : typeRef(index);
    },
    type: (reference) => {
      const index = requireRef(reference, "type");
      const value = selections().values[index];
      const raw = facts.types[index];
      if (value === undefined || value === null || raw === undefined || raw === null) {
        throw new Error("native Type metadata is absent or missing");
      }
      let key = typeKeys.get(value.identity);
      if (key === undefined) {
        key = {};
        typeKeys.set(value.identity, key);
      }
      return {
        key,
        any: value.any,
        unknown: value.unknown,
        never: raw.never,
        typeParameter: raw.typeParameter,
        unionCount: raw.unionCount,
        tupleCount: raw.tupleCount,
        symbol: raw.symbol === null ? null : symbolRef(raw.symbol),
        aliasSymbol: raw.aliasSymbol === null ? null : symbolRef(raw.aliasSymbol),
      };
    },
    symbol: (node) => {
      const value = nodeOf(node).symbol;
      return value === null ? null : symbolRef(value);
    },
    symbolData: (reference) => {
      const index = requireRef(reference, "symbol");
      const value = facts.symbols[index];
      const key = symbolKeys[index];
      if (value === undefined || key === undefined) {
        throw new Error("native symbol metadata is missing");
      }
      return { ...value, key, canonical: symbolRef(value.canonical) };
    },
    exports: (source) => exportOf(source).symbols.map(symbolRef),
    defaultExport: (source) => {
      const value = exportOf(source).default;
      return value === null ? null : symbolRef(value);
    },
    localTarget: (node) => {
      facts.assertNode(node);
      const row = locals.get(node);
      if (row === undefined) {
        throw new Error("native local export target was not captured");
      }
      return row.symbol === null ? null : symbolRef(row.symbol);
    },
    properties: (selector, at) => {
      const index = indexOf(selector);
      facts.assertNode(at);
      const row = facts.properties.find((entry) => entry.selector === index && entry.at === at);
      if (row === undefined) {
        throw new Error("native property-Type question was not captured");
      }
      return row.values.map((entry) => ({ name: entry.name, symbol: symbolRef(entry.symbol), selector: selectorAt(entry.type) }));
    },
    unions: (selector) => {
      const index = indexOf(selector);
      const row = facts.unions.find((entry) => entry.selector === index);
      if (row === undefined) {
        throw new Error("native union-slot question was not captured");
      }
      return row.values.map(selectorAt);
    },
    callReturns: (node) => {
      facts.assertNode(node);
      const row = returns.get(node);
      if (row === undefined) {
        throw new Error("native callable return slots were not captured");
      }
      return row.values.map(selectorAt);
    },
    signature: (call) => {
      facts.assertNode(call);
      const row = signatures.get(call);
      if (row === undefined || row.fact.kind === "unrequested") {
        throw new Error("native signature question was not captured");
      }
      return row.fact.kind === "absent" ? null : { declaration: row.fact.value.declaration, parameters: row.fact.value.parameters.map(selectorAt) };
    },
    depends: (selector, owner, at) => {
      const index = indexOf(selector);
      facts.assertNode(owner);
      facts.assertNode(at);
      const row = facts.dependencies.find((entry) => entry.type === index && entry.owner === owner && entry.at === at);
      if (row === undefined) {
        throw new Error("native generic-dependence question was not captured");
      }
      return row.witness;
    },
    relation: (left, right) => {
      const a = indexOf(left);
      const b = indexOf(right);
      const selected = selections();
      const index = selected.plan.relations.findIndex((pair) => pair.left === a && pair.right === b);
      return selectedTypeRelation(selected, index) ?? null;
    },
    display: (selector, at) => {
      const value = selections().values[indexOf({ ...selector, displayAt: at })];
      if (value === undefined) {
        throw new Error("native Type display answer is missing");
      }
      return value?.display ?? null;
    },
    computedNames: (selector) => {
      const index = indexOf(selector);
      const row = facts.computedNames.find((entry) => entry.selector === index);
      if (row === undefined) {
        throw new Error("native computed-property binding origins were not captured");
      }
      return row.values;
    },
    definitions: (node) => {
      facts.assertNode(node);
      const row = facts.definitions?.find((entry) => entry.node === node);
      if (row === undefined) {
        throw new Error("native definition-node question was not captured");
      }
      row.values.forEach(facts.assertNode);
      return row.values;
    },
    callParameters: (call) => {
      facts.assertNode(call);
      const row = facts.callParameters?.find((entry) => entry.call === call);
      if (row === undefined) {
        throw new Error("native instantiated parameter question was not captured");
      }
      return row.values?.map(selectorAt) ?? null;
    },
    signatureParameters: (selector, at) => {
      const index = indexOf(selector);
      facts.assertNode(at);
      const row = facts.signatureParameters?.find((entry) => entry.selector === index && entry.at === at);
      if (row === undefined) {
        throw new Error("native signature parameter table was not captured");
      }
      return row.values.map((parameters) => parameters.map(selectorAt));
    },
    literal: (selector) => {
      const value = facts.types[indexOf(selector)];
      if (value === undefined || value === null || value.stringLiteral === undefined) {
        throw new Error("native string literal question was not captured");
      }
      return value.stringLiteral;
    },
    valueDeclaration: (reference) => {
      const value = facts.symbols[requireRef(reference, "symbol")]?.valueDeclaration;
      if (value === undefined) {
        throw new Error("native symbol value declaration was not captured");
      }
      if (value !== null) {
        facts.assertNode(value);
      }
      return value;
    },
  };
  if (facts.definitions === undefined) {
    observeAuthoredTypeSlots(facts.demand, reader);
  } else {
    const usedDefinitions = new Set<Node>();
    const values = new Map<Node, Set<string>>();
    observeAuthoredTypeSlots(
      facts.demand,
      {
        ...reader,
        definitions: (node) => {
          usedDefinitions.add(node);
          return reader.definitions(node);
        },
      },
      (node, facets) => {
        facts.assertNode(node);
        const requested = values.get(node) ?? new Set<string>();
        for (const facet of facets) {
          requested.add(facet);
        }
        values.set(node, requested);
      },
    );
    if (facts.definitions.some((row) => !usedDefinitions.has(row.node))) {
      throw new Error("native definition-node question is foreign to the registered closure");
    }
    const delivered = facts.valueProfiles ?? [];
    if (
      delivered.length !== values.size ||
      delivered.some((row) => {
        const expected = values.get(row.node);
        return expected === undefined || row.facets.length !== expected.size || row.facets.some((facet) => !expected.has(facet));
      })
    ) {
      throw new Error("native value-profile nomination coverage is missing or foreign");
    }
    assertRawParameterCoverage(
      facts,
      (node) => JSON.stringify([node.getSourceFile().getFilePath(), node.getStart(), node.getEnd(), node.getKind()]),
      (node) => node.getKind(),
    );
  }
  return reader;
}
