// The ONE card mount site (D294, UI-Theming-and-Content §12.2). Two renderers call it — the settled row
// (`message-content.tsx`) and the STREAMING ghost row (`ghost-message-row.tsx`, once a card's fence has
// closed) — and they must not become two spellings of one sandbox posture: a copy would let the ghost's
// iframe drift off `CARD_FRAME_SANDBOX`, off the frame CSP, or onto a different tier. Sharing this file makes the
// two arms byte-identical by construction rather than by review.
//
// The TIER is never derived here. `render-trust.ts` is the one trust authority (it resolves BOTH the
// markdown trust and the card tier, from two documented consent axes); this file dispatches on the tier its
// caller was handed. Do not re-derive a tier at a call site — that mistake shipped once already and read as
// "trusted cards vanished".

import type { MessageContentBlock } from "@orb/contracts/chat";
import { stripStyleElements } from "@orb/kit/content";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { ImmersiveCard, InertCard } from "@orb/ui/immersive-card";
import { Markdown } from "@orb/ui/markdown";
import { useSandboxTheme } from "@orb/ui/sandbox-frame";
import type { ReactElement } from "react";
import { FormingChip, useFramedLinkConfirm } from "#components";
import { useCardFrame } from "#data";
import { FORMING_CARD_UNTITLED } from "../lib/reply-frame-names.ts";
import { FramedMediaNotice, FramedScriptNotice } from "./plain-content-notice.tsx";

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
 *  `cardOrigin` there is no room, hence no roster, hence no trust verdict — it renders the floor.
 *
 *  It frames as a styled reply does (`reply-frame.tsx`), through the same parts: `useCardFrame` mints once more when
 *  the handle is gone and then gives up to the floor, the shared confirm is the only way a framed link opens, and while
 *  the mint answers and the routed document draws, a forming chip holds the card's body. Two differences are the
 *  card's own. Its floor is its srcdoc render (a card brings its own look and fits the floor, where a reply cannot), so
 *  a refused mint or a lost handle draws the card there instead of an inert copy; that floor runs no script, so its
 *  links do nothing. A frame that falls to its floor (its scripts stopped, or its document loaded and never reported)
 *  gives the card up as a reply's does, so the fullscreen view draws that floor too instead of the address that failed. */
function TierBCard({
  block,
  allowExternal,
  cardOrigin,
}: {
  readonly block: Extract<MessageContentBlock, { kind: "html-card" }>;
  readonly allowExternal: boolean;
  readonly cardOrigin: CardOrigin | undefined;
}): ReactElement {
  const { themeTokens, styleTokens, fontFamily } = useSandboxTheme();
  const frame = useCardFrame(cardOrigin === undefined ? undefined : { ...cardOrigin, html: block.html, css: block.css, themeTokens, styleTokens, fontFamily });
  const links = useFramedLinkConfirm();
  const { mint } = frame;
  // Pending and routed wait behind the chip; only the floor draws at once.
  const forming =
    mint.state === "floor" ? undefined : <FormingChip title={block.title !== undefined && block.title !== "" ? block.title : FORMING_CARD_UNTITLED} />;
  return (
    <>
      <ImmersiveCard
        html={block.html}
        allowExternalMedia={allowExternal}
        {...(mint.state === "routed" ? { frameSrc: mint.url } : {})}
        {...(forming === undefined ? {} : { pending: forming })}
        onLink={links.requestLink}
        onMissing={frame.onMissing}
        onFloor={frame.giveUp}
        {...(block.css === undefined ? {} : { css: block.css })}
        {...(block.title === undefined ? {} : { title: block.title })}
        {...(block.origin === undefined ? {} : { origin: block.origin })}
      />
      {links.confirm}
      <FramedMediaNotice chatId={cardOrigin?.chatId} characterId={cardOrigin?.characterId ?? null} html={block.html} css={block.css} />
      {/* Only the routed document runs under the mint's script posture; the floor runs no script under any setting. */}
      {mint.state === "routed" ? <FramedScriptNotice chatId={cardOrigin?.chatId} characterId={cardOrigin?.characterId ?? null} html={block.html} /> : null}
    </>
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
  // Tier A: the sanitized body inside the inert frame. Why it is plain is said once, under the whole row.
  return (
    <InertCard {...(block.title === undefined ? {} : { title: block.title })}>
      {/* Tier A forbids `<style>`, and the allowlist would keep its content as text. */}
      <Markdown trust="untrusted" mode="static">
        {stripStyleElements(block.html)}
      </Markdown>
    </InertCard>
  );
}
