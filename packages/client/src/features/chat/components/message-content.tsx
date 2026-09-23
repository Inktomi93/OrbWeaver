// The message-body renderer — projects a stored body string into typed MessageContentBlock[] and
// dispatches each block by kind through an exhaustive switch + assertNever. The body is first parsed on
// <speaker>NAME</speaker> markers; zero markers collapses to one null-speaker span rendered through the
// original single-path (byte-identical no-op). Untrusted HTML never touches the main DOM; external
// media never bypasses MessageMediaBlock. Macros resolve against renderContext BEFORE the speaker split
// so a <speaker> NAME position never sees an unresolved {{char}}/{{user}}.

import type { MessageContentBlock } from "@orb/contracts/chat";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { parseSpeakerSpans } from "@orb/kit/speaker-label";
import { Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import type { PluginDisplayRow } from "#data";
import { usePluginDisplayText } from "#data";
import type { MessageRenderContext, RowRenderPolicy } from "#lib";
import { renderMessageForDisplay } from "#lib";
import { toContentBlocks } from "../lib/content-blocks.ts";
import { colorForCharacter } from "../lib/speaker-color.ts";
import type { CardOrigin } from "./card-block.tsx";
import { CardBlock } from "./card-block.tsx";
import { MessageChoicesBlock } from "./message-choices-block.tsx";
import { MessageMediaBlock } from "./message-media-block.tsx";

/** A stable empty CHARACTER-NAME list — a fresh `[]` per render would be a new identity for no reason. */
const NO_CHARACTER_NAMES: readonly string[] = [];

function assertNever(value: never): never {
  throw new Error(`MessageContent: unhandled block ${JSON.stringify(value)}`);
}

// biome can't infer `z.infer` of the contracts discriminatedUnion (it reads `block` as `never` →
// "unreachable case" on every arm); tsc resolves the union + the assertNever exhaustiveness correctly.
// Same resolver gap as data/bus/apply-chat-bus-event.ts (which suppresses the identical rule).
function renderBlock(block: MessageContentBlock, key: string, render: RowRenderPolicy, cardOrigin: CardOrigin | undefined): ReactElement {
  const { trust, allowExternal } = render;
  switch (block.kind) {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: contracts z.infer resolver gap (see above).
    case "markdown":
      return (
        // Quote tinting rides the PROSE arm only — a card block owns its own styles.
        <Markdown key={key} trust={trust} mode="static" colorQuotes={render.colorQuotes}>
          {block.md}
        </Markdown>
      );
    // biome-ignore lint/suspicious/noUnnecessaryConditions: contracts z.infer resolver gap (see above).
    case "media":
      return <MessageMediaBlock key={key} block={block} allowExternal={allowExternal} />;
    // D44 §12.2, the TWO card tiers — see the `cardTrust` mapping in MessageSegment for which row gets which:
    //   tierB = the OPT-IN trust tier — the ImmersiveCard chrome (§4.7 lifecycle: collapsed sandbox → expand
    //           lightbox → view-raw) around the sandboxed SandboxFrame (null-origin iframe + per-frame CSP),
    //           with the card's own CSS applied. The row's external-media verdict rides along: the sandbox
    //           CSP is the SAME axis as MessageMedia's gate, so a card's <img src="https://…"> obeys the
    //           same setting the media block does.
    //   tierA = the DEFAULT inert tier — the sanitized allowlist in the main DOM. Tier A FORBIDS <style> and
    //           inline style=, so `block.css` is not merely unused here, it is unusable by law.
    // The inert arm is wrapped in InertCard rather than emitted bare: an unstyled card in the prose flow is
    // indistinguishable from the model writing plain text, which is how this read as "cards vanish". The
    // frame says a card is here, the badge says it is plain, and the hint says what turns it on — the same
    // refuse-VISIBLY posture MessageMedia's click-to-load gate has always had.
    // biome-ignore lint/suspicious/noUnnecessaryConditions: contracts z.infer resolver gap (see above).
    case "html-card":
      return <CardBlock key={key} block={block} allowExternal={allowExternal} cardOrigin={cardOrigin} />;
    // The CYOA choice set — clickable send-affordances: a click sends the option as the
    // user's next turn through the room's choice-send capability (provider-less mounts render the
    // same buttons disabled). The block contract is untouched.
    // biome-ignore lint/suspicious/noUnnecessaryConditions: contracts z.infer resolver gap (see above).
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
}

function MessageSegment({ text, render, keyPrefix, cardOrigin }: MessageSegmentProps): ReactElement {
  // §4.3 trust routing: ONE trust authority (`render-trust`) resolves BOTH the markdown trust and the card
  // TIER — this renderer only dispatches. The tier mapping was INVERTED here until 2026-08-04 (trusted rows
  // were sent to tierA, whose allowlist forbids `<style>`, so every trusted card rendered as unstyled HTML
  // and read as "cards vanished"); it now lives in the resolver where its two consent axes are documented
  // together. Do not re-derive a tier from `render.trust` at a call site.
  // The compiler caches on the body + policy (§4.5 wiring-reality hygiene #1) so a chrome-only re-render
  // never re-tokenizes — and, with the index+kind keys below stable for an unchanged body, never reloads a
  // card's srcdoc.
  const blocks = toContentBlocks(text, { cardTrust: render.cardTier, lenientHtml: render.lenientCards });
  return <Stack gap="row">{blocks.map((block, index) => renderBlock(block, `${keyPrefix}${index}-${block.kind}`, render, cardOrigin))}</Stack>;
}

export interface MessageContentProps {
  readonly content: string;
  readonly render: RowRenderPolicy;
  /** Absent means no roster/persona threaded yet, so content renders unchanged. */
  readonly renderContext?: MessageRenderContext | undefined;
  /** Retargets `{{char}}` to this character; ignored when renderContext is absent. */
  readonly rowCharacterId?: CharacterId | null | undefined;
  /** Retargets `{{user}}`/`{{persona}}` to this persona; ignored when renderContext is absent. */
  readonly rowPersonaId?: PersonaId | null | undefined;
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
}

export function MessageContent({
  content,
  render,
  renderContext,
  rowCharacterId,
  rowPersonaId,
  speakerThemes,
  narratorVoiced = false,
  cardOrigin,
  pluginDisplayRow,
}: MessageContentProps): ReactElement {
  const rendered = renderContext === undefined ? content : renderMessageForDisplay(content, renderContext, rowCharacterId, rowPersonaId);
  // The LAST step before markup (§5.5/§5.29): the viewer's own plugins annotate what the house pipeline
  // produced. Inert without a row or without a registered transform — same string in, same string out.
  const resolvedContent = usePluginDisplayText(rendered, pluginDisplayRow);
  const characterNames = narratorVoiced && speakerThemes !== undefined ? [...speakerThemes.keys()] : NO_CHARACTER_NAMES;
  const spans = parseSpeakerSpans(resolvedContent, characterNames);

  const [onlySpan] = spans;
  if (spans.length === 1 && onlySpan !== undefined && onlySpan.speaker === null) {
    return <MessageSegment text={onlySpan.text} render={render} keyPrefix="" cardOrigin={cardOrigin} />;
  }

  return (
    <Stack gap="block" data-slot="message-content-spans">
      {spans.map((span, index) => {
        const key = `${index}-${span.speaker ?? "narrator"}`;
        if (span.speaker === null) {
          return <MessageSegment key={key} text={span.text} render={render} keyPrefix={`${key}-`} cardOrigin={cardOrigin} />;
        }
        const spanTokens = speakerThemes?.get(span.speaker) ?? colorForCharacter(span.speaker);
        return (
          <ThemeScope key={key} tokens={spanTokens}>
            <MessageSegment text={span.text} render={render} keyPrefix={`${key}-`} cardOrigin={cardOrigin} />
          </ThemeScope>
        );
      })}
    </Stack>
  );
}
