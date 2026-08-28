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
// SCOPE (U0): the anchors + tiers + the node union + zod + the global caps + the `$state` binding.
// U5 (seam 16) ADDED, each with its first consumer landing in the same change: the `page` + `dialog` anchors,
// the `grid`/`masterDetail`/`searchBar` browse vocabulary, the `image` aspect, and the command + toast +
// dialog-open vocabulary the host-mediated affordances speak (§4.5a/§4.5b).
// STILL DEFERRED, each with its first consumer and its own phase (never a guess): the `$chatVar` binding (waits
// on the chat-vars read proc) and the `when` CEL visibility predicate (priced with the node that first needs
// it). Adding those is a priced phase, not a widening of this file.

import type { AssetId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

// ── Vocabulary axes (closed tuples; a member is a compile-tier fact) ─────────────────────────────────────────

/** Where a plugin surface may MOUNT — each rides an EXISTING door-assembled family via ONE first-party
 *  contribution owned by `features/plugin` (plugin-ui-plane §4.5).
 *
 *  `message-footer` (U6, §5.4) is the ONE PER-ROW anchor: it mounts once per COMMITTED transcript row, so its
 *  cost multiplies by transcript length and it carries its own tighter bounds — {@link PLUGIN_ANCHOR_TIERS}
 *  (static only, permanently), {@link PLUGIN_FOOTER_NODE_KIND_ALLOWED} (decoration kinds only) and the two
 *  per-row caps below. Every one of those is a COMPILE-tier fact, not prose.
 *
 *  U5 (seam 16) added the last two, and they are different in KIND from the first five, which is worth saying
 *  because the doc calls `dialog` "a fifth surface KIND (not an anchor)":
 *   - `page` IS a mount point — the Extensions rail section's page switcher (§4.5b) renders it in CONTENT.
 *   - `dialog` mounts NOWHERE by itself: it is a house modal a plugin OPENS during a client-initiated round-trip
 *     (`host.ui.openDialog`, whose only delivery channel is the outcome of an action/command the person just
 *     ran — §4.5a). A spontaneous open is therefore unspellable rather than merely refused. It shares this tuple
 *     because it shares the REGISTRATION vocabulary: it is registered, titled, tiered and spec'd exactly like
 *     every other surface, and a second axis for one member would be the parallel map the house kills. */
export const PLUGIN_SURFACE_ANCHORS = ["settings", "chat-flank", "chat-settings-section", "tool-card", "message-footer", "page", "dialog"] as const;
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

/** An `image` node's ASPECT — the BROWSE-GENRE addition (U5, §4.5b failure 1). A cover image in a `grid` tile
 *  must reserve its box before the bytes land or the whole grid reflows on decode, and the three ratios below
 *  are the ones a media shelf actually uses. A plugin names a RATIO, never a pixel. Absent ⇒ the primitive's own
 *  intrinsic sizing (what every U0 `image` node already got). */
export const PLUGIN_IMAGE_ASPECTS = ["square", "portrait", "landscape"] as const;
export type PluginImageAspect = (typeof PLUGIN_IMAGE_ASPECTS)[number];

/** A `masterDetail` STAGE's kind — the page arrangement's two halves (U5, §4.5b failure 2). `browse` is the
 *  results half (a `grid`/`list`), `detail` is the DECISION half and it renders differently by construction: a
 *  hero slot above a READING-WIDTH prose column, which is exactly what the purged hub's drawer-crammed preview
 *  did not have. The plugin declares which stage it is; the host owns what that means. */
export const PLUGIN_PAGE_STAGE_KINDS = ["browse", "detail"] as const;
export type PluginPageStageKind = (typeof PLUGIN_PAGE_STAGE_KINDS)[number];

/** Every node kind, in the §4.3 table order (the three BROWSE-GENRE kinds appended by U5, §4.5b). This tuple
 *  and {@link PluginSurfaceNode}'s `kind` discriminants are pinned equal at the type level
 *  (tests/contracts/plugin/ui.test-d.ts) and the client renderer's exhaustive `Record<NodeKind, Renderer>`
 *  covers it — a new kind fails `tsc` until it is rendered. */
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
  "grid",
  "masterDetail",
  "searchBar",
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
/** The rendered-tile cap on a `grid` node (U5). Same posture as {@link PLUGIN_ROWS_MAX} and the same number: a
 *  tile costs more paint than a row, and a browse page that needs more than 64 results on screen at once needs
 *  paging (which is the plugin's own `actionId` round-trip, not a bigger cap). */
export const PLUGIN_GRID_TILES_MAX = 64;
/** The stage cap on a `masterDetail` node (U5) — a page arrangement, not a router. Two is the shape the genre
 *  needs (browse → detail); the headroom is for a plugin that splits browse by source. */
export const PLUGIN_PAGE_STAGES_MAX = 8;

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
  // a per-row frame is one document per transcript row. Neither is ever eligible here. This row is the whole
  // reason the record is TOTAL — the `frame` tier could not land here by omission, someone had to type `false`.
  "message-footer": { static: true, scripted: false, frame: false },
  // U5 (§4.5b/§4.5a): a full page and a house dialog both admit the scripted tier — a page IS the surface a
  // "lots of bits and bobs" extension needs client-immediate interaction on (U4 lands its guest), and a dialog
  // is a page-scale body in a modal shell. Neither multiplies per row.
  //
  // `frame: false` for BOTH, and it is a DELIBERATE conservative default at the U5×U7 merge, NOT the design's
  // final word. §6.2 names `page` and `dialog` among the hatch's anchors, so both are frame-ELIGIBLE — but a
  // frame tier that an anchor admits with no first-party mount to render it is the "empty labelled box" the
  // flank law forbids (a listed-but-undrawn surface). U7 wired the frame mount for chat-flank/settings/tool-card
  // only; U5's page/dialog surfaces render declarative specs, not a `PluginFrame`. So the anchor REFUSES a frame
  // here until the client mount lands — flip to `true` WITH that mount, never before it (root-slot-lands-with-
  // occupant, one axis over). Reported as a U7-follow-up at the merge.
  page: { static: true, scripted: true, frame: false },
  dialog: { static: true, scripted: true, frame: false },
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
  // U5 browse-genre kinds (§4.5b) — all REFUSED at the footer: a `grid` is a whole browse surface, and
  // `masterDetail`/`searchBar` are page arrangements. A per-row transcript decoration is one `row` of badges,
  // never a page under every message.
  grid: false,
  masterDetail: false,
  searchBar: false,
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
  /** Reserve a fixed RATIO box (U5) — a token-named ratio, never a pixel. See {@link PLUGIN_IMAGE_ASPECTS}. */
  readonly aspect?: PluginImageAspect | undefined;
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

// ── The BROWSE-GENRE vocabulary (U5, §4.5b) ──────────────────────────────────────────────────────────────────
// The design input is a MINED FAILURE LIST, not a wish list: the repo's own purged `features/hub` rendered a
// VISUAL medium as `ListRow`s, gave its decision surface the least design, stacked its controls at equal weight,
// and lost browse context on every switch. The owner's verdict on it is on the record. So these three kinds are
// shaped to make the row-list browse the HARD thing to build and the media-forward one the default: `grid` has no
// text-only arm (a tile has a cover slot), `masterDetail`'s detail stage is a hero + reading-width column rather
// than a drawer, and `searchBar` structurally SUBORDINATES its filters to the one primary query. Page STATE is
// free in this model — it lives in the guest/server and rides `$state`, so a stage switch or a query keeps
// everything the plugin published.

/** ONE media-forward tile in a {@link PluginGridNode}. The `image` slot is FIRST-CLASS and the whole point: the
 *  genre's primary signal is the art, and a tile without one falls back to a shape-matched placeholder rather
 *  than collapsing into a row. `actionId` makes the tile the round-trip (a browse click), absent = display-only. */
export interface PluginGridTile {
  /** The tile's own key + the `values.tile` the round-trip carries, so a handler knows WHICH tile was picked. */
  readonly id: string;
  readonly title: PluginBoundString;
  readonly subtitle?: PluginBoundString | undefined;
  readonly badge?: PluginBoundString | undefined;
  /** The cover image — an asset in the INSTALLER's CAS (the `image` node's rule, one home for the wall). */
  readonly assetId?: AssetId | undefined;
  readonly alt?: string | undefined;
  /** Names the server round-trip a click fires; the collected `values` gain `tile: <this tile's id>`. */
  readonly actionId?: string | undefined;
}

/** A media-forward TILE GRID (U5) — the browse shape that replaces results-as-rows. Renders through the house
 *  `MediaTileGrid` composite in `@orb/ui` (the §4.3 shelf-exposure rule: a browse-genre gap in the shelf is what
 *  failure 1 WAS, so the composite lands in the shelf and benefits the whole app, never in the plugin feature). */
export interface PluginGridNode {
  readonly kind: "grid";
  readonly tiles: readonly PluginGridTile[];
  /** The tile cover's reserved ratio — one decision for the whole grid, so tiles cannot shear. @defaultValue "portrait" */
  readonly aspect?: PluginImageAspect | undefined;
  /** What the grid says when it has no tiles — the three-states law reaching INTO the vocabulary. Absent ⇒ the
   *  host's own neutral line; a plugin that names one gets a teaching empty for free. */
  readonly empty?: string | undefined;
}

/** ONE stage of a {@link PluginMasterDetailNode}. A `detail` stage renders its `hero` above a reading-width
 *  column; a `browse` stage renders its body full-width. The plugin never spells a width. */
export interface PluginPageStage {
  readonly id: string;
  readonly kind: PluginPageStageKind;
  /** The stage's headline (a detail stage's subject name; a browse stage's result-set label). */
  readonly title?: PluginBoundString | undefined;
  /** The DETAIL stage's hero art — the moment a person decides. Ignored on a `browse` stage. */
  readonly hero?: { readonly assetId: AssetId; readonly alt?: string | undefined } | undefined;
  readonly body: PluginSurfaceNode;
}

/** The PAGE ARRANGEMENT (U5): declared stages, one active. `active` is a bound string so the ACTIVE STAGE is
 *  ordinary published state — which is what makes "page state persists across the switcher and stage nav" free
 *  rather than a mount-lifetime problem: the guest publishes the stage it wants, and a person who leaves the
 *  Extensions section and comes back lands on it again. An `active` naming no stage resolves to the FIRST stage
 *  (never nothing — a page that renders blank is the failure this arm exists to prevent). */
export interface PluginMasterDetailNode {
  readonly kind: "masterDetail";
  readonly stages: readonly PluginPageStage[];
  readonly active?: PluginBoundString | undefined;
}

/** The PAGE's one prominent query slot (U5) — at most one per spec (a superRefine on the spec root enforces it,
 *  because "prominent" is a claim two of them refute). `filters` renders as a COLLAPSED disclosure beneath it:
 *  the hierarchy the purged surface flattened, encoded structurally instead of asked for in review. */
export interface PluginSearchBarNode {
  readonly kind: "searchBar";
  /** The values-bag key the query lands under (the form-field `name` grammar). */
  readonly name: string;
  readonly label: string;
  readonly placeholder?: string | undefined;
  readonly value?: string | undefined;
  /** Fired when the person submits the query (Enter / the search button). Absent = the query is collected into
   *  `values` and travels with whatever action the page fires next. */
  readonly actionId?: string | undefined;
  /** The long tail, disclosed rather than stacked. Any nodes — typically the form leaves. */
  readonly filters?: readonly PluginSurfaceNode[] | undefined;
  /** The disclosure's own label. @defaultValue "Filters" */
  readonly filtersLabel?: string | undefined;
}

/** One node in a plugin surface spec — the closed discriminated union rendered by the ONE first-party
 *  renderer. Recursive through the three container kinds (`stack`/`row`/`section`) and, since U5, through
 *  `masterDetail`'s stage bodies and `searchBar`'s filter tail. */
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
  | PluginConfirmButtonNode
  | PluginGridNode
  | PluginMasterDetailNode
  | PluginSearchBarNode;

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
    z.object({
      kind: z.literal("image"),
      assetId: typeIdSchema(ID_PREFIX.asset),
      alt: z.string().max(LABEL_MAX).optional(),
      aspect: z.enum(PLUGIN_IMAGE_ASPECTS).optional(),
    }),
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
    // ── The U5 browse-genre arms. `grid` has no text-only shape by construction; the cover slot is where the
    //    genre's signal lives, so an absent `assetId` is a shape-matched placeholder, not a row.
    z.object({
      kind: z.literal("grid"),
      tiles: z
        .array(
          z.object({
            id: identSchema,
            title: boundString(LABEL_MAX),
            subtitle: boundString(LABEL_MAX).optional(),
            badge: boundString(LABEL_MAX).optional(),
            assetId: typeIdSchema(ID_PREFIX.asset).optional(),
            alt: z.string().max(LABEL_MAX).optional(),
            actionId: identSchema.optional(),
          }),
        )
        .max(PLUGIN_GRID_TILES_MAX),
      aspect: z.enum(PLUGIN_IMAGE_ASPECTS).optional(),
      empty: z.string().max(LABEL_MAX).optional(),
    }),
    z.object({
      kind: z.literal("masterDetail"),
      stages: z
        .array(
          z.object({
            id: identSchema,
            kind: z.enum(PLUGIN_PAGE_STAGE_KINDS),
            title: boundString(LABEL_MAX).optional(),
            hero: z.object({ assetId: typeIdSchema(ID_PREFIX.asset), alt: z.string().max(LABEL_MAX).optional() }).optional(),
            body: pluginSurfaceNodeSchema,
          }),
        )
        .min(1)
        .max(PLUGIN_PAGE_STAGES_MAX),
      active: boundString(LABEL_MAX).optional(),
    }),
    z.object({
      kind: z.literal("searchBar"),
      name: identSchema,
      label: labelSchema,
      placeholder: z.string().max(LABEL_MAX).optional(),
      value: z.string().max(LABEL_MAX).optional(),
      actionId: identSchema.optional(),
      filters: z.array(pluginSurfaceNodeSchema).max(PLUGIN_ROWS_MAX).optional(),
      filtersLabel: labelSchema.optional(),
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

/** Every child node one node carries, whatever shape it carries them in — the ONE home for "what recurses",
 *  and EXPORTED because there are five walks over this tree and they must not each re-spell the rule: the cap
 *  walk + the searchBar census here, and the renderer's depth belt, image-id sweep and form-default collector on
 *  the client. THE U5 HAZARD THIS CLOSES: `masterDetail` and `searchBar` carry children under fields that are
 *  NOT called `children`, so every walk that knew only the three container kinds went silently blind to an
 *  arbitrarily deep subtree — the cap walk reporting a passing node count over it, the image sweep never
 *  resolving a cover inside a stage, the default collector never seeding a filter's field. One seam, five
 *  readers, and a sixth recursive kind is one edit here. */
export function pluginChildNodes(node: PluginSurfaceNode): readonly PluginSurfaceNode[] {
  if (node.kind === "stack" || node.kind === "row" || node.kind === "section") {
    return node.children;
  }
  if (node.kind === "masterDetail") {
    return node.stages.map((stage) => stage.body);
  }
  if (node.kind === "searchBar") {
    return node.filters ?? [];
  }
  return [];
}

/** Walk the tree once, counting nodes and the deepest nesting (root = 1). Recursion is whatever
 *  {@link pluginChildNodes} reports — never a per-kind guess at this site. */
function surfaceStats(node: PluginSurfaceNode, depth: number): { readonly nodes: number; readonly maxDepth: number } {
  let nodes = 1;
  let maxDepth = depth;
  for (const child of pluginChildNodes(node)) {
    const childStats = surfaceStats(child, depth + 1);
    nodes += childStats.nodes;
    maxDepth = Math.max(maxDepth, childStats.maxDepth);
  }
  return { nodes, maxDepth };
}

/** Count `searchBar` nodes anywhere in the tree — the "one prominent query per page" claim, made checkable. */
function countSearchBars(node: PluginSurfaceNode): number {
  let count = node.kind === "searchBar" ? 1 : 0;
  for (const child of pluginChildNodes(node)) {
    count += countSearchBars(child);
  }
  return count;
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
  // ONE prominent query per surface (U5, §4.5b failure 3). This is a STRUCTURAL enforcement of a hierarchy
  // claim, not tidiness: the whole point of the `searchBar` slot is that the query outranks the filters, and
  // two of them on one page is a flat control stack wearing the slot's name.
  if (countSearchBars(spec) > 1) {
    ctx.addIssue({ code: "custom", message: "a surface spec may declare at most one searchBar" });
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

// ── Tier C — the `plugin.uiHostCall` WIRE bounds (U4, §4.6/§9) ────────────────────────────────────────────────
//
// The client guest's ONE wire is a relay: it hands the server a function NAME plus its arguments as an INERT
// JSON STRING, and gets an inert JSON string back. That marshalling is not a stylistic choice — it is the
// `infra/plugin-host/marshal.ts` "nothing live crosses" law reused at a second boundary, and a string is what
// makes the size bound EXACT (a structured `unknown` on the wire can only be bounded after it is materialized,
// which is the allocation the bound exists to prevent). Both caps below sit at the SAME 1 MiB the server
// membrane uses for its own inbound args / outbound results (`HOST_FN_ARGS_MAX_BYTES` /
// `HOST_FN_RESULT_CAP_BYTES`); they are re-declared here rather than imported because `infra` is above
// `contracts` in the cake and a client cannot reach it — the numbers are pinned equal by
// `tests/contracts/plugin/ui.contract.test.ts`, not by hope.

/** Max serialized bytes of ONE `plugin.uiHostCall` argument payload (the client→server direction). */
export const PLUGIN_UI_HOST_CALL_ARGS_MAX_BYTES = 1_048_576;
/** Max serialized bytes of ONE `plugin.uiHostCall` result payload (the server→client direction). */
export const PLUGIN_UI_HOST_CALL_RESULT_MAX_BYTES = 1_048_576;
/** Max bytes of a `ui.js` bundle entry — the SAME ceiling `main.js` carries (one pre-bundled ES script per
 *  guest, `domain/plugin/substrate/manifest.ts`). Declared here so the bytes ROUTE and the unzip allow-list
 *  cite one number. */
export const PLUGIN_UI_ENTRY_MAX_BYTES = 1_048_576;

/** The owner-gated route serving a plugin's `ui.js` as INERT BYTES: `GET /api/plugin-ui/:pluginId` (the
 *  `BLOB_ROUTE` precedent — the path is a contract, not a client-side string, so the route and its one caller
 *  cannot drift). The response is `application/octet-stream` + `nosniff`, so a `<script src>` pointed at it is
 *  MIME-REFUSED by the browser: the client fetches it as TEXT and hands it to the interpreter, and "these bytes
 *  are not script" is a property of the RESPONSE rather than of the caller remembering to be careful. */
export const PLUGIN_UI_ROUTE = "/api/plugin-ui";

/** The TREE a scripted guest publishes through `orb.ui(1).render(surfaceId, tree)` — the SAME closed
 *  vocabulary a static surface's `spec` uses, so there is exactly one node union in the system and the
 *  first-party renderer is the same code for both tiers. Re-validated CLIENT-side before mount
 *  (`pluginSurfaceSpecSchema`): the guest is untrusted in the browser exactly as it is on the server, and the
 *  worker boundary is not a validation. */
export type PluginRenderedTree = PluginSurfaceSpec;

// ── COMMANDS (U5, §4.5) — `host.ui.registerCommand` ──────────────────────────────────────────────────────────
// A plugin command is NOT a slash-command contribution: the door assembles ONE static `/plugin` dispatcher and
// a first-party "Plugins" chrome menu, and both fan per-plugin off `plugin.listCommands`. The door therefore
// never grows when a person installs a plugin (the one-assembly law, G8), and a plugin can never invent a
// top-level token — `/plugin <slug> <name> …` is the whole grammar it reaches. Per-command FIRST-CLASS palette
// rows are U8 (the dynamic palette source), deliberately not this.

/** A command's guest-local `name` — the surface-id grammar, for the same reason: it is a programmatic key
 *  (the dispatch token after the slug), never arbitrary text. */
export const PLUGIN_COMMAND_NAME_RE = /^[a-z][a-z0-9_]{0,40}$/;
/** The one-line help a command shows in the palette row / menu item. */
export const PLUGIN_COMMAND_DESCRIBE_MAX = 200;
/** The arg-string a `/plugin <slug> <name> <rest>` dispatch hands the guest, capped at the membrane. A command
 *  is a control affordance, not a paste target — a plugin that needs a document takes it through its own surface. */
export const PLUGIN_COMMAND_ARGS_MAX = 2000;

/** The SERIALIZABLE part of a `host.ui.registerCommand` def — validated host-side at collection (the trust
 *  boundary) and the exact descriptor `plugin.listCommands` projects to the client. The `onRun` handler is NOT
 *  here (it is a guest function kept as an opaque `PluginHandlerRef` on the collected registration). */
export const pluginCommandRegistrationMetaSchema = z.object({
  name: z.string().regex(PLUGIN_COMMAND_NAME_RE),
  describe: z.string().min(1).max(PLUGIN_COMMAND_DESCRIBE_MAX),
});
export type PluginCommandRegistrationMeta = z.infer<typeof pluginCommandRegistrationMetaSchema>;

// ── TOASTS + DIALOG OPENS (U5, §4.5a) — the HOST-MEDIATED affordances ────────────────────────────────────────
// Both are host chrome a plugin ASKS for, never draws: a toast is the house toast prefixed with the plugin's
// name, a dialog is the house modal with a plugin-attributed title. Neither is a vocabulary node, which is the
// impersonation wall stated at the compile tier (§4.3: "toasts and dialogs are NOT nodes").
//
// THE DELIVERY CHANNEL IS THE ROUND-TRIP OUTCOME, and that is the design, not a shortcut. A guest calls
// `host.ui.toast`/`openDialog` during an invocation; the domain stashes the item in the plugin's bounded UI
// OUTBOX, and the outbox DRAINS onto the result of the action/command the person just ran. Consequences, stated
// because they are the load-bearing half:
//   - A dialog can only appear as the outcome of an explicit user act on one of the plugin's own surfaces or
//     commands. "Open a modal spontaneously" has no channel to travel on — it is unspellable, not refused.
//   - A toast raised OUTSIDE a client round-trip (an event handler, a resident tool) has no viewer to show it
//     to. It waits in the bounded outbox for the person's next round-trip with that plugin, or is evicted. The
//     durable channel for "tell the user something that must not be lost" stays `notify` (the notifications
//     capability), and this one is honestly transient.

/** A plugin toast's severity — the HOUSE `notify` arms, spelled once here so the client dispatch is a total
 *  `Record<PluginToastLevel, …>` over the house's own vocabulary and a widened arm fails `tsc` at the renderer. */
export const PLUGIN_TOAST_LEVELS = ["info", "success", "warn", "error"] as const;
export type PluginToastLevel = (typeof PLUGIN_TOAST_LEVELS)[number];

/** A toast body cap. Transient viewer-local feedback reads at a glance or it reads as noise; the durable,
 *  longer channel is `notifications.post` (200 chars, its own recipient rules). */
export const PLUGIN_TOAST_MAX_CHARS = 200;

/** The per-plugin toast RATE FLOOR, seconds — the `AUTOMATION_NOTICE_COOLDOWN_SECONDS` posture (a named
 *  constant, not a magic number buried in a belt). A toast is an INTERRUPTION of the person's attention, and
 *  the membrane admits up to 32 concurrent host calls per instance, so without a floor one plugin can bury the
 *  screen. Ten seconds is the shortest interval at which two separate toasts still read as two events. */
export const PLUGIN_TOAST_COOLDOWN_SECONDS = 10;

/** The bounded per-plugin UI outbox depth. Small on purpose: the outbox exists to carry an invocation's
 *  host-mediated effects to the person who triggered it, never to accumulate a backlog — a plugin whose toasts
 *  nobody is present for is a plugin talking to an empty room. Oldest is evicted. */
export const PLUGIN_UI_OUTBOX_MAX = 8;

/** ONE toast a plugin asked for. `pluginName` is stamped DOMAIN-side (the guest never supplies it — a
 *  guest-named prefix is exactly the impersonation this attribution exists to prevent). */
export interface PluginToast {
  readonly level: PluginToastLevel;
  readonly message: string;
}

/** What a client-initiated round-trip (`invokeUiAction` / `invokeUiCommand`) hands back: the host-mediated
 *  effects the guest asked for while it ran. `openDialog` names one of the plugin's OWN registered `dialog`
 *  surfaces (the verb resolves it against the resident instance and drops an unknown id — a plugin cannot open
 *  another plugin's dialog, nor a surface it never registered). LAST WRITE WINS on the dialog: an invocation
 *  that asks twice meant the second one, and two modals at once is not a state the shell has. */
export interface PluginUiOutcome {
  readonly toasts: readonly PluginToast[];
  readonly openDialog?: string;
}

/** Every DISTINCT node kind in `spec` that {@link PLUGIN_FOOTER_NODE_KIND_ALLOWED} refuses, in first-seen
 *  order — one issue per offending KIND (not per occurrence), so a spec of forty buttons reports once. */
function unallowedFooterKinds(spec: PluginSurfaceSpec): readonly PluginNodeKind[] {
  const offenders = new Set<PluginNodeKind>();
  const walk = (node: PluginSurfaceNode): void => {
    if (!PLUGIN_FOOTER_NODE_KIND_ALLOWED[node.kind]) {
      offenders.add(node.kind);
    }
    // The U5 recursion seam (`pluginChildNodes`) rather than the 3-container list: `masterDetail`/`searchBar`
    // carry children under non-`children` fields, and although the footer refuses those container kinds
    // outright at the node itself, the walk stays honest about the whole subtree it descends.
    for (const child of pluginChildNodes(node)) {
      walk(child);
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
