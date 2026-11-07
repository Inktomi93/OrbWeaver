// Decorative skeleton diagrams of the anatomy MESSAGE_ROW_SKINS renders, not miniature transcripts.
// Current-color ink follows the viewer's palette; readable names and descriptions remain outside the art.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import { ChatStyleDiagram } from "@orb/ui/chat-style-diagram";
import { Stack } from "@orb/ui/layout";
import { RadioGroupPicker, RadioGroupPickerItem } from "@orb/ui/radio-group";
import type { ReactElement } from "react";
import { useId } from "react";
import { CHAT_STYLE_ITEMS } from "../lib/appearance-select-items.ts";
import { MESSAGE_ROW_SKINS } from "../lib/message-row-variants.ts";

type ChatStyle = AppearanceSettings["chatStyle"];
const STYLE_OPTIONS = CHAT_STYLE_ITEMS as readonly { readonly value: string; readonly label: string; readonly description?: string }[];
function optionFor(value: string): { readonly label: string; readonly description?: string } {
  return STYLE_OPTIONS.find((option) => option.value === value) ?? { label: value };
}

/** Artwork emphasizes structural differences without claiming to reproduce the viewer's transcript. */
function StylePreview({ style }: { readonly style: ChatStyle }): ReactElement {
  return (
    <Stack width="full" height="fill" data-chat-style={style} ink="foreground" data-slot="chat-style-preview">
      <ChatStyleDiagram headerPlacement={MESSAGE_ROW_SKINS[style].headerPlacement} style={style} />
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
    <RadioGroupPicker
      aria-label="Chat display"
      data-slot="chat-style-cards"
      detail={true}
      onValueChange={(next): void => onPick(next as ChatStyle)}
      value={value}
    >
      {THEME_CHAT_STYLES.map((style) => {
        const option = optionFor(style);
        return (
          <RadioGroupPickerItem
            key={style}
            art={<StylePreview style={style} />}
            {...(option.description === undefined ? {} : { description: option.description })}
            idPrefix={`${ids}-${style}`}
            label={option.label}
            shape="standard"
            value={style}
          />
        );
      })}
    </RadioGroupPicker>
  );
}
