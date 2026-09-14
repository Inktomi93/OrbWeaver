import type { Node } from "ts-morph";
import type { CssFacts } from "../contract/resource-css.ts";
import type { StaticClassFactResult, StaticClassSegment } from "../contract/static-class-expression.ts";
import type { CssVariableSite } from "./css-var-resolution.ts";
import { arbitraryCssVariableSites, cssVariableReferenceSites } from "./css-var-resolution.ts";
import type { CssVariableSourceFact } from "./css-variable-source-fact.ts";
import type { VendorContract } from "./vendor-css-contract.ts";

const DYNAMIC_CUSTOM_PROPERTY_TAIL_RE = /(?:var\(\s*|[-a-zA-Z0-9_[\].:/]+-\()--[a-zA-Z0-9_-]*$/u;

export interface CssVariableInventory {
  readonly cssDefinitions: ReadonlySet<string>;
  readonly runtimeDefinitions: ReadonlySet<string>;
  readonly runtimeDefinitionSites: readonly CssVariableSite[];
  readonly definitions: ReadonlySet<string>;
  readonly references: readonly CssVariableSite[];
  readonly unsupported: readonly CssVariableSite[];
  readonly classRoots: number;
}

function unique(sites: readonly CssVariableSite[]): readonly CssVariableSite[] {
  return [...new Map(sites.map((site) => [`${site.file}:${site.line}:${site.column}:${site.name}`, site])).values()];
}

function segmentSites(segment: StaticClassSegment, value: string, relativePath: (node: Node) => string): readonly CssVariableSite[] {
  const text = value.slice(segment.valueStart, segment.valueEnd);
  const file = relativePath(segment.node);
  return [
    ...cssVariableReferenceSites(text, file, segment.node, segment.sourceStart),
    ...arbitraryCssVariableSites(text, file, segment.node, segment.sourceStart),
  ];
}

export function cssVariableInventory(
  css: CssFacts,
  source: CssVariableSourceFact,
  classes: StaticClassFactResult,
  relativePath: (node: Node) => string,
): CssVariableInventory {
  const cssDefinitions = new Set(css.customPropertyDefinitions.map(({ name }) => name));
  const classReferences = classes.tokens.flatMap((token) => token.segments.flatMap((segment) => segmentSites(segment, token.value, relativePath)));
  const unsupported = classes.runtimePrefixes.flatMap((prefix) => {
    const segment = prefix.segments[0];
    if (segment === undefined || !DYNAMIC_CUSTOM_PROPERTY_TAIL_RE.test(prefix.prefix)) {
      return [];
    }
    const position = segment.node.getSourceFile().getLineAndColumnAtPos(segment.sourceStart);
    return [
      {
        file: relativePath(segment.node),
        ...position,
        name: "dynamic-custom-property",
        fallback: false,
        node: segment.node,
        offset: segment.sourceStart - segment.node.getStart(),
      },
    ];
  });
  const cssReferences = css.customPropertyReferences.map((site) => ({ ...site }));
  return {
    cssDefinitions,
    runtimeDefinitions: source.definitions,
    runtimeDefinitionSites: source.definitionSites,
    definitions: new Set([...cssDefinitions, ...source.definitions]),
    references: unique([...cssReferences, ...source.references, ...classReferences]),
    unsupported: unique(unsupported),
    classRoots: classes.roots,
  };
}

export function sameStringSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

export function vendorUse(inventory: CssVariableInventory, vendor: VendorContract): ReadonlySet<string> {
  return new Set(inventory.references.filter((site) => vendor.documented.has(site.name)).map((site) => site.name));
}

export function runtimeUse(inventory: CssVariableInventory): ReadonlySet<string> {
  return new Set(
    inventory.references.filter((site) => !inventory.cssDefinitions.has(site.name) && inventory.runtimeDefinitions.has(site.name)).map((site) => site.name),
  );
}
