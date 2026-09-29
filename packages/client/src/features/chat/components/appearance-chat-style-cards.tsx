// The chat-display PICKER as PREVIEW CARDS (#866 §7.8, the seen-not-read rebuilds — the owner's ack of
// the §7.6 table: a skin is a VISUAL ANATOMY, so its options are seen, not read). One cell per
// `ThemeChatStyle` in the shared `@orb/ui` picker-cell grid (#929 E6), each rendering a mini user/assistant
// transcript whose classes come STRAIGHT from `MESSAGE_ROW_SKINS[style]` — the same table the transcript composes
// — so a card can never drift from what picking it does (the derive-never-mirror rider; the labels/glosses
// ride `CHAT_STYLE_ITEMS`, the one option table).
//
// THE PREVIEW READS EVERY LIVE DISCRIMINATOR, NOT JUST outer/inner (#1099 F8). Five of the eight cards used
// to draw the IDENTICAL picture — two grey blobs — because `outer`/`inner` are the only fields that differ
// for bubble/echo/whisper/ripple/tide, and five identical pictures in a picker of pictures is worse than
// none: it asserts the options are the same. The mini pair now derives from the whole `RowSkin` record:
//   · `avatarTreatment` → the chip (icon-left) vs the welded portrait column (ripple);
//   · `bubbleLayout` → one box vs the per-paragraph train (tide);
//   · `headerPlacement` → tide's speaker bar ABOVE the train, which no other skin has;
//   · `bubbleDecoration` → echo's edge art pane, whisper's header band, hush's speaker stripe — asked for
//     with a real args record and painted from the values the decorator itself returns, including the
//     COLOURS (`--color-speaker`, the deterministic fallback hue), which is what the previews were missing.
// The record is TOTAL over the union, so a ninth chatStyle gets its own signature for free — nothing here
// switches on a style name.
//
// The write path is BYTE-IDENTICAL to the Select it replaced: the cell hands the picked value to the SAME
// bound form field; the section's autosave patch does not change shape.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { MessageRole } from "@orb/kit/message-role";
import { Row, Stack } from "@orb/ui/layout";
import { RadioGroupPicker, RadioGroupPickerItem } from "@orb/ui/radio-group";
import { Text } from "@orb/ui/text";
import type { CSSProperties, ReactElement } from "react";
import { useId } from "react";
import { CHAT_STYLE_ITEMS } from "../lib/appearance-select-items.ts";
import type { BubbleDecoration, RowSkin } from "../lib/message-row-variants.ts";
import { MESSAGE_ROW_SKINS } from "../lib/message-row-variants.ts";

type ChatStyle = AppearanceSettings["chatStyle"];

/** The flat option rows (labels + per-mode glosses) — `CHAT_STYLE_ITEMS` is flat by construction. */
const STYLE_OPTIONS = CHAT_STYLE_ITEMS as readonly { readonly value: string; readonly label: string; readonly description?: string }[];

function optionFor(value: string): { readonly label: string; readonly description?: string } {
  return STYLE_OPTIONS.find((option) => option.value === value) ?? { label: value };
}

/** The args a decorator needs, with NO avatar: the fallback arms return the hue tile / band / stripe, which
 *  are exactly the shapes a diagram wants (a real portrait would be a picture of one character, not of the
 *  skin). `hueSeed` is the style name so each card's fallback hue is stable and distinct. */
function decorationArgs(style: ChatStyle, speaker: MessageRole): Parameters<NonNullable<RowSkin["bubbleDecoration"]>>[0] {
  const persona = speaker === "user";
  return { kind: persona ? "persona" : "character", avatarHash: null, hueSeed: `${style}:${speaker}`, initial: persona ? "Y" : "M", showInChatAvatars: true };
}

/** Only the BORDER declarations of a decoration's bubble style survive into the mini pair — a stripe is
 *  chrome and scales to any box, while echo's `maxWidth`/`padding` are measured against the real reading
 *  column (a `--immersive-echo-art-width` inset would swallow a 100px diagram whole). A structural filter,
 *  never a per-style switch. */
function stripeOf(style: CSSProperties | undefined): CSSProperties {
  if (style === undefined) {
    return {};
  }
  return Object.fromEntries(Object.entries(style).filter(([key]) => key.startsWith("border")));
}

/** Whisper and Ripple let the decoration own the outer edge, matching the production bubble renderer. */
function withoutBubbleInsets(className: string): string {
  return className
    .split(" ")
    .filter((token) => token !== "px-block" && token !== "py-row")
    .join(" ");
}

/** A production banner grows with its transcript column; inside the fixed miniature the production
 *  `w-fit` instead collapses to the short prose. Give that same banner a representative wide frame. */
function withPreviewBannerWidth(className: string): string {
  return className
    .split(" ")
    .map((token) => (token === "w-fit" ? "w-4/5" : token))
    .join(" ");
}

const PREVIEW_COPY: Record<MessageRole, { readonly name: string; readonly line: string; readonly followup: string }> = {
  user: { name: "You", line: "Wait by the old gate.", followup: "I'll bring the map." },
  assistant: { name: "Mara", line: "The lantern is still warm.", followup: "Someone was here." },
  system: { name: "Story", line: "The room falls quiet.", followup: "" },
};

function PreviewAvatar({ speaker, welded }: { readonly speaker: MessageRole; readonly welded: boolean }): ReactElement {
  return (
    <Row
      aria-hidden="true"
      className={
        welded
          ? "w-avatar-lg shrink-0 self-stretch items-start justify-center rounded-inset bg-foreground/25 pt-field"
          : "mt-tight size-avatar-sm shrink-0 items-center justify-center rounded-full bg-foreground/20"
      }
      data-slot={welded ? "chat-style-preview-welded-avatar" : "chat-style-preview-avatar"}
    >
      <Text as="span" className="text-foreground" voice="kicker">
        {speaker === "user" ? "Y" : "M"}
      </Text>
    </Row>
  );
}

function PreviewHeader({ speaker, placement }: { readonly speaker: MessageRole; readonly placement: RowSkin["headerPlacement"] }): ReactElement {
  return (
    <Row align="center" className="min-w-0" data-placement={placement} data-slot="chat-style-preview-header" gap="tight" justify="between">
      <Text as="span" className="truncate text-speaker leading-none" voice="kicker">
        {PREVIEW_COPY[speaker].name}
      </Text>
      <Row aria-hidden="true" className="shrink-0" gap="tight">
        <Row className="size-1 rounded-full bg-foreground/30" />
        <Row className="size-1 rounded-full bg-foreground/30" />
      </Row>
    </Row>
  );
}

function PreviewProse({ speaker, followup = false }: { readonly speaker: MessageRole; readonly followup?: boolean }): ReactElement {
  return (
    <Text as="span" className="line-clamp-1 leading-none" voice="gloss">
      {followup ? PREVIEW_COPY[speaker].followup : PREVIEW_COPY[speaker].line}
    </Text>
  );
}

function PreviewBubbleContents({
  header,
  speaker,
  welded,
  inset,
}: {
  readonly header: ReactElement;
  readonly speaker: MessageRole;
  readonly welded: boolean;
  readonly inset: boolean;
}): ReactElement {
  const content = (
    <Stack className={inset ? "min-w-0 flex-1 px-field py-tight" : "min-w-0 flex-1"} gap="tight">
      {header}
      <PreviewProse speaker={speaker} />
    </Stack>
  );
  if (!welded) {
    return content;
  }
  return (
    <Row align="stretch" className="min-w-0" data-slot="chat-style-preview-welded-row">
      {speaker === "user" ? null : <PreviewAvatar speaker={speaker} welded={true} />}
      {content}
      {speaker === "user" ? <PreviewAvatar speaker={speaker} welded={true} /> : null}
    </Row>
  );
}

function PreviewBubble({
  skin,
  decoration,
  speaker,
}: {
  readonly skin: RowSkin;
  readonly decoration: BubbleDecoration | null;
  readonly speaker: MessageRole;
}): ReactElement {
  const header = <PreviewHeader placement={skin.headerPlacement} speaker={speaker} />;
  if (skin.bubbleLayout === "trains") {
    const trainClass = `${withoutBubbleInsets(skin.inner(speaker))} px-field py-tight`;
    return (
      <Stack className="min-w-0" data-slot="chat-style-preview-column" gap="tight">
        {header}
        <Stack data-slot="chat-style-preview-train" gap="tight">
          <Stack className={trainClass} data-slot="chat-style-preview-bubble">
            <PreviewProse speaker={speaker} />
          </Stack>
          <Stack className={trainClass} data-slot="chat-style-preview-bubble">
            <PreviewProse followup={true} speaker={speaker} />
          </Stack>
        </Stack>
      </Stack>
    );
  }

  const band = decoration?.headerBand;
  const edge = decoration?.edgeTile;
  const attributionKind = speaker === "user" ? "persona" : "character";
  const welded = skin.avatarTreatment(attributionKind) === "sticky-portrait";
  const decorationOwnsEdge = band !== undefined || welded;
  const runtimeClass = skin.inner(speaker);
  const previewClass = decorationOwnsEdge ? withoutBubbleInsets(runtimeClass) : runtimeClass;

  return (
    <Stack
      className={band === undefined ? previewClass : withPreviewBannerWidth(previewClass)}
      data-slot="chat-style-preview-bubble"
      style={stripeOf(decoration?.style)}
    >
      {band === undefined ? null : (
        <Row
          aria-hidden="true"
          className="h-avatar-lg w-full shrink-0 items-end rounded-inset p-tight"
          data-slot="chat-style-preview-band"
          style={{ backgroundColor: band.style.backgroundColor, backgroundImage: band.style.backgroundImage }}
        >
          <Text as="span" className="text-primary-foreground leading-none" voice="kicker">
            {band.initial ?? "M"}
          </Text>
        </Row>
      )}
      <Row className="relative min-w-0 items-stretch" gap="tight">
        {edge !== undefined && edge.side === "left" ? <PreviewEdge edge={edge} /> : null}
        <PreviewBubbleContents header={header} inset={decorationOwnsEdge} speaker={speaker} welded={welded} />
        {edge !== undefined && edge.side === "right" ? <PreviewEdge edge={edge} /> : null}
      </Row>
    </Stack>
  );
}

function PreviewEdge({ edge }: { readonly edge: NonNullable<BubbleDecoration["edgeTile"]> }): ReactElement {
  return (
    <Row
      aria-hidden="true"
      className="w-avatar-lg shrink-0 items-center justify-center self-stretch rounded-inset"
      data-side={edge.side}
      data-slot="chat-style-preview-edge"
      style={{ backgroundColor: edge.style.backgroundColor, backgroundImage: edge.style.backgroundImage }}
    >
      <Text as="span" className="text-primary-foreground leading-none" voice="kicker">
        {edge.initial}
      </Text>
    </Row>
  );
}

/** One miniature transcript message in the skin's production anatomy and role alignment. */
function PreviewLine({ style, speaker }: { readonly style: ChatStyle; readonly speaker: MessageRole }): ReactElement {
  const skin = MESSAGE_ROW_SKINS[style];
  const decoration = skin.bubbleDecoration?.(decorationArgs(style, speaker)) ?? null;
  const attributionKind = speaker === "user" ? "persona" : "character";
  const welded = skin.avatarTreatment(attributionKind) === "sticky-portrait";
  const anchoredAlignment = speaker === "user" ? "justify-end" : "justify-start";
  const bodyAlignment = skin.columnPlacement === "gutterCentred" ? "justify-center" : anchoredAlignment;
  return (
    <Stack className={skin.outer(speaker)} data-role={speaker} data-slot="chat-style-preview-message">
      <Row align="start" className={`w-full ${bodyAlignment} ${speaker === "user" ? "pe-avatar-sm" : ""}`} gap="tight">
        {welded || speaker === "user" ? null : <PreviewAvatar speaker={speaker} welded={false} />}
        <PreviewBubble decoration={decoration} skin={skin} speaker={speaker} />
        {welded || speaker !== "user" ? null : <PreviewAvatar speaker={speaker} welded={false} />}
      </Row>
    </Stack>
  );
}

/** The picture: mirrored roles where they define the skin; one complete message for dense anatomy. */
function StylePreview({ style }: { readonly style: ChatStyle }): ReactElement {
  const skin = MESSAGE_ROW_SKINS[style];
  const assistantDecoration = skin.bubbleDecoration?.(decorationArgs(style, "assistant")) ?? null;
  // Trains and banner cards spend their miniature aperture on one complete assistant message. Compressing
  // two roles made Tide's paragraph pills collide and reduced Whisper's banner to an edge; neither picture
  // represented the production anatomy. The discriminators remain the runtime skin record and decorator.
  const needsFullMessage = skin.bubbleLayout === "trains" || assistantDecoration?.headerBand !== undefined;
  const messages = (
    <>
      {needsFullMessage ? null : <PreviewLine speaker="user" style={style} />}
      <PreviewLine speaker="assistant" style={style} />
    </>
  );
  // Document's production reading cap matters only against a wide transcript. Translate that cap into
  // this fixed aperture by seating both messages in one visibly narrow manuscript column; Flat keeps the
  // full aperture. Record identity keeps the preview tied to the production skin table.
  const manuscript = skin === MESSAGE_ROW_SKINS.document;
  return (
    <Stack className="h-full w-full justify-center px-tight" data-chat-style={style} data-slot="chat-style-preview" gap="tight">
      {manuscript ? (
        <Stack className="mx-auto w-3/5" data-slot="chat-style-preview-manuscript" gap="tight">
          {messages}
        </Stack>
      ) : (
        messages
      )}
    </Stack>
  );
}

export interface ChatStyleCardsProps {
  /** The bound field's current value — the checked cell. */
  readonly value: ChatStyle;
  /** The bound field's write — same seam the Select drove. */
  readonly onPick: (value: ChatStyle) => void;
}

/**
 * The picker. ONE radiogroup with one tab stop, roving focus and arrow selection (#981 F20) — it used to be
 * eight independent `aria-pressed` buttons. Each cell's accessible name is its VISIBLE label through
 * `aria-labelledby` and the gloss is its `aria-describedby` (§13.10 N1/N2, the #1022 ruling preserved): the
 * name is still exactly "Bubble", and no visible word is dropped from it.
 */
export function ChatStyleCards({ value, onPick }: ChatStyleCardsProps): ReactElement {
  const ids = useId();
  return (
    <RadioGroupPicker aria-label="Chat display" data-slot="chat-style-cards" onValueChange={(next): void => onPick(next as ChatStyle)} value={value}>
      {THEME_CHAT_STYLES.map((style) => {
        const option = optionFor(style);
        return (
          <RadioGroupPickerItem
            key={style}
            art={<StylePreview style={style} />}
            {...(option.description === undefined ? {} : { description: option.description })}
            idPrefix={`${ids}-${style}`}
            label={option.label}
            value={style}
          />
        );
      })}
    </RadioGroupPicker>
  );
}
