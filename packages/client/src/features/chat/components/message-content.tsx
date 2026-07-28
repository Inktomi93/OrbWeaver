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
import { useMemo } from "react";
import type { MessageRenderContext } from "#lib";
import { renderMessageForDisplay } from "#lib";
import { toContentBlocks } from "../lib/content-blocks";
import type { RowRenderPolicy } from "../lib/render-trust";
import { colorForCharacter } from "../lib/speaker-color";
import { MessageChoicesBlock } from "./message-choices-block";
import { MessageMediaBlock } from "./message-media-block";

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
        <Markdown key={key} trust={trust} mode="static">
          {block.md}
        </Markdown>
      );
    // biome-ignore lint/suspicious/noUnnecessaryConditions: contracts z.infer resolver gap (see above).
    case "media":
      return <MessageMediaBlock key={key} block={block} allowExternal={allowExternal} />;
    // tierA renders through the sanitized untrusted markdown seal with css discarded (Tier-A forbids
    // <style>); tierB renders the ImmersiveCard chrome (§4.7 lifecycle: collapsed sandbox → expand
    // lightbox → view-raw) around the sandboxed SandboxFrame (null-origin iframe + per-frame CSP).
    // biome-ignore lint/suspicious/noUnnecessaryConditions: contracts z.infer resolver gap (see above).
    case "html-card":
      return block.trust === "tierB" ? (
        <ImmersiveCard
          key={key}
          html={block.html}
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
  // tierB sandbox (the model-output default); a trusted row's card may render inline tierA. Memoized on
  // the body + policy (§4.5 wiring-reality hygiene #1) so a chrome-only re-render never re-tokenizes —
  // and, with the index+kind keys below stable for an unchanged body, never reloads a card's srcdoc.
  const blocks = useMemo(
    () => toContentBlocks(text, { cardTrust: render.trust === "trusted" ? "tierA" : "tierB", lenientHtml: render.lenientCards }),
    [text, render.trust, render.lenientCards],
  );
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
  /** NAME -\> the character's authored themeOverride; absent ⇒ every span uses the hash fallback. */
  readonly speakerThemes?: ReadonlyMap<string, ThemeScopeTokens> | undefined;
}

export function MessageContent({ content, render, renderContext, rowCharacterId, rowPersonaId, speakerThemes }: MessageContentProps): ReactElement {
  const resolvedContent = renderContext === undefined ? content : renderMessageForDisplay(content, renderContext, rowCharacterId, rowPersonaId);
  const spans = parseSpeakerSpans(resolvedContent);

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
