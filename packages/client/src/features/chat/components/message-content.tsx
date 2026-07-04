// The message-body renderer — projects a stored body string into the typed `MessageContentBlock[]`
// (§12.4, via lib/content-blocks) and dispatches each block by kind. EXHAUSTIVE `switch` + `assertNever`
// so a new block kind fails `tsc` here (the trust-tier × render-tier dispatch stays type-safe).
//
// SCOPE (task #17): `markdown` is rendered fully through `@orb/ui/markdown`. `media` + `html-card`
// route to a minimal typed placeholder — the full `<MessageMedia>` (gated external loads) + Tier-B
// `<sandbox-frame>` wiring is task #25; the exhaustive dispatch means #25 drops straight in.
//
// SPEAKER SPLIT (#21, §12.4): the body is parsed on `<speaker>NAME</speaker>` markers UPSTREAM of
// block projection (`lib/parse-speaker-spans`) — each span is THEN projected independently through
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

import type { MessageContentBlock } from "@orb/contracts/chat";
import { Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement } from "react";
import { toContentBlocks } from "../lib/content-blocks";
import { parseSpeakerSpans } from "../lib/parse-speaker-spans";
import { colorForCharacter } from "../lib/speaker-color";

/** Own AI output is `trusted`; imported cards / other participants are `untrusted` (§11.6). */
type Trust = "trusted" | "untrusted";

function assertNever(value: never): never {
  throw new Error(`MessageContent: unhandled block ${JSON.stringify(value)}`);
}

// biome can't infer `z.infer` of the contracts discriminatedUnion (it reads `block` as `never` →
// "unreachable case" on every arm); tsc resolves the union + the assertNever exhaustiveness correctly.
// Same resolver gap as data/bus/apply-chat-bus-event.ts (which suppresses the identical rule).
function renderBlock(block: MessageContentBlock, key: string, trust: Trust): ReactElement {
  switch (block.kind) {
    // biome-ignore lint/suspicious/noUnnecessaryConditions: contracts z.infer resolver gap (see above).
    case "markdown":
      return (
        <Markdown key={key} trust={trust}>
          {block.md}
        </Markdown>
      );
    // Task #25 — the gated MessageMedia / sandbox-frame render. Typed placeholder keeps the seam.
    // biome-ignore lint/suspicious/noUnnecessaryConditions: contracts z.infer resolver gap (see above).
    case "media":
      return (
        <Text key={key} as="span" size="label" tone="muted">
          [media]
        </Text>
      );
    // biome-ignore lint/suspicious/noUnnecessaryConditions: contracts z.infer resolver gap (see above).
    case "html-card":
      return (
        <Text key={key} as="span" size="label" tone="muted">
          [card]
        </Text>
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
function renderSegment(
  text: string,
  trust: Trust,
  keyPrefix: string,
  listKey?: string,
): ReactElement {
  const blocks = toContentBlocks(text);
  return (
    <Stack key={listKey} gap="row">
      {/* Block order is fully determined by `text` and never reorders independently, so the
          positional index IS each block's stable identity (no natural id exists in the render model). */}
      {blocks.map((block, index) =>
        renderBlock(block, `${keyPrefix}${index}-${block.kind}`, trust),
      )}
    </Stack>
  );
}

export interface MessageContentProps {
  /** The stored/authored body string (D26/D51 — content is always a string upstream). */
  readonly content: string;
  readonly trust: Trust;
}

/** Render a message body as its typed block sequence, speaker-split + colored per §12.4. */
export function MessageContent({ content, trust }: MessageContentProps): ReactElement {
  const spans = parseSpeakerSpans(content);

  // Byte-identical no-op (the load-bearing case, §12.4): zero well-formed `<speaker>` markers
  // collapse to exactly one null-speaker span carrying the untouched `content` string — render
  // through the EXACT original single-path, no new element in the tree.
  const [onlySpan] = spans;
  if (spans.length === 1 && onlySpan !== undefined && onlySpan.speaker === null) {
    return renderSegment(onlySpan.text, trust, "");
  }

  return (
    <Stack gap="block" data-slot="message-content-spans">
      {spans.map((span, index) => {
        const key = `${index}-${span.speaker ?? "narrator"}`;
        if (span.speaker === null) {
          return renderSegment(span.text, trust, `${key}-`, key);
        }
        return (
          <ThemeScope key={key} tokens={colorForCharacter(span.speaker)}>
            {renderSegment(span.text, trust, `${key}-`)}
          </ThemeScope>
        );
      })}
    </Stack>
  );
}
