// The message-body renderer — projects a stored body string into the typed `MessageContentBlock[]`
// (§12.4, via lib/content-blocks) and dispatches each block by kind. EXHAUSTIVE `switch` + `assertNever`
// so a new block kind fails `tsc` here (the trust-tier × render-tier dispatch stays type-safe).
//
// SCOPE (task #17): `markdown` is rendered fully through `@orb/ui/markdown`. `media` + `html-card`
// route to a minimal typed placeholder — the full `<MessageMedia>` (gated external loads) + Tier-B
// `<sandbox-frame>` wiring is task #25; the exhaustive dispatch means #25 drops straight in.
// SEAM (#21 speaker coloring): the `<speaker>`-span split + per-span `<ThemeScope>` happens on the
// body string UPSTREAM of projection (§12.4) — this dispatcher stays speaker-blind.

import type { MessageContentBlock } from "@orb/contracts/chat";
import { Stack } from "@orb/ui/layout";
import { Markdown } from "@orb/ui/markdown";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { toContentBlocks } from "../lib/content-blocks";

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

export interface MessageContentProps {
  /** The stored/authored body string (D26/D51 — content is always a string upstream). */
  readonly content: string;
  readonly trust: Trust;
}

/** Render a message body as its typed block sequence. */
export function MessageContent({ content, trust }: MessageContentProps): ReactElement {
  const blocks = toContentBlocks(content);
  return (
    <Stack gap="row">
      {/* Block order is fully determined by `content` and never reorders independently, so the
          positional index IS each block's stable identity (no natural id exists in the render model). */}
      {blocks.map((block, index) => renderBlock(block, `${index}-${block.kind}`, trust))}
    </Stack>
  );
}
