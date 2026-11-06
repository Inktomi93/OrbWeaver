// Hand-written values in stylesheets, read from the css-tree AST: every literal in a declaration and every length in a media or container condition.
import type { Atrule, CssNode, Declaration } from "@eslint/css-tree";
import { parse, walk } from "@eslint/css-tree";
import type { Hit } from "./hand-model.ts";
import { CONTAINER_PROPERTY, hitOf, judgeLit, QUERY_PROPERTY } from "./hand-model.ts";
import type { Lit } from "./literals.ts";
import { conditionLits, litsOf, parseValue, written } from "./literals.ts";
import type { Source } from "./source.ts";
import type { ValueTokens } from "./tokens.ts";

// A face declaration holds URLs, ranges and metrics, none of them design values.
const UNPRICED_AT_RULES: ReadonlySet<string> = new Set(["font-face", "import", "layer", "charset", "namespace"]);
const DETAIL_MAX = 90;
const QUERY_AT_RULES: ReadonlySet<string> = new Set(["media", "container"]);

interface Written {
  readonly line: number;
  readonly where: "sheet" | "query";
  readonly detail: string;
  readonly found: Lit;
  readonly property: string | null;
}

function conditionWrites(node: Atrule, prelude: CssNode): readonly Written[] {
  const line = node.loc?.start.line ?? 1;
  const property = node.name.toLowerCase() === "container" ? CONTAINER_PROPERTY : QUERY_PROPERTY;
  return conditionLits(prelude).map((found) => ({ line, where: "query", detail: `@${node.name} ${found.text}`, found, property }));
}

function declarationWrites(node: Declaration): readonly Written[] {
  // A custom property's value is stored unparsed.
  const value = node.value.type === "Raw" ? parseValue(node.value.value.trim()) : node.value;
  const property = node.property.startsWith("--") ? null : node.property;
  const line = node.loc?.start.line ?? 1;
  const text = value === null ? "" : written(value).slice(0, DETAIL_MAX);
  return (value === null ? [] : litsOf(property, value)).map((found) => ({ line, where: "sheet", detail: `${node.property}: ${text}`, found, property }));
}

export function sheetHits(source: Source, tokens: ValueTokens): readonly Hit[] {
  const writes: Written[] = [];
  walk(parse(source.text, { positions: true }), {
    enter(node): void {
      if (node.type === "Atrule" && QUERY_AT_RULES.has(node.name.toLowerCase()) && node.prelude !== null) {
        writes.push(...conditionWrites(node, node.prelude));
      } else if (node.type === "Declaration" && !(this.atrule !== null && UNPRICED_AT_RULES.has(this.atrule.name.toLowerCase()))) {
        writes.push(...declarationWrites(node));
      }
    },
  });
  return writes.map(({ line, where, detail, found, property }) => {
    const judgement = judgeLit(found, property, tokens);
    const place = { path: source.path, line, section: source.section, layer: source.layer };
    return hitOf(place, { category: judgement.match === null ? "raw-value" : "token-literal", where, detail }, judgement);
  });
}
