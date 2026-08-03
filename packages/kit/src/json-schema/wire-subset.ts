// @orb/kit/json-schema/wire-subset — the ONE keyword-scrub ENGINE behind every wire's JSON-Schema subset.
// Pure + isomorphic, and deliberately NOT part of `projectJsonSchema`: the projection rule stays
// backend-agnostic (D79 — zod is the one representation), and WHICH subset a request may carry is a property
// of the WIRE, decided at the request-build site (D93). What lives here is only the walk + the per-mode
// vocabulary, so three backends cannot drift three ways over the same keyword table (they did: the agent-sdk
// walk was position-aware, vLLM's was not — a field literally named `title`/`default` was silently deleted
// from the guided-decoding wire, and OpenRouter had no scrub at all).
//
// WHY A SCRUB EXISTS AT ALL (vendor docs, fetched 2026-08-03):
//   • Anthropic — `minLength`/`maxLength`, `minimum`/`maximum`/`multipleOf` and the array/object bound
//     keywords are listed NOT SUPPORTED by the structured-output subset
//     (`https://platform.claude.com/docs/en/build-with-claude/structured-outputs.md`); `strict:true` tools
//     compile through the same grammar pipeline
//     (`https://platform.claude.com/docs/en/agents-and-tools/tool-use/strict-tool-use.md`).
//   • OpenAI — string bounds (`minLength`/`maxLength`) are unsupported; numeric bounds ARE supported
//     (`https://developers.openai.com/api/docs/guides/structured-outputs`).
//   • vLLM/xgrammar — guided decoding ENFORCES the bounds, so they must SURVIVE there; only the annotations
//     its validator chokes on come off.
// A hosted request cannot know which family its proxy will route to (OpenRouter routes per PROVIDER, not per
// model), so the hosted mode carries the strictest COMMON subset: bounds off, everywhere.
//
// The bounds are never lost as VALIDATION — zod keeps them and every caller re-imposes them on the parsed
// reply. This is a wire-copy concern only.
//
// The walk is POSITION-AWARE: under a `properties`/`$defs`/`definitions` map the KEYS are field NAMES, not
// keywords, so a field literally named `maximum`/`oneOf`/`$schema` is descended into as a schema (never
// stripped, never a false refusal); keyword matching resumes inside each field's own node.

/** The wire subsets we speak. One member per WIRE CLASS, never per vendor: what splits them is which
 *  keywords the endpoint can express, and two vendors with the same answer share a mode. */
export const WIRE_SCHEMA_MODES = ["hosted-common", "anthropic-format", "guided-decoding", "strict-compatible"] as const;
export type WireSchemaMode = (typeof WIRE_SCHEMA_MODES)[number];

// Bound keywords: refused by Anthropic's subset outright, half-refused by OpenAI's (strings), enforced by
// xgrammar. A hosted request drops all of them; a guided-decoding request keeps all of them.
const BOUND_KEYWORDS = [
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minProperties",
  "maxProperties",
  "multipleOf",
] as const;

// Dialect meta-keys. `z.toJSONSchema` stamps `$schema: "https://json-schema.org/draft/2020-12/schema"`, which
// is in NEITHER vendor's documented keyword list and which the agent-sdk's bundled validator rejects outright
// ("no schema with key or ref …", live-caught 2026-07-27). Stripping them changes no constraint — every wire
// infers its dialect.
const META_KEYWORDS = ["$schema", "$id"] as const;

// Pure annotations (no validation semantics). A strict guided-decoding endpoint chokes on them; the hosted
// wires accept them and they are prompt surface there (`description` is NEVER in this set — it is the model's
// instructions).
const ANNOTATION_KEYWORDS = ["title", "default", "examples"] as const;

/** Keys whose VALUE is a `{ name → schema }` map — the names are data, never keywords. */
const NAME_MAP_KEYWORDS: ReadonlySet<string> = new Set<string>(["properties", "$defs", "definitions"]);

const OBJECT_TYPE = "object";

interface WireSubset {
  /** Keywords dropped from the wire copy (the value still rides the caller's own zod belt). */
  readonly strip: ReadonlySet<string>;
  /** Keywords this wire cannot express AT ALL — reported to the caller, never silently removed (removing
   *  `oneOf` would change the schema's MEANING; the fix is a build-time reshape, so it must be loud). */
  readonly refuse: ReadonlySet<string>;
  /** Re-apply the projector's `additionalProperties:false` pin on every object node. ON only where the wire
   *  REQUIRES a closed object (guided decoding compiles it; OpenAI strict demands it). The hosted/Anthropic
   *  modes leave the tree exactly as projected — the projector already pinned it, and re-pinning there would
   *  silently close a hand-supplied schema those wires accept open today. */
  readonly pinClosed: boolean;
  /** OPTIONAL-AS-NULLABLE (the OpenAI strict shape). Every property lands in `required`, and a property that
   *  was NOT required is emitted as `anyOf: [<its schema>, {"type":"null"}]`. Semantics are unchanged because
   *  `null ≡ absent` is imposed at the parse boundary (`dropNullValues`). */
  readonly requireAllAsNullable: boolean;
}

/** The per-mode vocabulary. A mapped Record, not a switch — a new `WireSchemaMode` without a row is a tsc
 *  error, so a wire can never silently inherit another wire's subset (§5.5 dispatch discipline). */
const WIRE_SUBSETS: Readonly<Record<WireSchemaMode, WireSubset>> = {
  // Hosted proxies (OpenRouter's forced structured tool + its `response_format`): the strictest COMMON
  // subset, because the endpoint the request lands on is not knowable at build time. `oneOf` is NOT refused —
  // this wire carries it (the forced-tool vehicle compiles no grammar; live 200 on all three families).
  "hosted-common": { strip: new Set<string>([...BOUND_KEYWORDS, ...META_KEYWORDS]), refuse: new Set<string>(), pinClosed: false, requireAllAsNullable: false },
  // Anthropic's native `output_config.format` (the agent-sdk backend): the same bound/meta strip, PLUS the
  // documented `oneOf` refusal — the subset names `anyOf`/`allOf` and not `oneOf`, so a projected
  // `z.discriminatedUnion` is a build bug to be flattened, not a payload to send (D93).
  "anthropic-format": {
    strip: new Set<string>([...BOUND_KEYWORDS, ...META_KEYWORDS]),
    refuse: new Set<string>(["oneOf"]),
    pinClosed: false,
    requireAllAsNullable: false,
  },
  // STRICT-COMPATIBLE (built 2026-08-03, owner ruling — an OPTION, wired nowhere by default). The hosted subset
  // PLUS the documented optional-as-null reshape: OpenAI strict demands "All fields or function parameters must
  // be specified as `required`" and names the escape — "Emulate optional parameters using union with null"
  // (`https://developers.openai.com/api/docs/guides/structured-outputs`). Anthropic's grammar compiler refuses a
  // schema for having too many OPTIONALS (an undocumented runtime ceiling, measured at 46), so a schema with
  // zero optionals clears that wall too — the same reshape unlocks BOTH vendors. The union is spelled `anyOf`
  // and never `"type":["string","null"]`: only OpenAI documents the type-array form, while `anyOf` + the `null`
  // type are inside BOTH documented subsets.
  "strict-compatible": {
    strip: new Set<string>([...BOUND_KEYWORDS, ...META_KEYWORDS]),
    refuse: new Set<string>(),
    pinClosed: true,
    requireAllAsNullable: true,
  },
  // vLLM guided decoding (xgrammar): bounds are the POINT — they compile into the grammar. Only the
  // annotations its `--json-schema` validator refuses come off.
  "guided-decoding": {
    strip: new Set<string>([...ANNOTATION_KEYWORDS, ...META_KEYWORDS]),
    refuse: new Set<string>(),
    pinClosed: true,
    requireAllAsNullable: false,
  },
};

const NULL_ARM = { type: "null" } as const;

/** Is this node ALREADY a null union (a `z.nullable()` projection)? Wrapping it again would emit
 *  `anyOf:[anyOf:[T,null], null]` — legal but noise the grammar compiler pays for. */
function isNullable(node: Record<string, unknown>): boolean {
  const arms = node["anyOf"];
  return Array.isArray(arms) && arms.some((arm) => arm !== null && typeof arm === "object" && (arm as Record<string, unknown>)["type"] === "null");
}

/** The optional-as-null reshape for ONE object node (post-walk, so the child nodes are already scrubbed).
 *  `description` is HOISTED out of the wrapped arm: it is the model's instruction for the FIELD, and a reader
 *  looking at the property sees it at the property, not buried in arm 0. */
function requireAllProperties(node: Record<string, unknown>): void {
  const properties = node["properties"];
  if (properties === null || typeof properties !== "object" || Array.isArray(properties)) {
    return;
  }
  const props = properties as Record<string, unknown>;
  const names = Object.keys(props);
  const alreadyRequired = new Set<string>(
    Array.isArray(node["required"]) ? (node["required"] as unknown[]).filter((n): n is string => typeof n === "string") : [],
  );
  for (const name of names) {
    const child = props[name];
    if (alreadyRequired.has(name) || child === null || typeof child !== "object" || Array.isArray(child)) {
      continue;
    }
    const childNode = child as Record<string, unknown>;
    if (isNullable(childNode)) {
      continue;
    }
    const { description, ...rest } = childNode;
    props[name] = { ...(description === undefined ? {} : { description }), anyOf: [rest, { ...NULL_ARM }] };
  }
  node["required"] = names;
}

/** The scrub's result: the wire copy, plus every construct the mode cannot express (empty on the happy
 *  path). `refused` is deduped and in first-encounter order — a caller turns it into its own typed error. */
export interface WireSchemaScrub {
  readonly schema: Record<string, unknown>;
  readonly refused: readonly string[];
}

function walk(node: unknown, subset: WireSubset, refused: Set<string>): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => walk(item, subset, refused));
  }
  if (node === null || typeof node !== "object") {
    return node;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (subset.strip.has(key)) {
      continue;
    }
    if (subset.refuse.has(key)) {
      refused.add(key);
    }
    out[key] = NAME_MAP_KEYWORDS.has(key) ? walkNameMap(value, subset, refused) : walk(value, subset, refused);
  }
  // The projector's pin, re-applied where the WIRE requires a closed object (guided decoding compiles it;
  // OpenAI strict demands it) — a node minted after projection would otherwise arrive open.
  if (subset.pinClosed && out["type"] === OBJECT_TYPE && out["additionalProperties"] === undefined) {
    out["additionalProperties"] = false;
  }
  if (subset.requireAllAsNullable && out["type"] === OBJECT_TYPE) {
    requireAllProperties(out);
  }
  return out;
}

// Descend a `{ name → schema }` map: every KEY is an opaque field name (kept verbatim, never keyword-matched),
// every VALUE is a schema node walked normally.
function walkNameMap(node: unknown, subset: WireSubset, refused: Set<string>): unknown {
  if (node === null || typeof node !== "object" || Array.isArray(node)) {
    return walk(node, subset, refused);
  }
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(node as Record<string, unknown>)) {
    out[name] = walk(schema, subset, refused);
  }
  return out;
}

/**
 * Project an already-projected JSON Schema onto ONE wire's supported keyword subset. Returns a fresh tree —
 * never mutates the caller's cached `ResponseFormat.schema`, which the OTHER wires also send (they need the
 * keywords this one drops).
 */
export function scrubWireSchema(schema: Record<string, unknown>, mode: WireSchemaMode): WireSchemaScrub {
  const refused = new Set<string>();
  const scrubbed = walk(schema, WIRE_SUBSETS[mode], refused) as Record<string, unknown>;
  return { schema: scrubbed, refused: [...refused] };
}

/**
 * `null ≡ absent` — the PARSE half of the `strict-compatible` projection, and the reason that mode changes no
 * semantics: under it the model emits an explicit `null` where it would otherwise have omitted the key, so a
 * null-valued key must land byte-identically to an omitted one. Recursive, on a clone; array ELEMENTS are
 * walked but a `null` element is kept (an array slot is positional — erasing it would renumber the rest).
 *
 * Safe to run unconditionally on a model reply, which is where it belongs: a payload that carries an explicit
 * `null` for an omit-means-keep field means "no change" whichever projection produced it, and today it costs
 * that whole entry at the per-entry salvage instead.
 */
export function dropNullValues<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => dropNullValues(item)) as unknown as T;
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item !== null) {
      out[key] = dropNullValues(item);
    }
  }
  return out as unknown as T;
}
