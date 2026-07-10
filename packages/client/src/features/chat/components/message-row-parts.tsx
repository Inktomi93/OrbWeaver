// message-row.tsx's render helpers, split out to stay under the component-size cap
// (UI-Architecture-and-Layout.md §2.1; gate `component-size`, 450 lines) — Phase 4's §B.2 additions
// (avatarTreatment/bubbleDecoration/bubbleLayout consumption) pushed the row past it. Every export here
// is module-scope by the SAME rule the pre-Phase-4 row already followed for `renderRowActions`/
// `renderRowSwipe`/`renderAttributionName`: keeping branchy JSX out of `MessageRow`'s own body holds it
// under biome's cognitive-complexity ceiling. This file has no state of its own — every function is a
// pure `(args) => ReactElement | ReactNode` the row calls with its already-resolved data (attribution,
// skin, render policy, …); it never re-derives anything message-row.tsx already computed.

import { blobPortraitUrl, blobUrl } from "@orb/contracts/assets";
import type { MessageView } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { Avatar } from "@orb/ui/avatar";
import { Row, Stack } from "@orb/ui/layout";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement, ReactNode } from "react";
import type { MessageRenderContext } from "#lib";
import { cn } from "#lib";
import { setDraftGreeting } from "#state";
import type { RowAttribution } from "../lib/attribution";
import { initialsForAttribution } from "../lib/attribution";
import type { BubbleDecoration, RowSkin } from "../lib/message-row-variants";
import type { RowRenderPolicy } from "../lib/render-trust";
import type { GreetingBinding } from "../lib/synth-greeting-row";
import { GreetingActionsRow } from "./greeting-actions-row";
import { GreetingSwipeStrip } from "./greeting-swipe-strip";
import { MessageActionsRow } from "./message-actions-row";
import { MessageContent } from "./message-content";
import { MessageEditTextarea } from "./message-edit-textarea";
import { renderSingleBubble } from "./message-row-bubble";
import { SwipeStrip } from "./swipe-strip";

/** The omit-don't-pass-undefined `<Avatar src>` idiom (`exactOptionalPropertyTypes`). */
function avatarSrcProp(avatarHash: string | null): { src?: string } {
  return avatarHash === null ? {} : { src: blobUrl(avatarHash) };
}

// §B.2 Ripple's sticky VN portrait requests the smaller rung of the smart-cropped 2:3 ladder
// (`PORTRAIT_WIDTHS`, `domain/assets/substrate/variant-policy.ts`) — a message-row chip, not a hero.
const RIPPLE_PORTRAIT_REQUEST_WIDTH = 200;

/** The portrait-variant twin of {@link avatarSrcProp} — Ripple's sticky avatar requests the smart-cropped
 *  2:3 crop (§B.4) instead of the width-only icon ladder. */
function avatarPortraitSrcProp(avatarHash: string | null): { src?: string } {
  return avatarHash === null
    ? {}
    : { src: blobPortraitUrl(avatarHash, RIPPLE_PORTRAIT_REQUEST_WIDTH) };
}

/** The row's read-only body: the edit textarea while editing, else the full-body `<MessageContent>` —
 *  `null` when Tide's trains take over (each paragraph gets its OWN `<MessageContent>`, `renderRowBubble`
 *  below). */
export function resolveRowContent(args: {
  readonly editing: boolean;
  readonly message: MessageView;
  readonly greeting: GreetingBinding | undefined;
  readonly trainParagraphs: readonly string[] | null;
  readonly render: RowRenderPolicy;
  readonly renderContext: MessageRenderContext;
  readonly speakerThemes: ReadonlyMap<string, ThemeScopeTokens>;
}): ReactNode {
  if (args.editing) {
    const { greeting } = args;
    return (
      <MessageEditTextarea
        message={args.message}
        onSave={
          greeting === undefined
            ? undefined
            : (text): void => setDraftGreeting(greeting.draftKey, greeting.characterId, text)
        }
      />
    );
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
    />
  );
}

/** The bubble slot: a single decorated bubble (every mode but Tide) or Tide's per-paragraph "train" of
 *  chained bubbles, each paragraph its OWN `<MessageContent>` call sharing the row's render policy/
 *  context. The attribution `ThemeScope` (character theme override — §12.4 Layer 3) wraps the WHOLE
 *  bubble (not just its content, pre-Phase-4 shape) so `bubbleDecoration`'s `var(--color-speaker)`
 *  stripe/art resolves the character's own override, not just the global default — `className="contents"`
 *  keeps it a zero-layout-box wrapper (unchanged visual shape for bubble/flat/document/hush/tide, which
 *  carry no decoration). */
export function renderRowBubble(args: {
  readonly role: MessageRole;
  readonly message: MessageView;
  readonly content: ReactNode;
  readonly trainParagraphs: readonly string[] | null;
  readonly skin: RowSkin;
  readonly decoration: BubbleDecoration | null;
  /** Ripple's sticky portrait (renderRowAvatar's "sticky-portrait" branch), welded INSIDE the bubble's
   *  own Row instead of rendered as a sibling of the whole row (message-row.tsx) — `null` for every
   *  other mode/kind, which keeps the plain single-`<Stack>` bubble unchanged. */
  readonly weldedAvatar: ReactElement | null;
  readonly attributionTokens: ThemeScopeTokens | null;
  readonly render: RowRenderPolicy;
  readonly renderContext: MessageRenderContext;
  readonly speakerThemes: ReadonlyMap<string, ThemeScopeTokens>;
}): ReactElement {
  // Hide-from-AI dims the row (still user-visible, per §12.4 — the toggle holds it out of assembly, it
  // does not hide it from the reader) — the standard Tailwind opacity utility (the same `opacity-50`
  // scale every disabled-state variant in @orb/ui already uses), never a raw inline-style value.
  const bubbleClassName =
    cn(
      args.skin.inner(args.role),
      args.message.excludedFromPrompt && "opacity-50",
      args.decoration?.className,
    ) ?? "";
  const body =
    args.trainParagraphs === null ? (
      renderSingleBubble({
        role: args.role,
        content: args.content,
        bubbleClassName,
        decoration: args.decoration,
        weldedAvatar: args.weldedAvatar,
      })
    ) : (
      <Stack gap="field" data-slot="message-bubble-train">
        {args.trainParagraphs.map((paragraph, index) => (
          <Stack
            // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs are a stable re-split of the SAME settled `message.content` on every render — index IS the paragraph's identity here.
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
            />
          </Stack>
        ))}
      </Stack>
    );
  return args.attributionTokens === null ? (
    body
  ) : (
    <ThemeScope tokens={args.attributionTokens} className="contents">
      {body}
    </ThemeScope>
  );
}

/** UIP-304 speaker-name accent: a CHARACTER name (tokens present) is tinted with the per-speaker
 *  ThemeScope color (`--color-speaker` → `text-speaker`) so speakers are scannable; a USER/"You" row
 *  (tokens null) stays muted. `display: contents` on the scope div keeps the vars inheriting with zero
 *  layout box. A system/unresolved row (name null) renders nothing — the name-row still owns the actions
 *  slot. */
export function renderAttributionName(attribution: RowAttribution): ReactElement | null {
  if (attribution.name === null) {
    return null;
  }
  if (attribution.tokens === null) {
    return (
      <Text as="span" size="label" weight="medium" tone="muted">
        {attribution.name}
      </Text>
    );
  }
  return (
    <ThemeScope tokens={attribution.tokens} className="contents">
      <Text as="span" size="label" weight="medium" className="text-speaker">
        {attribution.name}
      </Text>
    </ThemeScope>
  );
}

/** The avatar SIBLING (§B.1/§B.2) — `null` when there's no resolved attribution to show one for, OR the
 *  `showInChatAvatars` pref is off (a real removal, not a `display:none`: nothing else in the content
 *  column reflows relative to itself either way, since the avatar was never nested inside it). Every
 *  mode renders the plain "icon-left" chip here, INCLUDING Echo/Whisper's character rows — their bled/
 *  banner art is a SEPARATE, independently kind-gated `bubbleDecoration` (`renderRowBubble`), not a
 *  substitute for the chip (Moonlit's own preview screenshots show both at once). "sticky-portrait"
 *  (Ripple) is the one treatment that swaps the chip out entirely for the smart-cropped 2:3 portrait,
 *  pinned via `position:sticky` while a tall message scrolls past, and — per §B.2/§B.3's documented VN
 *  shape override — ignores the avatarShape pref (forced `shape="square"`, a plain portrait frame)
 *  though NOT avatarRing (still a valid accent). The weld (§B.2 Ripple defect fix): its corners round
 *  only on the OUTER edge (the side away from the bubble it welds to — left for the common character/
 *  leading case, right when mirrored on a role==="user" row) so the inner edge sits flush/square against
 *  the bubble's own matching radius — `role` is needed ONLY for this mirroring (the weld's own rounding
 *  side, not a kind-vs-kind branch). */
export function renderRowAvatar(args: {
  readonly attribution: RowAttribution;
  readonly avatarTreatment: ReturnType<RowSkin["avatarTreatment"]>;
  readonly role: MessageRole;
  readonly showInChatAvatars: boolean;
  readonly avatarSize: "sm" | "md" | "lg";
  readonly avatarShape: "round" | "square" | "rounded";
  readonly avatarAspect: "square" | "portrait";
  readonly avatarRing: "none" | "accent";
}): ReactElement | null {
  if (args.attribution.name === null || !args.showInChatAvatars) {
    return null;
  }
  if (args.avatarTreatment === "sticky-portrait") {
    const weldRounding =
      args.role === "user" ? "rounded-l-none rounded-r-card" : "rounded-l-card rounded-r-none";
    return (
      <Avatar
        size={args.avatarSize}
        shape="square"
        aspect="portrait"
        ring={args.avatarRing}
        fallbackDelay={0}
        // §13.7 hue seed: an imageless Ripple portrait falls back to the entity's deterministic hue tile
        // (the same seed the chip/list-row/header use), never the constant `alt=""` bucket.
        hueSeed={args.attribution.hueSeed}
        className={
          cn("sticky top-0 h-auto w-(--immersive-ripple-portrait-width)", weldRounding) ?? ""
        }
        {...avatarPortraitSrcProp(args.attribution.avatarHash)}
      >
        {initialsForAttribution(args.attribution.name)}
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
      // §13.7 hue seed: seed the fallback color off the stable entity id so an imageless chip matches the
      // same character/persona everywhere (list row, header) AND the immersive Echo/Whisper art tile —
      // never the pre-fix constant bucket (hashed `alt=""`).
      hueSeed={args.attribution.hueSeed}
      {...avatarSrcProp(args.attribution.avatarHash)}
    >
      {initialsForAttribution(args.attribution.name)}
    </Avatar>
  );
}

/** The per-row ACTION cluster: suppressed in edit/select mode; the draft-greeting subset for a greeting
 *  row; else the committed set. */
export function renderRowActions(args: {
  readonly editing: boolean;
  readonly selecting: boolean;
  readonly greeting: GreetingBinding | undefined;
  readonly message: MessageView;
  readonly onChatForked: ((chatId: ChatId) => void) | undefined;
  readonly messageActions: "expanded" | "hover" | undefined;
}): ReactNode {
  if (args.editing || args.selecting) {
    return null;
  }
  if (args.greeting !== undefined) {
    return <GreetingActionsRow message={args.message} messageActions={args.messageActions} />;
  }
  return (
    <MessageActionsRow
      message={args.message}
      onChatForked={args.onChatForked}
      messageActions={args.messageActions}
    />
  );
}

/** The per-row SWIPE strip: a draft greeting steps over the card's `greetings[]` (≥2 alternates only); a
 *  committed row shows the variant swipe on the tail assistant row. */
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
    return args.greeting.variants.length > 1 ? (
      <GreetingSwipeStrip
        draftKey={args.greeting.draftKey}
        characterId={args.greeting.characterId}
        variants={args.greeting.variants}
        current={args.message.content}
      />
    ) : null;
  }
  return args.showSwipes && args.role === "assistant" ? (
    <SwipeStrip message={args.message} />
  ) : null;
}

/** Phase 4b §B.5.2 — the "last-in-context" boundary divider: a quiet accent-tinted rule marking where
 *  the model's most recent generation stopped reading history (`lib/context-boundary`'s resolved id —
 *  message-row.tsx passes `show = message.id === thatId`). A hairline, not a banner (mirrors the
 *  `[data-shadow]`/bubble-token restraint the rest of the row's chrome follows) — no copy, so it never
 *  competes with the reading surface; the accent tint alone reads as "a boundary", not "an alert". */
export function renderContextBoundaryDivider(show: boolean): ReactNode {
  if (!show) {
    return null;
  }
  return (
    <Row gap="field" align="center" data-slot="context-boundary-divider" className="w-full">
      <Separator className="flex-1 bg-(--color-primary)/35" />
      <Text size="micro" tone="muted" transform="caps">
        In context from here
      </Text>
      <Separator className="flex-1 bg-(--color-primary)/35" />
    </Row>
  );
}
