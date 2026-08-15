// The ONE card mount site (D44 §12.2). Two renderers call it — the settled row
// (`message-content.tsx`) and the STREAMING ghost row (`ghost-message-row.tsx`, once a card's fence has
// closed) — and they must not become two spellings of one sandbox posture: a copy would let the ghost's
// iframe drift off `SANDBOX_ATTR`, off the frame CSP, or onto a different tier. Sharing this file makes the
// two arms byte-identical by construction rather than by review.
//
// The TIER is never derived here. `render-trust.ts` is the one trust authority (it resolves BOTH the
// markdown trust and the card tier, from two documented consent axes); this file dispatches on the tier its
// caller was handed. Do not re-derive a tier at a call site — that mistake shipped once already and read as
// "trusted cards vanished".

import type { MessageContentBlock } from "@orb/contracts/chat";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { ImmersiveCard, InertCard } from "@orb/ui/immersive-card";
import { Markdown } from "@orb/ui/markdown";
import { useSandboxTheme } from "@orb/ui/sandbox-frame";
import type { ReactElement } from "react";
import { useCardFrameSrc } from "#data";

/** The room a card was authored in — the card-frame doorway's POLICY SELECTOR (the server resolves this
 *  character's `renderPolicy` and builds the frame CSP from it). Absent ⇒ the srcdoc floor renders, which is
 *  strictly TIGHTER (it inherits the app document's CSP on top of its own meta policy). */
export interface CardOrigin {
  readonly chatId: ChatId;
  readonly characterId: CharacterId | null;
}

/** The tierB card. A COMPONENT rather than a render helper: the routed card-frame handle is minted with a
 *  hook, and the mint needs the theme-resolved tokens the frame will actually carry (a card that recolors on
 *  a theme flip must re-mint, or the routed document would serve yesterday's palette). Without a
 *  `cardOrigin` there is no room, hence no roster, hence no trust verdict — it renders the floor. */
function TierBCard({
  block,
  allowExternal,
  cardOrigin,
}: {
  readonly block: Extract<MessageContentBlock, { kind: "html-card" }>;
  readonly allowExternal: boolean;
  readonly cardOrigin: CardOrigin | undefined;
}): ReactElement {
  const { themeTokens, fontFamily } = useSandboxTheme();
  const frameSrc = useCardFrameSrc(cardOrigin === undefined ? undefined : { ...cardOrigin, html: block.html, css: block.css, themeTokens, fontFamily });
  return (
    <ImmersiveCard
      html={block.html}
      allowExternalMedia={allowExternal}
      {...(frameSrc === undefined ? {} : { frameSrc })}
      {...(block.css === undefined ? {} : { css: block.css })}
      {...(block.title === undefined ? {} : { title: block.title })}
      {...(block.origin === undefined ? {} : { origin: block.origin })}
    />
  );
}

export interface CardBlockProps {
  readonly block: Extract<MessageContentBlock, { kind: "html-card" }>;
  /** The row's resolved external-media verdict — widens the frame CSP to `https:`. Fail-closed at false. */
  readonly allowExternal: boolean;
  /** The routed-mint selector; absent ⇒ the srcdoc floor (see {@link CardOrigin}). */
  readonly cardOrigin?: CardOrigin | undefined;
}

/** The `html-card` arm — the tierB sandbox or the tierA inert frame, selected by the tier the caller's
 *  render policy already resolved. */
export function CardBlock({ block, allowExternal, cardOrigin }: CardBlockProps): ReactElement {
  if (block.trust === "tierB") {
    return <TierBCard block={block} allowExternal={allowExternal} cardOrigin={cardOrigin} />;
  }
  // Tier A: the sanitized body inside the inert frame. No `authorName` is threaded yet — the row policy
  // does not carry one, and InertCard degrades to "this character" rather than printing an empty name.
  // Threading the real name is a follow-up worth doing (it makes the remedy one click more obvious), not a
  // reason to hold the visibility fix.
  return (
    <InertCard {...(block.title === undefined ? {} : { title: block.title })}>
      <Markdown trust="untrusted" mode="static">
        {block.html}
      </Markdown>
    </InertCard>
  );
}
