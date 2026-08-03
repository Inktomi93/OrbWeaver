// The message-body renderer — projects a stored body string into typed MessageContentBlock[] and
// dispatches each block by kind through an exhaustive switch + assertNever. The body is first parsed on
// <speaker>NAME</speaker> markers; zero markers collapses to one null-speaker span rendered through the
// original single-path (byte-identical no-op). Untrusted HTML never touches the main DOM; external
// media never bypasses MessageMediaBlock. Macros resolve against renderContext BEFORE the speaker split
// so a <speaker> NAME position never sees an unresolved {{char}}/{{user}}.

import type { MessageContentBlock } from "@orb/contracts/chat";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { parseSpeakerSpans } from "@orb/kit/speaker-label";
import { ImmersiveCard } from "@orb/ui/immersive-card";
import { Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import type { MessageRenderContext, RowRenderPolicy } from "#lib";
import { renderMessageForDisplay } from "#lib";
import { toContentBlocks } from "../lib/content-blocks.ts";
import { colorForCharacter } from "../lib/speaker-color.ts";
import { MessageChoicesBlock } from "./message-choices-block.tsx";
import { MessageMediaBlock } from "./message-media-block.tsx";

/** A stable empty cast list — a fresh `[]` per render would be a new identity for no reason. */
const NO_CAST_NAMES: readonly string[] = [];

function assertNever(value: never): never {
  throw new Error(`MessageContent: unhandled block ${JSON.stringify(value)}`);
}

// biome can't infer `z.infer` of the contracts discriminatedUnion (it reads `block` as `never` →
// "unreachable case" on every arm); tsc resolves the union + the assertNever exhaustiveness correctly.
// Same resolver gap as data/bus/apply-chat-bus-event.ts (which suppresses the identical rule).
function renderBlock(block: MessageContentBlock, key: string, render: RowRenderPolicy): ReactElement {
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
    // tierA renders through the sanitized untrusted markdown seal with css discarded (Tier-A forbids
    // <style>); tierB renders the ImmersiveCard chrome (§4.7 lifecycle: collapsed sandbox → expand
    // lightbox → view-raw) around the sandboxed SandboxFrame (null-origin iframe + per-frame CSP).
    // The row's external-media verdict rides along: the sandbox CSP is the SAME axis as MessageMedia's
    // gate, so a card's <img src="https://…"> obeys the same setting the media block does.
    // biome-ignore lint/suspicious/noUnnecessaryConditions: contracts z.infer resolver gap (see above).
    case "html-card":
      return block.trust === "tierB" ? (
        <ImmersiveCard
          key={key}
          html={block.html}
          allowExternalMedia={allowExternal}
          {...(block.css === undefined ? {} : { css: block.css })}
          {...(block.title === undefined ? {} : { title: block.title })}
          {...(block.origin === undefined ? {} : { origin: block.origin })}
        />
      ) : (
        <Markdown key={key} trust="untrusted" mode="static">
          {block.html}
        </Markdown>
      );
    // The parity-plus §5.2-5.3 choice set — clickable send-affordances: a click sends the option as the
    // user's next turn through the room's choice-send capability (P5; provider-less mounts render the
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
}

function MessageSegment({ text, render, keyPrefix }: MessageSegmentProps): ReactElement {
  // §4.3 trust routing: ONE trust authority (`render-trust`) — an untrusted row's card renders in the
  // tierB sandbox (the model-output default); a trusted row's card may render inline tierA. The compiler
  // caches on the body + policy (§4.5 wiring-reality hygiene #1) so a chrome-only re-render never
  // re-tokenizes — and, with the index+kind keys below stable for an unchanged body, never reloads a
  // card's srcdoc.
  const blocks = toContentBlocks(text, { cardTrust: render.trust === "trusted" ? "tierA" : "tierB", lenientHtml: render.lenientCards });
  return <Stack gap="row">{blocks.map((block, index) => renderBlock(block, `${keyPrefix}${index}-${block.kind}`, render))}</Stack>;
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
   *  Its KEYS are also the present cast-name set the plain-label span grammar keys on. */
  readonly speakerThemes?: ReadonlyMap<string, ThemeScopeTokens> | undefined;
  /** True only for a row this room voices through the NARRATOR grammar (one generation speaking the whole
   *  cast). It is the OUTER guard on the plain-`Name:` half of the span parse: in any other grammar a row
   *  is one speaker's, so a line opening `Alice:` is prose (or, on a USER row, an attribution a member
   *  could forge) and must never split. The `<speaker>` marker half is unconditional — it is markup, not
   *  prose, and cannot be typed into a body by accident. */
  readonly narratorVoiced?: boolean | undefined;
}

export function MessageContent({
  content,
  render,
  renderContext,
  rowCharacterId,
  rowPersonaId,
  speakerThemes,
  narratorVoiced = false,
}: MessageContentProps): ReactElement {
  const resolvedContent = renderContext === undefined ? content : renderMessageForDisplay(content, renderContext, rowCharacterId, rowPersonaId);
  const castNames = narratorVoiced && speakerThemes !== undefined ? [...speakerThemes.keys()] : NO_CAST_NAMES;
  const spans = parseSpeakerSpans(resolvedContent, castNames);

  const [onlySpan] = spans;
  if (spans.length === 1 && onlySpan !== undefined && onlySpan.speaker === null) {
    return <MessageSegment text={onlySpan.text} render={render} keyPrefix="" />;
  }

  return (
    <Stack gap="block" data-slot="message-content-spans">
      {spans.map((span, index) => {
        const key = `${index}-${span.speaker ?? "narrator"}`;
        if (span.speaker === null) {
          return <MessageSegment key={key} text={span.text} render={render} keyPrefix={`${key}-`} />;
        }
        const spanTokens = speakerThemes?.get(span.speaker) ?? colorForCharacter(span.speaker);
        return (
          <ThemeScope key={key} tokens={spanTokens}>
            <MessageSegment text={span.text} render={render} keyPrefix={`${key}-`} />
          </ThemeScope>
        );
      })}
    </Stack>
  );
}
