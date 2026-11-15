// The message-body renderer — projects a stored body string into typed MessageContentBlock[] and
// dispatches each block by kind through an exhaustive switch + assertNever. The body is first parsed on
// <speaker>NAME</speaker> markers; zero markers collapses to one null-speaker span rendered through the
// original single-path (byte-identical no-op). Untrusted HTML never touches the main DOM; external
// media never bypasses MessageMediaBlock. Macros resolve against renderContext BEFORE the speaker split
// so a <speaker> NAME position never sees an unresolved {{char}}/{{user}}.

import type { MessageContentBlock } from "@orb/contracts/chat";
import { scanStyledHold, stripStyleElements } from "@orb/kit/content";
import { parseSpeakerSpans } from "@orb/kit/speaker-label";
import { Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement, RefCallback } from "react";
import { FormingChip } from "#components";
import type { PluginDisplayRow } from "#data";
import { usePluginDisplayText } from "#data";
import type { DisplayRowCall, MessageRenderContext, RowRenderPolicy } from "#lib";
import { useDisplayText } from "../hooks/use-display-text.ts";
import { toContentBlocks } from "../lib/content-blocks.ts";
import { REPLY_PANEL_FORMING_TITLE } from "../lib/reply-frame-names.ts";
import type { FrameReplySegment, ReplySpan } from "../lib/reply-parts.ts";
import { replyParts } from "../lib/reply-parts.ts";
import { colorForCharacter } from "../lib/speaker-color.ts";
import type { CardOrigin } from "./card-block.tsx";
import { CardBlock } from "./card-block.tsx";
import { MessageChoicesBlock } from "./message-choices-block.tsx";
import { MessageMediaBlock } from "./message-media-block.tsx";
import { PlainContentNotice } from "./plain-content-notice.tsx";
import { ReplyFrame } from "./reply-frame.tsx";

/** A stable empty CHARACTER-NAME list — a fresh `[]` per render would be a new identity for no reason. */
const NO_CHARACTER_NAMES: readonly string[] = [];

function assertNever(value: never): never {
  throw new Error(`MessageContent: unhandled block ${JSON.stringify(value)}`);
}

function renderBlock(block: MessageContentBlock, key: string, render: RowRenderPolicy, cardOrigin: CardOrigin | undefined): ReactElement {
  const { trust, allowExternal } = render;
  switch (block.kind) {
    case "markdown":
      return (
        // Quote tinting rides the PROSE arm only — a card block owns its own styles.
        <Markdown key={key} trust={trust} mode="static" inlineDice={true} colorQuotes={render.colorQuotes} allowExternalMedia={allowExternal}>
          {block.md}
        </Markdown>
      );
    case "media":
      return <MessageMediaBlock key={key} block={block} allowExternal={allowExternal} />;
    // docs/law/UI-Theming-and-Content.md §12.2, the TWO card tiers — see the `cardTrust` mapping in MessageSegment for which row gets which:
    //   tierB = the trusted-author tier — the ImmersiveCard chrome (§4.7 lifecycle: collapsed sandbox → expand
    //           lightbox → view-raw) around the sandboxed SandboxFrame (null-origin iframe + per-frame CSP),
    //           with the card's own CSS applied. The row's external-media verdict rides along: the sandbox
    //           CSP is the SAME axis as MessageMedia's gate, so a card's <img src="https://…"> obeys the
    //           same setting the media block does.
    //   tierA = the inert tier for every other row — the sanitized allowlist in the main DOM. Tier A FORBIDS <style> and
    //           inline style=, so `block.css` is not merely unused here, it is unusable by law.
    // The inert arm is wrapped in InertCard rather than emitted bare: an unstyled card in the prose flow is
    // indistinguishable from the model writing plain text, which is how this read as "cards vanish". The
    // frame says a card is here, the badge says it is plain, and the row's notice says what turns it on — the same
    // refuse-VISIBLY posture MessageMedia's click-to-load gate has always had.
    case "html-card":
      return <CardBlock key={key} block={block} allowExternal={allowExternal} cardOrigin={cardOrigin} />;
    // The CYOA choice set — clickable send-affordances: a click sends the option as the
    // user's next turn through the room's choice-send capability (provider-less mounts render the
    // same buttons disabled). The block contract is untouched.
    case "choices":
      return <MessageChoicesBlock key={key} options={block.options} />;
    default:
      return assertNever(block);
  }
}

interface MessageSegmentProps {
  readonly text: string;
  readonly render: RowRenderPolicy;
  readonly keyPrefix: string;
  readonly cardOrigin: CardOrigin | undefined;
  /** The display pass's hold, set only on the body's outer element: while its scripts have not answered the
   *  body is laid out but not shown (`data-display-pending`, which the client stylesheet hides). */
  readonly pending?: boolean | undefined;
  /** Observes the body's outer element, so the display-pass queue runs it first while it is on screen. */
  readonly observeBody?: RefCallback<HTMLElement> | undefined;
}

function MessageSegment({ text, render, keyPrefix, cardOrigin, pending, observeBody }: MessageSegmentProps): ReactElement {
  // §4.3 trust routing: ONE trust authority (`render-trust`) resolves BOTH the markdown trust and the card
  // TIER — this renderer only dispatches. The tier mapping was INVERTED here until 2026-08-04 (trusted rows
  // were sent to tierA, whose allowlist forbids `<style>`, so every trusted card rendered as unstyled HTML
  // and read as "cards vanished"); it now lives in the resolver where its two consent axes are documented
  // together. Do not re-derive a tier from `render.trust` at a call site.
  // The compiler caches on the body + policy (§4.5 wiring-reality hygiene #1) so a chrome-only re-render
  // never re-tokenizes — and, with the index+kind keys below stable for an unchanged body, never reloads a
  // card's srcdoc.
  const blocks = toContentBlocks(text, { cardTrust: render.cardTier, lenientHtml: render.lenientCards });
  return (
    <Stack gap="row" ref={observeBody} data-display-pending={pending === true ? "" : undefined}>
      {blocks.map((block, index) => renderBlock(block, `${keyPrefix}${index}-${block.kind}`, render, cardOrigin))}
    </Stack>
  );
}

function tinted(node: ReactElement, tokens: ThemeScopeTokens | undefined, key: string): ReactElement {
  return tokens === undefined ? (
    node
  ) : (
    <ThemeScope key={key} tokens={tokens}>
      {node}
    </ThemeScope>
  );
}

// A frame run through the INERT path: what shows whenever the frame cannot draw it. Its prose renders under the
// untrusted allowlist, the same path the streaming ghost draws, so no inline style survives; `<style>` and `<script>`
// elements are removed with their content first, because the allowlist drops the tag and keeps its content as prose.
// Each markdown run is projected again with today's reading policy, so a directive the frame keeps as markup stays
// hidden here.
function renderRunNatively(
  segments: readonly FrameReplySegment[],
  rowRender: RowRenderPolicy,
  cardOrigin: CardOrigin | undefined,
  keyPrefix: string,
): ReactElement {
  const render: RowRenderPolicy = { ...rowRender, trust: "untrusted" };
  return (
    <Stack gap="row">
      {segments.map((segment, index) => {
        const key = `${keyPrefix}${index}-${segment.kind}`;
        if (segment.kind === "card") {
          return renderBlock({ kind: "html-card", html: segment.html, trust: render.cardTier }, key, render, cardOrigin);
        }
        return tinted(
          <MessageSegment key={key} text={stripStyleElements(segment.markdown)} render={render} keyPrefix={key} cardOrigin={cardOrigin} />,
          segment.tokens,
          key,
        );
      })}
    </Stack>
  );
}

// A frame run while its frame is on the way: the prose through the inert path, and each HTML block and card a forming
// chip with none of its bytes (`scanStyledHold`), the way a streaming card forms (§4.5). Nothing a template drew paints.
function renderRunHeld(segments: readonly FrameReplySegment[], rowRender: RowRenderPolicy, keyPrefix: string): ReactElement {
  const render: RowRenderPolicy = { ...rowRender, trust: "untrusted" };
  const chip = (key: string): ReactElement => <FormingChip key={key} title={REPLY_PANEL_FORMING_TITLE} />;
  return (
    <Stack gap="row">
      {segments.flatMap((segment, index) => {
        const key = `${keyPrefix}${index}-${segment.kind}`;
        if (segment.kind === "card") {
          return [chip(key)];
        }
        return scanStyledHold(segment.markdown).map((part, partIndex) => {
          const partKey = `${key}-${partIndex}-${part.kind}`;
          return part.kind === "forming-markup"
            ? chip(partKey)
            : tinted(<MessageSegment key={partKey} text={part.text} render={render} keyPrefix={partKey} cardOrigin={undefined} />, segment.tokens, partKey);
        });
      })}
    </Stack>
  );
}

/** A styled reply: its frame runs in routed card frames, and the blocks a frame cannot hold kept native between them. */
function FramedReply({
  spans,
  render,
  cardOrigin,
  speakerName,
  observeBody,
}: {
  readonly observeBody: RefCallback<HTMLElement> | undefined;
  readonly spans: readonly ReplySpan[];
  readonly render: RowRenderPolicy;
  readonly cardOrigin: CardOrigin | undefined;
  readonly speakerName: string | undefined;
}): ReactElement {
  const parts = replyParts(spans, { lenientHtml: render.lenientCards });
  return (
    <Stack gap="row" data-slot="message-content-framed" ref={observeBody}>
      {parts.map((part, index) => {
        const key = `${index}-${part.kind}`;
        if (part.kind === "native") {
          return tinted(renderBlock(part.block, key, render, cardOrigin), part.tokens, key);
        }
        return (
          <ReplyFrame
            key={key}
            segments={part.segments}
            colorQuotes={render.colorQuotes}
            cardOrigin={cardOrigin}
            speakerName={speakerName}
            held={renderRunHeld(part.segments, render, `${key}-`)}
            fallback={renderRunNatively(part.segments, render, cardOrigin, `${key}-`)}
          />
        );
      })}
    </Stack>
  );
}

// A tierA row draws rich content plain when a display script styled it or when it carries a card: the notice says once,
// under the row, which setting holds it there. A row still waiting on its scripts shows none until its answer lands.
function rowPlainNotice(texts: readonly string[], render: RowRenderPolicy, styled: boolean, pending: boolean): ReactElement | null {
  if (render.plain === undefined || pending) {
    return null;
  }
  const holdsCard = (): boolean =>
    texts.some((text) => toContentBlocks(text, { cardTrust: render.cardTier, lenientHtml: render.lenientCards }).some((block) => block.kind === "html-card"));
  return styled || holdsCard() ? <PlainContentNotice key="plain-notice" subject={render.plain} /> : null;
}

function withNotice(body: ReactElement, notice: ReactElement | null): ReactElement {
  return notice === null ? (
    body
  ) : (
    <Stack gap="row">
      {body}
      {notice}
    </Stack>
  );
}

export interface MessageContentProps {
  readonly content: string;
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
}

export function MessageContent({
  content,
  render,
  renderContext,
  display,
  speakerThemes,
  narratorVoiced = false,
  cardOrigin,
  pluginDisplayRow,
  displayOrder,
}: MessageContentProps): ReactElement {
  const { text: displayed, styled, pending, observeBody } = useDisplayText(content, renderContext, { ...display, order: displayOrder });
  // The LAST step before markup (§5.5/§5.29): the viewer's own plugins annotate what the house pipeline
  // produced. Inert without a row or without a registered transform — same string in, same string out.
  const resolvedContent = usePluginDisplayText(displayed, pluginDisplayRow);
  const characterNames = narratorVoiced && speakerThemes !== undefined ? [...speakerThemes.keys()] : NO_CHARACTER_NAMES;
  const spans = parseSpeakerSpans(resolvedContent, characterNames);

  // D354: a display script's own markup styled this row and the row's tier is the sandboxed one, so the reply
  // draws in a card frame. A plugin that rewrote the text has changed what the scripts produced, so the row keeps
  // today's path; markup the model wrote alone never styles a row. A row still waiting on its scripts is never
  // framed: it stays on the held inert path below until its answer lands.
  if (render.cardTier === "tierB" && styled && !pending && resolvedContent === displayed) {
    // The frame's accessible name is the row's own speaker: its character, or the persona that wrote it.
    const { characterId, personaId } = display.row;
    const characterName = characterId === null ? undefined : renderContext?.characterNamesById.get(characterId)?.name;
    const personaName = personaId === null ? undefined : renderContext?.personaNamesById.get(personaId)?.name;
    return (
      <FramedReply
        observeBody={observeBody}
        spans={spans.map((span) => ({
          text: span.text,
          tokens: span.speaker === null ? undefined : (speakerThemes?.get(span.speaker) ?? colorForCharacter(span.speaker)),
        }))}
        render={render}
        cardOrigin={cardOrigin}
        speakerName={characterName ?? personaName}
      />
    );
  }

  // A styled row the frame does not draw (a Tier A row, or a plugin rewrote its text) renders through the inert
  // allowlist, with the template's `<style>` and `<script>` elements removed, so their content never prints as prose.
  const segmentRender: RowRenderPolicy = styled ? { ...render, trust: "untrusted" } : render;
  const segmentText = (text: string): string => (styled ? stripStyleElements(text) : text);
  const plainNotice = rowPlainNotice(
    spans.map((span) => segmentText(span.text)),
    render,
    styled,
    pending,
  );
  const [onlySpan] = spans;
  if (spans.length === 1 && onlySpan !== undefined && onlySpan.speaker === null) {
    return withNotice(
      <MessageSegment
        text={segmentText(onlySpan.text)}
        render={segmentRender}
        keyPrefix=""
        cardOrigin={cardOrigin}
        pending={pending}
        observeBody={observeBody}
      />,
      plainNotice,
    );
  }

  return (
    <Stack gap="block" data-slot="message-content-spans" ref={observeBody} data-display-pending={pending ? "" : undefined}>
      {spans.map((span, index) => {
        const key = `${index}-${span.speaker ?? "narrator"}`;
        if (span.speaker === null) {
          return <MessageSegment key={key} text={segmentText(span.text)} render={segmentRender} keyPrefix={`${key}-`} cardOrigin={cardOrigin} />;
        }
        const spanTokens = speakerThemes?.get(span.speaker) ?? colorForCharacter(span.speaker);
        return (
          <ThemeScope key={key} tokens={spanTokens}>
            <MessageSegment text={segmentText(span.text)} render={segmentRender} keyPrefix={`${key}-`} cardOrigin={cardOrigin} />
          </ThemeScope>
        );
      })}
      {plainNotice}
    </Stack>
  );
}
