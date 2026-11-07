// The purpose of each token that names only one, read from `orb.purpose` in tokens.json.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { JsonValue } from "@orb/kit/json";
import { jsonValueSchema } from "@orb/kit/json";

const TOKENS_JSON = "packages/ui/src/tokens/tokens.json";
const PURPOSE = "orb.purpose";
const CSS_VALUES = "orb.cssValues";

interface JsonNode {
  readonly [key: string]: JsonValue;
}
const isNode = (value: JsonValue | undefined): value is JsonNode => typeof value === "object" && value !== null && !Array.isArray(value);

/** The `orb.purpose` string a token or group carries, if any. */
function purposeOf(node: JsonNode): string | null {
  const extensions = node["$extensions"];
  const purpose = isNode(extensions) ? extensions[PURPOSE] : undefined;
  return typeof purpose === "string" ? purpose : null;
}

export interface PurposeScopes {
  /** Custom property to the one purpose it serves. */
  readonly byName: ReadonlyMap<string, string>;
  /** Purpose-bearing nodes of `tokens.json` whose variables the theme does not declare: a purpose that outlived its token. */
  readonly stale: readonly string[];
}

/**
 * Read the scope table from `orb.purpose` in tokens.json. A group's purpose covers every token under it; a token's covers itself;
 * a `cssValues` entry's `purpose` covers its variable. A new token in a purpose group is scoped by existing there.
 */
export function loadPurposes(root: string, declared: ReadonlySet<string>): PurposeScopes {
  const document = jsonValueSchema.parse(JSON.parse(readFileSync(join(root, TOKENS_JSON), "utf8")));
  const byName = new Map<string, string>();
  const stale: string[] = [];
  const claim = (label: string, names: readonly string[], purpose: string): void => {
    if (!names.some((name) => declared.has(name))) {
      stale.push(label);
    }
    for (const name of names) {
      byName.set(name, purpose);
    }
  };
  // The custom properties of the tokens under a node, each scoped by the nearest purpose above it.
  const scopeTokens = (node: JsonNode, path: readonly string[], inherited: string | null): readonly string[] => {
    const own = purposeOf(node);
    const purpose = own ?? inherited;
    const names =
      "$value" in node || "$ref" in node
        ? [`--${path.join("-")}`]
        : Object.entries(node).flatMap(([key, child]) => (!key.startsWith("$") && isNode(child) ? scopeTokens(child, [...path, key], purpose) : []));
    if (own !== null) {
      claim(path.join("."), names, own);
    }
    return names;
  };
  if (!isNode(document)) {
    throw new Error(`${TOKENS_JSON} is not a token document`);
  }
  for (const [key, child] of Object.entries(document)) {
    if (!key.startsWith("$") && isNode(child)) {
      scopeTokens(child, [key], null);
    }
  }
  const extensions = document["$extensions"];
  const cssValues = isNode(extensions) ? extensions[CSS_VALUES] : undefined;
  for (const [name, entry] of Object.entries(isNode(cssValues) ? cssValues : {})) {
    const purpose = isNode(entry) ? entry["purpose"] : undefined;
    if (typeof purpose === "string") {
      claim(name, [name], purpose);
    }
  }
  return { byName, stale };
}
