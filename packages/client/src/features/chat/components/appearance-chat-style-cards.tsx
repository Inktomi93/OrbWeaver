// The chat-display PICKER as PREVIEW CARDS (#866 §7.8, the seen-not-read rebuilds — the owner's ack of
// the §7.6 table: a skin is a VISUAL ANATOMY, so its options are seen, not read). One cell per
// `ThemeChatStyle` in the shared picker-cell grid. Each image captures the same skin and bubble renderer
// the transcript composes; the coupled capture tests require image refresh when that anatomy changes.
// Labels and explanations come from `CHAT_STYLE_ITEMS`.
//
// These are raster captures of the production skin, avatar and bubble renderer with owned sample art.
// Asset refresh lives in the coupled renderer-capture CT; live UI text is never scaled to draw the picture.
// Labels and explanations remain real readable controls outside the decorative image.
//
// The write path is BYTE-IDENTICAL to the Select it replaced: the cell hands the picked value to the SAME
// bound form field; the section's autosave patch does not change shape.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import { CrossfadeImage } from "@orb/ui/crossfade-image";
import { Stack } from "@orb/ui/layout";
import { RadioGroupPicker, RadioGroupPickerItem } from "@orb/ui/radio-group";
import type { ReactElement } from "react";
import { useId } from "react";
import { CHAT_STYLE_ITEMS } from "../lib/appearance-select-items.ts";

type ChatStyle = AppearanceSettings["chatStyle"];
const STYLE_OPTIONS = CHAT_STYLE_ITEMS as readonly { readonly value: string; readonly label: string; readonly description?: string }[];
function optionFor(value: string): { readonly label: string; readonly description?: string } {
  return STYLE_OPTIONS.find((option) => option.value === value) ?? { label: value };
}

/** Representative renderer captures, not a promise to reproduce the viewer's custom palette. */
function StylePreview({ style }: { readonly style: ChatStyle }): ReactElement {
  return (
    <Stack className="h-full w-full justify-center" data-chat-style={style} data-slot="chat-style-preview">
      <CrossfadeImage src={`/illustrations/chat-styles/${style}-dark.png`} alt="" aspectRatio="4 / 3" fit="contain" className="in-data-[theme=light]:hidden" />
      <CrossfadeImage
        src={`/illustrations/chat-styles/${style}-light.png`}
        alt=""
        aspectRatio="4 / 3"
        fit="contain"
        className="hidden in-data-[theme=light]:block"
      />
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
