// @orb/contracts/refinery/schema-authoring — the custom payload-schema AUTHORING contract (R3 / SF0;
// docs/design/refinery-r3-build-plan.md §1; the NL→schema design's §4.2 write-boundary belt + §7
// security tightenings, homed HERE so the server verbs and the client editor validate through ONE
// schema). A stored `refinery_schemas.schema` blob is LIFTABLE BY INVARIANT: every write parses through
// {@link refinerySchemaDocumentSchema}, whose belt is `liftJsonSchema` (the same trust boundary that
// guards plugin tool registration) PLUS the refinery-specific tightenings below. Reads still re-lift
// defensively (the parse-seam convention).
//
// THE TIGHTENINGS, each with its reason (all refinery-tier — kit's lift subset is deliberately wider):
//   • depth ≤ 8 (kit allows 32): an LLM-payload schema has no business nesting deeper, and the renderer's
//     recursion budget is sized to this cap (schema-renderer §3.2's "nesting is bounded").
//   • `pattern` REFUSED: a user regex executed server-side against model output is a ReDoS surface
//     (NL design §6/§7); kit lifts it for plugin tools — the refinery declines the whole class.
//   • per-node property/enum caps + name/description caps: user text inside a schema reaches provider
//     wires as ResponseFormat content (NL design §7) — bounded like every other model-facing input.
//   • `x-orb-ui` render hints are VALIDATED here (malformed hints refuse at save with their path; on
//     READ the renderer heals a malformed hint to "no hint" — render-by-structure, never a failure).
//   • the WELL-KNOWN CORE (NL design §4.3): a custom SCORE schema must keep `overallScore` on the exact
//     1-10 scale (the F6 stamp, library sorts and the dossier stay comparable across schemas); a custom
//     ANALYZE schema must carry the verdict enum with the exact three spellings (the iterate loop's
//     REGRESSION stop condition survives any custom shape).
//
// Custom REWRITE schemas do not exist (F-N3: the apply path's semantics ARE the fixed typed contract),
// and there is no "any" stage: one schema serves one stage, because each stage pins its own core.

import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { JsonSchemaLiftError, liftJsonSchema, RENDER_HINT_KEY } from "@orb/kit/json-schema";
import { z } from "zod";
import { REFINERY_VERDICTS, SCORE_MAX, SCORE_MIN } from "./core.ts";

// ── the authoring caps (all model-facing text — NL design §7) ───────────────────────────────────────────

/** ResponseFormat identifier grammar (the extension's own rule, `validate.ts:100`) — the stored name IS
 *  the wire `ResponseFormat.name`. */
export const REFINERY_SCHEMA_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
export const REFINERY_SCHEMA_NAME_MAX = 64;
/** The NL origin / purpose note — editable, rides the editor and the generation prompt. */
export const REFINERY_SCHEMA_DESCRIPTION_MAX = 2000;
/** Nesting ceiling for a stored custom schema (tighter than kit's 32 — header). */
export const REFINERY_SCHEMA_MAX_DEPTH = 8;
/** Properties one object node may declare. */
export const REFINERY_SCHEMA_MAX_PROPERTIES = 64;
/** Members one enum may declare. */
export const REFINERY_SCHEMA_MAX_ENUM = 32;

/** Which stage a custom schema serves (no `rewrite`, no `any` — header). */
export const REFINERY_SCHEMA_STAGES = ["score", "analyze"] as const;
export type RefinerySchemaStage = (typeof REFINERY_SCHEMA_STAGES)[number];
export const refinerySchemaStageSchema = z.enum(REFINERY_SCHEMA_STAGES);

// ── the x-orb-ui render-hint vocabulary (schema-renderer §4.2 — CLOSED, save-validated) ─────────────────

/** The hint tones — word-primary tint semantics the renderer maps to intent tokens. */
export const RENDER_HINT_TONES = ["good", "warn", "bad", "info", "neutral"] as const;
export type RenderHintTone = (typeof RENDER_HINT_TONES)[number];

/** The hint roles — elevations over the structure-keyed floor (schema-renderer §3.2/§4.2). */
export const RENDER_HINT_ROLES = ["hero", "verdict", "axis", "prose", "title", "score", "body", "badge"] as const;
/** @public member twin of `RENDER_HINT_ROLES` — every live consumer (`renderHintSchema`'s `z.enum(RENDER_HINT_ROLES)`,
 *  `packages/server/src/domain/refinery/substrate/schema-forge.ts`'s hint forge call) reads the tuple, never
 *  this alias; it belongs to whatever renders/authors a hint role by NAME (schema-renderer §4.2). */
export type RenderHintRole = (typeof RENDER_HINT_ROLES)[number];

/** One node's `x-orb-ui` hint. `tone` maps enum MEMBERS to tone words (the verdict banner's good/warn/bad
 *  tints are authored data, never inferred from member spellings). `chart` is honored for `bars` in R3;
 *  `radar` is the R4 elevation — legal to author now, renders as bars until the radar primitive lands. */
/** A hint `group` word (a section-clustering key, same identifier budget as a schema name). */
const RENDER_HINT_GROUP_MAX = 64;
/** A hint `label` (display text — roomier than an identifier, still one line). */
const RENDER_HINT_LABEL_MAX = 120;

export const renderHintSchema = z.strictObject({
  role: z.enum(RENDER_HINT_ROLES).optional(),
  tone: z.record(z.string().max(REFINERY_SCHEMA_NAME_MAX), z.enum(RENDER_HINT_TONES)).optional(),
  group: z.string().max(RENDER_HINT_GROUP_MAX).optional(),
  label: z.string().max(RENDER_HINT_LABEL_MAX).optional(),
  chart: z.enum(["bars", "radar"]).optional(),
});
export type RenderHint = z.infer<typeof renderHintSchema>;

/** Read a node's hint the HEALING way (the render-side posture): a malformed hint is `null`, never a
 *  render failure — the save belt is where malformed hints REFUSE. */
export function renderHintOf(node: Record<string, unknown>): RenderHint | null {
  const raw = node[RENDER_HINT_KEY];
  if (raw === undefined) {
    return null;
  }
  const parsed = renderHintSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// ── the document belt ───────────────────────────────────────────────────────────────────────────────────

interface BeltIssue {
  readonly path: string;
  readonly message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** The PER-NODE tightenings (depth · pattern ban · hint shape · enum/property counts). */
function nodeIssueOf(node: Record<string, unknown>, path: string, depth: number): BeltIssue | null {
  if (depth > REFINERY_SCHEMA_MAX_DEPTH) {
    return { path, message: `nests deeper than ${REFINERY_SCHEMA_MAX_DEPTH} levels — flatten the shape` };
  }
  if (node["pattern"] !== undefined) {
    return { path, message: '"pattern" is not allowed in a refinery schema (an LLM payload needs no regex)' };
  }
  if (node[RENDER_HINT_KEY] !== undefined && !renderHintSchema.safeParse(node[RENDER_HINT_KEY]).success) {
    return { path, message: `malformed "${RENDER_HINT_KEY}" render hint` };
  }
  const enumMembers = node["enum"];
  if (Array.isArray(enumMembers) && enumMembers.length > REFINERY_SCHEMA_MAX_ENUM) {
    return { path, message: `enum exceeds ${REFINERY_SCHEMA_MAX_ENUM} members` };
  }
  const properties = node["properties"];
  if (isRecord(properties) && Object.keys(properties).length > REFINERY_SCHEMA_MAX_PROPERTIES) {
    return { path, message: `object exceeds ${REFINERY_SCHEMA_MAX_PROPERTIES} properties` };
  }
  return null;
}

/** The child nodes a schema node can carry, with their walk paths — properties (by key), items, anyOf
 *  (by index). The recursion enumerates through here so the walker itself stays flat. */
function childrenOf(node: Record<string, unknown>, path: string): readonly { node: Record<string, unknown>; path: string }[] {
  const children: { node: Record<string, unknown>; path: string }[] = [];
  const properties = node["properties"];
  if (isRecord(properties)) {
    for (const key of Object.keys(properties)) {
      const child = properties[key];
      if (isRecord(child)) {
        children.push({ node: child, path: `${path}/properties/${key}` });
      }
    }
  }
  const items = node["items"];
  if (isRecord(items)) {
    children.push({ node: items, path: `${path}/items` });
  }
  const anyOf = node["anyOf"];
  if (Array.isArray(anyOf)) {
    for (const [i, member] of anyOf.entries()) {
      if (isRecord(member)) {
        children.push({ node: member, path: `${path}/anyOf/${i}` });
      }
    }
  }
  return children;
}

/** Walk every schema node depth-first, running the refinery tightenings. Returns the FIRST issue
 *  (deterministic — the lift's own one-issue posture) or null. */
function walkTightenings(node: Record<string, unknown>, path: string, depth: number): BeltIssue | null {
  const own = nodeIssueOf(node, path, depth);
  if (own !== null) {
    return own;
  }
  for (const child of childrenOf(node, path)) {
    const issue = walkTightenings(child.node, child.path, depth + 1);
    if (issue !== null) {
      return issue;
    }
  }
  return null;
}

/** The stage's well-known core (header). Structural check on the RAW schema — the lift already proved it
 *  liftable, so the reads here are over a known-good vocabulary. */
function coreIssueOf(schema: Record<string, unknown>, stage: RefinerySchemaStage): BeltIssue | null {
  const properties = isRecord(schema["properties"]) ? schema["properties"] : {};
  const required = Array.isArray(schema["required"]) ? schema["required"] : [];
  if (stage === "score") {
    const overall = properties["overallScore"];
    const ok =
      isRecord(overall) &&
      (overall["type"] === "number" || overall["type"] === "integer") &&
      overall["minimum"] === SCORE_MIN &&
      overall["maximum"] === SCORE_MAX &&
      required.includes("overallScore");
    return ok
      ? null
      : {
          path: "#/properties/overallScore",
          message: `a custom score schema must keep a required "overallScore" number with minimum ${SCORE_MIN} and maximum ${SCORE_MAX} — the card's score stamp and the library sorts stay on one scale`,
        };
  }
  const verdict = properties["verdict"];
  const members = isRecord(verdict) && Array.isArray(verdict["enum"]) ? verdict["enum"] : null;
  const wanted = new Set<string>(REFINERY_VERDICTS);
  const ok = members !== null && members.length === wanted.size && members.every((m) => typeof m === "string" && wanted.has(m)) && required.includes("verdict");
  return ok
    ? null
    : {
        path: "#/properties/verdict",
        message: `a custom analyze schema must keep a required "verdict" enum with exactly ${REFINERY_VERDICTS.join("/")} — the iterate loop's stop condition`,
      };
}

/** The liftable-subset check as a zod issue (the §4.5 lift-refusal bridge — the SAME message the model
 *  sees on the bounded retry, and the same one the editor's raw-paste door surfaces verbatim). */
function liftIssueOf(schema: Record<string, unknown>): BeltIssue | null {
  try {
    liftJsonSchema(schema);
    return null;
  } catch (err) {
    if (err instanceof JsonSchemaLiftError) {
      return { path: err.path, message: err.message };
    }
    throw err;
  }
}

const rawSchemaNode = z.record(z.string(), z.unknown());

/** A custom schema DOCUMENT — the whole authored artifact (name + NL description + stage + the schema).
 *  The ONE belt every write runs (and the client editor may run locally — same refusals, same paths). */
export const refinerySchemaDocumentSchema = z
  .object({
    name: z.string().max(REFINERY_SCHEMA_NAME_MAX).regex(REFINERY_SCHEMA_NAME_PATTERN, "name must match ^[a-zA-Z_][a-zA-Z0-9_]*$"),
    description: z.string().max(REFINERY_SCHEMA_DESCRIPTION_MAX),
    stage: refinerySchemaStageSchema,
    schema: rawSchemaNode,
  })
  .superRefine((doc, ctx) => {
    const issue = liftIssueOf(doc.schema) ?? walkTightenings(doc.schema, "#", 0) ?? coreIssueOf(doc.schema, doc.stage);
    if (issue !== null) {
      ctx.addIssue({ code: "custom", path: ["schema"], message: `${issue.message} (at ${issue.path})` });
    }
  });
/** @public type twin of `refinerySchemaDocumentSchema` — every live consumer (create/update/test-schema
 *  verbs, `packages/server/src/domain/refinery/substrate/schema-forge.ts`) calls `.parse`/`.safeParse` and
 *  never imports this alias; it belongs to whatever needs the STATIC document shape (the client editor). */
export type RefinerySchemaDocument = z.infer<typeof refinerySchemaDocumentSchema>;

/** The schema-library wire row (the stage-config picker + the editor's library list). `version` bumps on
 *  every content update — the run log's provenance pin (P1-B). */
export const refinerySchemaSummarySchema = z.object({
  id: typeIdSchema(ID_PREFIX.refinerySchema),
  name: z.string(),
  description: z.string(),
  stage: refinerySchemaStageSchema,
  version: z.number().int().min(1),
  schema: rawSchemaNode,
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type RefinerySchemaSummary = z.infer<typeof refinerySchemaSummarySchema>;
