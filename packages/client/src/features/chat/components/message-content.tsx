// The message-body renderer — projects a stored body string into the typed `MessageContentBlock[]`
// (§12.4, via lib/content-blocks) and dispatches each block by kind. EXHAUSTIVE `switch` + `assertNever`
// so a new block kind fails `tsc` here (the trust-tier × render-tier dispatch stays type-safe).
//
// SCOPE (task #25): `markdown` renders through `@orb/ui/markdown` at the row's resolved trust tier;
// `media` routes through the gated `<MessageMediaBlock>` (external → `<MessageMedia>` + `<Lightbox>`;
// asset = the pre-wired #67 seam); `html-card` dispatches on its OWN block-level `trust` (tierA → the
// sanitized `untrusted` markdown seal with `css` DISCARDED — Tier-A forbids `<style>`; tierB → the
// sandboxed `<SandboxFrame>`). Untrusted HTML NEVER touches the main DOM (gate
// `no-untrusted-html-in-main-dom`); external media NEVER bypasses `<MessageMedia>` (gate
// `no-external-media-without-gate`).
//
// SPEAKER SPLIT (#21, §12.4): the body is parsed on `<speaker>NAME</speaker>` markers UPSTREAM of
// block projection (`@orb/kit/speaker-label` `parseSpeakerSpans` — C16: promoted from a client-local
// mirror of kit's private tag-pair regex) — each span is THEN projected independently through
// the same `toContentBlocks`/`renderBlock` machinery above. Zero markers is the load-bearing no-op:
// exactly one `{speaker: null}` span whose `text` is the untouched `content` string, rendered through
// the EXACT original single-path (`renderSegment`, no new wrapper element) — byte-identical to the
// pre-#21 output. A tagged body renders each span as its own block group, wrapped in `<ThemeScope>`
// with a deterministic per-speaker color (`lib/speaker-color`, keyed on the marker's NAME — the only
// signal available at THIS render layer) so a merged/narrator message's dialogue/narration colors
// apply *within* the one bubble. This is NOT the "never parse attribution from body" violation: a
// row's TRUSTED author identity (name/avatar) is a separate concern resolved in message-row.tsx from
// the server-stamped `characterId`; this per-span tint is a cosmetic default, and a real
// per-character `ThemeOverride` (once the theme system lands) layers on top via the same ThemeScope.
//
// MACRO DISPLAY PASS (the `{{char}}`/`{{user}}` bug fix, §12.4's deferred SEAM in content-blocks.ts):
// `renderMessageForDisplay` (`#lib/message-render` — ONE engine, `@orb/kit/macro` underneath, D-ledger
// "engine vs data") runs on the RAW `content` string BEFORE the speaker-span split, so a merged-
// narrator body's markers still see fully-resolved text and `{{char}}`/`{{user}}` never leak into a
// `<speaker>` NAME position. `renderContext` is optional + additive: absent (no roster/persona
// threaded to the row yet — the pre-existing #21 default) means content passes through UNCHANGED, so
// every caller that predates this pass (CT stories, the edit textarea's read-only preview, etc.)
// keeps its exact prior byte-for-byte render.

import type { MessageContentBlock } from "@orb/contracts/chat";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import { parseSpeakerSpans } from "@orb/kit/speaker-label";
import { Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import { SandboxFrame } from "@orb/ui/sandbox-frame";
import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import type { MessageRenderContext } from "#lib";
import { renderMessageForDisplay } from "#lib";
import { toContentBlocks } from "../lib/content-blocks";
import type { RowRenderPolicy } from "../lib/render-trust";
import { colorForCharacter } from "../lib/speaker-color";
import { MessageMediaBlock } from "./message-media-block";

function assertNever(value: never): never {
  throw new Error(`MessageContent: unhandled block ${JSON.stringify(value)}`);
}

// biome can't infer `z.infer` of the contracts discriminatedUnion (it reads `block` as `never` →
// "unreachable case" on every arm); tsc resolves the union + the assertNever exhaustiveness correctly.
// Same resolver gap as data/bus/apply-chat-bus-event.ts (which suppresses the identical rule).
function renderBlock(
  block: MessageContentBlock,
  key: string,
  render: RowRenderPolicy,
): ReactElement {
  const { trust, allowExternal } = render;
  switch (block.kind) {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: contracts z.infer resolver gap (see above).
    case "markdown":
      return (
        // `static` — a settled canon body: the seal's incomplete-markdown repair stays off (streaming-only).
        // The ST-parity settled-body auto-fix is applied UPSTREAM (renderMessageForDisplay's `fixMarkdown`,
        // gated by the `autoFixMarkdown` pref), never here.
        <Markdown key={key} trust={trust} mode="static">
          {block.md}
        </Markdown>
      );
    // Gated media (D44 §12.3): external → `<MessageMedia>` + `<Lightbox>`; asset → the #67 pre-wired seam.
    // biome-ignore lint/suspicious/noUnnecessaryConditions: contracts z.infer resolver gap (see above).
    case "media":
      return <MessageMediaBlock key={key} block={block} allowExternal={allowExternal} />;
    // HTML card (D44 §12.2). Dispatch on the block's OWN trust tier (independent of the message-level
    // `trust`): tierA renders through the SANITIZED untrusted markdown seal (Streamdown's Tier-A allowlist
    // + url gate — main DOM, inert), `css` DISCARDED (Tier-A forbids `<style>`/inline style; applying it
    // would reopen the CSS-exfil vector the iframe exists to contain). tierB renders inside the sandboxed
    // `<SandboxFrame>` (null-origin iframe + per-frame CSP — untrusted HTML never sanitized-into-main-DOM).
    // biome-ignore lint/suspicious/noUnnecessaryConditions: contracts z.infer resolver gap (see above).
    case "html-card":
      return block.trust === "tierB" ? (
        <SandboxFrame
          key={key}
          html={block.html}
          {...(block.css === undefined ? {} : { css: block.css })}
          title="Rich content card"
        />
      ) : (
        <Markdown key={key} trust="untrusted" mode="static">
          {block.html}
        </Markdown>
      );
    default:
      return assertNever(block);
  }
}

// One span's block group — IDENTICAL markup to the pre-#21 single-path render (no new wrapper, no
// extra attribute) so the zero-marker no-op case is byte-for-byte unchanged. `keyPrefix` disambiguates
// block keys ACROSS spans when more than one exists; the no-op call passes `""` so its block keys
// (`${index}-${block.kind}`) match the pre-#21 keys exactly. `listKey` is set directly on creation
// (never serializes to the DOM — harmless to pass `undefined` for the no-op call).
interface SegmentContext {
  readonly render: RowRenderPolicy;
  readonly keyPrefix: string;
  readonly listKey?: string | undefined;
}

function renderSegment(text: string, ctx: SegmentContext): ReactElement {
  const blocks = toContentBlocks(text);
  return (
    <Stack key={ctx.listKey} gap="row">
      {/* Block order is fully determined by `text` and never reorders independently, so the
          positional index IS each block's stable identity (no natural id exists in the render model). */}
      {blocks.map((block, index) =>
        renderBlock(block, `${ctx.keyPrefix}${index}-${block.kind}`, ctx.render),
      )}
    </Stack>
  );
}

export interface MessageContentProps {
  /** The stored/authored body string (D26/D51 — content is always a string upstream). */
  readonly content: string;
  /** The RESOLVED render decision for this row (D44 §12.0 — `resolveRowRenderPolicy`): the markdown/
   *  html-card trust tier + the external-media gate. Untrusted + gate-external is the safe floor. */
  readonly render: RowRenderPolicy;
  /** The room-level macro DATA (roster/persona names) — absent means "no roster/persona threaded
   *  yet" (the pre-existing #21 additive default), in which case `content` renders UNCHANGED. */
  readonly renderContext?: MessageRenderContext | undefined;
  /** This row's own speaker (the message's `characterId`) — retargets `{{char}}` to THIS character
   *  in a group room; omit/null for rows with no known speaker (falls back to `renderContext`'s
   *  `speakerCharName` default). Ignored when `renderContext` is absent. */
  readonly rowCharacterId?: CharacterId | null | undefined;
  /** This row's own author persona (the message's `personaId`) — retargets `{{user}}`/`{{persona}}` to
   *  THIS persona (the SAME id the #21 attribution badge resolves); omit/null for rows with no known
   *  author (falls back to `renderContext`'s anchor-persona `fallbackPersonaName` default). Ignored when `renderContext`
   *  is absent. */
  readonly rowPersonaId?: PersonaId | null | undefined;
  /** Layer 3 (merged-narrator §12.4) — NAME → the character's authored `themeOverride`, so each
   *  `<speaker>` span inside one merged bubble carries that character's palette; a speaker with no
   *  override falls back to the deterministic hash tint. Absent ⇒ every span uses the hash fallback. */
  readonly speakerThemes?: ReadonlyMap<string, ThemeScopeTokens> | undefined;
}

/** Render a message body as its typed block sequence, speaker-split + colored per §12.4. Macros
 *  (`{{char}}`/`{{user}}`/…) are resolved against `renderContext` BEFORE the speaker-span split, so a
 *  merged-narrator body's `<speaker>` markers see already-substituted text. */
export function MessageContent({
  content,
  render,
  renderContext,
  rowCharacterId,
  rowPersonaId,
  speakerThemes,
}: MessageContentProps): ReactElement {
  const resolvedContent =
    renderContext === undefined
      ? content
      : renderMessageForDisplay(content, renderContext, rowCharacterId, rowPersonaId);
  const spans = parseSpeakerSpans(resolvedContent);

  // Byte-identical no-op (the load-bearing case, §12.4): zero well-formed `<speaker>` markers
  // collapse to exactly one null-speaker span carrying the untouched `content` string — render
  // through the EXACT original single-path, no new element in the tree.
  const [onlySpan] = spans;
  if (spans.length === 1 && onlySpan !== undefined && onlySpan.speaker === null) {
    return renderSegment(onlySpan.text, { render, keyPrefix: "" });
  }

  return (
    <Stack gap="block" data-slot="message-content-spans">
      {spans.map((span, index) => {
        const key = `${index}-${span.speaker ?? "narrator"}`;
        if (span.speaker === null) {
          return renderSegment(span.text, { render, keyPrefix: `${key}-`, listKey: key });
        }
        // Layer 3: the speaker's authored override (by marker name) wins; the hash tint is the fallback.
        const spanTokens = speakerThemes?.get(span.speaker) ?? colorForCharacter(span.speaker);
        return (
          <ThemeScope key={key} tokens={spanTokens}>
            {renderSegment(span.text, { render, keyPrefix: `${key}-` })}
          </ThemeScope>
        );
      })}
    </Stack>
  );
}
