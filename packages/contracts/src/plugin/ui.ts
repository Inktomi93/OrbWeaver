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
 *  U5 (seam 16), NOT here — an anchor with no first-party mount is the root-slot-lands-with-occupant concern.
 *
 *  `message-footer` (U6, §5.4) is the ONE PER-ROW anchor: it mounts once per COMMITTED transcript row, so its
 *  cost multiplies by transcript length and it carries its own tighter bounds — {@link PLUGIN_ANCHOR_TIERS}
 *  (static only, permanently), {@link PLUGIN_FOOTER_NODE_KIND_ALLOWED} (decoration kinds only) and the two
 *  per-row caps below. Every one of those is a COMPILE-tier fact, not prose. */
export const PLUGIN_SURFACE_ANCHORS = ["settings", "chat-flank", "chat-settings-section", "tool-card", "message-footer"] as const;
export type PluginSurfaceAnchor = (typeof PLUGIN_SURFACE_ANCHORS)[number];

/** How a surface's pixels are produced. The first TWO share this file's declarative vocabulary — `static`
 *  (server-validated JSON, actions round-trip to the server guest) and `scripted` (an optional client-side
 *  QuickJS-WASM `ui.js` at native latency — U4); a `scripted` surface still produces the same node tree, so the
 *  tier is WHO COMPUTES it, not what it is.
 *
 *  `frame` (U7, §6.2) is the ESCAPE HATCH and is a different KIND of thing: it produces no node tree at all. It
 *  is a document of the plugin's own HTML/JS served into an isolated (opaque-origin) iframe — the arbitrary-pixels
 *  arm for the §6.1 rows the vocabulary cannot reach (canvas games, live2d/VRM, arbitrary card art). It is a
 *  MEMBER of this tuple rather than a parallel axis precisely so every per-tier decision on the tree — most of
 *  all {@link PLUGIN_ANCHOR_TIERS} — has to be re-taken FOR it instead of inheriting an answer by omission.
 *
 *  THE PRIORITY LAW STANDS (§6.2): a surface expressible in the vocabulary ships in the vocabulary. The frame is
 *  the last resort, never a parallel UI system. */
export const PLUGIN_SURFACE_TIERS = ["static", "scripted", "frame"] as const;
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

// ── The `message-footer` per-ROW bounds (U6, §5.4) ────────────────────────────────────────────────────────────
// Every other anchor mounts ONCE per open room; this one mounts once per COMMITTED transcript row, so its cost
// is multiplied by transcript length. The design's three clamps are encoded here as compile-tier facts:

/** Total nodes a `message-footer` spec may carry — an order of magnitude under the whole-tree
 *  {@link PLUGIN_SPEC_MAX_NODES}, because this budget is spent once PER ROW. A badge strip, not a panel. */
export const PLUGIN_FOOTER_MAX_NODES = 8;
/** Container nesting a `message-footer` spec may carry (root = 1): one `row` wrapping its badges, nothing
 *  deeper. Depth is where a per-row tree turns into layout. */
export const PLUGIN_FOOTER_MAX_DEPTH = 2;

/** WHICH TIERS MAY MOUNT AT WHICH ANCHOR — the permanent refusal of a scripted (and, at U7, a framed) surface
 *  in the transcript, coded rather than written down. It is a TOTAL `Record<anchor, Record<tier, boolean>>` on
 *  purpose: a new {@link PLUGIN_SURFACE_TIERS} member makes EVERY anchor row a missing key and fails `tsc`, so
 *  the `ui.frame` hatch (U7, §6.2) cannot land at `message-footer` by omission — someone has to type
 *  `frame: false` here, which is exactly the decision plugin-ui-plane §4.5 says is permanent. */
export const PLUGIN_ANCHOR_TIERS = {
  // `frame: true` — §6.1's "arbitrary-HTML settings look" row (§5.1) is HATCH-ELIGIBLE at U7: it is the
  // installer's OWN settings screen, under their own grant, and the integrated form nodes remain the
  // recommended authoring path.
  settings: { static: true, scripted: true, frame: true },
  // `frame: true` — the hatch's HEADLINE anchor (§6.2, and §8-U7's owner test is a chess board drawn here).
  "chat-flank": { static: true, scripted: true, frame: true },
  // `frame: false` — NOT an omission: §6.2 enumerates the hatch's anchors (`chat-flank`, the `dialog` kind,
  // `tool-card`, `page`) and this band is not among them. It is the HOST-CONTROLS band, mounted under the
  // host gate (`contribution-contracts.ts`), and a room's host controls are the one place the app's own
  // grammar has to read as the app's. A frame there is a decision to take deliberately, not to inherit.
  "chat-settings-section": { static: true, scripted: true, frame: false },
  // `frame: true` — §6.1's arbitrary-card-ART row. LAZY at the mount (`loading="lazy"`, minted on mount), never
  // per-row-eager: a tool card exists once per actual tool CALL, which is bounded by what the model did.
  "tool-card": { static: true, scripted: true, frame: true },
  // PERMANENT (plugin-ui-plane §4.5, §6.2): a per-row interpreter is one guest context per transcript row, and
  // a per-row frame is one document per transcript row. Neither is ever eligible here. This row is the whole
  // reason the record is TOTAL — the `frame` tier could not land here by omission, someone had to type `false`.
  "message-footer": { static: true, scripted: false, frame: false },
} as const satisfies Record<PluginSurfaceAnchor, Record<PluginSurfaceTier, boolean>>;

/** WHICH HOST FUNCTION MAY MINT WHICH TIER — the CAPABILITY fork, coded (U7).
 *
 *  The membrane gates at the FUNCTION, never at the argument (`HOST_FUNCTION_CAPABILITY`, host-v1.ts), so a tier
 *  that needs a different capability needs a different function: `ui.register` (capability `ui.surface`) mints the
 *  two declarative tiers, and `ui.registerFrame` (capability `ui.frame`) mints the frame tier and only it.
 *  Without this fork a guest holding only `ui.surface` could pass `tier: "frame"` to `ui.register` and take the
 *  hatch's tier without the hatch's consent — a wall that leaks by omission is not a wall.
 *
 *  TOTAL Record on purpose, the {@link PLUGIN_ANCHOR_TIERS} discipline one axis over: a new tier fails `tsc` here
 *  until someone names the function — and therefore the capability, and therefore the consent line — that mints it. */
export const PLUGIN_TIER_REGISTRARS = ["ui.register", "ui.registerFrame"] as const;
export type PluginTierRegistrar = (typeof PLUGIN_TIER_REGISTRARS)[number];
export const PLUGIN_TIER_REGISTRAR = {
  static: "ui.register",
  scripted: "ui.register",
  frame: "ui.registerFrame",
} as const satisfies Record<PluginSurfaceTier, PluginTierRegistrar>;

/** WHICH NODE KINDS a `message-footer` spec may spell — the DSL-BADGES fidelity of §5.4 ("adjacent decoration,
 *  not in-bubble markup"), as a TOTAL record so a new {@link PLUGIN_NODE_KINDS} member must be decided FOR the
 *  transcript rather than inheriting admission from silence. The three exclusion classes, each argued:
 *   - INTERACTIVE (`textField`/`numberField`/`toggle`/`select`/`slider`/`button`/`confirmButton`) — an action
 *     round-trip per transcript row is the multiply-by-length hazard the anchor exists to bound.
 *   - BULK (`list`/`keyValue`) — up to {@link PLUGIN_ROWS_MAX} rows each, under every message.
 *   - PROSE (`markdown`, `section`, `stack`) — `markdown` is in-bubble markup by another name, and the two
 *     block containers are panel grammar; a footer is one `row` of decorations. */
export const PLUGIN_FOOTER_NODE_KIND_ALLOWED = {
  stack: false,
  row: true,
  section: false,
  text: true,
  badge: true,
  meter: true,
  keyValue: false,
  list: false,
  image: true,
  markdown: false,
  textField: false,
  numberField: false,
  toggle: false,
  select: false,
  slider: false,
  button: false,
  confirmButton: false,
} as const satisfies Record<PluginNodeKind, boolean>;

// ── The `frame` tier's DOCUMENT BODY (U7, §6.2) ───────────────────────────────────────────────────────────────
// The bytes a frame surface renders. They are the plugin's OWN code and pass through VERBATIM — the frame IS the
// boundary, not a sanitizer (the `CardFrameContent` posture, `@orb/kit/card-frame`). What contains them is the
// isolated document: opaque origin, `default-src 'none'` with NO `connect-src`, `sandbox allow-scripts` and never
// `allow-same-origin`. What does NOT contain them is WebRTC (the measured, unclosable residual R1) — which is why
// this tier needs its own capability and its own consent line rather than riding `ui.surface`.
//
// THESE BYTES NEVER ENTER THE PROJECTED WIRE SHAPE. The body hangs off `PluginSurfaceRegistration`
// (registrations.ts), NOT off {@link PluginSurfaceRegistrationMeta} — and `PluginSurfaceView extends
// PluginSurfaceRegistrationMeta`, so putting it here would have shipped every frame document to the client inside
// `listSurfaces`. The client names a (pluginId, surfaceId); the SERVER assembles the document from bytes it holds.
// That makes the plugin-frame doorway strictly NARROWER than the card-frame one it rides, whose mint carries the
// card's bytes in the request: a client cannot mint an arbitrary document at our own origin here.

/** A frame body's HTML cap. The card frame's own proven bound (`contracts/chat/card-frame.ts`), reused rather than
 *  re-guessed: generous for self-contained interface code, and it bounds per-instance retention with the count cap
 *  below. STATED LIMIT: a bundle-shipped BINARY asset (a live2d/VRM model) does not fit here and is not meant to —
 *  large assets ride the bundle `ui/assets/` → installer-CAS route (seam 11), which is a later phase. */
export const PLUGIN_FRAME_HTML_MAX_CHARS = 64_000;
/** A frame body's CSS cap — the card frame's bound, same reasoning. */
export const PLUGIN_FRAME_CSS_MAX_CHARS = 16_000;
/** How many `frame` surfaces ONE resident instance may register. `ui.register` has no count cap today because a
 *  declarative spec is already bounded to 32 KiB by {@link PLUGIN_SPEC_MAX_BYTES}; a frame body is 5× that, held for
 *  the instance lifetime, and multiplied by `PLUGIN_RESIDENT_RUNTIME_MAX`. Eight bounds the worst case to a few
 *  hundred KiB per plugin, and no honest plugin needs a ninth isolated document. */
export const PLUGIN_FRAME_SURFACES_MAX = 8;

/** The `frame` tier's document body — held server-side, assembled into the isolated document by the plugin-frame
 *  doorway (`entry/http/plugin-frame.ts`) and never projected to a client. */
export interface PluginFrameBody {
  /** The plugin's own markup + inline scripts, verbatim. */
  readonly html: string;
  /** The plugin's own stylesheet, if it ships one. */
  readonly css?: string | undefined;
}

/** The frame body's gate, applied host-side at registration (the trust boundary). It bounds SIZE only: the
 *  CONTENT is deliberately unconstrained — arbitrary pixels is the whole point of the tier, and the isolation is
 *  the response CSP, not a filter. Anything a filter here could plausibly catch is already reachable inside the
 *  document, and pretending otherwise would teach the next reader that this is a sanitizer. */
export const pluginFrameBodySchema = z.strictObject({
  html: z.string().max(PLUGIN_FRAME_HTML_MAX_CHARS),
  css: z.string().max(PLUGIN_FRAME_CSS_MAX_CHARS).optional(),
});

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
/** The GUEST-LOCAL tool name a `tool-card` surface names (`host.tools.register`'s `name` — the grammar
 *  `host-v1.ts` documents for it, before the host namespaces it to `plugin_<slug'>_<name>`). A surface names
 *  the tool the way its own `main.js` registered it; the WIRE name is derived host-side and never guessed
 *  client-side (`pluginToolWireName`, `registrations.ts` — the ONE mint). */
export const PLUGIN_TOOL_NAME_RE = /^[a-z][a-z0-9_]{0,40}$/;
/** The shell label line cap (`host.ui.register`'s `title`; plugin-ui-plane §4.2). */
export const PLUGIN_SURFACE_TITLE_MAX = 80;

/** The SERIALIZABLE part of a `host.ui.register` def — validated host-side at collection (the trust boundary)
 *  AND the exact descriptor `plugin.listSurfaces` projects to the client renderer. The `onAction` handler is NOT
 *  here (it is a guest function, kept as an opaque `PluginHandlerRef` on the collected
 *  {@link PluginSurfaceRegistration}); `spec` is REQUIRED for a static-tier surface to render anything, but is
 *  optional at THIS schema because a scripted-tier (U4) surface computes its tree client-side. An invalid meta
 *  is a REGISTRATION refusal (surface absent + a plugin log line), never activation-fatal (plugin-ui-plane §4.9).
 *
 *  `toolName` is the `tool-card` LINKAGE (U3): which of the plugin's OWN tools this card renders, named the way
 *  `host.tools.register` took it. It is a BICONDITIONAL with the anchor — a `tool-card` without a `toolName`
 *  could never be matched to a call (a card nobody can reach), and a `toolName` on any other anchor is a claim
 *  the renderer would never honour. Both halves are the same registration refusal, so a stale linkage costs the
 *  generic tool block and a log line, never the plugin's activation.
 *
 *  The two PER-ANCHOR belts below (U3's `toolName` biconditional and U6's `message-footer` clamps) are the same
 *  class of rule and deliberately live at the same seam: the node schema bounds ONE node and the spec schema
 *  bounds the whole tree, but neither knows WHERE the tree is about to mount. */
export const pluginSurfaceRegistrationMetaSchema = z
  .object({
    id: z.string().regex(PLUGIN_SURFACE_ID_RE),
    anchor: z.enum(PLUGIN_SURFACE_ANCHORS),
    title: z.string().min(1).max(PLUGIN_SURFACE_TITLE_MAX),
    tier: z.enum(PLUGIN_SURFACE_TIERS),
    spec: pluginSurfaceSpecSchema.optional(),
    toolName: z.string().regex(PLUGIN_TOOL_NAME_RE).optional(),
  })
  // THE PER-ANCHOR BELTS, in one place. `superRefine` (the U6 message-footer clamps) precedes the U3
  // `tool-card` biconditional; both run, and a spec that violates both reports both.
  .superRefine((meta, ctx) => {
    if (!PLUGIN_ANCHOR_TIERS[meta.anchor][meta.tier]) {
      ctx.addIssue({ code: "custom", message: `the '${meta.anchor}' anchor does not admit the '${meta.tier}' tier`, path: ["tier"] });
    }
    // U7: a `frame` surface produces a DOCUMENT, not a node tree. A spec alongside it would be a second, silently
    // unrendered description of the same surface — and, worse, a `frame` registration that smuggled a spec past
    // `ui.register` would render as a declarative surface for a plugin that never held `ui.surface`.
    if (meta.tier === "frame" && meta.spec !== undefined) {
      ctx.addIssue({ code: "custom", message: "a frame-tier surface renders its own document and names no `spec`", path: ["spec"] });
    }
    if (meta.anchor !== "message-footer" || meta.spec === undefined) {
      return;
    }
    const { nodes, maxDepth } = surfaceStats(meta.spec, 1);
    if (nodes > PLUGIN_FOOTER_MAX_NODES) {
      ctx.addIssue({ code: "custom", message: `a message-footer spec exceeds ${PLUGIN_FOOTER_MAX_NODES} nodes`, path: ["spec"] });
    }
    if (maxDepth > PLUGIN_FOOTER_MAX_DEPTH) {
      ctx.addIssue({ code: "custom", message: `a message-footer spec exceeds nesting depth ${PLUGIN_FOOTER_MAX_DEPTH}`, path: ["spec"] });
    }
    for (const kind of unallowedFooterKinds(meta.spec)) {
      ctx.addIssue({ code: "custom", message: `the '${kind}' node is not spellable at the message-footer anchor (decoration kinds only)`, path: ["spec"] });
    }
  })
  .refine((meta) => (meta.anchor === "tool-card") === (meta.toolName !== undefined), {
    message: "a tool-card surface must name its `toolName`, and only a tool-card surface may name one",
    path: ["toolName"],
  });
export type PluginSurfaceRegistrationMeta = z.infer<typeof pluginSurfaceRegistrationMetaSchema>;

/** Every DISTINCT node kind in `spec` that {@link PLUGIN_FOOTER_NODE_KIND_ALLOWED} refuses, in first-seen
 *  order — one issue per offending KIND (not per occurrence), so a spec of forty buttons reports once. */
function unallowedFooterKinds(spec: PluginSurfaceSpec): readonly PluginNodeKind[] {
  const offenders = new Set<PluginNodeKind>();
  const walk = (node: PluginSurfaceNode): void => {
    if (!PLUGIN_FOOTER_NODE_KIND_ALLOWED[node.kind]) {
      offenders.add(node.kind);
    }
    if (node.kind === "stack" || node.kind === "row" || node.kind === "section") {
      for (const child of node.children) {
        walk(child);
      }
    }
  };
  walk(spec);
  return [...offenders];
}

// ── The tool-card BINDING ROOT (U3, seam 7 — plugin-ui-plane §4.5's `tool-card` row) ─────────────────────────

/** What a `tool-card` spec's `{ $state: "…" }` paths resolve against — the persisted `ToolCallRecord` of the
 *  call being rendered, projected. It is the ONE thing a card binds: a tool card has no `host.ui.setState`
 *  plane (a card is per-CALL, and published state is per-(plugin, surface) — binding a card to it would make
 *  every historical call in the transcript repaint with the latest draw).
 *
 *  - `args` — the model's arguments, JSON-parsed; the raw string when it does not parse (a model can emit
 *    malformed JSON, and the record is provenance-faithful).
 *  - `result` — the handler's returned document, JSON-parsed; the raw string when it is not JSON (the guest's
 *    return flows back verbatim, so a plugin that returns prose gets prose here). `null` = not executed.
 *  - `isError` / `durationMs` — the record's own outcome facts, so a card can badge a failure without the
 *    plugin having to encode it into its result.
 *
 *  A plugin authoring a card therefore binds `{ $state: "result.<field>" }` — which is why the seeded
 *  oracle-deck returns a JSON document rather than a sentence.
 *
 *  The client builds it as a `satisfies PluginToolCardState` OBJECT LITERAL rather than an annotated value:
 *  the renderer resolves paths against a `Record<string, unknown>`, and an interface-typed value has no
 *  implicit index signature (an annotation here would force a cast at the seam). */
export interface PluginToolCardState {
  readonly args: unknown;
  readonly result: unknown;
  readonly isError: boolean;
  readonly durationMs: number | null;
}
