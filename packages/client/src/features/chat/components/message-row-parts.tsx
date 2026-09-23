// message-row.tsx's render helpers, split out to stay under the component-size cap. No state of its
// own — every export is a pure (args) => ReactElement/ReactNode the row calls with already-resolved data.
// The row's HEADER (speaker · timestamp · actions) and its placement decision are a second module,
// message-row-header.tsx, split off when #288 pushed this file past the cap.

import type { MessageView } from "@orb/contracts/chat";
import { initialsFor } from "@orb/kit/initials";
import type { MessageRole } from "@orb/kit/message-role";
import { Avatar } from "@orb/ui/avatar";
import { Stack } from "@orb/ui/layout";
import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement, ReactNode } from "react";
import type { MessageRenderContext, RowRenderPolicy } from "#lib";
import { cn, renderMessageForDisplay } from "#lib";

import type { RowAttribution } from "../lib/attribution.ts";
import type { GreetingBinding } from "../lib/greeting-window.ts";
import { MESSAGE_REASONING_NAME } from "../lib/message-action-names.ts";
import { BG_PHOTO_CHROME_PLATE } from "../lib/message-row-backing.ts";
import type { BubbleDecoration, RowSkin } from "../lib/message-row-variants.ts";
import { avatarPortraitSrcProp, avatarSrcProp } from "../lib/message-row-variants.ts";
import { GreetingSwipeStrip } from "./greeting-swipe-strip.tsx";
import { MessageContent } from "./message-content.tsx";
import { MessageEditTextarea } from "./message-edit-textarea.tsx";
import { renderSingleBubble } from "./message-row-bubble.tsx";
import { ReasoningBlock } from "./reasoning-block.tsx";
import { SwipeStrip } from "./swipe-strip.tsx";

/** #1728 arm B — a chip in a `1fr` RAIL must hug the centred column's edge or it drifts to the far side of
 *  the margin. Mapped rather than branched, so a new rail member fails tsc here (the house dispatch rule). */
const GUTTER_RAIL_CLASS: Readonly<Record<"none" | "leading" | "trailing", string>> = {
  none: "",
  leading: "@4xl:justify-self-end",
  trailing: "@4xl:justify-self-start",
};

/** The SETTLED reasoning disclosure for a committed row — the durable half of the live ghost's block, reading
 *  `MessageView.reasoning` (the `message_variants.reasoning` column every backend's turn persists) so a
 *  completed turn's trace stays readable after the ghost unmounts. Collapsed by default, click-to-expand.
 *
 *  IT IS NOT AN ACCESS GATE: the server already decided what this viewer may read — §3.6's reasoning strip
 *  NULLS the field for a member of a deception-active game at every read path (listMessages, the durable
 *  replay, the live fan-out, the turn returns, the fork copy), so a stripped row arrives with nothing to
 *  render. Null/empty ⇒ no disclosure at all (never an empty affordance advertising a withheld channel).
 *  Suppressed while EDITING, like the tool-call + metadata rows. */
export function renderRowReasoning(args: {
  readonly editing: boolean;
  readonly message: MessageView;
  readonly renderContext: MessageRenderContext;
  readonly showLLMReasoningIcon: boolean;
}): ReactNode {
  const raw = args.message.reasoning;
  if (args.editing || raw === null || raw.length === 0) {
    return null;
  }
  // Same macro/regex display pass the ghost's live trace gets, so `{{char}}`/`{{user}}` in a thinking trace
  // read identically before and after commit.
  const text = renderMessageForDisplay(raw, args.renderContext, args.message.characterId, args.message.personaId);
  return <ReasoningBlock reasoning={text} thinking={false} label={MESSAGE_REASONING_NAME} showIcon={args.showLLMReasoningIcon} />;
}

/** Null when Tide's trains take over — each paragraph gets its own MessageContent call. */
export function resolveRowContent(args: {
  readonly editing: boolean;
  readonly message: MessageView;
  readonly trainParagraphs: readonly string[] | null;
  readonly render: RowRenderPolicy;
  readonly renderContext: MessageRenderContext;
  readonly speakerThemes: ReadonlyMap<string, ThemeScopeTokens>;
  readonly narratorVoiced: boolean;
}): ReactNode {
  if (args.editing) {
    // No `onSave` override: the edit lands through the committed message-edit verb. The draft-greeting
    // override (`setDraftGreeting`, a client store) died with draft mode — a seeded greeting is real canon
    // now, so editing one IS a message edit (D166).
    return <MessageEditTextarea message={args.message} />;
  }
  if (args.trainParagraphs !== null) {
    return null;
  }
  return (
    <MessageContent
      content={args.message.content}
      render={args.render}
      renderContext={args.renderContext}
      rowCharacterId={args.message.characterId}
      rowPersonaId={args.message.personaId}
      speakerThemes={args.speakerThemes}
      narratorVoiced={args.narratorVoiced}
      cardOrigin={{ chatId: args.message.chatId, characterId: args.message.characterId }}
      // The COMMITTED row identity the plugin display seam needs (U6, seam 14). Only committed rows carry one:
      // a ghost row has no settled `MessageView`, so it renders untransformed and always did.
      pluginDisplayRow={{ chatId: args.message.chatId, messageId: args.message.id }}
    />
  );
}

/** THE ROW'S CARRIED PALETTE, OVER THE WHOLE CONTENT COLUMN (#2425) — the one home both the settled row
 *  and the streaming ghost mount it through.
 *
 *  It used to wrap the BUBBLE only, which was correct for the seven `inside` skins (their header is the
 *  container's own first child) and silently wrong for the one `outside` skin: tide's header is a SIBLING
 *  above the box, so it sat outside the scope and resolved its plate, its band and its ink from the
 *  VIEWER's palette while the prose one line below rode the CARRIED one. Measured live 2026-09-19 as the
 *  pinned band reading a neutral `oklch(0.12 0.006 60)` against the inside skins' speaker-tinted
 *  `oklch(0.112 …)` — #204's "one column, two palettes" defect, at the one surface #288's anatomy move
 *  left outside the container.
 *
 *  It stops at the bubble: the chrome BELOW it (metadata row, swipe strip, message footer) is deliberately
 *  still the viewer's, because that chrome is about the MESSAGE (timestamps, swipes, disclosures) rather
 *  than about the speaker, and #106 floors it against the viewer's own plate.
 *
 *  `display: contents`, so nothing in the column's height chain moves and a null-token row is byte-identical. */
export function themedColumnContent(tokens: ThemeScopeTokens | null, content: ReactNode): ReactNode {
  if (tokens === null) {
    return content;
  }
  return (
    <ThemeScope tokens={tokens} className="contents">
      {content}
    </ThemeScope>
  );
}

export function renderRowBubble(args: {
  readonly role: MessageRole;
  readonly message: MessageView;
  readonly content: ReactNode;
  /** The settled reasoning disclosure ({@link renderRowReasoning}), or null. Rendered INSIDE the bubble above
   *  the body — the same place the streaming ghost puts it, so commit doesn't jump the affordance out of the
   *  bubble. Trains (Tide) have no single bubble, so it leads the paragraph stack instead. */
  readonly reasoning: ReactNode;
  /** #288 — the speaker header, when this skin's `headerPlacement` is `inside`; null when it is not (the
   *  row renders it as a sibling above instead). It leads the container's content in EVERY bubble shape —
   *  the plain box, whisper's below-the-band stack and ripple's welded-portrait row — so "one container"
   *  is a property of the anatomy rather than of one branch. */
  readonly header: ReactNode;
  readonly trainParagraphs: readonly string[] | null;
  readonly skin: RowSkin;
  readonly decoration: BubbleDecoration | null;
  /** Ripple's sticky portrait, welded inside the bubble's own Row; null for every other mode/kind. */
  readonly weldedAvatar: ReactElement | null;
  readonly render: RowRenderPolicy;
  readonly renderContext: MessageRenderContext;
  readonly speakerThemes: ReadonlyMap<string, ThemeScopeTokens>;
  readonly narratorVoiced: boolean;
  /** #245 — EDIT mode: the bubble stops hugging (`w-fit`, D66 N3) and fills the column the row holds open
   *  (`MessageRow`'s reservation is the other half); a hugging editor snapped a short reply's box narrower. */
  readonly editing: boolean;
}): ReactElement {
  // Hide-from-AI dims the row (still user-visible — the toggle holds it out of assembly only).
  const bubbleClassName = cn(args.skin.inner(args.role), args.editing && "w-full", args.message.excludedFromPrompt && "opacity-50") ?? "";
  const body =
    args.trainParagraphs === null ? (
      renderSingleBubble({
        role: args.role,
        header: args.header,
        content:
          args.reasoning === null ? (
            args.content
          ) : (
            <>
              {args.reasoning}
              {args.content}
            </>
          ),
        bubbleClassName,
        decoration: args.decoration,
        weldedAvatar: args.weldedAvatar,
      })
    ) : (
      // A train has no single container, so an `inside` header would have nowhere to be inside — `tide` is
      // declared `outside` for exactly that reason and never reaches this with a header. Rendering it at
      // the head of the stack anyway keeps the slot TOTAL: a future trains skin that chose `inside` would
      // paint a header above its pills, never silently drop the speaker.
      <Stack gap="field" data-slot="message-bubble-train">
        {args.header}
        {args.reasoning}
        {args.trainParagraphs.map((paragraph, index) => (
          <Stack
            // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs are a stable re-split of the SAME settled message.content each render — the index IS the paragraph identity.
            key={index}
            gap="row"
            data-slot="message-bubble"
            className={bubbleClassName}
            style={args.decoration?.style}
          >
            <MessageContent
              content={paragraph}
              render={args.render}
              renderContext={args.renderContext}
              rowCharacterId={args.message.characterId}
              rowPersonaId={args.message.personaId}
              speakerThemes={args.speakerThemes}
              narratorVoiced={args.narratorVoiced}
              cardOrigin={{ chatId: args.message.chatId, characterId: args.message.characterId }}
            />
          </Stack>
        ))}
      </Stack>
    );
  // #2425 — THE SPEAKER SCOPE IS THE CONTENT COLUMN'S, NOT THE BUBBLE'S. It used to wrap this function's
  // return, which put an `outside` header (tide's, the one skin whose header is a SIBLING above the box)
  // OUTSIDE the carried palette: its pinned band resolved `--color-reading-band` from the VIEWER's theme
  // while the prose one line below rode the CARRIED one — measured live 2026-09-19 as a neutral
  // `oklch(0.12 0.006 60)` band over speaker-tinted `oklch(0.112 …)` prose, i.e. #204's one-column-two-
  // palettes defect reaching the one surface #288 left outside the container. The caller now wraps the
  // column's header + bubble in ONE scope (`message-row.tsx`, and its twin in `ghost-message-row.tsx`), so
  // the seven `inside` skins are byte-identical and tide joins them.
  return body;
}

// "sticky-portrait" (Ripple) swaps the chip for a smart-cropped 2:3 portrait pinned via
// position:sticky, forcing shape="square" regardless of the avatarShape pref. Its weld rounds only the
// outer edge (away from the bubble it welds to — mirrored for role==="user") so the inner edge sits
// flush against the bubble's own radius.
export function renderRowAvatar(args: {
  readonly attribution: RowAttribution;
  readonly avatarTreatment: ReturnType<RowSkin["avatarTreatment"]>;
  readonly role: MessageRole;
  readonly showInChatAvatars: boolean;
  readonly avatarSize: "sm" | "md" | "lg";
  readonly avatarShape: "round" | "square" | "rounded";
  readonly avatarAspect: "square" | "portrait";
  readonly avatarRing: "none" | "accent";
  /** #288 — the gutter chip aligns with the SPEAKER'S NAME, and since the header moved inside the
   *  container that line starts one `--spacing-row` below the container's top edge. Without this the chip
   *  top-aligned with the box instead of the name and sat 8px high of it (measured; the "chip top-aligns
   *  with the name row" CT is the fence). ST's own refs align the chip to the header line, not the card.
   *  False for an `outside` skin, where the header IS the column's first line and nothing is offset. */
  readonly alignToInsideHeader: boolean;
  /** #1728 arm B — this row's skin seats its column with `columnPlacement: "gutterCentred"`, so at/above
   *  the `@4xl` crossover the chip lives in a `1fr` RAIL beside the centred column rather than in flow
   *  beside it. A rail is wider than the chip, so the chip has to hug the column's edge or it drifts to
   *  the far side of the margin: `justify-self-end` for a leading chip, `justify-self-start` for a
   *  trailing one. Inert below the crossover and inert for every `anchored` skin, where the row body is
   *  still a flex line and `justify-self` has no grid to resolve against. */
  readonly gutterRail: "none" | "leading" | "trailing";
}): ReactElement | null {
  if (args.attribution.name === null || !args.showInChatAvatars) {
    return null;
  }
  // The welded portrait spans the card and has no line to align to — offset only the gutter chip.
  // exactOptionalPropertyTypes idiom: OMIT the prop rather than pass `undefined` (the `avatarSrcProp`
  // precedent one file over).
  const railClass = GUTTER_RAIL_CLASS[args.gutterRail];
  const chipClass = cn(args.alignToInsideHeader ? "mt-row" : "", railClass);
  const headerOffset = chipClass === undefined || chipClass === "" ? {} : { className: chipClass };
  if (args.avatarTreatment === "sticky-portrait") {
    const weldRounding = args.role === "user" ? "rounded-l-none rounded-r-card" : "rounded-l-card rounded-r-none";
    return (
      <Avatar
        size={args.avatarSize}
        shape="square"
        aspect="portrait"
        ring={args.avatarRing}
        fallbackDelay={0}
        hueSeed={args.attribution.hueSeed}
        className={cn("sticky top-0 h-auto w-(--immersive-ripple-portrait-width)", weldRounding) ?? ""}
        {...avatarPortraitSrcProp(args.attribution.avatarHash)}
      >
        {initialsFor(args.attribution.name)}
      </Avatar>
    );
  }
  return (
    <Avatar
      size={args.avatarSize}
      shape={args.avatarShape}
      aspect={args.avatarAspect}
      ring={args.avatarRing}
      fallbackDelay={0}
      hueSeed={args.attribution.hueSeed}
      {...headerOffset}
      {...avatarSrcProp(args.attribution.avatarHash)}
    >
      {initialsFor(args.attribution.name)}
    </Avatar>
  );
}

// TWO STRIPS, ONE SLOT (D166). A row in the GREETING WINDOW
// pages its character card's alternates (`GreetingSwipeStrip` → `chat.setSeededGreeting`); every other row
// pages its own generated variants (`SwipeStrip` → selectVariant/swipe). They are different sources, different
// verbs and different windows, so they are different components — but the same `n / m` + chevrons chrome,
// because to a reader they are one gesture.
//
// The `greeting` binding arrives ONLY inside the window: `ChatThread` computes it from the canon it already
// holds (no user row yet) and the roster's cards. Absent ⇒ the variant strip's own `showSwipes` rule decides,
// exactly as before.
//
// BOTH STRIPS TAKE THE ROW'S WALLPAPER BACKING (#221). The slot sits between the metadata row and the
// message footer, which have carried `BG_PHOTO_CHROME_PLATE` mode-independently since #106 — the strip
// took nothing, so its chevrons were the one band still floating on the raw photo (measured 1.60:1 live,
// against WCAG 1.4.11's 3:1 for a UI component). It is threaded from here, not imported by the strips, for
// the same reason `MessageMetadataRow` takes it as a prop: the ROW owns its backings and the leaf keeps
// knowing nothing about the shell's wallpaper flag. Self-gated on `in-data-[has-bg-image]`, so a
// plain-background room is byte-identical.
export function renderRowSwipe(args: {
  readonly editing: boolean;
  readonly showSwipes: boolean;
  readonly role: MessageView["role"];
  readonly greeting: GreetingBinding | undefined;
  readonly message: MessageView;
}): ReactNode {
  if (args.editing) {
    return null;
  }
  if (args.greeting !== undefined) {
    return (
      <GreetingSwipeStrip
        chatId={args.message.chatId}
        messageId={args.message.id}
        variants={args.greeting.variants}
        current={args.message.content}
        backingClass={BG_PHOTO_CHROME_PLATE}
      />
    );
  }
  return args.showSwipes && args.role === "assistant" ? <SwipeStrip message={args.message} backingClass={BG_PHOTO_CHROME_PLATE} /> : null;
}
