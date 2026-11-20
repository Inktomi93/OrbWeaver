// The streaming ghost row — the only component that subscribes to token text, so a delta re-renders
// this row alone. Stream content is UNTRUSTED (live model output; indirect prompt-injection can emit
// exfil-shaped markup that a paced reveal would fetch before commit-time sanitization runs) — always
// rendered `untrusted` regardless of the settled row's per-message trust resolution.
//
// ── THE GHOST'S CARD POSTURE (2026-08-14 security review; the §4.5 granularity fix) ───────────────────
// A card whose fence has CLOSED mid-stream mounts the REAL card here, through the shared `CardBlock` —
// the same component, the same `SandboxFrame`, the same `CARD_FRAME_SANDBOX`/frame CSP the settled row
// uses. The ghost has no routed mint yet, so it renders the SRCDOC FLOOR: strictly the tighter arm
// (sandbox `""`, script-dead, the app's CSP inherited on top of its own).
// Holding the chip until the whole message settled was the defect (owner dogfood: "they won't render
// fully until the message is done ... even when the html is done being written"); a closed fence's bytes
// are provably immutable under append (`@orb/kit/content`'s ghost-scan note states the proof), so this
// is NOT the "speculatively render partial HTML" the §4.5 design rejected — a still-FORMING card carries
// no bytes on its segment at all and can only render the chip.
//
// THREE AXES, and only ONE of them is read from the row policy:
//   • TIER  — from the ONE trust authority (`render-trust.ts`), threaded as `cardTier` by the surface,
//     which resolves it with the same inputs `MessageRow` will use at commit. Never re-derived here.
//   • MARKDOWN TRUST — pinned `untrusted`, as above. Unchanged.
//   • EXTERNAL MEDIA + FRAME DELIVERY — pinned to the FLOOR: `allowExternal={false}` and no `cardOrigin`,
//     so the frame is the srcdoc floor (which additionally inherits the app document's `img-src`) and no
//     routed mint fires. This is the SAME fail-closed lattice the markdown-trust pin already applies,
//     extended to the one capability mounting-earlier would actually grant: a model-authored outbound
//     media fetch inside the pre-commit window. The ghost's own markdown makes no model-controlled
//     request off the box (the untrusted markdown allowlist drops `<img>` entirely); the row's
//     real media verdict + the routed door arrive with the settled row, one second later. Widening
//     either axis here is a security decision, not a polish item.
//
// THE ONE ROUTED MINT the stream makes is a FORMING panel's (D354): on the sandboxed tier a reply's held HTML unit,
// read after the live display pass, draws in its own routed frame once its bytes are final (`scanFormingPanels`), so a
// reader sees a panel while the rest streams. A script whose match runs past a drawn unit can still rewrite it; the
// settled row draws the final bytes. Its mint asks for the forming cap, which the server enforces: the static posture and external media
// off whatever the speaker's step, so the window above still runs no model script and fetches nothing off the box.
// `data:` images follow the step, as they fetch nothing. At most `FORMING_PANELS_MAX` panels draw per stream; the
// rest hold their chips until the reply settles.

import type { CardTrust } from "@orb/contracts/chat";
import type { FrameStyleSheet, GhostContentSegment } from "@orb/kit/content";
import { modelPanels, scanGhostContent, scanStyledHold, stripStyleElements, stripTags } from "@orb/kit/content";
import { holdTornSpeaker } from "@orb/kit/fix-markdown";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { holdTornMacro } from "@orb/kit/macro";
import type { MessageKind } from "@orb/kit/message-author";
import { speakerTagsToPlain, stripLeadingSpeakerName } from "@orb/kit/speaker-label";
import { Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import { TypingDots, useSmoothText } from "@orb/ui/stream";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormingChip, HeldCardsNotice } from "#components";
import type { HeldCards, MessageRenderContext } from "#lib";
import { useArtViewer } from "../hooks/art-viewer-context.tsx";
import { useArtControl } from "../hooks/use-art-control.ts";
import { useDisplayText } from "../hooks/use-display-text.ts";
import { useEnterMotion } from "../hooks/use-enter-motion.ts";
import { useGhostProviderWaiting, useGhostReasoning, useGhostText, useGhostThinking } from "../hooks/use-ghost-stream.ts";
import type { RowAttribution } from "../lib/attribution.ts";
import { avatarTreatmentFor } from "../lib/avatar-treatment.ts";
import { CHAT_PROVIDER_WAITING_NOTE } from "../lib/chat-surface-names.ts";
import { holdsUnwrappedCard } from "../lib/content-blocks.ts";
import { bodyDisplayRow, ghostStamps, reasoningDisplayRow } from "../lib/display-row.ts";
import { messageBoxFacts } from "../lib/message-box-facts.ts";
import type { RowSkin } from "../lib/message-row-variants.ts";
import { MESSAGE_ROW_SKINS } from "../lib/message-row-variants.ts";
import { FORMING_CARD_UNTITLED, REPLY_PANEL_FORMING_TITLE } from "../lib/reply-frame-names.ts";
import type { FormingPart } from "../lib/reply-parts.ts";
import { carriedRoomSheets, FORMING_PANELS_MAX, formingParts, PANEL_READ_MAX_CHARS } from "../lib/reply-parts.ts";
import { gutterRailFor } from "../lib/row-placement.ts";
import type { CardOrigin } from "./card-block.tsx";
import { CardBlock } from "./card-block.tsx";
import { FormingPanel } from "./forming-panel.tsx";
import { GhostActionsFootprint } from "./message-actions-cluster.tsx";
import { artViewFor, renderRowAvatar } from "./message-row-avatar.tsx";
import { renderSingleBubble } from "./message-row-bubble.tsx";
import { placeRowHeader, renderGhostNameRow } from "./message-row-header.tsx";
import { MessageContentColumn, MessageRowBody, MessageRowRoot } from "./message-row-layout.tsx";
import { themedColumnContent } from "./message-row-parts.tsx";
import { ReasoningBlock } from "./reasoning-block.tsx";

// Fallback pace when smooth-streaming is on but the surface passed no explicit cps (matches the contract
// default). The pref (`UserSettings.chat.smoothStreamCps`) overrides it via the `smoothStreamCps` prop.
const DEFAULT_SMOOTH_STREAM_CPS = 80;

interface GhostSegmentOptions {
  readonly isTail: boolean;
  readonly streaming: boolean;
  readonly colorQuotes: boolean;
  readonly cardTier: CardTrust;
  /** A display script in force may reshape this reply's markup once it settles, so the stream holds it (D354). */
  readonly holdsMarkup: boolean;
  /** The stream has shown a panel its author wrote, so every text segment holds from here (D354). */
  readonly panelSeen: boolean;
  /** Where a complete panel draws, on the sandboxed tier only; absent ⇒ every held unit stays a chip. */
  readonly panels: StreamPanels | undefined;
}

// What a held unit needs to draw in a forming frame: the mint's selector, the frame's name, and the panels the stream's
// budget admitted (`admitPanels`).
interface StreamPanels {
  readonly origin: CardOrigin;
  readonly speakerName: string | undefined;
  readonly admitted: readonly string[];
}

/** One ghost segment → its element. The KEY is `index-kind`, the settled path's precedent
 *  (`message-content.tsx`): stable for an unchanged body, so a closed card's iframe is never remounted by
 *  the prose that keeps streaming BELOW it — a remount would reload the srcdoc and re-run the card's paint
 *  on every token. `tests/client/features/chat/components/card-frame-parity.ct.tsx` holds it: prose streaming below a
 *  closed card never remounts or reloads the card's frame. */
function ghostSegment(segment: GhostContentSegment, index: number, opts: GhostSegmentOptions, parts: readonly FormingPart[] | undefined): ReactElement {
  const key = `${index}-${segment.kind}`;
  if (segment.kind === "forming-card") {
    // Once a `:::card` OPEN line completes, the accumulating raw HTML is suppressed behind the chip for exactly as long
    // as the body is still arriving; the real card replaces it at FENCE CLOSE (see the header), not at commit. A card
    // whose close never arrives stays a chip and drops with the ghost row on abort (no false card).
    return <FormingChip key={key} title={segment.title !== null && segment.title !== "" ? segment.title : FORMING_CARD_UNTITLED} />;
  }
  if (segment.kind === "card") {
    // FLOOR, deliberately (see the file header): tier from the ONE resolver; external media OFF and no
    // `cardOrigin`, so the frame is the srcdoc floor and no routed mint fires mid-stream.
    return (
      <CardBlock
        key={key}
        block={{ kind: "html-card", html: segment.body, trust: opts.cardTier, origin: "fence", ...(segment.title === null ? {} : { title: segment.title }) }}
        allowExternal={false}
      />
    );
  }
  if (parts !== undefined) {
    return heldGhostText(parts, key, opts);
  }
  return holdsText(segment.text, opts) ? heldGhostText(scanStyledHold(segment.text), key, opts) : ghostMarkdown(segment.text, key, opts);
}

// Whether a text segment streams held: a display script in force, or a panel forming on the sandboxed tier.
function holdsText(text: string, opts: Pick<GhostSegmentOptions, "holdsMarkup" | "cardTier" | "panelSeen">): boolean {
  return opts.holdsMarkup || formsPanel(text, opts);
}

// A complete panel's identity in the stream's budget: its bytes and the sheets its frame carries.
function panelIdentity(part: Extract<FormingPart, { readonly kind: "panel" }>): string {
  return JSON.stringify([part.markup, part.styles]);
}

// The stream's panel budget: the panels it has drawn keep drawing, and new ones join in reading order up to
// `FORMING_PANELS_MAX`. It only grows, so a panel whose bytes a display script later rewrote still counts against it.
function admitPanels(admitted: readonly string[], identities: readonly string[]): readonly string[] {
  const next = [...admitted];
  for (const identity of identities) {
    if (!next.includes(identity) && next.length < FORMING_PANELS_MAX) {
      next.push(identity);
    }
  }
  return next.length === admitted.length ? admitted : next;
}

// A tag line still arriving at the tail: it may yet carry the style attribute that makes its block a panel.
const ARRIVING_TAG_LINE = /(?:^|\n) {0,3}<[A-Za-z][^>\n]*$/u;

// On the sandboxed tier a reply whose own panel will settle framed (`modelPanels`, D354) holds from the first moment the
// stream shows one, and while a tag line is still arriving at the tail, so no CSS, script or half a tag ever prints.
function formsPanel(text: string, opts: Pick<GhostSegmentOptions, "cardTier" | "panelSeen">): boolean {
  return opts.cardTier === "tierB" && (opts.panelSeen || ARRIVING_TAG_LINE.test(text));
}

// Whether the stream shows a panel yet, or markup using a class the room's sheets name, which settles framed the same
// way. Past the read bound it holds unread, as a settled body that long never frames.
function streamShowsPanel(held: string, roomSheets: readonly FrameStyleSheet[] | undefined): boolean {
  return (
    held.length > PANEL_READ_MAX_CHARS ||
    modelPanels(held).length > 0 ||
    (roomSheets !== undefined && carriedRoomSheets(roomSheets, held, { lenientHtml: false }).length > 0)
  );
}

// Only the TAIL segment is live (the caret + incomplete-markdown repair); earlier segments are settled text. A
// `<style>` or `<script>` element streams as nothing, its close not yet arrived included, because the allowlist keeps
// its content as text.
function ghostMarkdown(text: string, key: string, opts: GhostSegmentOptions): ReactElement {
  return (
    <Markdown key={key} trust="untrusted" mode={opts.streaming && opts.isTail ? "streaming" : "static"} colorQuotes={opts.colorQuotes}>
      {stripStyleElements(text)}
    </Markdown>
  );
}

// A display script is in force or the reply holds a panel, so it may settle styled (D354). What streams is the text after
// the live display pass: each HTML block (a lone tag line, a block-level tag) streams as the forming chip with none of
// its bytes until it is complete, and the prose streams with its inline tags removed and their words kept, so no tag,
// attribute or CSS prints before a frame draws it.
function heldGhostText(held: readonly FormingPart[], key: string, opts: GhostSegmentOptions): ReactElement {
  const { panels } = opts;
  return (
    <Stack key={key} gap="row">
      {held.map((part, index) => {
        const partKey = `${key}-${String(index)}-${part.kind}`;
        if (part.kind === "text") {
          return ghostMarkdown(stripTags(part.text), partKey, { ...opts, isTail: opts.isTail && index === held.length - 1 });
        }
        if (part.kind === "panel" && panels !== undefined && panels.admitted.includes(panelIdentity(part))) {
          return (
            <FormingPanel
              key={partKey}
              markup={part.markup}
              styles={part.styles}
              cardOrigin={panels.origin}
              speakerName={panels.speakerName}
              colorQuotes={opts.colorQuotes}
            />
          );
        }
        return <FormingChip key={partKey} title={REPLY_PANEL_FORMING_TITLE} />;
      })}
    </Stack>
  );
}

// The bubble's streamed body: typing dots before the first token, else the paced Markdown. Extracted to
// module scope so `GhostMessageRow` stays under the cognitive-complexity ceiling. The streaming caret is
// CLIENT-OWNED CSS (#42 — client globals.css paints a 2px `--color-primary` blinking bar as an `::after` on
// the last LEAF block within the `ghost-stream-body` scope; Streamdown's own `caret` prop is unused —
// its ::after attached to the per-block dir wrapper and dropped the bar to a new line). The wrapper is
// a data-slot marker only (no className — feature paint law).
function GhostBubbleBody({
  held,
  streaming,
  colorQuotes,
  cardTier,
  holdsMarkup,
  roomSheets,
  providerWaiting,
  origin,
  speakerName,
}: {
  readonly origin: CardOrigin;
  readonly speakerName: string | undefined;
  readonly held: string;
  readonly streaming: boolean;
  readonly colorQuotes: boolean;
  readonly cardTier: CardTrust;
  readonly holdsMarkup: boolean;
  readonly roomSheets: readonly FrameStyleSheet[] | undefined;
  readonly providerWaiting: boolean;
}): ReactElement {
  // A stream that has shown a panel holds to its end, so the whole-text read stops there: each delta would otherwise read
  // the whole reply again, which over a stream costs the square of its length.
  const [panelSeen, setPanelSeen] = useState(false);
  const [admitted, setAdmitted] = useState<readonly string[]>([]);
  const showsPanel = panelSeen || (cardTier === "tierB" && streamShowsPanel(held, roomSheets));
  if (showsPanel && !panelSeen) {
    setPanelSeen(true);
  }
  if (held.length === 0) {
    // The wait note rides the dots' own reserved line, so it appears and leaves without moving the row.
    return <TypingDots label="Generating a reply…" note={providerWaiting ? CHAT_PROVIDER_WAITING_NOTE : undefined} />;
  }
  // §4.5: split the accumulating text on completed `:::card` opens — text streams as markdown, a card whose
  // body is still arriving shows the chip, and a card whose fence CLOSED renders for real. The common
  // no-card path is one text segment (byte-identical to the pre-P4 render).
  const segments = scanGhostContent(held);
  const shared = { streaming, colorQuotes, cardTier, holdsMarkup, panelSeen: showsPanel };
  // On the sandboxed tier a held segment is split once, so its complete panels can draw (`formingParts`). The text is
  // already through the display scripts, so a unit a script deletes never reaches a frame.
  const drawsPanels = cardTier === "tierB";
  const heldParts = segments.map((segment) =>
    drawsPanels && segment.kind === "text" && holdsText(segment.text, shared) ? formingParts(segment.text, roomSheets) : undefined,
  );
  const next = admitPanels(
    admitted,
    heldParts.flatMap((parts) => parts?.flatMap((part) => (part.kind === "panel" ? [panelIdentity(part)] : [])) ?? []),
  );
  if (next !== admitted) {
    setAdmitted(next);
  }
  const panels: StreamPanels | undefined = drawsPanels ? { origin, speakerName, admitted: next } : undefined;
  return (
    <div data-slot="ghost-stream-body" data-streaming={streaming ? "" : undefined}>
      <Stack gap="row">
        {segments.map((segment, index) => ghostSegment(segment, index, { ...shared, isTail: index === segments.length - 1, panels }, heldParts[index]))}
      </Stack>
    </div>
  );
}

// The held-cards notice the settled row will say, shown from the moment the stream holds card markup the game's wrap
// would draw. It latches as the panel read does, so the whole text is read per delta only until the first card.
function GhostHeldCardsNotice({ held, heldCards }: { readonly held: string; readonly heldCards: HeldCards }): ReactElement | null {
  const [seen, setSeen] = useState(false);
  const holds = seen || holdsUnwrappedCard(held);
  if (holds && !seen) {
    setSeen(true);
  }
  return holds ? <HeldCardsNotice viewerIsHost={heldCards.viewerIsHost} /> : null;
}

/** The ghost bubble's body: the live reasoning trace, when there is one, over the streamed text. */
function GhostBubbleContent(props: {
  readonly reasoning: string;
  readonly thinking: boolean;
  readonly showLLMReasoningIcon: boolean;
  readonly smoothStream: boolean;
  readonly smoothStreamCps: number;
  readonly reasoningAutoCollapse: boolean;
  readonly held: string;
  readonly streaming: boolean;
  readonly colorQuotedSpeech: boolean;
  readonly cardTier: CardTrust;
  readonly heldCards: HeldCards | undefined;
  readonly holdsMarkup: boolean;
  readonly roomSheets: readonly FrameStyleSheet[] | undefined;
  readonly providerWaiting: boolean;
  readonly origin: CardOrigin;
  readonly speakerName: string | undefined;
}): ReactElement {
  return (
    <>
      {props.reasoning.length > 0 ? (
        <ReasoningBlock
          reasoning={props.reasoning}
          thinking={props.thinking}
          showIcon={props.showLLMReasoningIcon}
          smoothStream={props.smoothStream}
          smoothStreamCps={props.smoothStreamCps}
          autoCollapse={props.reasoningAutoCollapse}
        />
      ) : null}
      <GhostBubbleBody
        held={props.held}
        streaming={props.streaming}
        colorQuotes={props.colorQuotedSpeech}
        cardTier={props.cardTier}
        holdsMarkup={props.holdsMarkup}
        roomSheets={props.roomSheets}
        providerWaiting={props.providerWaiting}
        origin={props.origin}
        speakerName={props.speakerName}
      />
      {props.heldCards === undefined ? null : <GhostHeldCardsNotice held={props.held} heldCards={props.heldCards} />}
    </>
  );
}

/** Ripple's portrait welds into the bubble; every other treatment is the gutter chip beside the column. */
function placeAvatar(
  treatment: ReturnType<typeof avatarTreatmentFor>,
  node: ReactElement | null,
  chipPlacement: RowSkin["chipPlacement"],
): { readonly weldedAvatar: ReactElement | null; readonly leadingAvatar: ReactElement | null; readonly headerChip: ReactElement | null } {
  if (treatment === "sticky-portrait") {
    return { weldedAvatar: node, leadingAvatar: null, headerChip: null };
  }
  return chipPlacement === "header"
    ? { weldedAvatar: null, leadingAvatar: null, headerChip: node }
    : { weldedAvatar: null, leadingAvatar: node, headerChip: null };
}

export interface GhostMessageRowProps {
  readonly chatId: ChatId;
  readonly chatStyle: keyof typeof MESSAGE_ROW_SKINS;
  /** Pacing (and the streaming caret) run only while true; pending shows the typing dots instead. */
  readonly streaming: boolean;
  /** The live turn's resolved identity, the same shape resolveRowAttribution produces for the settled
   *  row. Undefined ⇒ no sibling avatar, no immersive decoration. */
  readonly attribution?: RowAttribution | undefined;
  /** The live turn's voiced character: the subject `{{char}}` resolves to, as the settled row's stamp does. */
  readonly speakerCharacterId: CharacterId | null;
  /** The room's macro-name context, so the streamed text and reasoning resolve `{{char}}`/`{{user}}` exactly as the settled row. */
  readonly renderContext: MessageRenderContext;
  /** The kind this turn's reply will be born with, a display-pass author stamp. */
  readonly messageKind: MessageKind;
  /** The ghost's display depth (`displayDepthsOf`). */
  readonly displayDepth: number | undefined;
  readonly avatarSize?: "sm" | "md" | "lg" | undefined;
  readonly avatarShape?: "round" | "square" | "rounded" | undefined;
  readonly avatarAspect?: "square" | "portrait" | undefined;
  readonly avatarRing?: "none" | "accent" | undefined;
  readonly showInChatAvatars?: boolean | undefined;
  readonly showLLMReasoningIcon?: boolean | undefined;
  /** The `appearance.colorQuotedSpeech` pref — the live half of the settled row's identical tint. Absent ⇒ ON. */
  readonly colorQuotedSpeech?: boolean | undefined;
  /** The CARD TIER this turn's row will settle at, resolved by the surface through the ONE trust authority
   *  (`resolveRowRenderPolicy`) with the same inputs `MessageRow` uses — so a card closed mid-stream does not
   *  change tier at commit. Of the trust axes ONLY the tier is threaded: see the file header for why the ghost's markdown
   *  trust, external-media verdict and frame delivery stay pinned at the stream floor. Absent ⇒ `tierA`, the
   *  same fail-closed value the resolver returns for a mount with no roster. */
  readonly cardTier?: CardTrust | undefined;
  /** The settled row's held-cards fact (`RowRenderPolicy.heldCards`): set in a game room whose immersive HTML cards are
   *  off, so the stream says what the settled row will. The script notice has no ghost arm: the stream's cards draw on
   *  the srcdoc floor by design, so a dead control there is the stream's, not a consent the viewer can change. */
  readonly heldCards?: HeldCards | undefined;
  /** The `UserSettings.chat.smoothStream` pref: pace the reveal. The PREF ships ON (owner ruling
   *  2026-08-09 — the #42 word fade rides `mode="streaming"` in BOTH modes, so this is pure pacing); the
   *  prop's own fallback stays OFF because an ABSENT prop means "this mount never resolved the pref", not
   *  "the user wants pacing" — the contract keeps the ONE home of the default. */
  readonly smoothStream?: boolean | undefined;
  /** The `UserSettings.chat.smoothStreamCps` pref: the trickle floor when `smoothStream` is on. */
  readonly smoothStreamCps?: number | undefined;
  /** The `UserSettings.chat.reasoningAutoCollapse` pref: fold the live reasoning trace on the first answer
   *  token (default ON). Absent ⇒ ON. */
  readonly reasoningAutoCollapse?: boolean | undefined;
  /** True only on the render the ghost genuinely appears; a mid-stream scrollback remount gets false. */
  readonly enterMotion?: boolean;
  /** Keep the identity header pinned within its own row while it crosses the transcript edge. */
  readonly stickyAttribution?: boolean | undefined;
  /** The settled row's `showModelIcon` gate: the credit glyph its action cluster will carry, reserved here so
   *  commit does not widen the card. Absent ⇒ no credit. */
  readonly generationCredit?: boolean | undefined;
  /** The viewer's display scripts draw markup, so the reply may settle styled (D354): the stream holds its own HTML
   *  blocks as forming chips and drops its inline tags. Absent ⇒ the stream renders as any reply does. */
  readonly holdsMarkup?: boolean | undefined;
  /** The room's sheets (`roomSheetsBefore`): markup using a class they name settles framed, so the stream holds it as
   *  it holds a panel. Absent ⇒ none. */
  readonly roomSheets?: readonly FrameStyleSheet[] | undefined;
}

export function GhostMessageRow({
  chatId,
  chatStyle,
  streaming,
  attribution,
  speakerCharacterId,
  renderContext,
  messageKind,
  displayDepth,
  avatarSize = "lg",
  avatarShape = "round",
  avatarAspect = "square",
  avatarRing = "none",
  showInChatAvatars = true,
  showLLMReasoningIcon = false,
  colorQuotedSpeech = true,
  cardTier = "tierA",
  heldCards,
  smoothStream = false,
  smoothStreamCps = DEFAULT_SMOOTH_STREAM_CPS,
  reasoningAutoCollapse = true,
  enterMotion = false,
  stickyAttribution = false,
  generationCredit = false,
  holdsMarkup = false,
  roomSheets,
}: GhostMessageRowProps): ReactElement {
  const arrival = useEnterMotion(enterMotion);
  const viewArt = useArtViewer();
  const artControl = useArtControl();
  // A torn `{{macro}}` is held on the RAW stream, before substitution: after it, the half-token is already
  // literal text the renderer cannot tell from prose. The slot text is empty outside a live turn.
  const text = holdTornMacro(useGhostText(chatId));
  const rawReasoning = holdTornMacro(useGhostReasoning(chatId));
  // Live: never held; while a token's scripts run, the previous token's answer stays on screen.
  // The stamps of the reply this turn commits as, so its scripts are the ones the settled row draws.
  const stamps = ghostStamps(messageKind, speakerCharacterId);
  const reasoning = useDisplayText(rawReasoning, renderContext, { ...reasoningDisplayRow(stamps, displayDepth), live: true }).text;
  const thinking = useGhostThinking(chatId);
  const providerWaiting = useGhostProviderWaiting(chatId);
  const displayed = useDisplayText(text, renderContext, { ...bodyDisplayRow(stamps, displayDepth), live: true }).text;
  const paced = useSmoothText(displayed, {
    enabled: streaming && smoothStream,
    cps: smoothStreamCps,
  });
  // The live speaker's own name (the same value the server's per-speaker clean strips against). In a
  // speakerTags group turn the model, trained on the `Name:`-prefixed transcript, echoes its own `JFC: `
  // prefix at the START of the stream — the server strips it at finalize, so without this the raw prefix
  // would flash in the bubble for the whole turn (P1 leaked-implementation-detail). Progressive leading
  // strip here mirrors the persist-side `cleanPerSpeakerReply` so the display matches what canon will hold.
  const speakerName = attribution?.name ?? null;
  const deLabelled = speakerName === null ? paced : stripLeadingSpeakerName(paced, speakerName);
  // Streamdown repairs the streaming markdown tail itself; the only pre-pass still needed here is
  // holding a torn <speaker> tag, then converting a complete one to a plain "Name:" prefix (the
  // untrusted seal drops the <speaker> element and its name child otherwise).
  const held = speakerTagsToPlain(streaming ? holdTornSpeaker(deLabelled) : deLabelled);
  const skin = MESSAGE_ROW_SKINS[chatStyle];

  const kind = attribution?.kind ?? null;
  const decorationAvatarHash = attribution === undefined ? null : attribution.avatarHash;
  const decoration =
    skin.bubbleDecoration?.({
      kind,
      avatarHash: decorationAvatarHash,
      name: attribution?.name ?? null,
      hueSeed: attribution?.hueSeed ?? "",
      role: "assistant",
      showInChatAvatars,
    }) ?? null;
  const [artFailed, setArtFailed] = useState(false);
  const avatarTreatment = avatarTreatmentFor(skin, kind, decoration, artFailed);
  const avatarNode =
    attribution === undefined
      ? null
      : renderRowAvatar({
          attribution,
          avatarTreatment,
          role: "assistant",
          showInChatAvatars,
          avatarSize,
          avatarShape,
          avatarAspect,
          avatarRing,
          alignToInsideHeader: skin.headerPlacement === "inside" && skin.chipPlacement === "gutter",
          gutterRail: gutterRailFor(skin, "assistant"),
          // The live turn is always the assistant side, which never mirrors.
          mirrored: false,
          viewArt,
          artControl,
        });
  // Ripple welds its portrait into the bubble, as the settled row does, so the streaming card is the card it settles as.
  const { weldedAvatar, leadingAvatar, headerChip } = placeAvatar(avatarTreatment, avatarNode, skin.chipPlacement);

  // #116/#288 — the SPEAKER, for the whole generation, in the SAME home the settled row will put it in.
  // The placement is read off the skin here rather than hardcoded because a live turn whose header sat
  // above the bubble and jumped inside it at commit would be a visible one-frame reflow on every reply.
  const header = placeRowHeader(
    renderGhostNameRow({
      attribution,
      stickyAttribution,
      edges: skin,
      named: skin.actionsRow.identity,
      actionsFootprint: <GhostActionsFootprint chatId={chatId} generationCredit={generationCredit} />,
      chip: headerChip,
      rule: skin.headerRule,
    }),
    skin.headerPlacement,
  );
  // The settled row's own bubble shape, so the art slot (echo's tile, whisper's band) streams in the place it will
  // settle in. `w-full` so the shimmer/streaming-markdown children have a sized parent (the assistant skin is
  // otherwise shrink-to-fit).
  const bubble = renderSingleBubble({
    header: header.inside,
    content: (
      <GhostBubbleContent
        reasoning={reasoning}
        thinking={thinking}
        showLLMReasoningIcon={showLLMReasoningIcon}
        smoothStream={smoothStream}
        smoothStreamCps={smoothStreamCps}
        reasoningAutoCollapse={reasoningAutoCollapse}
        held={held}
        streaming={streaming}
        colorQuotedSpeech={colorQuotedSpeech}
        cardTier={cardTier}
        heldCards={heldCards}
        holdsMarkup={holdsMarkup}
        roomSheets={roomSheets}
        providerWaiting={providerWaiting}
        origin={{ chatId, characterId: speakerCharacterId }}
        speakerName={attribution?.name ?? undefined}
      />
    ),
    footer: null,
    // The live turn's bar takes its shape from the ghost frame, not from `headerShape`: that frame always takes a line of its own,
    // so the page flows as the settled last row's does, bar above the text.
    facts: messageBoxFacts(skin, decoration, { role: "assistant", lastRowFloor: false, headerOverlaid: false, editing: false, receded: false }),
    decoration,
    weldedAvatar,
    mirrored: false,
    artView: artViewFor(viewArt, attribution, artControl),
    onArtFailed: setArtFailed,
  });
  // #2425 — ONE scope over the column's header AND bubble, the settled row's shape exactly
  // (`themedColumnContent`): an `outside` header (tide's) is a SIBLING above the box, so a bubble-only
  // scope left its band and its plate resolving from the VIEWER's palette beside carried-palette prose.
  const themedColumn = themedColumnContent(
    attribution?.tokens ?? null,
    <>
      {/* #116 — the SPEAKER, for the whole generation. Same slot, same frame and same sticky mechanics as
          the settled row's name row (`renderGhostNameRow`), so a multi-viewport streaming turn pins its
          attribution exactly the way the committed one does instead of being the one row in the transcript
          with no speaker on it. Since #288 this arm carries it only for a skin whose header is `outside`
          (tide); every other skin's header rides inside the bubble above. */}
      {header.above}
      {bubble}
    </>,
  );

  return (
    <MessageRowRoot
      skin={skin}
      messageRole="assistant"
      hoverGroup={false}
      arrival={arrival}
      data-slot="ghost-message-row"
      data-role="assistant"
      data-kind={attribution?.kind ?? undefined}
    >
      {/* The root, body and column are the settled row's own (`message-row-layout.tsx`) — the ghost is the one row
          that MUST be laid out identically to what it becomes (#1728 arm B), phone-width gutter step included. The
          live turn is always the assistant side, which never mirrors. */}
      <MessageRowBody skin={skin} gutterChip={leadingAvatar !== null}>
        {leadingAvatar}
        {/* The skin's own column width rides the ghost too — a live turn that reflows at commit is a
            visible jump, so the two columns stay equal. */}
        <MessageContentColumn skin={skin} mirrored={false}>
          {themedColumn}
        </MessageContentColumn>
      </MessageRowBody>
    </MessageRowRoot>
  );
}
