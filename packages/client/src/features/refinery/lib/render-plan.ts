// The schema-driven RENDER PLAN (refinery R3 — the crowning-feature directive's
// mechanical half): a PURE derivation from a payload SCHEMA (the liftable JSON-Schema subset + x-orb-ui
// hints) to a widget tree, data-independent. The payload only ever FILLS values — nothing in this file
// reads a datum to decide a widget, which is the structural negation of the OG's whole failure class
// (scale guessed from the value, card anatomy from string lengths, item schema from data[0]).
//
// TOTALITY IS THE THEOREM: the custom vocabulary is CLOSED (`LIFTABLE_JSON_SCHEMA`), so the node
// dispatch below is a finite mapping with an arm for every kind and NO unknown branch — the raw-JSON
// floor is unreachable, not merely forbidden. The `satisfies Record<LiftableNodeKind, …>` clause is the
// tsc-forced proof; the property test over the OG schema corpus is the behavioral one.
//
// HINTS ELEVATE, NEVER CARRY: a hintless schema renders well by structure alone; a malformed
// hint heals to "no hint" (`renderHintOf`) — render-by-structure, never a render failure. Field NAMES
// are used for exactly one thing: the label (prettified) — the ONE deliberate exception is the
// structural hero elevation, which is a structure fact, not a name guess.

import type { RenderHint, RenderHintTone } from "@orb/contracts/refinery";
import { renderHintOf } from "@orb/contracts/refinery";

/** The closed node vocabulary the plan dispatches over — derived from `LIFTABLE_JSON_SCHEMA`'s shapes
 *  (object/array/string/number/integer/boolean + enum/const/anyOf). A construct outside it cannot reach
 *  this file: the save belt refused it at write and the read seam refused it at re-lift. The tuple is
 *  the one home; the totality dispatch derives from it (§7.5). */
const LIFTABLE_NODE_KINDS = ["object", "array", "string", "number", "boolean", "enum", "const", "union"] as const;
type LiftableNodeKind = (typeof LIFTABLE_NODE_KINDS)[number];

/** One field's widget — the §3.2 total mapping's output vocabulary. Consumed through `PlanField["widget"]`
 *  (a non-exported alias — the exported interfaces carry it structurally, the §7.4 client posture). */
type RenderWidget =
  | {
      readonly kind: "gauge";
      readonly min: number;
      readonly max: number;
      /** The §3.2 structural elevation (exactly one both-bounded root number) or an explicit hero hint. */
      readonly hero: boolean;
    }
  | { readonly kind: "stat" }
  | {
      readonly kind: "chip-enum";
      readonly members: readonly string[];
      /** member → tone word, from the hint's authored tone map (never inferred from spellings). */
      readonly tones: Readonly<Record<string, RenderHintTone>>;
      /** The verdict-banner elevation (hint role "verdict"). */
      readonly verdict: boolean;
    }
  | { readonly kind: "text" }
  | { readonly kind: "prose" }
  | { readonly kind: "boolean" }
  | { readonly kind: "bullets" }
  | { readonly kind: "number-list" }
  | { readonly kind: "rows"; readonly row: RowPlan }
  | { readonly kind: "section"; readonly fields: readonly PlanField[] }
  | { readonly kind: "const"; readonly value: string }
  | {
      readonly kind: "union";
      /** Each arm's plan + its own membership test order — the view renders the FIRST arm whose shape
       *  fits the value (the lifted zod already discriminated at parse; this is presentation dispatch). */
      readonly arms: readonly RenderWidget[];
    };

/** One named field in a section (or the root). */
export interface PlanField {
  readonly key: string;
  readonly label: string;
  readonly required: boolean;
  readonly widget: RenderWidget;
}

/** An `array<object>` row's anatomy — fixed PER SCHEMA, identical for every row (the OG's per-datum
 *  length heuristics die here): header fields (short/enum/number chips), an optional score member
 *  (bounded number → the row bar), and the accordion body (long strings — FORK A's one-open carries). */
export interface RowPlan {
  readonly header: readonly PlanField[];
  readonly score: PlanField | null;
  readonly body: readonly PlanField[];
}

export interface RenderPlan {
  readonly fields: readonly PlanField[];
}

/** Hints may also arrive OUT of band for the FIXED payloads (`builtin-hints.ts` — zod contracts carry no
 *  x-orb-ui, so the built-in hint set overlays by JSON-pointer path). In-schema hints win. */
export interface HintOverlay {
  readonly [pointerPath: string]: RenderHint | undefined;
}

/** Above this `maxLength` (or unbounded) a string is PROSE; at or below, inline text (§3.2). */
const PROSE_THRESHOLD = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** `camelCase`/`snake_case` → a spaced label (presentation, not semantics). */
export function formatLabel(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The scope chip's label for one selected field. Greetings spell out their narrowed slots; every other
 *  field is humanized through {@link formatLabel} so the chip's micro-caps voice renders "EXAMPLE MESSAGES"
 *  / "CREATOR NOTES" instead of the mashed "EXAMPLEMESSAGES" (side-eye 2026-08-09 P3). */
export function scopeChipLabelOf(field: string, greetingIndexes: readonly number[] | undefined): string {
  if (field === "greetings" && greetingIndexes !== undefined) {
    return `greetings ${greetingIndexes.join(",")}`;
  }
  return formatLabel(field);
}

function hintAt(node: Record<string, unknown>, path: string, overlay: HintOverlay): RenderHint | null {
  return renderHintOf(node) ?? overlay[path] ?? null;
}

/** The node's dispatch kind — the closed vocabulary (header). Order matters exactly as the lift's does:
 *  anyOf first (stands alone), const, bare enum, then the typed arms. */
function nodeKindOf(node: Record<string, unknown>): LiftableNodeKind {
  if (Array.isArray(node["anyOf"])) {
    return "union";
  }
  if ("const" in node) {
    return "const";
  }
  if (Array.isArray(node["enum"])) {
    return "enum";
  }
  const type = node["type"];
  if (type === "integer" || type === "number") {
    return "number";
  }
  if (type === "boolean") {
    return "boolean";
  }
  if (type === "array") {
    return "array";
  }
  if (type === "object") {
    return "object";
  }
  // The lift admits nothing else with a type; a missing type without enum/const/anyOf cannot have
  // passed it. Defaulting to "string" keeps the derivation total WITHOUT a raw-JSON arm.
  return "string";
}

interface NodeContext {
  readonly node: Record<string, unknown>;
  readonly path: string;
  readonly overlay: HintOverlay;
}

type WidgetBuilder = (ctx: NodeContext) => RenderWidget;

function numberWidget({ node, path, overlay }: NodeContext): RenderWidget {
  const min = node["minimum"];
  const max = node["maximum"];
  const hint = hintAt(node, path, overlay);
  if (typeof min === "number" && typeof max === "number") {
    // The scale is the schema's OWN bounds — the anti-`>10?100:10` law. Hero is decided by the caller
    // (structural elevation) or the hint; plain both-bounded numbers meter at their honest scale.
    return { kind: "gauge", min, max, hero: hint?.role === "hero" };
  }
  // No honest scale ⇒ no bar. Never guess one.
  return { kind: "stat" };
}

function enumWidget({ node, path, overlay }: NodeContext): RenderWidget {
  const members = (node["enum"] as readonly unknown[]).filter((m): m is string => typeof m === "string");
  const hint = hintAt(node, path, overlay);
  return {
    kind: "chip-enum",
    members,
    // Tone semantics are HINT data, never inferred from member spellings (the colourblind law's data half).
    tones: hint?.tone ?? {},
    verdict: hint?.role === "verdict",
  };
}

function stringWidget({ node, path, overlay }: NodeContext): RenderWidget {
  const hint = hintAt(node, path, overlay);
  if (hint?.role === "prose" || hint?.role === "body") {
    return { kind: "prose" };
  }
  const maxLength = node["maxLength"];
  return typeof maxLength === "number" && maxLength <= PROSE_THRESHOLD ? { kind: "text" } : { kind: "prose" };
}

function arrayWidget({ node, path, overlay }: NodeContext): RenderWidget {
  const items = isRecord(node["items"]) ? node["items"] : {};
  const itemKind = nodeKindOf(items);
  if (itemKind === "object") {
    return { kind: "rows", row: rowPlanOf(items, `${path}/items`, overlay) };
  }
  if (itemKind === "number") {
    return { kind: "number-list" };
  }
  // string / enum / boolean / const / union items all read best as the bullet list (§3.2's honest floor
  // for scalar lists); nested array-of-array cannot pass the save belt's depth pragmatics but still has
  // a designed floor here (each item renders through the generic value formatter).
  return { kind: "bullets" };
}

function objectWidget({ node, path, overlay }: NodeContext): RenderWidget {
  return { kind: "section", fields: fieldsOf(node, path, overlay, false) };
}

function unionWidget({ node, path, overlay }: NodeContext): RenderWidget {
  const arms = (node["anyOf"] as readonly unknown[]).filter(isRecord).map((arm, i) => widgetOf({ node: arm, path: `${path}/anyOf/${i}`, overlay }));
  return { kind: "union", arms };
}

/** The TOTAL node dispatch (header) — an arm per closed-vocabulary kind, tsc-forced. */
const WIDGET_BUILDERS = {
  object: objectWidget,
  array: arrayWidget,
  string: stringWidget,
  number: numberWidget,
  boolean: (): RenderWidget => ({ kind: "boolean" }),
  enum: enumWidget,
  const: ({ node }): RenderWidget => ({ kind: "const", value: String(node["const"]) }),
  union: unionWidget,
} satisfies Record<LiftableNodeKind, WidgetBuilder>;

function widgetOf(ctx: NodeContext): RenderWidget {
  return WIDGET_BUILDERS[nodeKindOf(ctx.node)](ctx);
}

function fieldsOf(node: Record<string, unknown>, path: string, overlay: HintOverlay, elevateHero: boolean): PlanField[] {
  const properties = isRecord(node["properties"]) ? node["properties"] : {};
  const required = new Set(Array.isArray(node["required"]) ? (node["required"] as string[]) : []);
  const fields = Object.entries(properties)
    .filter((entry): entry is [string, Record<string, unknown>] => isRecord(entry[1]))
    .map(([key, child]) => {
      const childPath = `${path}/properties/${key}`;
      const hint = hintAt(child, childPath, overlay);
      return {
        key,
        label: hint?.label ?? formatLabel(key),
        required: required.has(key),
        widget: widgetOf({ node: child, path: childPath, overlay }),
      };
    });
  if (!elevateHero) {
    return fields;
  }
  // §3.2's ONE structural elevation: a root object with EXACTLY ONE both-bounded numeric property
  // renders it as the hero gauge — "this schema has one headline number" is a structure fact. Two or
  // more bounded numbers ⇒ no hero unless hinted (the multi-axis case renders as meter rows). An
  // AXIS-hinted gauge is already CLAIMED (it docks on a verdict banner — the analyze anatomy), so it
  // never counts as an elevation candidate: hints elevate, and an authored claim outranks structure.
  const gauges = fields.filter((f) => {
    if (f.widget.kind !== "gauge") {
      return false;
    }
    const child = properties[f.key];
    return !isRecord(child) || hintAt(child, `${path}/properties/${f.key}`, overlay)?.role !== "axis";
  });
  if (gauges.length === 1 && gauges[0] !== undefined && gauges[0].widget.kind === "gauge") {
    const hero = gauges[0];
    return fields.map((f) => (f === hero ? { ...f, widget: { ...(f.widget as Extract<RenderWidget, { kind: "gauge" }>), hero: true } } : f));
  }
  return fields;
}

/** Classify an item-object's fields into the fixed ROW anatomy (§3.2's rows arm). The score member —
 *  the bar — is picked by claim strength: an explicit `score`-role hint, else the REQUIRED both-bounded
 *  number, else the first one (an optional bounded number is usually an ADDRESS, e.g. `greetingIndex`,
 *  and must not claim the bar over a required datum). */
function rowPlanOf(items: Record<string, unknown>, path: string, overlay: HintOverlay): RowPlan {
  const fields = fieldsOf(items, path, overlay, false);
  const properties = isRecord(items["properties"]) ? items["properties"] : {};
  const hinted = fields.find((f) => {
    const child = properties[f.key];
    return f.widget.kind === "gauge" && isRecord(child) && hintAt(child, `${path}/properties/${f.key}`, overlay)?.role === "score";
  });
  const score = hinted ?? fields.find((f) => f.widget.kind === "gauge" && f.required) ?? fields.find((f) => f.widget.kind === "gauge") ?? null;
  const body = fields.filter((f) => f.widget.kind === "prose" || f.widget.kind === "section" || f.widget.kind === "rows" || f.widget.kind === "bullets");
  const header = fields.filter((f) => f !== score && !body.includes(f));
  return { header, score, body };
}

/** Derive the whole plan from a projected/stored payload schema (+ the fixed payloads' hint overlay).
 *  Pure, data-independent — the §3.1 contract. */
export function buildRenderPlan(schema: Record<string, unknown>, overlay: HintOverlay = {}): RenderPlan {
  return { fields: fieldsOf(schema, "#", overlay, true) };
}

/** Does this union arm's widget FIT the value, broadly? Presentation dispatch only — the lifted zod
 *  already discriminated at the parse seam, so this never validates, it picks which arm's dress renders
 *  (`PayloadView`'s union block asks; the FIRST fitting arm wins). */
export function armFits(arm: RenderWidget, value: unknown): boolean {
  switch (arm.kind) {
    case "gauge":
    case "stat":
      return typeof value === "number";
    case "number-list":
      return typeof value === "number" || Array.isArray(value);
    case "boolean":
      return typeof value === "boolean";
    case "chip-enum":
      return typeof value === "string" && arm.members.includes(value);
    case "text":
    case "prose":
    case "const":
      return typeof value === "string";
    case "bullets":
    case "rows":
      return Array.isArray(value);
    case "section":
      return isRecord(value);
    case "union":
      return arm.arms.some((a) => armFits(a, value));
    default: {
      const never: never = arm;
      throw new Error(`unreachable widget: ${String(never)}`);
    }
  }
}
