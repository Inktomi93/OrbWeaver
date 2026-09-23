// domain/chat/substrate/wire-history — the ONE CONVERT home: SHAPE's string history → the provider's
// content-part rows (§3.5, the WIRE plane of the content-class visibility registry), plus the cost rows the
// history FIT prices them by.
//
// WHY IT LIVES IN substrate/ AND NOT IN engine/: the conversion is LOSSY on purpose (a stored card collapses
// to `[card: Title]`, a choices block drops entirely, a display-only image becomes a short marker), so what
// the FIT must price is the CONVERTED text, never the shaped body. #1434 (0debca16) put CONVERT before FIT in
// the turn pipeline for exactly that reason. #1540 is the same defect on the READ side: `previewContextFit`
// (the transcript divider's boundary) and `previewAssembly` (the host's budget readout) ran the fit over the
// RAW shaped rows, so on a card-heavy or choices-heavy chat the preview claimed rows were out of context that
// the very next turn keeps. Both callers — `engine/pipeline.ts` (the turn) and `verbs/read.ts` (the previews)
// — now build their fit input HERE, so there is one conversion, one cost rule and one ordering to drift.
//
// THE LAW IS D51 and this file is the seam it names: content-parts are produced
// exactly ONCE, here, and everything upstream stays `content: string`. D51's cited file was
// `engine/pipeline.ts` until #1540 moved the CONVERT step down to this substrate module — the ruling
// survives, its input changed: still one producer, still the request seam's conversion, now reachable by the
// read verb that has to price the same rows. ENFORCER: the `content-part-seam` gate
// (`tooling/src/verify/gates/content-part-seam.ts`), whose sanctioned-home row names this path and whose
// rename tripwire reds if it moves again without the row following.
//
// `engine/` → `substrate/` is the legal downward edge; nothing here imports `engine/` or `assembly/` beyond
// the `assembly-access.ts` DI seam this directory already owns.

import type { ChatContentPart, ChatReasoningPart, MessageView } from "@orb/contracts/chat";
import { cacheDepthCovering, rowIndexAtCacheDepth } from "@orb/inference";
import type { ContentImageRef, ContentSpan, ContentSpanKind } from "@orb/kit/content";
import { cardWireStub, tokenizeContent } from "@orb/kit/content";
import type { AssetId, MessageId } from "@orb/kit/ids";
import type { ResolvedMediaRef, TurnMessage } from "../contract/results.ts";
import type { shapeTurn } from "./assembly-access.ts";
import { fitHistory, historyTurnTokens } from "./assembly-access.ts";

/** A media-only row whose every part drops must not collapse to an empty text part — the runner's
 *  empty-row wire filter would delete it, ending the delivered history on the prior assistant row (then
 *  400s on some providers). Substitute the dropped media's alt text (or a neutral marker) instead. The
 *  label names the dropped KIND (`image`/`video`; a mixed drop says `media`) so the model's stand-in stays
 *  honest about what it didn't see. */
function droppedMediaPlaceholder(dropped: readonly DroppedMedia[]): string {
  const kinds = new Set(dropped.map((d) => d.media));
  const label = kinds.size === 1 ? (dropped[0]?.media ?? "image") : "media";
  const named = dropped.filter((d) => d.alt.length > 0).map((d) => d.alt);
  return named.length > 0 ? `[${label}: ${named.join(", ")}]` : `[${label} omitted]`;
}

/** The DISPLAY-ONLY image's wire stand-in (the ST-parity rule below): the reader keeps the real picture, the
 *  model gets a short marker in its place — it learns an image was shown without a vision part or the raw
 *  URL bytes riding the prompt. Inline (never a part boundary), so it merges with the surrounding text. */
function displayOnlyImageText(alt: string): string {
  return alt.length > 0 ? `[image: ${alt}]` : "[image]";
}

/** MAY this image span become a model-visible image part? There are exactly TWO admitted classes, and
 *  everything else is DISPLAY-ONLY: it renders in the transcript forever and never rides as an image part.
 *
 *  THE SCHEME GATE IS UNCONDITIONAL — an `external` http(s) ref NEVER rides, on any row. Those are authored
 *  bytes (a character card's greeting image, a world-info illustration, a pasted link) and riding one makes
 *  the PROVIDER fetch a third-party URL — the same tracking-pixel/exfil vector `forbidExternalMedia` exists
 *  for — for content that can change under us. Only an owned-CAS `asset:<id>` is a candidate.
 *
 *  CLASS 1 — a deliberate USER ATTACHMENT (the owner ruling, ST parity). `role` is the DELIVERED wire role,
 *  so it already covers the id-less rows (the regen/continue synthetic user turn, injections); the
 *  `userAuthored` predicate additionally rejects the SCOPED-FOLD demotion — `shape.scopeToSpeaker` re-roles
 *  another character's assistant row to a `Name: …` USER line, and those images are still character-authored
 *  (a narrator/`/imagine` post carries real `asset:` refs, so the scheme alone would let them through).
 *
 *  CLASS 2 — THE MODEL'S OWN INLINE REPLY PICTURE (§6.7), and this relaxation is PER-ASSET, never per-row.
 *  The row it admits is the very row class the old rule refused wholesale, and that refusal was not
 *  conservatism: an `/imagine` illustration post is an ASSISTANT row that carries REAL `asset:` refs today
 *  (`verbs/post-narrator-message.ts`), so "assistant rows may now carry assets" would hand the model every
 *  picture anyone in the room ever generated. The discriminator is the `message_assets` link's `origin`
 *  column — minted for exactly this (§5.3b) — and the question asked is the narrowest one the column can
 *  answer: does the link for THIS slot and THIS asset say `inline-reply`?
 *
 *  KEYED ON THE (slot, asset) PAIR for the same reason. A chat-wide id set would admit any
 *  assistant-delivered row that merely SPELLS `![x](asset:<id>)` — a world-info entry, an author's note, a
 *  card greeting, a spliced injection — and those bodies are authored text whose ids are readable straight
 *  off the transcript. The link row is the generation's own receipt; authored prose cannot forge one.
 *
 *  A row delivered as `user` is judged by class 1 ALONE even when its slot has inline-reply links: the
 *  scoped-fold demotion is precisely the case §6.7 names, and a picture that stops riding when another
 *  character's line folds into the user channel is a bounded fidelity loss, not a leak. */
function ridesAsModelMedia(span: { readonly ref: ContentImageRef }, row: WireRowFacts, inlineReply: InlineReplyAssets): boolean {
  if (span.ref.kind !== "asset") {
    return false;
  }
  if (row.role === "user") {
    return row.userAuthored;
  }
  if (row.role !== "assistant" || row.userAuthored || row.messageId === undefined) {
    return false;
  }
  return inlineReply.get(row.messageId)?.has(span.ref.assetId) === true;
}

/** THE §6.7 EXFIL FENCE'S ONE INPUT: for each canon slot, the asset ids whose `message_assets` link is
 *  stamped `inline-reply` — pictures the model emitted inside that slot's own generation. Loaded per chat by
 *  `persistence/queries.loadInlineReplyAssetIds` (the tenancy belt is its `messages` join) and handed in,
 *  because this module holds no db handle. EMPTY is the safe value: no asset rides off an assistant row. */
type InlineReplyAssets = ReadonlyMap<MessageId, ReadonlySet<AssetId>>;

/** The `InlineReplyAssets` a history with no assistant-row `asset:` span needs — nobody is asked, nothing
 *  is loaded, and the predicate answers `false` for every assistant row. */
const NO_INLINE_REPLY_ASSETS: InlineReplyAssets = new Map<MessageId, ReadonlySet<AssetId>>([]);

/** One dropped attachment: its alt text + which media kind the drop was (drives the per-kind warning
 *  flags and the honest placeholder label). */
interface DroppedMedia {
  readonly alt: string;
  readonly media: ResolvedMediaRef["media"];
}

/** The per-assembly wire environment for the span→part projection (§3.5 — the WIRE plane). */
interface WirePartsEnv {
  readonly visionOk: boolean;
  /** The video twin (#317): `capability.input.video === true` — gates video parts as `visionOk` gates images. */
  readonly videoOk: boolean;
  readonly resolveImageUrl: (ref: ContentImageRef) => Promise<ResolvedMediaRef | null>;
  /** The card spans riding FULL this assembly (the M2 keep-last-X window; empty = every card stubs). */
  readonly fullCards: ReadonlySet<ContentSpan>;
  /** §6.7's per-(slot, asset) inline-reply set — see {@link ridesAsModelMedia}. */
  readonly inlineReply: InlineReplyAssets;
}

/** The PER-ROW facts the projection needs (only the image arm reads them — see {@link ridesAsModelMedia}). */
interface WireRowFacts {
  /** The DELIVERED wire role. */
  readonly role: TurnMessage["role"];
  /** The row's bytes were authored by a human user: it is not a canon ASSISTANT row (an id-less shaped row —
   *  the synthetic regen/continue user turn, a spliced injection — is judged by `role` alone). */
  readonly userAuthored: boolean;
  /** The row's canon slot id, or `undefined` for a SYNTHETIC row (a spliced injection, the regen/continue
   *  turn). §6.7's inline-reply lookup is keyed on it, which is what stops an authored body that merely
   *  spells another slot's `asset:<id>` from laundering that picture onto the wire. */
  readonly messageId: MessageId | undefined;
}

/** The M2 keep-last-X window: the LAST X card spans across the fitted history (document order, counted from
 *  the tail) ride the wire full; everything older stubs. Deterministic PER ASSEMBLY — the same history at a
 *  given turn always yields the same last-X set; a card entering the stub zone as newer cards arrive is a
 *  bounded one-time cache break per card, inherent to a sliding window (§3.5).
 *
 *  A CARD IN A SYNTHETIC ROW IS INSTRUCTION, NOT CONTENT — it never stubs and never consumes the window.
 *  A synthetic row is id-less by construction (a spliced injection or the regen/continue user turn; canon
 *  rows always carry a `messageId` — the same discriminator {@link ridesAsModelMedia} reads two functions up).
 *  The rpg card-teach block embeds a literal `:::card` worked example, so under the old rule the default
 *  `cardKeepLastX = 0` collapsed the model's own teaching example to `[card: Crossing sign]` before it was
 *  ever sent: the one measured intervention that pins the opener's exact bytes, deleted by the wire seam on
 *  every game. Worse at `keepLastX >= 1` — the example rides the tail, so it WON the window and stubbed the
 *  model's real cards instead. Stored cards still obey the window; authored ones are not stored cards. */
function resolveFullCards(
  tokenized: readonly { readonly h: { readonly messageId?: MessageId | undefined }; readonly spans: readonly ContentSpan[] }[],
  /** ABSENT ≠ ZERO. Contributed ONLY by an rpg game's gather, so a chat with no game supplies nothing —
   *  `undefined` ⇒ NO window (every card rides whole); `0` ⇒ keep none (rpg's explicit default); `n` ⇒ last n.
   *  This used to be `?? 0` at the call site, which silently gave every non-rpg chat the strictest setting of
   *  a feature it never opted into: all its cards stubbed on every turn, with no knob to change it. */
  keepLastX: number | undefined,
): ReadonlySet<ContentSpan> {
  const full = new Set<ContentSpan>();
  const canonCards: ContentSpan[] = [];
  for (const { h, spans } of tokenized) {
    for (const span of spans) {
      if (span.kind !== "card") {
        continue;
      }
      if (h.messageId === undefined) {
        full.add(span); // authored this turn — instruction, exempt from the window
      } else {
        canonCards.push(span);
      }
    }
  }
  for (const card of windowed(canonCards, keepLastX)) {
    full.add(card);
  }
  return full;
}

/** The stored-card slice the window keeps FULL. Absent window ⇒ all of them (a chat that never opted into
 *  the rpg budget tradeoff); `0` ⇒ none; `n` ⇒ the newest n in document order. */
function windowed(canonCards: readonly ContentSpan[], keepLastX: number | undefined): readonly ContentSpan[] {
  if (keepLastX === undefined) {
    return canonCards;
  }
  return keepLastX > 0 ? canonCards.slice(-keepLastX) : [];
}

type WirePartResult = ChatContentPart | { droppedAlt: string; droppedMedia: ResolvedMediaRef["media"] } | null;
type SpanOfKind<K extends ContentSpanKind> = Extract<ContentSpan, { readonly kind: K }>;
type WirePartHandler<K extends ContentSpanKind> = (span: SpanOfKind<K>, env: WirePartsEnv, row: WireRowFacts) => WirePartResult | Promise<WirePartResult>;

/** The total dispatch over the content-class registry's WIRE plane (§3.5) — one handler per
 *  `CONTENT_CLASS_POLICY` row, keyed by `ContentSpanKind` so a new class fails to build until it registers
 *  here (the content-class wire memory: table + hardcoded dispatch, edit BOTH). `image` is the one handler
 *  whose runtime behavior is NARROWER than its policy row (`wire:"drop"`): only a deliberate user attachment
 *  is a resolve-or-drop candidate — every other embedded image is DISPLAY-ONLY and never touches the wire
 *  plane at all, so the policy row and this handler agree on the ATTACHMENT arm and the binding test below
 *  only asserts that arm. */
const WIRE_PART_HANDLERS: { readonly [K in ContentSpanKind]: WirePartHandler<K> } = {
  // wire:"full" — verbatim bytes.
  text: (span) => (span.text.length > 0 ? { type: "text", text: span.text } : null),
  // wire:"drop" — the CYOA fence must not re-pile unselected options into context on later turns.
  choices: () => null,
  // wire:"full" — the model must remember its own lie / the true event.
  hidden: (span) => ({ type: "text", text: span.raw }),
  // wire:"full" — the §3.2.1 allowlist-strip keeps the model's bytes even though it renders as noise.
  "unknown-directive": (span) => ({ type: "text", text: span.raw }),
  // wire:"stub" — the reader keeps the rich card forever, the model gets the deterministic stub, except
  // inside the M2 keep-last-X window.
  card: (span, env) => ({ type: "text", text: env.fullCards.has(span) ? span.raw : cardWireStub(span.title) }),
  // wire:"drop" — ATTACHMENT-ONLY (owner ruling, ST parity): a non-attachment image is DISPLAY-ONLY and
  // collapses to its short marker; an attachment resolves-or-drops-to-alt gated by the asset's media kind
  // (`input.vision` for images, `input.video` for mp4/webm/animated-gif — #317). The KIND is only known
  // after resolve (it is the asset row's stored fact), so the kind-gate runs on the resolver's answer.
  image: async (span, env, row) => {
    if (!ridesAsModelMedia(span, row, env.inlineReply)) {
      // DISPLAY-ONLY, unconditionally — not a capability drop, so it never flags `imageDropped` (the
      // `image_dropped` warning means "your model can't see the image you attached", and nagging it on
      // every turn of a chat whose greeting embeds a picture would be a lie).
      return { type: "text", text: displayOnlyImageText(span.alt) };
    }
    if (!(env.visionOk || env.videoOk)) {
      // Cheap short-circuit — a media-blind model must not pay asset I/O on every history re-resolve,
      // so the kind is never learned here and the drop reports as the common case (image).
      return { droppedAlt: span.alt, droppedMedia: "image" };
    }
    const resolved = await env.resolveImageUrl(span.ref);
    if (resolved === null) {
      return { droppedAlt: span.alt, droppedMedia: "image" };
    }
    if (resolved.media === "video") {
      return env.videoOk ? { type: "video", url: resolved.url } : { droppedAlt: span.alt, droppedMedia: "video" };
    }
    return env.visionOk ? { type: "image", url: resolved.url } : { droppedAlt: span.alt, droppedMedia: "image" };
  },
};

/** One span → its wire part — total Record-dispatch over `WIRE_PART_HANDLERS` (§3.5). The cast is the one
 *  spot a discriminated union's per-member narrowing is lost to a dynamic key lookup; the handler itself
 *  stays narrowed via {@link SpanOfKind}. */
function spanToWirePart(span: ContentSpan, env: WirePartsEnv, row: WireRowFacts): Promise<WirePartResult> {
  const handler = WIRE_PART_HANDLERS[span.kind] as WirePartHandler<typeof span.kind>;
  return Promise.resolve(handler(span, env, row));
}

/** Which spans convert to NOTHING — the `null` arms of {@link WIRE_PART_HANDLERS}, answered before the
 *  conversion runs, because SHAPE judges a system row's slot by the rows the wire will deliver. Every other
 *  class always leaves a part: an image resolves, drops to its alt placeholder, or collapses to its marker.
 *  Keyed by span kind like the handlers, and pinned to them by the pipeline binding test. */
const SPAN_CONVERTS_TO_NOTHING: { readonly [K in ContentSpanKind]: (span: SpanOfKind<K>) => boolean } = {
  text: (span) => span.text.length === 0,
  choices: () => true,
  hidden: () => false,
  "unknown-directive": () => false,
  card: () => false,
  image: () => false,
};

function spanConvertsToNothing(span: ContentSpan): boolean {
  // The same per-member narrowing loss as `spanToWirePart`'s dynamic key lookup.
  const check = SPAN_CONVERTS_TO_NOTHING[span.kind] as (checked: ContentSpan) => boolean;
  return check(span);
}

/** A shaped row body that converts to an empty wire row, so {@link dropEmptyWireRows} removes it. SHAPE reads
 *  this to skip such a row when it judges a system row's neighbours (`assembly/shape` deliverSystemRows). */
export function convertsToEmptyWireRow(content: string): boolean {
  return tokenizeContent(content, { committed: true }).every(spanConvertsToNothing);
}

/** Test-only seam: the empty-conversion table is bound to the handlers span kind by span kind.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export const __spanConvertsToNothingForTest = spanConvertsToNothing;

/** Test-only seam: the CONTENT_CLASS_POLICY/dispatch binding test calls the real dispatch directly (no
 *  reason to reassemble a full turn to exercise one span → wire-part rule).
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export const __spanToWirePartForTest = spanToWirePart;

/** Projects a row's spans into provider content-parts. Adjacent text parts MERGE, so a body whose spans all
 *  ride as text (the common no-image case — hidden tags and all) stays ONE text part, byte-identical to the
 *  pre-registry wire for every wire=full class. */
async function toContentParts(
  spans: readonly ContentSpan[],
  env: WirePartsEnv,
  row: WireRowFacts,
): Promise<{ parts: ChatContentPart[]; imageDropped: boolean; videoDropped: boolean }> {
  const resolved = await Promise.all(spans.map((span) => spanToWirePart(span, env, row)));
  const parts: ChatContentPart[] = [];
  let mergeBlocked = false;
  const droppedMedia: DroppedMedia[] = [];
  for (const r of resolved) {
    if (r === null) {
      continue;
    }
    if ("droppedAlt" in r) {
      // A drop is a part BOUNDARY (the pre-registry wire shape): text on either side of a dropped image
      // stays two parts — only text that was truly adjacent in the body merges.
      mergeBlocked = true;
      droppedMedia.push({ alt: r.droppedAlt, media: r.droppedMedia });
      continue;
    }
    const prev = parts.at(-1);
    if (!mergeBlocked && r.type === "text" && prev !== undefined && prev.type === "text") {
      parts[parts.length - 1] = { type: "text", text: prev.text + r.text };
      continue;
    }
    mergeBlocked = false;
    parts.push(r);
  }
  if (parts.length === 0) {
    // Only substitute a placeholder when a drop emptied the row; a genuinely empty body keeps its empty text part.
    parts.push({ type: "text", text: droppedMedia.length > 0 ? droppedMediaPlaceholder(droppedMedia) : "" });
  }
  return {
    parts,
    imageDropped: droppedMedia.some((d) => d.media === "image"),
    videoDropped: droppedMedia.some((d) => d.media === "video"),
  };
}

/** One row of SHAPE's output — derived from `shapeTurn`, never re-spelled, so the fit and the conversion
 *  both consume exactly what SHAPE produced (`fitHistory` takes the same rows). */
type ShapedHistoryRow = ReturnType<typeof shapeTurn>["history"][number];

/** One shaped row after the WIRE conversion: the provider row itself, the string the FIT prices it by, and
 *  the per-row media verdicts. `costRow` re-states the row's canon identity because the fit reads it (the
 *  irreducible-tail anchor + the context-boundary id), and carries the WIRE text as its `content`. */
interface WireRow {
  readonly row: TurnMessage;
  readonly costRow: ShapedHistoryRow;
  readonly imageDropped: boolean;
  readonly videoDropped: boolean;
}

/** THE `conversation` CARRY MATERIALIZATION (§8.8) — a prior turn's own thinking put back on its assistant
 *  row, in the order the provider streamed it, AHEAD of everything else the row carries.
 *
 *  ORDER IS NOT COSMETIC: Anthropic requires the `thinking` block at the head of an assistant turn, and the
 *  wire converters emit parts in array order, so a signed block behind the prose is not the turn the model
 *  signed. (A persisted row carries no tool-call part today — the recorded exchange is materialized only by
 *  the in-turn loop — so "ahead of the tool-call part" is satisfied by construction here and explicitly by
 *  `toolExchangeMessages` there.)
 *
 *  ONLY ASSISTANT ROWS, and only rows that already carry something: a row whose body converted to nothing is
 *  about to be dropped (`dropEmptyWireRows`), and prepending thinking to it would resurrect a row the model
 *  never wrote as an assistant turn made of pure thinking — which every converter refuses. */
function carryReasoningParts(parts: readonly ChatContentPart[], stored: readonly ChatReasoningPart[] | undefined): readonly ChatContentPart[] {
  if (stored === undefined || stored.length === 0 || isEmptyPartList(parts)) {
    return parts;
  }
  return [...stored, ...parts];
}

/** The wire text a row costs the model — the concatenation of its TEXT parts, and nothing else (#1434).
 *  A resolved image/video part carries a URL or a data payload the token estimator cannot price and the
 *  provider does not charge as prompt text, so it contributes ZERO here; what it replaced (a multi-KB
 *  `![alt](orb://…)` blob, or a card body collapsed to `[card: Title]`) is gone by construction because
 *  this reads the CONVERTED parts, not the shaped body.
 *
 *  A REPLAYED `reasoning` part (§8.8) DOES count: unlike a media URL its prose is real prompt bytes the
 *  provider bills, so a `conversation` carry that the fit priced at zero would silently overflow the window
 *  it was fitted to. Its opaque provenance (an Anthropic signature, an encrypted-reasoning blob) is not
 *  priceable from here and is not estimated — absence over a fabricated number, the same posture as the
 *  economics fields. */
function wireCostText(parts: readonly ChatContentPart[]): string {
  return parts.flatMap((p) => (p.type === "text" || p.type === "reasoning" ? [p.text] : [])).join("");
}

/** The REQUEST-step history build: tokenize each shaped row ONCE, resolve the keep-last-X card window over
 *  the whole assembly, then project every row through the ONE span→part seam (§3.5).
 *
 *  THIS RUNS BEFORE THE FIT (#1434). It used to run after, which meant the token fitter priced bytes the
 *  provider never sees: it charged the full multi-KB body of every stored card that the very next step
 *  collapsed to `[card: Title]`, and charged every choices block that the next step DROPPED — so a
 *  card-heavy chat evicted useful older turns to make room for content it was about to delete, and
 *  `fitUsedTokens` (the managed-compaction trigger) overstated the real request. Converting first costs one
 *  extra media resolve for rows the fit then drops — rare, since only a deliberate user ATTACHMENT resolves
 *  anything — and buys a fit and a boundary that describe the actual wire.
 *
 *  The card window MOVED with the conversion: it used to be resolved over the FITTED tail (this ran after
 *  the fit), and it is now resolved over the WHOLE shaped assembly. That is not a behaviour change, and the
 *  reason is worth stating because it is the thing that makes the reorder safe — the window is the last-X
 *  cards in DOCUMENT ORDER, and the fit only ever removes OLDER rows, so every card it could remove was
 *  already outside the last-X (a stub-zone card). The extra entries the window may now hold belong to rows
 *  the fit drops, and a dropped row's spans are never projected. */
export async function buildWireHistory(
  /** The per-assembly inputs the conversion needs, spelled INLINE (an exported shape declared in
   *  `substrate/` is `no-inline-types` RED — a domain type home is `contract/`), and identical on both
   *  callers: the turn reads them off `RunTurnPipelineArgs`, the previews off `PreviewInputs` + the chat ctx. */
  env: {
    /** `connection.capability.input.vision === true` — gates resolved IMAGE parts. */
    readonly visionOk: boolean;
    /** The video twin (#317): `capability.input.video === true`. */
    readonly videoOk: boolean;
    readonly resolveImageUrl: (ref: ContentImageRef) => Promise<ResolvedMediaRef | null>;
    /** The M2 keep-last-X card window. ABSENT ≠ ZERO — see {@link resolveFullCards}; contributed only by an
     *  rpg game's gather, so a chat with no game passes `undefined` (no window) on BOTH paths. */
    readonly cardKeepLastX: number | undefined;
    /** The loaded canon — read ONLY for the assistant-authored set below (the §8.8 carry's own source is
     *  `reasoningByMessage`, not this list). */
    readonly canon: readonly MessageView[];
    /** §8.8's `conversation` CARRY SOURCE: each canon slot's persisted replayable thinking, keyed by slot id.
     *  Supplied ONLY on that rung (the caller resolves it through `resolveCarryReasoning`, the one policy
     *  home, and passes an EMPTY map otherwise) — `tool-chain` carries inside the ACTIVE chain, which is the
     *  engine's in-turn loop and never reaches the persisted history. A map rather than a `MessageView` field
     *  because these blobs are host-side replay material that must not cross to a client. */
    readonly reasoningByMessage: ReadonlyMap<MessageId, readonly ChatReasoningPart[]>;
    /** §6.7's INLINE-REPLY ORIGIN SET, LAZY — awaited at most ONCE per build, and only when some
     *  assistant-delivered row actually carries an `asset:` span. A history with no model-emitted picture
     *  (every history today, and every history on a text-only model forever) performs NO read, the same
     *  posture the §8.8 carry takes. Both callers close it over their own chat id; the query is the ONE home
     *  (`persistence/queries.loadInlineReplyAssetIds`) so the fence cannot be re-derived differently on the
     *  turn path and the preview path. */
    readonly loadInlineReplyAssetIds: () => Promise<InlineReplyAssets>;
  },
  shapedHistory: readonly ShapedHistoryRow[],
): Promise<WireRow[]> {
  // COMMITTED canon (the shaped history is stored rows, never the in-flight stream), so an unterminated
  // card closes at EOF and STUBS like any other card instead of riding the wire as a multi-KB raw blob.
  const tokenized = shapedHistory.map((h) => ({ h, spans: tokenizeContent(h.content, { committed: true }) }));
  // The §6.7 origin read is DEMAND-DRIVEN: only an assistant-delivered row bearing an `asset:` span can ever
  // reach class 2 of `ridesAsModelMedia`, so a history without one asks nothing and pays nothing. The probe
  // is deliberately WIDER than the predicate (it ignores `userAuthored`, which needs the canon fold below):
  // over-loading costs one indexed query, under-loading would silently drop a real picture.
  const mayCarryInlineReply = tokenized.some(({ h, spans }) => h.role === "assistant" && spans.some((s) => s.kind === "image" && s.ref.kind === "asset"));
  const partsEnv: WirePartsEnv = {
    visionOk: env.visionOk,
    videoOk: env.videoOk,
    resolveImageUrl: env.resolveImageUrl,
    fullCards: resolveFullCards(tokenized, env.cardKeepLastX),
    inlineReply: mayCarryInlineReply ? await env.loadInlineReplyAssetIds() : NO_INLINE_REPLY_ASSETS,
  };
  // The canon rows a SHAPE fold may have re-roled to `user` (`scopeToSpeaker` stamps another character's
  // assistant line as `Name: …`) — their images stay character-authored, so they never count as attachments.
  const assistantMessageIds = new Set(env.canon.filter((m) => m.role === "assistant").map((m) => m.id));
  return await Promise.all(
    tokenized.map(async ({ h, spans }): Promise<WireRow> => {
      const userAuthored = h.messageId === undefined || !assistantMessageIds.has(h.messageId);
      const { parts: bodyParts, imageDropped, videoDropped } = await toContentParts(spans, partsEnv, { role: h.role, userAuthored, messageId: h.messageId });
      // A SHAPE fold may have re-roled a character's assistant line to `user` (`scopeToSpeaker`); its thinking
      // must not ride back on a row the wire will deliver as the user speaking.
      const parts = h.role === "assistant" && h.messageId !== undefined ? carryReasoningParts(bodyParts, env.reasoningByMessage.get(h.messageId)) : bodyParts;
      const row: TurnMessage = h.name === undefined ? { role: h.role, content: parts } : { role: h.role, content: parts, name: h.name };
      const costRow: ShapedHistoryRow = {
        role: h.role,
        content: wireCostText(parts),
        ...(h.name === undefined ? {} : { name: h.name }),
        messageId: h.messageId,
      };
      return { row, costRow, imageDropped, videoDropped };
    }),
  );
}

/** A converted row that carries NOTHING for the provider: one empty text part, which is what
 *  `toContentParts` emits when every span was `wire:"drop"`ped and no media drop left a placeholder. */
function isEmptyWireRow(wire: WireRow): boolean {
  return isEmptyPartList(wire.row.content);
}

/** The part-list half of {@link isEmptyWireRow}, so the §8.8 carry can ask the same question BEFORE the row
 *  exists (it must not resurrect a would-be-dropped row as a turn made of pure thinking). */
function isEmptyPartList(parts: readonly ChatContentPart[]): boolean {
  return parts.length === 1 && parts[0]?.type === "text" && parts[0].text.length === 0;
}

/** Drop the rows that converted to nothing (#1438).
 *
 *  A CHOICES-ONLY canon row is the reachable case: the `choices` handler returns `null` for every span
 *  (the CYOA fence — unselected options must not re-pile into context), `toContentParts` skips nulls, and
 *  with no dropped media to placeholder the row falls through to `{type:"text", text:""}`. Providers reject
 *  empty messages, and shipping one contradicts the fence's own intent to remove the block entirely.
 *
 *  THE FINAL ROW IS NEVER DROPPED. It is the turn's own tail — the user's message, the regen/continue
 *  synthetic, or the assistant prefill — and its POSITION is load-bearing to every wire (`acceptsAssistantPrefill`,
 *  the continuation nudge, the cache breakpoint's offset-from-end). An empty tail is a different defect and
 *  silently deleting it would hide it. */
export function dropEmptyWireRows(
  built: readonly WireRow[],
  cacheBreakpointFromEnd: number | undefined,
): { kept: WireRow[]; cacheBreakpointFromEnd: number | null } {
  const lastIdx = built.length - 1;
  const keeps = built.map((wire, i) => i === lastIdx || !isEmptyWireRow(wire));
  const kept = built.filter((_, i) => keeps[i] === true);
  return { kept, cacheBreakpointFromEnd: shiftBreakpoint(cacheBreakpointFromEnd, built, keeps, kept) };
}

/** The new-chat marker SHAPE placed, derived from `shapeTurn` like {@link ShapedHistoryRow}. */
type NewChatMarker = ReturnType<typeof shapeTurn>["newChatMarker"];

/** Place SHAPE's new-chat marker at the head of the rows the history fit KEPT. It opens the first row that reaches
 *  the wire when that row is a user row and the turn's level merges (SHAPE's own squash separator); a leading row
 *  that converts to nothing is skipped, because {@link dropEmptyWireRows} removes it next. In every other case the
 *  marker rides as its own user row. A row added at the head leaves every cache depth below it unchanged: depths
 *  count from the end. */
function withNewChatMarkerAtHead(kept: readonly WireRow[], marker: NonNullable<NewChatMarker>): WireRow[] {
  const at = kept.findIndex((wire) => !isEmptyWireRow(wire));
  const head = kept[at];
  if (head !== undefined && head.row.role === "user" && marker.mergeSeparator !== null) {
    const lead = `${marker.content}${marker.mergeSeparator}`;
    const [first, ...parts] = head.row.content;
    const content: ChatContentPart[] =
      first?.type === "text" ? [{ type: "text", text: lead + first.text }, ...parts] : [{ type: "text", text: lead }, ...head.row.content];
    const merged: WireRow = { ...head, row: { ...head.row, content }, costRow: { ...head.costRow, content: lead + head.costRow.content } };
    return kept.map((wire, index) => (index === at ? merged : wire));
  }
  const row: TurnMessage = { role: "user", content: [{ type: "text", text: marker.content }] };
  return [{ row, costRow: { role: "user", content: marker.content, messageId: undefined }, imageDropped: false, videoDropped: false }, ...kept];
}

/** THE FIT over the converted rows — the one home both the turn pipeline and the read previews call, so the wire
 *  and the preview keep the same rows and report the same cost. The fit drops the OLDEST rows, and the new-chat
 *  marker is the oldest row, so a trimmed history reserves the marker's own row before it trims and then places
 *  the marker at the head of what it kept (`kept`, the rows the wire sends; `fitted.history`, their cost rows).
 *  `fitted.usedTokens` prices the rows as delivered, marker included. */
export function fitWireHistory(
  converted: readonly WireRow[],
  budget: Parameters<typeof fitHistory>[1],
  marker: NewChatMarker,
): { readonly fitted: ReturnType<typeof fitHistory>; readonly kept: WireRow[] } {
  const fitted = fitHistory(wireCostRows(converted), budget);
  if (marker === null || fitted.droppedCount === 0) {
    return { fitted, kept: converted.slice(fitted.droppedCount) };
  }
  const reserve = historyTurnTokens({ content: marker.content });
  const trimmed = fitHistory(wireCostRows(converted), { ...budget, systemTokens: budget.systemTokens + reserve });
  const kept = withNewChatMarkerAtHead(converted.slice(trimmed.droppedCount), marker);
  const history = wireCostRows(kept);
  return { fitted: { ...trimmed, history, usedTokens: history.reduce((sum, row) => sum + historyTurnTokens(row), 0) }, kept };
}

/** Re-anchor the §8 cache breakpoint after a MID-ARRAY drop (#1543).
 *
 *  The breakpoint is a DEPTH in role groups from the end (`@orb/inference` `rowIndexAtCacheDepth`, the counter
 *  SHAPE and the runner share). The fit's front-trim leaves it alone for free; a drop from anywhere else can
 *  merge two role groups (an emptied assistant row between two user rows) or remove the pinned row itself, so
 *  the depth is resolved to the row it pins, that row is carried across the drop (or the nearest kept row above
 *  it, when the drop took it), and the depth is recomputed on the kept rows. `null` ⇒ nothing is left to pin —
 *  `shape.ts` refuses that same case, so it resolves to NO breakpoint rather than to a placement nobody
 *  measured. */
function shiftBreakpoint(
  cacheBreakpointFromEnd: number | undefined,
  before: readonly WireRow[],
  keeps: readonly boolean[],
  kept: readonly WireRow[],
): number | null {
  if (cacheBreakpointFromEnd === undefined) {
    return null;
  }
  const pinned = rowIndexAtCacheDepth(
    before.map((wire) => wire.row),
    cacheBreakpointFromEnd,
  );
  if (pinned === undefined) {
    return null;
  }
  const keptAtOrAbove = keeps.slice(0, pinned + 1).filter(Boolean).length - 1;
  const shifted = cacheDepthCovering(
    kept.map((wire) => wire.row),
    keptAtOrAbove,
  );
  return shifted !== undefined && shifted >= 1 ? shifted : null;
}

/** The ROWS THE FIT PRICES — the single spelling of the fit's input (#1540). Both callers hand
 *  `fitHistory` exactly this: the turn pipeline, whose `droppedCount` then slices the kept wire rows back
 *  out of the same array, and the read verb's previews, which read only the boundary + the numbers. Spelling
 *  it once is the point of the ticket: a second `.map(w => w.costRow)` on the read side is how the two
 *  paths silently disagreed about what a card-heavy history costs. */
export function wireCostRows(converted: readonly WireRow[]): ShapedHistoryRow[] {
  return converted.map((w) => w.costRow);
}
