// One body as the display pipeline draws it, for the renderer: the display pass, the plugin display seam and the
// speaker split, each run once over the text. The single-bubble row draws its body through it once
// (`MessageContent`), and Tide's train draws the whole reply through it once and cuts what it drew (`MessageTrain`).

import type { FrameStyleSheet } from "@orb/kit/content";
import type { SpeakerSpan } from "@orb/kit/speaker-label";
import { parseSpeakerSpans } from "@orb/kit/speaker-label";
import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import type { RefCallback } from "react";
import type { PluginDisplayRow } from "#data";
import { usePluginDisplayText } from "#data";
import type { DisplayRowCall, MessageRenderContext, RowRenderPolicy } from "#lib";
import { PLAIN_REPLY_REASON } from "#lib";
import type { CardOrigin } from "../components/card-block.tsx";
import type { ReplyLayout } from "../lib/reply-parts.ts";
import { carriedRoomSheets, PANEL_READ_MAX_CHARS, readPanels, replyLayout } from "../lib/reply-parts.ts";
import { colorForCharacter } from "../lib/speaker-color.ts";
import { useDisplayText } from "./use-display-text.ts";

/** A stable empty CHARACTER-NAME list — a fresh `[]` per render would be a new identity for no reason. */
const NO_CHARACTER_NAMES: readonly string[] = [];

/** Who a body is drawn for and how: everything the display pipeline and the body read besides the text. */
export interface MessageDrawProps {
  readonly render: RowRenderPolicy;
  /** Absent means no roster/persona threaded yet, so content renders unchanged. */
  readonly renderContext?: MessageRenderContext | undefined;
  /** The row this body belongs to, read off its own data: the display call's target, author stamps and depth. The
   *  stamps also retarget `{{char}}`, `{{user}}` and `{{persona}}`. Ignored when renderContext is absent. */
  readonly display: DisplayRowCall;
  /** NAME -\> that character's tint (`speakerThemesByName`); absent ⇒ every span uses the hash fallback.
   *  Its KEYS are also the present character-name set the plain-label span grammar keys on. */
  readonly speakerThemes?: ReadonlyMap<string, ThemeScopeTokens> | undefined;
  /** True only for a row this room voices through the NARRATOR grammar (one generation speaking every
   *  character). It is the OUTER guard on the plain-`Name:` half of the span parse: in any other grammar a
   *  row is one speaker's, so a line opening `Alice:` is prose (or, on a USER row, an attribution a member
   *  could forge) and must never split. The `<speaker>` marker half is unconditional — it is markup, not
   *  prose, and cannot be typed into a body by accident. */
  readonly narratorVoiced?: boolean | undefined;
  /** The room + author this body was written in — the card-frame doorway selector (see {@link CardOrigin}).
   *  Absent (a story/preview mount with no room) ⇒ every tierB card renders the srcdoc floor. */
  readonly cardOrigin?: CardOrigin | undefined;
  /** The COMMITTED row this body belongs to — the plugin DISPLAY-transform seam (seam 14, U6).
   *  Absent (a ghost row, a preview, a story mount) ⇒ no transform runs, byte-identical. Present ⇒ the viewer's
   *  OWN plugins may annotate the rendered text, after macros and after DISPLAY regex, before markdown. */
  readonly pluginDisplayRow?: PluginDisplayRow | undefined;
  /** This body's place in the display-pass queue: a higher value runs first. The row's sequence number. */
  readonly displayOrder?: number | undefined;
  /** The room's sheets written before this row (`roomSheetsBefore`), which a framed body carries when its markup uses
   *  a class they name. Absent (a ghost, a preview, a room with none) ⇒ the body frames only on its own triggers. */
  readonly roomSheets?: readonly FrameStyleSheet[] | undefined;
}

/** A body as the display pipeline drew it: the text, its speaker spans, and the pass's verdicts. */
export interface DrawnMessage {
  readonly text: string;
  readonly spans: readonly SpeakerSpan[];
  /** A display script's own template drew markup (D354). */
  readonly styled: boolean;
  /** The drawn prose holds a panel its author wrote (`modelPanels`, D354): a stylesheet, a script, an svg, or a block
   *  whose tag carries a style attribute. */
  readonly modelPanel: boolean;
  /** The scripts have not answered: lay the body out, do not show it. */
  readonly pending: boolean;
  /** A viewer's plugin changed what the scripts drew. */
  readonly rewritten: boolean;
  /** Attach to the body element so the display queue knows the row is on screen. */
  readonly observeBody: RefCallback<HTMLElement> | undefined;
}

export function useDrawnMessage(content: string, props: MessageDrawProps): DrawnMessage {
  const { renderContext, display, speakerThemes, narratorVoiced = false, pluginDisplayRow, displayOrder } = props;
  const { text: displayed, styled, pending, observeBody } = useDisplayText(content, renderContext, { ...display, order: displayOrder });
  // The LAST step before markup (§5.5/§5.29): the viewer's own plugins annotate what the house pipeline
  // produced. Inert without a row or without a registered transform — same string in, same string out.
  const resolvedContent = usePluginDisplayText(displayed, pluginDisplayRow);
  const characterNames = narratorVoiced && speakerThemes !== undefined ? [...speakerThemes.keys()] : NO_CHARACTER_NAMES;
  const panels = readPanels(resolvedContent, props.render);
  return {
    text: resolvedContent,
    spans: parseSpeakerSpans(resolvedContent, characterNames, panels.opaque),
    styled,
    modelPanel: panels.modelPanel,
    pending,
    rewritten: resolvedContent !== displayed,
    observeBody,
  };
}

/** How a drawn body lays out: undefined for the inert path, else framed or the plain path whole, with why (D354).
 *  On the sandboxed tier a reply draws in a card frame when a display script's own markup styled it, when its drawn
 *  prose holds a panel its author wrote, or when its prose markup uses a class one of the room's sheets names
 *  (`roomSheets`, {@link carriedRoomSheets}), which its frame then carries. A plugin that rewrote the text has changed
 *  what the scripts produced, so the script trigger no longer holds; the panel and room triggers read the text after the
 *  plugin, so a plugin's own markup frames like the model's. A row still waiting on its scripts is never framed: it
 *  stays on the held inert path until its answer lands. */
export function drawnLayout(
  drawn: Omit<DrawnMessage, "observeBody">,
  props: Pick<MessageDrawProps, "render" | "speakerThemes" | "roomSheets">,
): ReplyLayout | undefined {
  const { render, speakerThemes, roomSheets } = props;
  if (render.cardTier !== "tierB" || drawn.pending) {
    return undefined;
  }
  const overRead = drawn.text.length > PANEL_READ_MAX_CHARS;
  // Past the read bound the room trigger reads nothing, as the panel trigger does.
  const room = roomSheets === undefined || overRead ? [] : carriedRoomSheets(roomSheets, drawn.text, { lenientHtml: render.lenientCards });
  if (!((drawn.styled && !drawn.rewritten) || drawn.modelPanel || room.length > 0)) {
    return undefined;
  }
  if (overRead) {
    return { kind: "plain", reason: PLAIN_REPLY_REASON.carriedStylesOverBudget };
  }
  return replyLayout(
    drawn.spans.map((span) => ({
      text: span.text,
      tokens: span.speaker === null ? undefined : (speakerThemes?.get(span.speaker) ?? colorForCharacter(span.speaker)),
    })),
    { lenientHtml: render.lenientCards, cardTrust: render.cardTier, room },
  );
}
