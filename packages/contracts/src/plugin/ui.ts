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
// #818 ADDED the `primary` button weight — SPELLABLE everywhere, HONOURED only where
// `PLUGIN_ANCHOR_PRIMARY_ALLOWED` says (page/dialog) and only once per anchor. It is the one rule in this file
// that is deliberately NOT a compile-tier or parse-tier refusal: the anchor is not known until mount, so the
// arbitration is the renderer's (`resolvePluginPrimaryButton`) and an over-claiming spec is DEMOTED, never
// rejected. See that tuple's own note for why the S1 one-primary law survives its input changing.
// STILL DEFERRED, each with its first consumer and its own phase (never a guess): the `$chatVar` binding (waits
// on the chat-vars read proc) and the `when` CEL visibility predicate (priced with the node that first needs
// it). Adding those is a priced phase, not a widening of this file.

import type { AssetId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { PLUGIN_TOOL_NAME_LOCAL_MAX, PLUGIN_UI_ASSET_ENTRY_RE } from "./manifest.ts";

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

/** A `badge` node's intent — a closed slice of the house Badge intents. `primary` is EXCLUDED and STAYS
 *  excluded: a badge is a static mark, not the surface's act, so it has no claim on the attention budget the
 *  #818 ruling reopened for `button` (see {@link PLUGIN_BUTTON_VARIANTS}). CONTENT's one primary is a CTA law. */
export const PLUGIN_BADGE_INTENTS = ["neutral", "info", "success", "warning", "danger"] as const;
export type PluginBadgeIntent = (typeof PLUGIN_BADGE_INTENTS)[number];

/** A `button` node's weight. The two NEUTRAL weights are unconditional; `primary` is ADMITTED (owner ruling
 *  2026-08-30, #818) but only ARBITRATED — spellable everywhere, HONOURED only where
 *  {@link PLUGIN_ANCHOR_PRIMARY_ALLOWED} says so, and only once per anchor.
 *
 *  THE RULING SURVIVES — ITS INPUT CHANGED. The S1 one-primary law was minted for the chat CONTROL BAND, whose
 *  attention budget the host owns and a plugin borrows; on a `page`/`dialog` anchor the plugin's surface IS the
 *  whole region and owns its own budget. So the law is not repealed, its condition is: the band keeps the clamp
 *  (a `primary` there is refused), a page gets exactly one.
 *
 *  IT IS ONE AXIS, NOT TWO. A separate `emphasis` slot beside `variant` would be the parallel map the house
 *  kills — a button has ONE weight, and this tuple is where it is named.
 *
 *  THE ARBITRATION IS A RENDER RULE, NEVER A PARSE RULE. Two `primary` buttons PARSE (`ui.register` accepts the
 *  spec) and the renderer honours the FIRST in document order, demoting every later one — see
 *  {@link resolvePluginPrimaryButton}. Refusing at registration would make a spec's admissibility depend on the
 *  anchor it is later mounted at, and would turn a hierarchy mistake into a dead surface. */
export const PLUGIN_BUTTON_VARIANTS = ["neutral", "outline", "primary"] as const;
export type PluginButtonVariant = (typeof PLUGIN_BUTTON_VARIANTS)[number];

/** An `image` node's ASPECT — the BROWSE-GENRE addition (U5, §4.5b failure 1). A cover image in a `grid` tile
 *  must reserve its box before the bytes land or the whole grid reflows on decode, and the three ratios below
 *  are the ones a media shelf actually uses. A plugin names a RATIO, never a pixel. Absent ⇒ the primitive's own
 *  intrinsic sizing (what every U0 `image` node already got). */
export const PLUGIN_IMAGE_ASPECTS = ["square", "portrait", "landscape"] as const;
export type PluginImageAspect = (typeof PLUGIN_IMAGE_ASPECTS)[number];

/** The `icon` node's GLYPH vocabulary (#799) — a CURATED closed slice of the sealed `@orb/ui` icon set
 *  (`packages/ui/src/primitives/icons/index.ts`), named in the lucide seal's own spelling, lower-camel. The
 *  client owns the ONE total `Record<PluginIconName, LucideIcon>`, so a member added here fails `tsc` until it
 *  is given a glyph — the same compile-tier discipline every axis in this file carries.
 *
 *  THE CURATION IS A WALL, not taste. Three classes are DELIBERATELY EXCLUDED and must stay excluded:
 *   - CHROME IDENTITY — `Blocks` (the plugin attribution glyph the shell stamps on every plugin surface,
 *     `plugin-surface-shell.tsx`) and the `OrbWeb`/`OrbWebCompact` brand marks. A plugin that could draw the
 *     app's own mark could dress its content as the app's.
 *   - CONSENT / TRUST — `Lock`/`LockOpen`/`Unlock`/`KeyRound`/`Shield`/`ShieldHalf`/`Ban`. The grant screen
 *     and the credential surfaces speak in these; a fake consent row wearing the house's trust glyphs is
 *     exactly the impersonation the §4.3 walls exist to make unspellable.
 *   - IDENTITY / HOST ANATOMY — `CircleUser`/`UserPlus`/`UserX`, `Settings`, `Menu`, the `Panel*` family. A
 *     plugin never draws a person's identity chrome or the shell's own anatomy.
 *  Growing this tuple is a vocabulary decision: check the new name against those three classes first. */
export const PLUGIN_ICON_NAMES = [
  // Signal / esteem
  "star",
  "heart",
  "flame",
  "sparkles",
  "award",
  "crown",
  "gem",
  "bookmark",
  // Counters — the stat-row genre this node was minted for
  "download",
  "eye",
  "clock",
  "hash",
  "tag",
  "users",
  "chartColumn",
  // Medium / genre markers
  "images",
  "fileText",
  "bookOpen",
  "scroll",
  "library",
  "drama",
  "swords",
  "leaf",
  "globe",
  "compass",
  "map",
  // Neutral status + affordance labels (the badge intents' glyph twins; no consent/trust glyph among them)
  "check",
  "info",
  "circleAlert",
  "alertTriangle",
  "search",
  "externalLink",
  "chevronRight",
  "arrowLeft",
  "x",
] as const;
export type PluginIconName = (typeof PLUGIN_ICON_NAMES)[number];

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
  // #799 — the two VOCABULARY-REACH kinds the card-atlas visual review named (stickler 2026-08-29 §3): a
  // glyph vocabulary (the shelf's icon set had NO spelling at all) and a first-class one-of-N strip (a
  // source switcher rendered as a `select` reads as long-tail configuration, not as the page's own axis).
  "icon",
  "tabs",
] as const;
export type PluginNodeKind = (typeof PLUGIN_NODE_KINDS)[number];

// ── Global caps (the trust bounds; enforced at the spec ROOT) ────────────────────────────────────────────────

/** The whole spec, serialized, must fit — the outermost DoS bound, 32 KiB (plugin-ui-plane §4.3). */
export const PLUGIN_SPEC_MAX_BYTES = 32_768;
/** Total node count across the tree. */
export const PLUGIN_SPEC_MAX_NODES = 256;
/** Container nesting depth (root = 1). */
export const PLUGIN_SPEC_MAX_DEPTH = 8;
/** A single `text`/`markdown`/`confirmButton` body value cap, 2 KiB — measured in BYTES (the schema runs
 *  `byteBoundedString`, not `z.string().max()`, so the name and the enforcement agree for non-ASCII text). */
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
/** The option cap on a `tabs` node (#799) — an order of magnitude under {@link PLUGIN_ROWS_MAX}, and the
 *  number IS the design: a segmented strip renders every option AT ONCE, so a strip that outgrows a single
 *  row stops being a strip and becomes a menu. A vocabulary bigger than this is a `select` — which the
 *  vocabulary already has, with a 64-option cap, for exactly that case. */
export const PLUGIN_TABS_OPTIONS_MAX = 8;
/** The tag cap on ONE grid tile (hub v1.2, tags-on-cards): the chip row is a scent — the words a person
 *  filters by — never a taxonomy dump; the renderer clips a row that outgrows its tile. */
export const PLUGIN_TILE_TAGS_MAX = 8;

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
  // `frame: true` for BOTH (#787 — the deliberate decision the U5×U7 merge deferred). §6.2 names `page` and
  // `dialog` among the hatch's anchors; the merge shipped them `frame: false` as a conservative default because a
  // frame tier an anchor admits with NO first-party mount to render it is the "empty labelled box" the flank law
  // forbids (a listed-but-undrawn surface). #787 is the follow-up that default named: the client mount now exists
  // at BOTH anchors — `ExtensionsPageSurface` renders a `page` frame inside its page-scale shell (the §9
  // impersonation band, the biggest canvas here), and `PluginDialogBody` renders a `dialog` frame inside the
  // house modal. So the anchor admits the tier WITH its occupant (root-slot-lands-with-occupant, one axis over),
  // never before it. A page/dialog frame is the §6.1 arbitrary-pixels arm at page/modal scale, and the priority
  // law still stands (§6.2 — a surface the vocabulary can express ships in the vocabulary; the frame is last
  // resort).
  page: { static: true, scripted: true, frame: true },
  dialog: { static: true, scripted: true, frame: true },
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
  // #799: `icon` is DECORATION — the exact class this anchor admits (`badge`/`text`/`meter`/`image`), and a
  // glyph beside a per-row badge is the "adjacent decoration" §5.4 describes. `tabs` is INTERACTIVE (an
  // action round-trip per transcript row), so it falls under the first exclusion class above.
  icon: true,
  tabs: false,
} as const satisfies Record<PluginNodeKind, boolean>;

/** WHICH ANCHORS HONOUR A `primary` BUTTON — the #818 owner ruling, coded in the
 *  {@link PLUGIN_FOOTER_NODE_KIND_ALLOWED} pattern one axis over (a TOTAL `Record<anchor, boolean>`, so a new
 *  {@link PLUGIN_SURFACE_ANCHORS} member fails `tsc` until someone DECIDES its attention budget rather than
 *  inheriting an answer from silence).
 *
 *  The line is WHO OWNS THE REGION'S ATTENTION BUDGET:
 *   - `page` / `dialog` — TRUE. The plugin's surface IS the whole region (a full CONTENT pane; a modal body),
 *     so its one decision affordance is the region's one primary. This is the F3 defect the ruling closed:
 *     card-atlas's "Summon to your library" carried the same visual weight as "Back to results".
 *   - every other anchor — FALSE, and each for the same reason: the surface is a GUEST inside host chrome whose
 *     primary belongs to the host. `chat-flank`/`chat-settings-section` are the chat CONTROL BAND the S1
 *     one-primary law was minted for; `settings` is a row inside the plugins pane; `tool-card` is one card in a
 *     transcript; `message-footer` is per-row decoration that already refuses `button` outright
 *     ({@link PLUGIN_FOOTER_NODE_KIND_ALLOWED}) — `false` here is the belt under that suspender.
 *
 *  This record decides ADMISSION only. The one-per-anchor count is {@link resolvePluginPrimaryButton}'s. */
export const PLUGIN_ANCHOR_PRIMARY_ALLOWED = {
  settings: false,
  "chat-flank": false,
  "chat-settings-section": false,
  "tool-card": false,
  "message-footer": false,
  page: true,
  dialog: true,
} as const satisfies Record<PluginSurfaceAnchor, boolean>;

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
 *  large assets ride the bundle `ui/assets/` → installer-CAS route (seam 11), which LANDED with #820: install
 *  and upgrade unpack the bundle's `ui/assets/` IMAGES into the installer's CAS and an `image`/`hero`/tile node
 *  names one by path ({@link PluginImageNode.bundleAsset}). A live2d/VRM model still does not ride it — that
 *  route admits the four raster image formats the magic-byte sniff can prove and refuses everything else. */
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
/** A boolean value that MAY be a state binding (#799) — minted for `grid.loading`, the first slot whose
 *  whole point is that it FLIPS between two publishes. */
export type PluginBoundBoolean = boolean | PluginStateBinding;

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
  /** Declared rows — spec structure, fixed at registration (values may still bind). Exactly ONE of
   *  `rows`/`rowsFrom` (the spec-level belt enforces it — the grid's declared-vs-bound discipline). */
  readonly rows?: readonly PluginKeyValueRow[] | undefined;
  /** THE BOUND ARM (hub v1.3): the row set itself is PUBLISHED STATE (`{ $state: "path" }` naming an
   *  array of `{key, value}` strings) — for a fact sheet whose CARDINALITY is data (a hub detail's
   *  per-provider stat rows: one hub answers three, another seven, and a fixed row set would show
   *  half a page of "—"). Resolved by {@link resolvePluginBoundKeyValueRows}: entries are UNTRUSTED
   *  STATE, so each is schema-validated (malformed ⇒ dropped) and the count clamps to
   *  {@link PLUGIN_ROWS_MAX} — state is never a loophole past the declared arm's bound. */
  readonly rowsFrom?: PluginStateBinding | undefined;
}
export interface PluginListNode {
  readonly kind: "list";
  readonly items: readonly PluginBoundString[];
}
export interface PluginImageNode {
  readonly kind: "image";
  /** An asset in the INSTALLER's CAS ONLY — a well-formed asset id (the `typeIdSchema` rejects a URL: the
   *  seam-11 "no URL arm exists" wall). The FORMAT is validated here; the CAS OWNERSHIP resolve is server-side.
   *  Exactly ONE of `assetId`/`assetFrom`/`bundleAsset` (the spec-level belt enforces it): declared for an
   *  asset the SPEC knows, bound for one the STATE carries, bundle for one the plugin SHIPPED. */
  readonly assetId?: AssetId | undefined;
  /** THE BOUND ARM (#774 ARM C): resolve the asset id from published state (`{ $state: "path" }`) — for an
   *  image whose subject is DATA, not structure (a photo plugin's detail view; a generated cover). The
   *  resolved value is UNTRUSTED STATE: it is format-validated at resolve (a non-TypeID string paints
   *  nothing) and then rides the SAME owner-scoped server resolve every declared `assetId` rides — a foreign
   *  owner's id yields no ref and the node renders its placeholder, NEVER another user's blob. */
  readonly assetFrom?: PluginStateBinding | undefined;
  /** THE BUNDLE ARM (#820 seam 11): art the plugin SHIPPED, named by its zip path (`ui/assets/happy.png`).
   *  It exists because the other two arms structurally cannot express it — a sprite pack's ids are minted by
   *  the CAS at INSTALL time, so the spec cannot know one and the guest is never told one.
   *
   *  IT IS A NAME, NEVER A LOCATION, and that is the whole security shape. The string is format-validated
   *  here against the SAME anchored, flat, alphanumeric-led pattern the install funnel admitted the zip entry
   *  under ({@link PLUGIN_UI_ASSET_ENTRY_RE}), so a URL, a traversal, a second path segment and an absolute
   *  path are all unspellable rather than filtered. At render it is looked up in the plugin's OWN
   *  install-time path→id map (`plugin.listBundleAssets`, gated by the owner-scoped `plugins` row load) and
   *  the resulting id then rides the SAME owner-scoped `assets.resolveBlobRefs` a declared `assetId` rides.
   *  So a path this plugin never shipped resolves to nothing and paints the placeholder — exactly like a
   *  foreign `assetId` — and the arm adds a name lookup, never a new way to reach bytes.
   *
   *  DECLARED-ONLY, deliberately: there is no `bundleAssetFrom`. A bundle's contents are fixed at install, so
   *  a path that came from published STATE would be untrusted input entering a namespace whose whole value is
   *  that it is spec structure. A plugin whose image is genuinely data-driven has `assetFrom` already. */
  readonly bundleAsset?: string | undefined;
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
  /** Fired when the person FLIPS the switch (hub v1.3) — the select's `actionId` arm one control over,
   *  for a toggle that drives the page (a content filter) rather than riding a later submit. The
   *  round-trip carries the whole collected `values` bag with the fresh value riding as an extra. */
  readonly actionId?: string | undefined;
}
export interface PluginSelectOption {
  readonly value: string;
  readonly label: string;
}
export interface PluginSelectNode {
  readonly kind: "select";
  readonly name: string;
  readonly label: string;
  /** Declared options — spec structure, fixed at registration. Exactly ONE of `options`/`optionsFrom`
   *  (the spec-level belt enforces it). */
  readonly options?: readonly PluginSelectOption[] | undefined;
  /** THE BOUND ARM (hub v1.3): the option set is PUBLISHED STATE (`{ $state: "path" }` naming an array
   *  of `{value, label}` strings) — for a select whose vocabulary is DATA (a per-hub sort menu: the
   *  members and their labels differ by which hub is picked, which a registration-fixed list
   *  structurally cannot express). Resolved by {@link resolvePluginBoundSelectOptions}: entries are
   *  UNTRUSTED STATE (validated, malformed dropped, clamped to {@link PLUGIN_ROWS_MAX}). */
  readonly optionsFrom?: PluginStateBinding | undefined;
  readonly value?: string | undefined;
  /** Fired when the person PICKS a value (hub v1.2) — the `searchBar.actionId` shape one control over, so a
   *  select that drives the page (a source switcher, a sort order) applies on change instead of sitting inert
   *  until some other submit. The round-trip carries the whole collected `values` bag, new value included.
   *  Absent = the U0 behavior: the choice is collected and travels with whatever action fires next. */
  readonly actionId?: string | undefined;
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
/** A GLYPH from the curated {@link PLUGIN_ICON_NAMES} tuple (#799) — the vocabulary's icon reach, which was
 *  previously NONE: a stat row could say "7.4k" but never mark it, and a source line could never carry its
 *  medium's glyph. It renders through the sealed `@orb/ui` `Icon` wrapper, so size/stroke/fill behave exactly
 *  as they do anywhere else in the app and a plugin still names a house primitive, never a package.
 *
 *  `label` is the ACCESSIBLE NAME and its ABSENCE is meaningful: omitted ⇒ the glyph is DECORATIVE
 *  (`aria-hidden`, the house default for an icon beside text — the tracker-kit rule that a glyph never
 *  carries information alone). A plugin naming a label is claiming the glyph is the only thing saying this,
 *  and gets a named image in the a11y tree for it. */
export interface PluginIconNode {
  readonly kind: "icon";
  readonly name: PluginIconName;
  readonly label?: string | undefined;
}
/** A ONE-OF-N SEGMENTED STRIP (#799) — the page's own axis, rendered ALL AT ONCE.
 *
 *  IT IS NOT A SECOND `select`, and the difference is the whole reason it exists. A `select` is long-tail
 *  configuration: its vocabulary is hidden until you open it, which is the right shape for a sort order and
 *  the wrong shape for the axis a browse page is ORGANISED BY (the card-atlas hub picker spent a release
 *  collapsed under "Filters" — stickler 2026-08-29 §3 limit 5). A strip shows every option, so the page
 *  states its own axis; that visibility is also why {@link PLUGIN_TABS_OPTIONS_MAX} is an order of magnitude
 *  under the select's cap.
 *
 *  IT RENDERS AS THE HOUSE RADIOGROUP STRIP, not as house `Tabs`, and that is deliberate: a `tablist` whose
 *  tabs point at no `tabpanel` is dangling ARIA, and this node cannot own panels — what a pick CHANGES is
 *  whatever the plugin republishes (its `masterDetail` stage, its grid), which lives in state, not in a
 *  panel this node could contain. The house one-of-N strip (`ToggleGroup semantics="radio"`) is the
 *  primitive that means exactly "pick one of these", so that is what it maps to.
 *
 *  The two option arms and the `actionId` are the `select`'s, verbatim (one grammar, two presentations):
 *  exactly one of `options`/`optionsFrom` (the spec-level belt), and the pick IS the act. */
export interface PluginTabsNode {
  readonly kind: "tabs";
  readonly name: string;
  /** The strip's accessible name (the a11y floor every form leaf carries) — rendered as the group's label. */
  readonly label: string;
  /** Declared options — spec structure, fixed at registration. */
  readonly options?: readonly PluginSelectOption[] | undefined;
  /** THE BOUND ARM: the option set is PUBLISHED STATE, resolved by {@link resolvePluginBoundTabOptions}
   *  (validated, malformed dropped, clamped to {@link PLUGIN_TABS_OPTIONS_MAX}) — for a strip whose axis is
   *  data (the hubs a plugin actually reached this session). */
  readonly optionsFrom?: PluginStateBinding | undefined;
  readonly value?: string | undefined;
  /** Fired when the person picks — a strip that sat inert until some other submit would be a switcher that
   *  does not switch. The round-trip carries the whole `values` bag with the fresh pick riding as an extra. */
  readonly actionId?: string | undefined;
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
  /** …or an image the plugin's own bundle shipped, by zip path (#820 — the `image` node's bundle arm, same
   *  rule and same wall). At most one of the two; neither is the shape-matched placeholder this genre wants
   *  when a tile has no cover. */
  readonly bundleAsset?: string | undefined;
  readonly alt?: string | undefined;
  /** The tile's tag/genre words (hub v1.2) — rendered as a clipped chip row under the subtitle, so a browse
   *  grid shows the vocabulary a person filters by. Plain strings on BOTH arms (a tag set is data, not a
   *  binding target); count-capped at {@link PLUGIN_TILE_TAGS_MAX}. */
  readonly tags?: readonly string[] | undefined;
  /** Names the server round-trip a click fires; the collected `values` gain `tile: <this tile's id>`. */
  readonly actionId?: string | undefined;
}

/** A media-forward TILE GRID (U5) — the browse shape that replaces results-as-rows. Renders through the house
 *  `MediaTileGrid` composite in `@orb/ui` (the §4.3 shelf-exposure rule: a browse-genre gap in the shelf is what
 *  failure 1 WAS, so the composite lands in the shelf and benefits the whole app, never in the plugin feature).
 *
 *  TWO TILE ARMS, exactly one per grid (the spec-level belt enforces it):
 *   - `tiles` — DECLARED: the tile set is spec structure, fixed at registration; per-tile fields may still
 *     bind values. Right when the collection is known up front (a fixed set of slots, a menu).
 *   - `tilesFrom` (#774 ARM C) — BOUND: the tile set is PUBLISHED STATE (`{ $state: "path" }` naming an array
 *     of {@link PluginBoundGridTile}), so its CARDINALITY is data. This is the browse-genre arm — a search's
 *     results, a gallery that grows — which a registration-fixed tile count structurally cannot express (a
 *     12-slot grid with 3 results is 9 ghost tiles; the mined §4.5b failure list one shape over). Resolved by
 *     {@link resolvePluginBoundTiles}: entries are UNTRUSTED STATE, so each is schema-validated (malformed ⇒
 *     dropped) and the count is clamped to {@link PLUGIN_GRID_TILES_MAX}; covers ride the SAME owner-scoped
 *     server resolve declared tiles ride. `tileAction` names ONE round-trip for every bound tile (the clicked
 *     tile's id rides as `values.tile`) — per-tile actions are a declared-arm affair. */
export interface PluginGridNode {
  readonly kind: "grid";
  readonly tiles?: readonly PluginGridTile[] | undefined;
  readonly tilesFrom?: PluginStateBinding | undefined;
  /** The bound arm's ONE actionId (ident grammar), fired with `values.tile = <clicked tile id>`. Absent ⇒ a
   *  display-only bound grid. Only legal WITH `tilesFrom` (the belt refuses it beside `tiles`). */
  readonly tileAction?: string | undefined;
  /** The tile cover's reserved ratio — one decision for the whole grid, so tiles cannot shear. @defaultValue "portrait" */
  readonly aspect?: PluginImageAspect | undefined;
  /** What the grid says when it has no tiles — the three-states law reaching INTO the vocabulary. Absent ⇒ the
   *  host's own neutral line; a plugin that names one gets a teaching empty for free. */
  readonly empty?: string | undefined;
  /** THE LOADING THIRD of the three-states law (#799), previously unreachable: `MediaTileGridSkeleton` has
   *  been on the shelf since U5 and nothing could spell it, so a browse grid mid-fetch sat on stale tiles or
   *  on its `empty` line — the state that is neither. Bound (or declared) TRUE ⇒ the grid renders the
   *  shape- and aspect-matched skeleton INSTEAD of tiles or the empty state, so the loading arm outranks
   *  both (a grid that is loading is not empty, and it is not showing you last query's results).
   *
   *  IT IS REACHABLE AT BOTH TIERS. A `scripted` guest holds its own state and flips this before it awaits.
   *  A `static` guest reaches it through the SETTLEMENT-WALL shape its handlers already use: publish
   *  `loading: true` synchronously, FLOAT the wire work, and republish `false` with the results — the second
   *  `setState`'s `pluginSurfaceStateChanged` poke repaints the surface. `card-atlas`'s search/page handlers
   *  are the worked example. */
  readonly loading?: PluginBoundBoolean | undefined;
}

/** ONE tile of a BOUND grid (`tilesFrom`) as the plugin PUBLISHES it in state. The declared-tile shape minus
 *  the binding arms (state inside state would be a hall of mirrors) and minus `actionId` (the grid-level
 *  `tileAction` owns the round-trip). It crosses as published state, so it is validated at RESOLVE, not at
 *  registration — {@link pluginBoundGridTileSchema} is that gate. */
export interface PluginBoundGridTile {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string | undefined;
  readonly badge?: string | undefined;
  /** A cover in the INSTALLER's CAS — the `image` node's wall, one home: format-validated here, ownership
   *  resolved server-side (foreign ⇒ no ref ⇒ placeholder). */
  readonly assetId?: AssetId | undefined;
  readonly alt?: string | undefined;
  /** The tile's tag/genre chip row (hub v1.2) — the declared arm's `tags`, published as state. */
  readonly tags?: readonly string[] | undefined;
}

/** ONE stage of a {@link PluginMasterDetailNode}. A `detail` stage renders its `hero` above a reading-width
 *  column; a `browse` stage renders its body full-width. The plugin never spells a width. */
export interface PluginPageStage {
  readonly id: string;
  readonly kind: PluginPageStageKind;
  /** The stage's headline (a detail stage's subject name; a browse stage's result-set label). */
  readonly title?: PluginBoundString | undefined;
  /** The DETAIL stage's hero art — the moment a person decides. Ignored on a `browse` stage. */
  readonly hero?: PluginPageHero | undefined;
  readonly body: PluginSurfaceNode;
}

/** A detail stage's hero art. Exactly ONE of `assetId`/`assetFrom`/`bundleAsset` (the spec-level belt enforces
 *  it), the `image` node's rule one plane over: `assetId` is declared for art the SPEC knows, `assetFrom`
 *  (#774 ARM C / plugin-remote-image #798) BINDS the id from published state — for a hero whose subject is
 *  DATA (a hub cover a plugin just `net.fetchAsset`ed, a photo plugin's detail view) — and `bundleAsset`
 *  (#820) names art the plugin SHIPPED. No arm is a LOCATION: NO URL is ever
 *  spellable here (the anti-exfil-pixel wall), and the bound arm's resolved value is UNTRUSTED STATE —
 *  format-validated at resolve (a non-TypeID string paints nothing) and then owner-scope-resolved server-side
 *  exactly like a declared id, so a foreign owner's id yields no ref and the hero renders nothing, never
 *  another user's blob. */
export interface PluginPageHero {
  readonly assetId?: AssetId | undefined;
  readonly assetFrom?: PluginStateBinding | undefined;
  /** …or the THIRD arm, the `image` node's bundle path (#820 seam 11) — hero art the plugin shipped with its
   *  own code. Same wall, same one-home rule: see {@link PluginImageNode.bundleAsset}. */
  readonly bundleAsset?: string | undefined;
  readonly alt?: string | undefined;
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
  | PluginSearchBarNode
  | PluginIconNode
  | PluginTabsNode;

/** A registered surface's spec: the root node of its declarative tree (the whole tree is bounded by the
 *  global caps below). */
export type PluginSurfaceSpec = PluginSurfaceNode;

// ── The zod gate (host-side at registration + client-side before mount) ──────────────────────────────────────

const stateBindingSchema = z.object({ $state: z.string().min(1).max(STATE_PATH_MAX) });

/** A string bounded in BYTES — the unit every `*_MAX_BYTES` cap here names. `z.string().max()` measures
 *  UTF-16 code UNITS, which for a CJK payload is a third of the bytes it claims to bound: a 2048-character
 *  run of `"中"` is 6144 bytes and passed a cap documented as 2 KiB. The defect is one-directional (UTF-16
 *  length never EXCEEDS UTF-8 byte length, so nothing under the cap was ever wrongly rejected), which is also
 *  why the `.max()` stays in front: it can only reject what the byte check would reject anyway, and it keeps
 *  the measurement — which allocates — off an arbitrarily long guest string. */
const byteBoundedString = (max: number): z.ZodType<string> =>
  z
    .string()
    .max(max)
    .refine((value) => value.isWellFormed(), { message: "must not contain an unpaired UTF-16 surrogate" })
    .refine((value) => utf8ByteLength(value) <= max, { message: `must be at most ${max} bytes` });

const boundString = (max: number): z.ZodType<PluginBoundString> => z.union([byteBoundedString(max), stateBindingSchema]);
const finiteNumber = z.number().refine((n) => Number.isFinite(n), { message: "must be a finite number" });
const boundNumber: z.ZodType<PluginBoundNumber> = z.union([finiteNumber, stateBindingSchema]);
const boundBoolean: z.ZodType<PluginBoundBoolean> = z.union([z.boolean(), stateBindingSchema]);
const identSchema = z.string().regex(IDENT_RE);
const labelSchema = z.string().min(1).max(LABEL_MAX);
const gapSchema = z.enum(PLUGIN_GAP_TOKENS);
/** A `bundleAsset` path (#820 seam 11) — the SAME anchored pattern the install funnel admitted the zip entry
 *  under, imported from its ONE home rather than re-spelled. That identity is what makes the arm safe to
 *  validate here at all: a path this schema accepts is, by construction, a path the funnel could have
 *  admitted, so the resolve is a lookup that either hits the plugin's own map or paints nothing. A second,
 *  looser spelling here would admit names the map can never contain and turn a wall into a shrug. */
const bundleAssetPathSchema = z.string().regex(PLUGIN_UI_ASSET_ENTRY_RE);

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
    z.object({
      kind: z.literal("keyValue"),
      rows: z
        .array(z.object({ key: labelSchema, value: boundString(LABEL_MAX) }))
        .max(PLUGIN_ROWS_MAX)
        .optional(),
      rowsFrom: stateBindingSchema.optional(),
    }),
    z.object({ kind: z.literal("list"), items: z.array(boundString(LABEL_MAX)).max(PLUGIN_ROWS_MAX) }),
    z.object({
      kind: z.literal("image"),
      assetId: typeIdSchema(ID_PREFIX.asset).optional(),
      assetFrom: stateBindingSchema.optional(),
      bundleAsset: bundleAssetPathSchema.optional(),
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
    z.object({ kind: z.literal("toggle"), name: identSchema, label: labelSchema, value: z.boolean().optional(), actionId: identSchema.optional() }),
    z.object({
      kind: z.literal("select"),
      name: identSchema,
      label: labelSchema,
      options: z
        .array(z.object({ value: z.string().max(LABEL_MAX), label: labelSchema }))
        .max(PLUGIN_ROWS_MAX)
        .optional(),
      optionsFrom: stateBindingSchema.optional(),
      value: z.string().max(LABEL_MAX).optional(),
      actionId: identSchema.optional(),
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
      confirmBody: byteBoundedString(PLUGIN_TEXT_MAX_BYTES).optional(),
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
            bundleAsset: bundleAssetPathSchema.optional(),
            alt: z.string().max(LABEL_MAX).optional(),
            tags: z.array(z.string().max(LABEL_MAX)).max(PLUGIN_TILE_TAGS_MAX).optional(),
            actionId: identSchema.optional(),
          }),
        )
        .max(PLUGIN_GRID_TILES_MAX)
        .optional(),
      tilesFrom: stateBindingSchema.optional(),
      tileAction: identSchema.optional(),
      aspect: z.enum(PLUGIN_IMAGE_ASPECTS).optional(),
      empty: z.string().max(LABEL_MAX).optional(),
      loading: boundBoolean.optional(),
    }),
    // #799 — the glyph leaf. `name` is the closed curated tuple, so an off-tuple glyph is a REGISTRATION
    // refusal rather than a runtime miss, and the client's total Record cannot be reached with a name it has
    // no component for.
    z.object({ kind: z.literal("icon"), name: z.enum(PLUGIN_ICON_NAMES), label: z.string().max(LABEL_MAX).optional() }),
    // #799 — the one-of-N strip. The `select`'s grammar, with its own (much smaller) option cap: every
    // option paints at once, so the bound is a LAYOUT bound, not just a DoS one.
    z.object({
      kind: z.literal("tabs"),
      name: identSchema,
      label: labelSchema,
      options: z
        .array(z.object({ value: z.string().max(LABEL_MAX), label: labelSchema }))
        .max(PLUGIN_TABS_OPTIONS_MAX)
        .optional(),
      optionsFrom: stateBindingSchema.optional(),
      value: z.string().max(LABEL_MAX).optional(),
      actionId: identSchema.optional(),
    }),
    z.object({
      kind: z.literal("masterDetail"),
      stages: z
        .array(
          z.object({
            id: identSchema,
            kind: z.enum(PLUGIN_PAGE_STAGE_KINDS),
            title: boundString(LABEL_MAX).optional(),
            hero: z
              .object({
                assetId: typeIdSchema(ID_PREFIX.asset).optional(),
                assetFrom: stateBindingSchema.optional(),
                bundleAsset: bundleAssetPathSchema.optional(),
                alt: z.string().max(LABEL_MAX).optional(),
              })
              .optional(),
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

// The UTF-8 encoding widths, by the code point's own ranges (RFC 3629 §3) — the whole table the counter needs.
const UTF8_ONE_BYTE_MAX = 0x7f;
const UTF8_TWO_BYTE_MAX = 0x7_ff;
const UTF8_THREE_BYTE_MAX = 0xff_ff;
const UTF8_TWO_BYTES = 2;
const UTF8_THREE_BYTES = 3;
const UTF8_FOUR_BYTES = 4;

/** UTF-8 byte length WITHOUT `TextEncoder` — `@orb/contracts` is isomorphic (tsconfig lib=es2025, types=[]),
 *  so TextEncoder/Buffer are unavailable (the same kit-purity note `kit/cel` and `kit/png-card-chunk` carry).
 *
 *  TOTAL BY CONSTRUCTION, and that is a fix rather than a style choice (#1525): this used to be
 *  `encodeURIComponent(source).replace(…)`, and `encodeURIComponent` THROWS `URIError` on an unpaired UTF-16
 *  surrogate. That was survivable while its only caller measured `JSON.stringify(spec)` (which escapes lone
 *  surrogates to `\uD800`), but the byte cap now measures raw GUEST text — so a one-character plugin value
 *  turned a `safeParse` into a throw, i.e. a validation boundary that crashes instead of refusing. A summed
 *  per-code-point width cannot throw on any input; an unpaired surrogate simply counts as its 3-byte width,
 *  and it is REFUSED separately (`byteBoundedString`) rather than silently measured. */
function utf8ByteLength(source: string): number {
  let bytes = 0;
  for (const char of source) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint <= UTF8_ONE_BYTE_MAX) {
      bytes += 1;
    } else if (codePoint <= UTF8_TWO_BYTE_MAX) {
      bytes += UTF8_TWO_BYTES;
    } else if (codePoint <= UTF8_THREE_BYTE_MAX) {
      bytes += UTF8_THREE_BYTES;
    } else {
      bytes += UTF8_FOUR_BYTES;
    }
  }
  return bytes;
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

/** The DECLARED-vs-BOUND exactly-one-of belts (#774 ARM C), collected in one walk. They live at the SPEC
 *  level rather than on the node schemas because a `z.discriminatedUnion` member must be a plain object
 *  schema (`.refine` would make it a ZodEffects and the union refuses it) — the same reason the per-anchor
 *  belts live on the registration meta. One issue per offending node, in walk order. */
/** Each stage hero's exactly-one-of belt (#798) — split out of {@link collectArmViolations} so that function
 *  stays under the cognitive-complexity ceiling. One issue per offending hero, in stage order. */
function collectHeroViolations(node: Extract<PluginSurfaceNode, { kind: "masterDetail" }>, out: string[]): void {
  for (const stage of node.stages) {
    if (stage.hero !== undefined && countImageSourceArms(stage.hero) !== 1) {
      out.push("a stage hero names exactly one of `assetId` (declared), `assetFrom` (bound) or `bundleAsset` (shipped)");
    }
  }
}

/** How many of an image source's THREE arms are present. Counting rather than the old two-arm XOR because the
 *  #820 bundle arm made "exactly one" a real arity question — an XOR pair silently readmits "all three", which
 *  is a node describing one picture three ways and a renderer picking whichever it happens to check first. */
function countImageSourceArms(node: { readonly assetId?: unknown; readonly assetFrom?: unknown; readonly bundleAsset?: unknown }): number {
  return [node.assetId, node.assetFrom, node.bundleAsset].filter((arm) => arm !== undefined).length;
}

/** A DECLARED grid tile's cover arms (#820). AT MOST one, not exactly one: the browse genre's own rule is that
 *  a coverless tile is a shape-matched placeholder rather than an error (see the grid schema's note), so zero
 *  is legal here where it is not on an `image` node. Split out for the same cognitive-complexity reason
 *  {@link collectHeroViolations} was. */
function collectTileCoverViolations(node: Extract<PluginSurfaceNode, { kind: "grid" }>, out: string[]): void {
  for (const tile of node.tiles ?? []) {
    if (tile.assetId !== undefined && tile.bundleAsset !== undefined) {
      out.push("a grid tile names at most one of `assetId` (declared) or `bundleAsset` (shipped)");
    }
  }
}

/** The `options`/`optionsFrom` exactly-one-of belt, shared by the two nodes that speak that grammar — the
 *  `select` menu and the `tabs` strip (#799). Split out for the same reason {@link collectHeroViolations}
 *  was: {@link collectArmViolations} sits at the cognitive-complexity ceiling. */
function collectOptionArmViolation(node: Extract<PluginSurfaceNode, { kind: "select" | "tabs" }>, out: string[]): void {
  if ((node.options === undefined) === (node.optionsFrom === undefined)) {
    out.push(`a ${node.kind} names exactly one of \`options\` (declared) or \`optionsFrom\` (bound)`);
  }
}

function collectArmViolations(node: PluginSurfaceNode, out: string[]): void {
  if (node.kind === "grid") {
    if ((node.tiles === undefined) === (node.tilesFrom === undefined)) {
      out.push("a grid names exactly one of `tiles` (declared) or `tilesFrom` (bound)");
    }
    if (node.tileAction !== undefined && node.tilesFrom === undefined) {
      out.push("`tileAction` belongs to the bound arm — a declared tile carries its own `actionId`");
    }
    collectTileCoverViolations(node, out);
  }
  if (node.kind === "image" && countImageSourceArms(node) !== 1) {
    out.push("an image names exactly one of `assetId` (declared), `assetFrom` (bound) or `bundleAsset` (shipped)");
  }
  // The hub-v1.3 bound arms carry the identical exactly-one-of discipline: a node naming both is two
  // descriptions of one control, and a node naming neither renders nothing while claiming to be a control.
  // `select` and `tabs` (#799) are ONE grammar in two presentations, so they share one belt.
  if (node.kind === "select" || node.kind === "tabs") {
    collectOptionArmViolation(node, out);
  }
  if (node.kind === "keyValue" && (node.rows === undefined) === (node.rowsFrom === undefined)) {
    out.push("a keyValue names exactly one of `rows` (declared) or `rowsFrom` (bound)");
  }
  // A detail stage's hero carries the SAME exactly-one-of belt as an `image` node (#798). `pluginChildNodes`
  // walks only stage BODIES, so the hero — which is not itself a node — is checked in `collectHeroViolations`
  // against its parent masterDetail; without this a hero could declare both arms (or neither) and slip past.
  if (node.kind === "masterDetail") {
    collectHeroViolations(node, out);
  }
  for (const child of pluginChildNodes(node)) {
    collectArmViolations(child, out);
  }
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
  // The declared-vs-bound belts (#774 ARM C) — see `collectArmViolations` for why they live here.
  const armViolations: string[] = [];
  collectArmViolations(spec, armViolations);
  for (const message of armViolations) {
    ctx.addIssue({ code: "custom", message });
  }
});

// ── BOUND-TILE resolution (#774 ARM C — the `tilesFrom` arm's trust gate) ────────────────────────────────────

/** ONE bound tile as published state, validated at RESOLVE — the registration gate cannot see state, so this
 *  schema is where an untrusted entry is judged. `assetId` is FORMAT-validated exactly like the `image` node's
 *  (a URL or garbage is unspellable); OWNERSHIP is the server resolve's job, same as everywhere. */
export const pluginBoundGridTileSchema = z.object({
  id: z.string().regex(IDENT_RE),
  title: z.string().max(LABEL_MAX),
  subtitle: z.string().max(LABEL_MAX).optional(),
  badge: z.string().max(LABEL_MAX).optional(),
  assetId: typeIdSchema(ID_PREFIX.asset).optional(),
  alt: z.string().max(LABEL_MAX).optional(),
  tags: z.array(z.string().max(LABEL_MAX)).max(PLUGIN_TILE_TAGS_MAX).optional(),
});

/** Resolve a grid's `tilesFrom` binding against published state: read the path, validate EVERY entry, clamp
 *  the count. The three postures, each deliberate:
 *   - a missing/non-array path resolves to NO tiles (the binding-miss posture every `$state` slot has — the
 *     grid renders its `empty` line, never a crash);
 *   - a malformed ENTRY is DROPPED, not fatal (one bad row must not blank a whole results page — the D53
 *     skip posture applied to data);
 *   - the count clamps to {@link PLUGIN_GRID_TILES_MAX} (the same cap the declared arm's schema enforces —
 *     state must not be a loophole past a registration bound; past-cap results are the plugin's paging
 *     problem, exactly as they are for declared tiles).
 *  Pure + isomorphic: the client renderer resolves with it, and a test can drive it with no DOM. The
 *  aggregate payload is already bounded upstream by the `ui.setState` 16 KiB cap. */
export function resolvePluginBoundTiles(state: Record<string, unknown>, binding: PluginStateBinding): readonly PluginBoundGridTile[] {
  return resolveBoundArray(state, binding, pluginBoundGridTileSchema, PLUGIN_GRID_TILES_MAX);
}

/** The dotted-path read every bound-arm resolver shares: `{ $state: "a.b" }` against published state,
 *  `undefined` for any miss or non-object hop (the binding-miss posture every `$state` slot has). */
function readBindingPath(state: Record<string, unknown>, binding: PluginStateBinding): unknown {
  let cursor: unknown = state;
  for (const segment of binding.$state.split(".")) {
    if (typeof cursor !== "object" || cursor === null) {
      return;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

/** The shared bound-ARRAY resolve (tiles / select options / keyValue rows): read the path, validate
 *  EVERY entry against the arm's own schema (malformed ⇒ DROPPED, never fatal — one bad row must not
 *  blank a page), clamp the count to the same cap the declared arm's schema enforces (state is never a
 *  loophole past a registration bound). Pure + isomorphic, like every resolver here. */
function resolveBoundArray<T>(state: Record<string, unknown>, binding: PluginStateBinding, schema: z.ZodType<T>, cap: number): readonly T[] {
  const cursor = readBindingPath(state, binding);
  if (!Array.isArray(cursor)) {
    return [];
  }
  const out: T[] = [];
  for (const entry of cursor) {
    if (out.length >= cap) {
      break;
    }
    const parsed = schema.safeParse(entry);
    if (parsed.success) {
      out.push(parsed.data);
    }
  }
  return out;
}

/** ONE bound select option as published state — the declared `PluginSelectOption` shape, judged at
 *  RESOLVE (the registration gate cannot see state). */
export const pluginBoundSelectOptionSchema = z.object({ value: z.string().max(LABEL_MAX), label: labelSchema });

/** Resolve a select's `optionsFrom` binding (hub v1.3): the per-entry gate + the {@link PLUGIN_ROWS_MAX}
 *  clamp, the `resolvePluginBoundTiles` posture exactly. A miss resolves to NO options — the renderer
 *  shows an empty select rather than crashing (the plugin publishes its vocabulary with the same state
 *  write that populates the page). */
export function resolvePluginBoundSelectOptions(state: Record<string, unknown>, binding: PluginStateBinding): readonly PluginSelectOption[] {
  return resolveBoundArray(state, binding, pluginBoundSelectOptionSchema, PLUGIN_ROWS_MAX);
}

/** Resolve a `tabs` node's `optionsFrom` binding (#799) — the select resolver's twin, differing ONLY in the
 *  clamp: a strip paints every option at once, so it clamps to {@link PLUGIN_TABS_OPTIONS_MAX}, the same
 *  bound its declared arm's schema enforces. State is never a loophole past a registration bound, and here
 *  the bound is the layout's. */
export function resolvePluginBoundTabOptions(state: Record<string, unknown>, binding: PluginStateBinding): readonly PluginSelectOption[] {
  return resolveBoundArray(state, binding, pluginBoundSelectOptionSchema, PLUGIN_TABS_OPTIONS_MAX);
}

/** Resolve a bindable BOOLEAN (#799 — `grid.loading`): a `{ $state }` binding read against published state,
 *  else the literal. TRUE only on a real `true` — a missing path, a non-boolean, or a truthy string all
 *  resolve FALSE, because "loading" is a claim a plugin makes deliberately and a binding miss must never
 *  wedge a grid into a permanent skeleton (the binding-miss posture every `$state` slot has, pointed at the
 *  safe arm). Pure + isomorphic, like every resolver here. */
export function resolvePluginBoundBoolean(state: Record<string, unknown>, value: PluginBoundBoolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  return readBindingPath(state, value) === true;
}

/** ONE bound keyValue row as published state — key AND value are plain strings on this arm (the row set
 *  itself is data; a binding inside published state would be a hall of mirrors, the bound-tile rule). */
export const pluginBoundKeyValueRowSchema = z.object({ key: labelSchema, value: z.string().max(LABEL_MAX) });
export type PluginBoundKeyValueRow = z.infer<typeof pluginBoundKeyValueRowSchema>;

/** Resolve a keyValue's `rowsFrom` binding (hub v1.3) — same gate, same clamp, same miss posture. */
export function resolvePluginBoundKeyValueRows(state: Record<string, unknown>, binding: PluginStateBinding): readonly PluginBoundKeyValueRow[] {
  return resolveBoundArray(state, binding, pluginBoundKeyValueRowSchema, PLUGIN_ROWS_MAX);
}

/** Resolve an image's `assetFrom` binding: the path's value IFF it is a well-formed asset id — the same
 *  format wall the declared `assetId` passes at registration, applied at resolve because state cannot be
 *  judged earlier. Anything else (missing path, wrong type, malformed id) is `undefined` ⇒ the node paints
 *  its placeholder. Ownership is the server resolve's, as everywhere. */
export function resolvePluginBoundAssetId(state: Record<string, unknown>, binding: PluginStateBinding): AssetId | undefined {
  let cursor: unknown = state;
  for (const segment of binding.$state.split(".")) {
    if (typeof cursor !== "object" || cursor === null) {
      return;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  const parsed = typeIdSchema(ID_PREFIX.asset).safeParse(cursor);
  return parsed.success ? parsed.data : undefined;
}

// ── Registration metadata (U1, seam 4 — the guest's `host.ui.register` def MINUS the `onAction` handle) ───────

/** A surface's `id` grammar (`host.ui.register`'s `id`; plugin-ui-plane §4.2) — unique per plugin, a bounded
 *  programmatic identifier (the values-bag / registry key discipline), never arbitrary text. */
export const PLUGIN_SURFACE_ID_RE = /^[a-z][a-z0-9_]{0,40}$/;
/** The GUEST-LOCAL tool name a `tool-card` surface names (`host.tools.register`'s `name` — the grammar
 *  `host-v1.ts` documents for it, before the host namespaces it to `plugin_<slug'>_<name>`). A surface names
 *  the tool the way its own `main.js` registered it; the WIRE name is derived host-side and never guessed
 *  client-side (`pluginToolWireName`, `registrations.ts` — the ONE mint). Length capped at
 *  {@link PLUGIN_TOOL_NAME_LOCAL_MAX} (`manifest.ts` — the wire-mint's byte budget, #1803): this is the
 *  SAME grammar the membrane's `tools.register` trust boundary (`infra/plugin-host/membrane.ts`) enforces
 *  on the raw guest input, so a name too long is refused at the guest's own `tools.register` call, never
 *  merely at the `toolName` linkage above. */
export const PLUGIN_TOOL_NAME_RE = new RegExp(`^[a-z][a-z0-9_]{0,${PLUGIN_TOOL_NAME_LOCAL_MAX - 1}}$`);
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

// ── TYPED ARG GRAMMAR (#791) — the deep half of the ST SlashCommandParser, cut to the CLEAN core ────────────────
// U5 gave a command ONE opaque `args` remainder ("a command owns its own argument grammar"). #791 lets a command
// DECLARE its arguments so the platform can collect + type + validate + AUTOCOMPLETE them at both surfaces (the
// palette's typed input strip, the composer's `name=value` completion) before the guest ever runs. This is the
// ST `SlashCommandArgument` ability — named/typed/enum/required args — carried on the SAME registration def and
// keyed to the SAME `ui.surface` grant (no new capability: a declared arg is metadata on a command a plugin could
// already register). ST's exotic grammar (closures, macro-in-arg substitution, `acceptsMultiple`, `range`, the
// `varname`/`dictionary`/`list`/`subcommand` types, `enumProvider`) is DELIBERATELY OUT — a command that needs
// them keeps taking the raw `args` remainder, which is untouched and still delivered alongside the typed values.

/** The CLOSED type set a declared command arg may carry (§5.5 axis, so a member is a compile-tier fact): the four
 *  ST types with a clean, non-executable client input (string→text, number→numeric, enum→select, boolean→toggle).
 *  A new member fails `tsc` at {@link coercePluginCommandArgs}' dispatch AND the client's input renderer. */
export const PLUGIN_COMMAND_ARG_TYPES = ["string", "number", "enum", "boolean"] as const;
export type PluginCommandArgType = (typeof PLUGIN_COMMAND_ARG_TYPES)[number];

/** How many args ONE command may declare — a control affordance's argument list is short by nature, and the bound
 *  keeps the collected `values` bag and the completion fan small. Over-cap is a REGISTRATION refusal. */
export const PLUGIN_COMMAND_ARGS_DECLARED_MAX = 16;
/** How many values an `enum` arg may offer — the `select` option cap ({@link PLUGIN_ROWS_MAX} posture). */
export const PLUGIN_COMMAND_ENUM_VALUES_MAX = 64;
/** A declared arg's `name` grammar — the values-bag key AND the `name=value` token a person types, so a bounded
 *  programmatic identifier (the form-field `name` spirit), never arbitrary text. */
export const PLUGIN_COMMAND_ARG_NAME_RE = /^[a-z][a-z0-9_]{0,40}$/;

/** ONE declared command argument (the ST `SlashCommandNamedArgument` core). `enumValues` is present IFF
 *  `type === "enum"` — a biconditional the schema enforces (an enum with no options is unpickable; options on a
 *  non-enum is a claim the input renderer would never honour). `describe` is the one-line hint the completion
 *  strip and the palette input label show. A declared arg with no `required` defaults to optional. */
export interface PluginCommandArgSpec {
  readonly name: string;
  readonly type: PluginCommandArgType;
  readonly required?: boolean | undefined;
  readonly describe?: string | undefined;
  /** The accepted values — REQUIRED for `type: "enum"`, forbidden otherwise. */
  readonly enumValues?: readonly string[] | undefined;
}

/** A TYPED arg value — what the surfaces collect and the guest receives (the ST-parity typed bag). The three
 *  JSON-safe scalars the four arg types coerce to (`enum` is a constrained `string`). The ONE home for the axis;
 *  the wire (`invokeUiCommand`), the server validator and the guest payload all speak it. */
export type PluginCommandArgValue = string | number | boolean;

/** A declared arg spec, validated host-side at registration. The enum biconditional lives here so a malformed
 *  arg is a REGISTRATION refusal (the command absent, a log line), never activation-fatal. */
export const pluginCommandArgSpecSchema = z
  .object({
    name: z.string().regex(PLUGIN_COMMAND_ARG_NAME_RE),
    type: z.enum(PLUGIN_COMMAND_ARG_TYPES),
    required: z.boolean().optional(),
    describe: z.string().min(1).max(PLUGIN_COMMAND_DESCRIBE_MAX).optional(),
    enumValues: z.array(z.string().min(1).max(LABEL_MAX)).min(1).max(PLUGIN_COMMAND_ENUM_VALUES_MAX).optional(),
  })
  .superRefine((arg, ctx) => {
    if ((arg.type === "enum") !== (arg.enumValues !== undefined)) {
      ctx.addIssue({ code: "custom", message: "an enum arg must name its enumValues, and only an enum arg may", path: ["enumValues"] });
    }
  });

/** The SERIALIZABLE part of a `host.ui.registerCommand` def — validated host-side at collection (the trust
 *  boundary) and the exact descriptor `plugin.listCommands` projects to the client. The `onRun` handler is NOT
 *  here (it is a guest function kept as an opaque `PluginHandlerRef` on the collected registration).
 *
 *  `args` is the #791 TYPED-ARG grammar (absent ⇒ the U5 shape, a command with one opaque `args` remainder). Arg
 *  NAMES must be unique within a command (a duplicate would make the values bag ambiguous) — a superRefine, the
 *  registration-refusal posture. */
export const pluginCommandRegistrationMetaSchema = z
  .object({
    name: z.string().regex(PLUGIN_COMMAND_NAME_RE),
    describe: z.string().min(1).max(PLUGIN_COMMAND_DESCRIBE_MAX),
    args: z.array(pluginCommandArgSpecSchema).max(PLUGIN_COMMAND_ARGS_DECLARED_MAX).optional(),
  })
  .superRefine((meta, ctx) => {
    if (meta.args === undefined) {
      return;
    }
    const seen = new Set<string>();
    for (const arg of meta.args) {
      if (seen.has(arg.name)) {
        ctx.addIssue({ code: "custom", message: `duplicate command arg name '${arg.name}'`, path: ["args"] });
      }
      seen.add(arg.name);
    }
  });
export type PluginCommandRegistrationMeta = z.infer<typeof pluginCommandRegistrationMetaSchema>;

/** Coerce a bag of RAW STRING inputs — the composer's parsed `name=value` map, or the palette's typed-field
 *  strings — into the typed {@link PluginCommandArgValue} bag per `specs`, collecting a human error per offending
 *  arg (missing-required, non-number, off-enum). Pure + isomorphic: it runs CLIENT-side for UX (block dispatch on
 *  an error, show the sentence), and the SERVER independently re-validates the typed result at the membrane
 *  ({@link pluginCommandArgsSchema}) — a client is untrusted on both ends of this boundary. Keys not naming a
 *  declared arg are DROPPED (a command receives only what it declared). */
export function coercePluginCommandArgs(
  specs: readonly PluginCommandArgSpec[],
  raw: Readonly<Record<string, string>>,
): { readonly values: Record<string, PluginCommandArgValue>; readonly errors: readonly string[] } {
  const values: Record<string, PluginCommandArgValue> = {};
  const errors: string[] = [];
  for (const spec of specs) {
    const input = raw[spec.name];
    if (input === undefined || input === "") {
      if (spec.required === true) {
        errors.push(`${spec.name} is required`);
      }
      continue;
    }
    const coerced = coerceArgValue(spec, input);
    if (coerced.ok) {
      values[spec.name] = coerced.value;
    } else {
      errors.push(`${spec.name}: ${coerced.error}`);
    }
  }
  return { values, errors };
}

/** One raw input, coerced to its declared type. The `type` dispatch is exhaustive via `assertNever`, so a new
 *  {@link PLUGIN_COMMAND_ARG_TYPES} member fails `tsc` here until it is given a coercion. */
function coerceArgValue(
  spec: PluginCommandArgSpec,
  input: string,
): { readonly ok: true; readonly value: PluginCommandArgValue } | { readonly ok: false; readonly error: string } {
  switch (spec.type) {
    case "string":
      return { ok: true, value: input };
    case "number": {
      const n = Number(input);
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: `'${input}' is not a number` };
    }
    case "boolean": {
      if (input === "true") {
        return { ok: true, value: true };
      }
      if (input === "false") {
        return { ok: true, value: false };
      }
      return { ok: false, error: `'${input}' is not true or false` };
    }
    case "enum":
      return (spec.enumValues ?? []).includes(input)
        ? { ok: true, value: input }
        : { ok: false, error: `'${input}' is not one of ${(spec.enumValues ?? []).join(", ")}` };
    default:
      return assertNever(spec.type);
  }
}

function assertNever(value: never): never {
  throw new Error(`unhandled plugin command arg type: ${String(value)}`);
}

/** The WIRE/MEMBRANE validator: a zod schema BUILT from a command's declared `specs` that parses the typed
 *  `values` bag the client sent. This is the trust boundary — the server re-derives it from the RESIDENT command's
 *  own specs (never anything the client claimed) and rejects a bag that omits a required arg, mistypes one, or
 *  names an off-enum value. Unknown keys are STRIPPED (the guest receives only declared args). */
export function pluginCommandArgsSchema(specs: readonly PluginCommandArgSpec[]): z.ZodType<Record<string, PluginCommandArgValue>> {
  const shape: Record<string, z.ZodType<PluginCommandArgValue> | z.ZodOptional<z.ZodType<PluginCommandArgValue>>> = {};
  for (const spec of specs) {
    const base = argValueSchema(spec);
    shape[spec.name] = spec.required === true ? base : base.optional();
  }
  return z.object(shape) as z.ZodType<Record<string, PluginCommandArgValue>>;
}

/** One declared arg's value schema — the exhaustive `type` dispatch, matching {@link coerceArgValue}. */
function argValueSchema(spec: PluginCommandArgSpec): z.ZodType<PluginCommandArgValue> {
  switch (spec.type) {
    case "string":
      return z.string() as z.ZodType<PluginCommandArgValue>;
    case "number":
      return z.number().refine((n) => Number.isFinite(n), { message: "must be a finite number" }) as z.ZodType<PluginCommandArgValue>;
    case "boolean":
      return z.boolean() as z.ZodType<PluginCommandArgValue>;
    case "enum":
      return z.enum((spec.enumValues ?? [""]) as [string, ...string[]]) as z.ZodType<PluginCommandArgValue>;
    default:
      return assertNever(spec.type);
  }
}

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

// ── The per-anchor PRIMARY arbitration (#818, the F3 ruling) ─────────────────────────────────────────────────

/** What the renderer must do with every `variant: "primary"` button in ONE spec at ONE anchor
 *  ({@link resolvePluginPrimaryButton}). The nodes are IDENTITIES out of the caller's own validated tree, not
 *  copies — the renderer compares by reference as it walks, so no node needs an id it does not have. */
export interface PluginPrimaryArbitration {
  /** The ONE button that renders at the house primary weight — the FIRST `primary` in document order at an
   *  anchor {@link PLUGIN_ANCHOR_PRIMARY_ALLOWED} admits. `null` = nobody gets it. */
  readonly granted: PluginButtonNode | null;
  /** Every `primary` button DEMOTED to the neutral weight, in document order: the later ones at an admitting
   *  anchor (the one-per-anchor law) and ALL of them at a refusing one (the band keeps the S1 clamp). Each is a
   *  spec defect worth telling the plugin's author about, which is why they are returned rather than dropped. */
  readonly refused: readonly PluginButtonNode[];
}

/** ARBITRATE the spec's `primary` buttons for the anchor it is mounted at (#818). PURE and total — the ONE home
 *  for "who gets the primary", so the seven mount sites cannot each invent an answer.
 *
 *  WHY IT IS A RENDER RULE. A spec is registered once and could be mounted at any anchor, so admissibility
 *  cannot be decided at parse; and a spec that DOES over-claim must still render — demotion is a legible
 *  outcome, a refused registration is a dead surface. First-in-document-order wins because that is the order a
 *  person reads the surface in, and it makes the outcome deterministic rather than dependent on which subtree
 *  React commits first. */
export function resolvePluginPrimaryButton(spec: PluginSurfaceSpec, anchor: PluginSurfaceAnchor): PluginPrimaryArbitration {
  const claimants: PluginButtonNode[] = [];
  const walk = (node: PluginSurfaceNode): void => {
    if (node.kind === "button" && node.variant === "primary") {
      claimants.push(node);
    }
    // The U5 recursion seam, never a per-kind guess — a `masterDetail` stage body holds the browse genre's
    // real CTA, and a walk blind to it would hand the primary to a button nobody can see.
    for (const child of pluginChildNodes(node)) {
      walk(child);
    }
  };
  walk(spec);
  if (!PLUGIN_ANCHOR_PRIMARY_ALLOWED[anchor]) {
    return { granted: null, refused: claimants };
  }
  return { granted: claimants[0] ?? null, refused: claimants.slice(1) };
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
