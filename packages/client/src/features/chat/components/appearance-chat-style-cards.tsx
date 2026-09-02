// The chat-display PICKER as PREVIEW CARDS (#866 §7.8, the seen-not-read rebuilds — the owner's ack of
// the §7.6 table: a skin is a VISUAL ANATOMY, so its options are seen, not read). One card per
// `ThemeChatStyle`, each rendering a mini user/assistant pair whose classes come STRAIGHT from
// `MESSAGE_ROW_SKINS[style].outer/inner` — the same table the transcript composes — so a card can never
// drift from what picking it does (the derive-never-mirror rider; the labels/glosses ride
// `CHAT_STYLE_ITEMS`, the one option table). Immersive decorations (echo's portrait pane, whisper's
// banner) need a real avatar and are deliberately absent from the mini pair — the card previews the
// ANATOMY the classes define, and the gloss says the rest.
//
// The write path is BYTE-IDENTICAL to the Select it replaces: the card hands the picked value to the
// SAME bound form field; the section's autosave patch does not change shape.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { THEME_CHAT_STYLES } from "@orb/contracts/theme";
import type { MessageRole } from "@orb/kit/message-role";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId } from "react";
import { CHAT_STYLE_ITEMS } from "../lib/appearance-select-items.ts";
import { MESSAGE_ROW_SKINS } from "../lib/message-row-variants.ts";

/** The flat option rows (labels + per-mode glosses) — `CHAT_STYLE_ITEMS` is flat by construction. */
const STYLE_OPTIONS = CHAT_STYLE_ITEMS as readonly { readonly value: string; readonly label: string; readonly description?: string }[];

function optionFor(value: string): { readonly label: string; readonly description?: string } {
  return STYLE_OPTIONS.find((option) => option.value === value) ?? { label: value };
}

/** One mini transcript line in the skin's OWN anatomy classes — two content bars stand in for prose. */
function PreviewLine({ style, speaker }: { readonly style: AppearanceSettings["chatStyle"]; readonly speaker: MessageRole }): ReactElement {
  const skin = MESSAGE_ROW_SKINS[style];
  return (
    <Row className={skin.outer(speaker)}>
      <Stack className={skin.inner(speaker)} gap="field">
        <Row className="h-1 w-full rounded-full bg-foreground/25" />
        <Row className="h-1 w-1/2 rounded-full bg-foreground/25" />
      </Stack>
    </Row>
  );
}

export interface ChatStyleCardsProps {
  /** The bound field's current value — the pressed card. */
  readonly value: AppearanceSettings["chatStyle"];
  /** The bound field's write — same seam the Select drove. */
  readonly onPick: (value: AppearanceSettings["chatStyle"]) => void;
}

/**
 * The card grid. Each card is a real `aria-pressed` button named for its mode; the mini pair inside is
 * ornament (`aria-hidden`) — the gloss under the name is the reader's words.
 *
 * THE NAME IS THE RENDERED MODE LABEL, WIRED (#1022, and the side-eye 2026-08-16 ruling this preserves).
 * The card used to carry `aria-label={option.label}` over visible "Bubble" + a full-sentence gloss, and
 * WCAG 2.5.3 (§13.10 N2) counts every visible word: the label dropped seven of them, ×8 cards, and the
 * `accessible-name-quality` suite reds on it. The ruling that the card's name must stay the BARE MODE NAME
 * still stands — a gloss folded into the name renames every card and breaks the way this pane is addressed
 * — so the fix is the WIRING, not the string: `aria-labelledby` points at the rendered label (N1's top
 * tier: visible text, one source, nothing to drift) and the gloss becomes the DESCRIPTION it always was.
 * N2's own carve-out for `aria-describedby` targets then applies, and the name is still exactly "Bubble".
 */
export function ChatStyleCards({ value, onPick }: ChatStyleCardsProps): ReactElement {
  const ids = useId();
  return (
    <Row className="flex-wrap" gap="row" data-slot="chat-style-cards">
      {THEME_CHAT_STYLES.map((style) => {
        const option = optionFor(style);
        const selected = style === value;
        const labelId = `${ids}-${style}-label`;
        const glossId = `${ids}-${style}-gloss`;
        return (
          <Button
            key={style}
            aria-labelledby={labelId}
            {...(option.description === undefined ? {} : { "aria-describedby": glossId })}
            aria-pressed={selected}
            className={
              selected
                ? "h-auto min-w-40 flex-1 basis-1/4 flex-col items-stretch gap-field p-field ring-2 ring-ring"
                : "h-auto min-w-40 flex-1 basis-1/4 flex-col items-stretch gap-field p-field"
            }
            intent="outline"
            onClick={(): void => onPick(style)}
          >
            <Stack aria-hidden={true} className="pointer-events-none h-16 select-none overflow-hidden rounded-control bg-background p-field" gap="field">
              <PreviewLine speaker="user" style={style} />
              <PreviewLine speaker="assistant" style={style} />
            </Stack>
            <Stack className="min-w-0" gap="tight">
              <Text as="span" voice="label" className="truncate" id={labelId}>
                {option.label}
              </Text>
              {option.description === undefined ? null : (
                <Text as="span" voice="gloss" className="whitespace-normal" id={glossId}>
                  {option.description}
                </Text>
              )}
            </Stack>
          </Button>
        );
      })}
    </Row>
  );
}
