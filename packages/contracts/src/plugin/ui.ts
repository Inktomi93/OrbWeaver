// @orb/contracts/plugin/ui — the plugin UI-surface SPEC vocabulary (#679 plugin-ui-plane U0, seam 3). The
// closed, zod-validated declarative node tree a plugin registers through `host.ui.register` (host-v1.ts) and
// the ONE first-party renderer in `features/plugin` maps to sealed `@orb/ui` primitives (the exhaustive
// `Record<NodeKind, Renderer>`, built U1). A plugin composes house components as DATA — it never imports,
// styles, or subclasses `@orb/ui`. The vocabulary deliberately CANNOT express raw HTML/CSS/className, host
// chrome (rail/topbar/composer), a modal, focus theft, or any write channel: a node is data, and only a
// `button`/`confirmButton` `actionId` round-trips (the impersonation walls, plugin-ui-plane §4.3/§4.8 —
// enforced at the COMPILE tier by this closed union, so the walls are unspellable rather than merely refused).
//
// The bounds ARE the trust boundary: the schema is applied host-side at registration AND client-side before
// mount (the `buildCardFrameDocument` clamp posture — server call is trust, client call is depth-in-depth).
//
// SCOPE (U0): the anchors + tiers + the node union + zod + the global caps + the `$state` binding. DEFERRED,
// each with its first consumer and its own phase (never a U0 guess — plugin-ui-plane §4.3/§4.5b/seam 16):
// the `$chatVar` binding (waits on the chat-vars read proc), the `when` CEL visibility predicate (priced with
// the node that first needs it), and the `page` anchor + `grid`/`masterDetail`/`searchBar` browse vocabulary
// (U5). Adding those is a priced phase, not a widening of this file.

import type { AssetId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

// ── Vocabulary axes (closed tuples; a member is a compile-tier fact) ─────────────────────────────────────────

/** Where a plugin surface may MOUNT — each rides an EXISTING door-assembled family via ONE first-party
 *  contribution owned by `features/plugin` (plugin-ui-plane §4.5). `page` (the Extensions section) lands at
 *  U5 (seam 16), NOT here — an anchor with no first-party mount is the root-slot-lands-with-occupant concern. */
export const PLUGIN_SURFACE_ANCHORS = ["settings", "chat-flank", "chat-settings-section", "tool-card"] as const;
export type PluginSurfaceAnchor = (typeof PLUGIN_SURFACE_ANCHORS)[number];

/** The two rendering tiers sharing THIS one vocabulary: `static` (server-validated JSON, actions round-trip to
 *  the server guest) and `scripted` (an optional client-side QuickJS-WASM `ui.js` at native latency — U4). A
 *  `scripted` surface still produces this same declarative tree; the tier is who computes it, not what it is. */
export const PLUGIN_SURFACE_TIERS = ["static", "scripted"] as const;
export type PluginSurfaceTier = (typeof PLUGIN_SURFACE_TIERS)[number];

/** The gap token subset a container node may name — a closed slice of the house intent-gap scale
 *  (`@orb/ui` layout `variants.ts`), mapped by the renderer. A plugin names a token, never a pixel. */
export const PLUGIN_GAP_TOKENS = ["tight", "field", "row", "block", "section"] as const;
export type PluginGapToken = (typeof PLUGIN_GAP_TOKENS)[number];

/** The `text` node's content voice — the three reading voices a plugin may speak (plugin-ui-plane §4.3). The
 *  renderer maps each to the sealed `Text` primitive; a plugin cannot reach `kicker`/`datum`/`figure` (host
 *  grammar voices) — a section's name is the `section` node's `kicker`, never a raw voice. */
export const PLUGIN_TEXT_VOICES = ["body", "gloss", "label"] as const;
export type PluginTextVoice = (typeof PLUGIN_TEXT_VOICES)[number];

/** A `badge` node's intent — a closed slice of the house Badge intents. `primary` is EXCLUDED: it stays
 *  CONTENT's one primary (the S1 card law), the same reason `button` cannot be `primary`. */
export const PLUGIN_BADGE_INTENTS = ["neutral", "info", "success", "warning", "danger"] as const;
export type PluginBadgeIntent = (typeof PLUGIN_BADGE_INTENTS)[number];

/** A `button` node's variant, clamped to the two NEUTRAL weights (plugin-ui-plane §4.3): `primary` is
 *  CONTENT's one primary and is unspellable here. */
export const PLUGIN_BUTTON_VARIANTS = ["neutral", "outline"] as const;
export type PluginButtonVariant = (typeof PLUGIN_BUTTON_VARIANTS)[number];

/** Every node kind, in the §4.3 table order. This tuple and {@link PluginSurfaceNode}'s `kind` discriminants
 *  are pinned equal at the type level (tests/contracts/plugin/ui.test-d.ts) and the client renderer's
 *  exhaustive `Record<NodeKind, Renderer>` covers it — a new kind fails `tsc` until it is rendered. */
export const PLUGIN_NODE_KINDS = [
  "stack",
  "row",
  "section",
  "text",
  "badge",
  "meter",
  "keyValue",
  "list",
  "image",
  "markdown",
  "textField",
  "numberField",
  "toggle",
  "select",
  "slider",
  "button",
  "confirmButton",
] as const;
export type PluginNodeKind = (typeof PLUGIN_NODE_KINDS)[number];

// ── Global caps (the trust bounds; enforced at the spec ROOT) ────────────────────────────────────────────────

/** The whole spec, serialized, must fit — the outermost DoS bound, 32 KiB (plugin-ui-plane §4.3). */
export const PLUGIN_SPEC_MAX_BYTES = 32_768;
/** Total node count across the tree. */
export const PLUGIN_SPEC_MAX_NODES = 256;
/** Container nesting depth (root = 1). */
export const PLUGIN_SPEC_MAX_DEPTH = 8;
/** A single `text`/`markdown`/`confirmButton` body value cap, 2 KiB. */
export const PLUGIN_TEXT_MAX_BYTES = 2048;
/** The rendered-row cap on `list` items, `keyValue` rows, and `select` options (plugin-ui-plane §4.3). */
export const PLUGIN_ROWS_MAX = 64;

const LABEL_MAX = 200;
const STATE_PATH_MAX = 128;
/** Form-field `name` and `button` `actionId` are programmatic keys into the action's `values` bag — a bounded
 *  identifier grammar (the surface-id spirit), so a value key is an ident and never arbitrary text. */
const IDENT_RE = /^[a-z][a-z0-9_]{0,63}$/;

// ── State binding (the U0 binding; `$chatVar`/`when` are DEFERRED — see the header) ──────────────────────────

/** A late-bound value: `{ $state: "path.in.state" }` is resolved by the renderer against the surface's
 *  published state (`host.ui.setState`). A missing path renders the node's fallback or nothing. */
export interface PluginStateBinding {
  readonly $state: string;
}
/** A string value that MAY be a state binding. */
export type PluginBoundString = string | PluginStateBinding;
/** A numeric value that MAY be a state binding. */
export type PluginBoundNumber = number | PluginStateBinding;

// ── The node union (declared explicitly, then the schema is PINNED to it — biome cannot see switch-reachability
//    through a `z.infer` of a lazy discriminated union, so the type leads and `z.ZodType<…>` follows) ──────────

export interface PluginStackNode {
  readonly kind: "stack";
  readonly gap?: PluginGapToken | undefined;
  readonly children: readonly PluginSurfaceNode[];
}
export interface PluginRowNode {
  readonly kind: "row";
  readonly gap?: PluginGapToken | undefined;
  readonly children: readonly PluginSurfaceNode[];
}
export interface PluginSectionNode {
  readonly kind: "section";
  /** The section's NAME (the host grouping grammar) — a plugin never draws its own grouping chrome. */
  readonly kicker: string;
  readonly children: readonly PluginSurfaceNode[];
}
export interface PluginTextNode {
  readonly kind: "text";
  readonly value: PluginBoundString;
  readonly voice?: PluginTextVoice | undefined;
}
export interface PluginBadgeNode {
  readonly kind: "badge";
  readonly text: PluginBoundString;
  readonly intent?: PluginBadgeIntent | undefined;
}
export interface PluginMeterNode {
  readonly kind: "meter";
  readonly value: PluginBoundNumber;
  readonly max?: number | undefined;
  readonly label?: string | undefined;
}
export interface PluginKeyValueRow {
  readonly key: string;
  readonly value: PluginBoundString;
}
export interface PluginKeyValueNode {
  readonly kind: "keyValue";
  readonly rows: readonly PluginKeyValueRow[];
}
export interface PluginListNode {
  readonly kind: "list";
  readonly items: readonly PluginBoundString[];
}
export interface PluginImageNode {
  readonly kind: "image";
  /** An asset in the INSTALLER's CAS ONLY — a well-formed asset id (the `typeIdSchema` rejects a URL: the
   *  seam-11 "no URL arm exists" wall). The FORMAT is validated here; the CAS OWNERSHIP resolve is server-side. */
  readonly assetId: AssetId;
  readonly alt?: string | undefined;
}
export interface PluginMarkdownNode {
  readonly kind: "markdown";
  /** Rendered by the sealed Streamdown renderer (already hardened for untrusted model text). */
  readonly value: PluginBoundString;
}
export interface PluginTextFieldNode {
  readonly kind: "textField";
  readonly name: string;
  readonly label: string;
  readonly value?: string | undefined;
  readonly placeholder?: string | undefined;
}
export interface PluginNumberFieldNode {
  readonly kind: "numberField";
  readonly name: string;
  readonly label: string;
  readonly value?: number | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
  readonly step?: number | undefined;
}
export interface PluginToggleNode {
  readonly kind: "toggle";
  readonly name: string;
  readonly label: string;
  readonly value?: boolean | undefined;
}
export interface PluginSelectOption {
  readonly value: string;
  readonly label: string;
}
export interface PluginSelectNode {
  readonly kind: "select";
  readonly name: string;
  readonly label: string;
  readonly options: readonly PluginSelectOption[];
  readonly value?: string | undefined;
}
export interface PluginSliderNode {
  readonly kind: "slider";
  readonly name: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step?: number | undefined;
  readonly value?: number | undefined;
}
export interface PluginButtonNode {
  readonly kind: "button";
  /** Names the server round-trip (`host.ui.register`'s `onAction`); values are the collected form fields. */
  readonly actionId: string;
  readonly label: string;
  readonly variant?: PluginButtonVariant | undefined;
}
export interface PluginConfirmButtonNode {
  readonly kind: "confirmButton";
  readonly actionId: string;
  readonly label: string;
  /** The house `ConfirmDialog` title, plugin-attributed — a plugin cannot draw its own confirm modal. */
  readonly confirmTitle: string;
  readonly confirmBody?: string | undefined;
}

/** One node in a plugin surface spec — the closed discriminated union rendered by the ONE first-party
 *  renderer. Recursive through the three container kinds (`stack`/`row`/`section`). */
export type PluginSurfaceNode =
  | PluginStackNode
  | PluginRowNode
  | PluginSectionNode
  | PluginTextNode
  | PluginBadgeNode
  | PluginMeterNode
  | PluginKeyValueNode
  | PluginListNode
  | PluginImageNode
  | PluginMarkdownNode
  | PluginTextFieldNode
  | PluginNumberFieldNode
  | PluginToggleNode
  | PluginSelectNode
  | PluginSliderNode
  | PluginButtonNode
  | PluginConfirmButtonNode;

/** A registered surface's spec: the root node of its declarative tree (the whole tree is bounded by the
 *  global caps below). */
export type PluginSurfaceSpec = PluginSurfaceNode;

// ── The zod gate (host-side at registration + client-side before mount) ──────────────────────────────────────

const stateBindingSchema = z.object({ $state: z.string().min(1).max(STATE_PATH_MAX) });
const boundString = (max: number): z.ZodType<PluginBoundString> => z.union([z.string().max(max), stateBindingSchema]);
const finiteNumber = z.number().refine((n) => Number.isFinite(n), { message: "must be a finite number" });
const boundNumber: z.ZodType<PluginBoundNumber> = z.union([finiteNumber, stateBindingSchema]);
const identSchema = z.string().regex(IDENT_RE);
const labelSchema = z.string().min(1).max(LABEL_MAX);
const gapSchema = z.enum(PLUGIN_GAP_TOKENS);

/** The node schema. Recursive via `z.lazy` (the container arms reference this const by the time the thunk
 *  runs); the explicit `z.ZodType<PluginSurfaceNode>` annotation breaks the circular inference and keeps the
 *  DECLARED union authoritative (biome's type service cannot see reachability through an inferred lazy union). */
export const pluginSurfaceNodeSchema: z.ZodType<PluginSurfaceNode> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("stack"), gap: gapSchema.optional(), children: z.array(pluginSurfaceNodeSchema) }),
    z.object({ kind: z.literal("row"), gap: gapSchema.optional(), children: z.array(pluginSurfaceNodeSchema) }),
    z.object({ kind: z.literal("section"), kicker: labelSchema, children: z.array(pluginSurfaceNodeSchema) }),
    z.object({ kind: z.literal("text"), value: boundString(PLUGIN_TEXT_MAX_BYTES), voice: z.enum(PLUGIN_TEXT_VOICES).optional() }),
    z.object({ kind: z.literal("badge"), text: boundString(LABEL_MAX), intent: z.enum(PLUGIN_BADGE_INTENTS).optional() }),
    z.object({ kind: z.literal("meter"), value: boundNumber, max: finiteNumber.optional(), label: labelSchema.optional() }),
    z.object({ kind: z.literal("keyValue"), rows: z.array(z.object({ key: labelSchema, value: boundString(LABEL_MAX) })).max(PLUGIN_ROWS_MAX) }),
    z.object({ kind: z.literal("list"), items: z.array(boundString(LABEL_MAX)).max(PLUGIN_ROWS_MAX) }),
    z.object({ kind: z.literal("image"), assetId: typeIdSchema(ID_PREFIX.asset), alt: z.string().max(LABEL_MAX).optional() }),
    z.object({ kind: z.literal("markdown"), value: boundString(PLUGIN_TEXT_MAX_BYTES) }),
    z.object({
      kind: z.literal("textField"),
      name: identSchema,
      label: labelSchema,
      value: z.string().max(LABEL_MAX).optional(),
      placeholder: z.string().max(LABEL_MAX).optional(),
    }),
    z.object({
      kind: z.literal("numberField"),
      name: identSchema,
      label: labelSchema,
      value: finiteNumber.optional(),
      min: finiteNumber.optional(),
      max: finiteNumber.optional(),
      step: finiteNumber.optional(),
    }),
    z.object({ kind: z.literal("toggle"), name: identSchema, label: labelSchema, value: z.boolean().optional() }),
    z.object({
      kind: z.literal("select"),
      name: identSchema,
      label: labelSchema,
      options: z.array(z.object({ value: z.string().max(LABEL_MAX), label: labelSchema })).max(PLUGIN_ROWS_MAX),
      value: z.string().max(LABEL_MAX).optional(),
    }),
    z.object({
      kind: z.literal("slider"),
      name: identSchema,
      label: labelSchema,
      min: finiteNumber,
      max: finiteNumber,
      step: finiteNumber.optional(),
      value: finiteNumber.optional(),
    }),
    z.object({ kind: z.literal("button"), actionId: identSchema, label: labelSchema, variant: z.enum(PLUGIN_BUTTON_VARIANTS).optional() }),
    z.object({
      kind: z.literal("confirmButton"),
      actionId: identSchema,
      label: labelSchema,
      confirmTitle: labelSchema,
      confirmBody: z.string().max(PLUGIN_TEXT_MAX_BYTES).optional(),
    }),
  ]),
);

/** UTF-8 byte length WITHOUT `TextEncoder` — `@orb/contracts` is isomorphic (tsconfig lib=es2025, types=[]),
 *  so TextEncoder/Buffer are unavailable (the same kit-purity note `kit/cel` and `kit/png-card-chunk` carry).
 *  `encodeURIComponent` emits one literal char per ASCII byte and a `%XX` triple per other byte, so collapsing
 *  each triple to one char yields the byte count. */
function utf8ByteLength(source: string): number {
  return encodeURIComponent(source).replace(/%[0-9A-F]{2}/g, "_").length;
}

/** Walk the tree once, counting nodes and the deepest nesting (root = 1). Only the three container kinds
 *  carry children; every other kind is a leaf. */
function surfaceStats(node: PluginSurfaceNode, depth: number): { readonly nodes: number; readonly maxDepth: number } {
  if (node.kind === "stack" || node.kind === "row" || node.kind === "section") {
    let nodes = 1;
    let maxDepth = depth;
    for (const child of node.children) {
      const childStats = surfaceStats(child, depth + 1);
      nodes += childStats.nodes;
      maxDepth = Math.max(maxDepth, childStats.maxDepth);
    }
    return { nodes, maxDepth };
  }
  return { nodes: 1, maxDepth: depth };
}

/** The SPEC schema: a node tree plus the whole-tree global bounds (node count, nesting depth, serialized
 *  size). This is the schema a registration/mount validates against — the per-node schema alone bounds each
 *  node but never the aggregate, which is exactly the DoS surface the caps close. */
export const pluginSurfaceSpecSchema: z.ZodType<PluginSurfaceSpec> = pluginSurfaceNodeSchema.superRefine((spec, ctx) => {
  const { nodes, maxDepth } = surfaceStats(spec, 1);
  if (nodes > PLUGIN_SPEC_MAX_NODES) {
    ctx.addIssue({ code: "custom", message: `surface spec exceeds ${PLUGIN_SPEC_MAX_NODES} nodes` });
  }
  if (maxDepth > PLUGIN_SPEC_MAX_DEPTH) {
    ctx.addIssue({ code: "custom", message: `surface spec exceeds nesting depth ${PLUGIN_SPEC_MAX_DEPTH}` });
  }
  if (utf8ByteLength(JSON.stringify(spec)) > PLUGIN_SPEC_MAX_BYTES) {
    ctx.addIssue({ code: "custom", message: `surface spec exceeds ${PLUGIN_SPEC_MAX_BYTES} bytes` });
  }
});

// ── Registration metadata (U1, seam 4 — the guest's `host.ui.register` def MINUS the `onAction` handle) ───────

/** A surface's `id` grammar (`host.ui.register`'s `id`; plugin-ui-plane §4.2) — unique per plugin, a bounded
 *  programmatic identifier (the values-bag / registry key discipline), never arbitrary text. */
export const PLUGIN_SURFACE_ID_RE = /^[a-z][a-z0-9_]{0,40}$/;
/** The shell label line cap (`host.ui.register`'s `title`; plugin-ui-plane §4.2). */
export const PLUGIN_SURFACE_TITLE_MAX = 80;

/** The SERIALIZABLE part of a `host.ui.register` def — validated host-side at collection (the trust boundary)
 *  AND the exact descriptor `plugin.listSurfaces` projects to the client renderer. The `onAction` handler is NOT
 *  here (it is a guest function, kept as an opaque `PluginHandlerRef` on the collected
 *  {@link PluginSurfaceRegistration}); `spec` is REQUIRED for a static-tier surface to render anything, but is
 *  optional at THIS schema because a scripted-tier (U4) surface computes its tree client-side. An invalid meta
 *  is a REGISTRATION refusal (surface absent + a plugin log line), never activation-fatal (plugin-ui-plane §4.9). */
export const pluginSurfaceRegistrationMetaSchema = z.object({
  id: z.string().regex(PLUGIN_SURFACE_ID_RE),
  anchor: z.enum(PLUGIN_SURFACE_ANCHORS),
  title: z.string().min(1).max(PLUGIN_SURFACE_TITLE_MAX),
  tier: z.enum(PLUGIN_SURFACE_TIERS),
  spec: pluginSurfaceSpecSchema.optional(),
});
export type PluginSurfaceRegistrationMeta = z.infer<typeof pluginSurfaceRegistrationMetaSchema>;
