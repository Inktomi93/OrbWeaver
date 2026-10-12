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
//     media fetch inside the pre-commit window. Today the ghost makes ZERO model-controlled requests
//     (the untrusted markdown allowlist drops `<img>` entirely) and this keeps it that way; the row's
//     real media verdict + the routed door arrive with the settled row, one second later. Widening
//     either axis here is a security decision, not a polish item.

import type { CardTrust } from "@orb/contracts/chat";
import type { GhostContentSegment } from "@orb/kit/content";
import { scanGhostContent } from "@orb/kit/content";
import { holdTornSpeaker } from "@orb/kit/fix-markdown";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { speakerTagsToPlain, stripLeadingSpeakerName } from "@orb/kit/speaker-label";
import { Card } from "@orb/ui/card";
import { Row, Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import { Skeleton } from "@orb/ui/skeleton";
import { TypingDots, useSmoothText } from "@orb/ui/stream";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import type { MessageRenderContext } from "#lib";
import { cn, renderMessageForDisplay } from "#lib";
import { useArtViewer } from "../hooks/art-viewer-context.tsx";
import { useEnterMotion } from "../hooks/use-enter-motion.ts";
import { useGhostReasoning, useGhostText, useGhostThinking } from "../hooks/use-ghost-stream.ts";
import type { RowAttribution } from "../lib/attribution.ts";
import { avatarTreatmentFor } from "../lib/avatar-treatment.ts";
import { ROW_BODY_AT_PHONE_WIDTH } from "../lib/chat-track.ts";
import { MESSAGE_ROW_SKINS } from "../lib/message-row-variants.ts";
import { columnClassFor, gutterRailFor, rowBodyClassFor } from "../lib/row-placement.ts";
import { CardBlock } from "./card-block.tsx";
import { GhostActionsFootprint } from "./message-actions-cluster.tsx";
import { artViewFor, renderRowAvatar } from "./message-row-avatar.tsx";
import { renderSingleBubble } from "./message-row-bubble.tsx";
import { placeRowHeader, renderGhostNameRow } from "./message-row-header.tsx";
import { themedColumnContent } from "./message-row-parts.tsx";
import { ReasoningBlock } from "./reasoning-block.tsx";

// Fallback pace when smooth-streaming is on but the surface passed no explicit cps (matches the contract
// default). The pref (`UserSettings.chat.smoothStreamCps`) overrides it via the `smoothStreamCps` prop.
const DEFAULT_SMOOTH_STREAM_CPS = 80;

// The §4.5 FORMING-CARD placeholder (parity-plus P4, ghost arm only): once a `:::card` OPEN line completes
// in the ghost text, the accumulating raw HTML is suppressed behind a pretty building-state chip (skeleton
// shimmer + the title) — NO iframe, NO partial HTML, for exactly as long as the body is still arriving. The
// chip is replaced by the real card at FENCE CLOSE (see the header), not at message commit. A card whose
// close never arrives stays a chip and drops with the ghost row on abort (no false card).
function FormingCardChip({ title }: { readonly title: string | null }): ReactElement {
  return (
    // DENSITY S6: the chip is the placeholder ISLAND for the card it becomes, so it stays a box — but a
    // `<Card>`, whose padding + `--radius-base` the room's instrument tier resolves. It was the largest
    // radius step (D6 reserved that for the floating bubble it streams inside).
    <Card aria-busy={true}>
      <Stack gap="row" data-slot="forming-card-chip">
        <Text voice="gloss">✦ {title !== null && title !== "" ? title : "Immersive card"} — forming…</Text>
        <Skeleton className="h-control-md w-full" />
        <Skeleton variant="text" className="h-control-sm" />
      </Stack>
    </Card>
  );
}

/** One ghost segment → its element. The KEY is `index-kind`, the settled path's precedent
 *  (`message-content.tsx`): stable for an unchanged body, so a closed card's iframe is never remounted by
 *  the prose that keeps streaming BELOW it — a remount would reload the srcdoc and re-run the card's paint
 *  on every token. Kept honest by the "prose after a closed card never reloads the iframe" CT. */
function ghostSegment(
  segment: GhostContentSegment,
  index: number,
  opts: { readonly isTail: boolean; readonly streaming: boolean; readonly colorQuotes: boolean; readonly cardTier: CardTrust },
): ReactElement {
  const key = `${index}-${segment.kind}`;
  if (segment.kind === "forming-card") {
    return <FormingCardChip key={key} title={segment.title} />;
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
  // Only the TAIL segment is live (the caret + incomplete-markdown repair); earlier segments are settled text.
  return (
    <Markdown key={key} trust="untrusted" mode={opts.streaming && opts.isTail ? "streaming" : "static"} colorQuotes={opts.colorQuotes}>
      {segment.text}
    </Markdown>
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
}: {
  readonly held: string;
  readonly streaming: boolean;
  readonly colorQuotes: boolean;
  readonly cardTier: CardTrust;
}): ReactElement {
  if (held.length === 0) {
    return <TypingDots label="Generating a reply…" />;
  }
  // §4.5: split the accumulating text on completed `:::card` opens — text streams as markdown, a card whose
  // body is still arriving shows the chip, and a card whose fence CLOSED renders for real. The common
  // no-card path is one text segment (byte-identical to the pre-P4 render).
  const segments = scanGhostContent(held);
  return (
    <div data-slot="ghost-stream-body" data-streaming={streaming ? "" : undefined}>
      <Stack gap="row">
        {segments.map((segment, index) => ghostSegment(segment, index, { isTail: index === segments.length - 1, streaming, colorQuotes, cardTier }))}
      </Stack>
    </div>
  );
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
      <GhostBubbleBody held={props.held} streaming={props.streaming} colorQuotes={props.colorQuotedSpeech} cardTier={props.cardTier} />
    </>
  );
}

/** Ripple's portrait welds into the bubble; every other treatment is the gutter chip beside the column. */
function placeAvatar(
  treatment: ReturnType<typeof avatarTreatmentFor>,
  node: ReactElement | null,
): { readonly weldedAvatar: ReactElement | null; readonly leadingAvatar: ReactElement | null } {
  return treatment === "sticky-portrait" ? { weldedAvatar: node, leadingAvatar: null } : { weldedAvatar: null, leadingAvatar: node };
}

export interface GhostMessageRowProps {
  readonly chatId: ChatId;
  readonly chatStyle: keyof typeof MESSAGE_ROW_SKINS;
  /** Pacing (and the streaming caret) run only while true; pending shows the typing dots instead. */
  readonly streaming: boolean;
  readonly renderContext?: MessageRenderContext | undefined;
  readonly rowCharacterId?: CharacterId | null | undefined;
  /** The live turn's resolved identity, the same shape resolveRowAttribution produces for the settled
   *  row. Undefined ⇒ no sibling avatar, no immersive decoration. */
  readonly attribution?: RowAttribution | undefined;
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
   *  change tier at commit. ONLY the tier is threaded: see the file header for why the ghost's markdown
   *  trust, external-media verdict and frame delivery stay pinned at the stream floor. Absent ⇒ `tierA`, the
   *  same fail-closed value the resolver returns for a mount with no roster. */
  readonly cardTier?: CardTrust | undefined;
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
  /** #113/#116 — the virtualizer MEASURED this row as taller than the scrollport. The LIVE turn reaches
   *  that state constantly (a long reply grows past the screen while it streams), which is exactly when the
   *  reader can no longer see who is speaking. Pins the ghost's name row to the top of the scrollport, the
   *  same mechanism and the same layout-neutral chip the settled row takes. Absent/false ⇒ no sticky. */
  readonly stickyAttribution?: boolean | undefined;
  /** The settled row's `showModelIcon` gate: the credit glyph its action cluster will carry, reserved here so
   *  commit does not widen the card. Absent ⇒ no credit. */
  readonly generationCredit?: boolean | undefined;
}

export function GhostMessageRow({
  chatId,
  chatStyle,
  streaming,
  renderContext,
  rowCharacterId,
  attribution,
  avatarSize = "lg",
  avatarShape = "round",
  avatarAspect = "square",
  avatarRing = "none",
  showInChatAvatars = true,
  showLLMReasoningIcon = false,
  colorQuotedSpeech = true,
  cardTier = "tierA",
  smoothStream = false,
  smoothStreamCps = DEFAULT_SMOOTH_STREAM_CPS,
  reasoningAutoCollapse = true,
  enterMotion = false,
  stickyAttribution = false,
  generationCredit = false,
}: GhostMessageRowProps): ReactElement {
  const enterClasses = useEnterMotion(enterMotion);
  const viewArt = useArtViewer();
  const rawText = useGhostText(chatId);
  const rawReasoning = useGhostReasoning(chatId);
  const thinking = useGhostThinking(chatId);
  const text = renderContext === undefined ? rawText : renderMessageForDisplay(rawText, renderContext, rowCharacterId);
  const reasoning = renderContext === undefined ? rawReasoning : renderMessageForDisplay(rawReasoning, renderContext, rowCharacterId);
  const paced = useSmoothText(text, { enabled: streaming && smoothStream, cps: smoothStreamCps });
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
          alignToInsideHeader: skin.headerPlacement === "inside",
          gutterRail: gutterRailFor(skin, "assistant"),
          // The live turn is always the assistant side, which never mirrors.
          mirrored: false,
          viewArt,
        });
  // Ripple welds its portrait into the bubble, as the settled row does, so the streaming card is the card it settles as.
  const { weldedAvatar, leadingAvatar } = placeAvatar(avatarTreatment, avatarNode);
  // #1728 arm B — THE GHOST TAKES THE SETTLED ROW'S PLACEMENT, for the reason this file already states
  // about the header two blocks down: a live turn laid out one way that relaid out at commit is a visible
  // one-frame reflow on every reply. Same two helpers the settled row reads, so they cannot drift.
  const columnClass = columnClassFor(skin);

  // #116/#288 — the SPEAKER, for the whole generation, in the SAME home the settled row will put it in.
  // The placement is read off the skin here rather than hardcoded because a live turn whose header sat
  // above the bubble and jumped inside it at commit would be a visible one-frame reflow on every reply.
  const header = placeRowHeader(
    renderGhostNameRow({
      attribution,
      stickyAttribution,
      placement: skin.headerPlacement,
      pinnedPaint: skin.pinnedHeader.paint("assistant"),
      named: skin.actionsRow.identity,
      actionsFootprint: <GhostActionsFootprint chatId={chatId} generationCredit={generationCredit} surface={skin.actionsRow.surface} />,
    }),
    skin.headerPlacement,
  );
  // The settled row's own bubble shape, so the art slot (echo's tile, whisper's band) streams in the place it will
  // settle in. `w-full` so the shimmer/streaming-markdown children have a sized parent (the assistant skin is
  // otherwise shrink-to-fit).
  const bubble = renderSingleBubble({
    role: "assistant",
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
      />
    ),
    footer: null,
    bubbleClassName: skin.inner("assistant"),
    decoration,
    weldedAvatar,
    mirrored: false,
    artView: artViewFor(viewArt, attribution),
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
    <Stack
      gap="row"
      data-slot="ghost-message-row"
      data-role="assistant"
      data-kind={attribution?.kind ?? undefined}
      className={cn("@container", skin.outer("assistant"), enterClasses)}
    >
      {/* The `@container` above and this element's two arms are the settled row's, verbatim — the ghost is
          the one row that MUST be laid out identically to what it becomes (#1728 arm B). THE `@max-md`
          AVATAR STEP IS PART OF THAT PARITY: the row body takes the settled row's own
          `ROW_BODY_AT_PHONE_WIDTH`, or a live turn at a phone width would reflow its gutter the
          instant it settled. */}
      <Row align="start" gap="row" data-slot="message-row-body" className={cn(rowBodyClassFor(skin), "w-full", ROW_BODY_AT_PHONE_WIDTH)}>
        {leadingAvatar}
        {/* The skin's own column width rides the ghost too — a live turn that reflows at commit is a
            visible jump (the reading-measure suite pins the two columns equal). */}
        <Stack gap="row" data-slot="message-content-column" className={columnClass} style={skin.columnStyle}>
          {themedColumn}
        </Stack>
      </Row>
    </Stack>
  );
}
