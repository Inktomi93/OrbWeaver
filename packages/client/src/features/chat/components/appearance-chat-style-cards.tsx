// The chat-display PICKER as PREVIEW CARDS (#866 §7.8, the seen-not-read rebuilds — the owner's ack of
// the §7.6 table: a skin is a VISUAL ANATOMY, so its options are seen, not read). One cell per
// `ThemeChatStyle` in the shared `@orb/ui` picker-cell grid (#929 E6), each rendering a mini user/assistant
// pair whose classes come STRAIGHT from `MESSAGE_ROW_SKINS[style]` — the same table the transcript composes
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
import type { CSSProperties, ReactElement } from "react";
import { useId } from "react";
import { CHAT_STYLE_ITEMS } from "../lib/appearance-select-items.ts";
import type { RowSkin } from "../lib/message-row-variants.ts";
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
function decorationArgs(style: ChatStyle): Parameters<NonNullable<RowSkin["bubbleDecoration"]>>[0] {
  return { kind: "character", avatarHash: null, hueSeed: style, initial: "A", showInChatAvatars: true };
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

/** One mini transcript line in the skin's OWN anatomy classes plus its own identity/decoration shapes. */
function PreviewLine({ style, speaker }: { readonly style: ChatStyle; readonly speaker: MessageRole }): ReactElement {
  const skin = MESSAGE_ROW_SKINS[style];
  const decoration = skin.bubbleDecoration?.(decorationArgs(style)) ?? null;
  const edge = decoration?.edgeTile;
  const band = decoration?.headerBand;
  const welded = skin.avatarTreatment("character") === "sticky-portrait";
  const bars = skin.bubbleLayout === "trains" ? ["w-full", "w-2/3"] : ["w-full", "w-1/2"];
  const artPane =
    edge === undefined ? null : <Row className="w-field shrink-0 self-stretch rounded-inset" style={{ backgroundColor: edge.style.backgroundColor }} />;
  const body = (
    <Stack className={skin.inner(speaker)} gap="tight" style={stripeOf(decoration?.style)}>
      {band === undefined ? null : <Row className="h-2 w-full shrink-0 rounded-inset" style={{ backgroundColor: band.style.backgroundColor }} />}
      <Row className="w-full items-stretch gap-tight">
        {edge !== undefined && edge.side === "left" ? artPane : null}
        {/* `trains` (tide) splits the body into per-paragraph pills; every other skin is one box. */}
        <Stack className="min-w-0 flex-1" gap="tight">
          {bars.map((width) =>
            skin.bubbleLayout === "trains" ? (
              <Row key={width} className={`h-1.5 ${width} rounded-full bg-foreground/25`} />
            ) : (
              <Row key={width} className={`h-1 ${width} rounded-full bg-foreground/25`} />
            ),
          )}
        </Stack>
        {edge !== undefined && edge.side === "right" ? artPane : null}
      </Row>
    </Stack>
  );
  return (
    <Row className={skin.outer(speaker)} gap="tight">
      {welded ? (
        // Ripple welds a tall portrait beside the text and drops the chip — the one skin whose identity art
        // IS its avatar treatment.
        <Row className="w-field shrink-0 self-stretch rounded-inset bg-foreground/30" />
      ) : (
        <Row className="mt-tight size-2 shrink-0 rounded-full bg-foreground/30" />
      )}
      {body}
    </Row>
  );
}

/** The picture: the speaker bar (only for a skin that puts its header OUTSIDE the box) over the pair. */
function StylePreview({ style }: { readonly style: ChatStyle }): ReactElement {
  const skin = MESSAGE_ROW_SKINS[style];
  return (
    <Stack className="h-full w-full justify-center p-tight" gap="tight">
      {skin.headerPlacement === "outside" ? <Row className="h-1 w-1/4 rounded-full bg-foreground/40" /> : null}
      <PreviewLine speaker="user" style={style} />
      <PreviewLine speaker="assistant" style={style} />
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
