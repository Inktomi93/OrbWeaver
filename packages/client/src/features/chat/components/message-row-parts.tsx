// message-row.tsx's render helpers, split out to stay under the component-size cap. No state of its
// own — every export is a pure (args) => ReactElement/ReactNode the row calls with already-resolved data.

import { blobPortraitUrl, blobUrl } from "@orb/contracts/assets";
import type { MessageView } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { initialsFor } from "@orb/kit/initials";
import type { MessageRole } from "@orb/kit/message-role";
import { Avatar } from "@orb/ui/avatar";
import { Row, Stack } from "@orb/ui/layout";
import { Separator } from "@orb/ui/separator";
import { Text } from "@orb/ui/text";
import type { ThemeScopeTokens } from "@orb/ui/theme-scope";
import { ThemeScope } from "@orb/ui/theme-scope";
import type { ReactElement, ReactNode } from "react";
import type { MessageRenderContext, RowRenderPolicy } from "#lib";
import { cn, renderMessageForDisplay } from "#lib";
import { setDraftGreeting } from "#state";
import type { RowAttribution } from "../lib/attribution";
import type { BubbleDecoration, RowSkin } from "../lib/message-row-variants";
import type { GreetingBinding } from "../lib/synth-greeting-row";
import { CompactSummaryPeek } from "./compact-summary-peek";
import { GreetingActionsRow } from "./greeting-actions-row";
import { GreetingSwipeStrip } from "./greeting-swipe-strip";
import { MessageActionsRow } from "./message-actions-row";
import { MessageContent } from "./message-content";
import { MessageEditTextarea } from "./message-edit-textarea";
import { MessageTimestamp } from "./message-metadata-row";
import { renderSingleBubble } from "./message-row-bubble";
import { ReasoningBlock } from "./reasoning-block";
import { SwipeStrip } from "./swipe-strip";

/** The settled disclosure's label. A canon-rehydrated row carries no measured think window (`ttftMs` is
 *  time-to-FIRST-token of any channel, `genFinishedAt − genStartedAt` is the whole generation), so naming a
 *  duration here would be a fabricated number — the channel names itself instead. */
const SETTLED_REASONING_LABEL = "Reasoning";

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
  return <ReasoningBlock reasoning={text} thinking={false} label={SETTLED_REASONING_LABEL} showIcon={args.showLLMReasoningIcon} />;
}

// exactOptionalPropertyTypes idiom: omit `src` rather than pass undefined.
function avatarSrcProp(avatarHash: string | null): { src?: string } {
  return avatarHash === null ? {} : { src: blobUrl(avatarHash) };
}

const RIPPLE_PORTRAIT_REQUEST_WIDTH = 200;

function avatarPortraitSrcProp(avatarHash: string | null): { src?: string } {
  return avatarHash === null ? {} : { src: blobPortraitUrl(avatarHash, RIPPLE_PORTRAIT_REQUEST_WIDTH) };
}

/** Null when Tide's trains take over — each paragraph gets its own MessageContent call. */
export function resolveRowContent(args: {
  readonly editing: boolean;
  readonly message: MessageView;
  readonly greeting: GreetingBinding | undefined;
  readonly trainParagraphs: readonly string[] | null;
  readonly render: RowRenderPolicy;
  readonly renderContext: MessageRenderContext;
  readonly speakerThemes: ReadonlyMap<string, ThemeScopeTokens>;
  readonly narratorVoiced: boolean;
}): ReactNode {
  if (args.editing) {
    const { greeting } = args;
    return (
      <MessageEditTextarea
        message={args.message}
        onSave={greeting === undefined ? undefined : (text): void => setDraftGreeting(greeting.draftKey, greeting.characterId, text)}
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
      narratorVoiced={args.narratorVoiced}
    />
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
  readonly trainParagraphs: readonly string[] | null;
  readonly skin: RowSkin;
  readonly decoration: BubbleDecoration | null;
  /** Ripple's sticky portrait, welded inside the bubble's own Row; null for every other mode/kind. */
  readonly weldedAvatar: ReactElement | null;
  readonly attributionTokens: ThemeScopeTokens | null;
  readonly render: RowRenderPolicy;
  readonly renderContext: MessageRenderContext;
  readonly speakerThemes: ReadonlyMap<string, ThemeScopeTokens>;
  readonly narratorVoiced: boolean;
}): ReactElement {
  // Hide-from-AI dims the row (still user-visible — the toggle holds it out of assembly only).
  const bubbleClassName = cn(args.skin.inner(args.role), args.message.excludedFromPrompt && "opacity-50", args.decoration?.className) ?? "";
  const body =
    args.trainParagraphs === null ? (
      renderSingleBubble({
        role: args.role,
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
      <Stack gap="field" data-slot="message-bubble-train">
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

function renderAttributionName(attribution: RowAttribution): ReactElement | null {
  if (attribution.name === null) {
    return null;
  }
  // The speaker's name IS the name of this row's one datum — the `label` voice (density-pass-spec.md §2.3).
  if (attribution.tokens === null) {
    return (
      <Text as="span" voice="label">
        {attribution.name}
      </Text>
    );
  }
  return (
    <ThemeScope tokens={attribution.tokens} className="contents">
      <Text as="span" voice="label" className="text-speaker">
        {attribution.name}
      </Text>
    </ThemeScope>
  );
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
}): ReactElement | null {
  if (args.attribution.name === null || !args.showInChatAvatars) {
    return null;
  }
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
      {...avatarSrcProp(args.attribution.avatarHash)}
    >
      {initialsFor(args.attribution.name)}
    </Avatar>
  );
}

// The name-row left cluster (D66 N3): the speaker name (when a roster is threaded) + the quiet inline
// timestamp beside it. Split out (not inlined in message-row.tsx) so the row body stays under the
// cognitive-complexity ceiling. Renders nothing when there is neither a name nor a shown timestamp.
export function renderRowIdentity(args: { readonly attribution: RowAttribution; readonly message: MessageView; readonly showTimestamp: boolean }): ReactNode {
  const { attribution, message, showTimestamp } = args;
  if (attribution.name === null && !showTimestamp) {
    return null;
  }
  return (
    <Row gap="field" align="baseline">
      {attribution.name === null ? null : (
        <Row gap="field" align="baseline" data-slot="message-attribution">
          {renderAttributionName(attribution)}
        </Row>
      )}
      <MessageTimestamp message={message} show={showTimestamp} />
    </Row>
  );
}

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
    return (
      <GreetingActionsRow
        message={args.message}
        greeting={{ draftKey: args.greeting.draftKey, characterId: args.greeting.characterId, variants: args.greeting.variants }}
        messageActions={args.messageActions}
      />
    );
  }
  return <MessageActionsRow message={args.message} onChatForked={args.onChatForked} messageActions={args.messageActions} />;
}

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
  return args.showSwipes && args.role === "assistant" ? <SwipeStrip message={args.message} /> : null;
}

export function renderContextBoundaryDivider(show: boolean, budgetLabel?: string | undefined, compactSummary?: string | null | undefined): ReactNode {
  if (!show) {
    return null;
  }
  const compacted = compactSummary !== null && compactSummary !== undefined && compactSummary.length > 0;
  return (
    <Row gap="field" align="center" data-slot="context-boundary-divider" className="w-full">
      <Separator className="flex-1 bg-(--color-primary)/35" />
      {/* The divider NAMES a region of the transcript ("everything below is in context") — the `kicker`
          voice, which is exactly the caps-micro-with-a-hairline shape this line was already assembling by
          hand. The noun is COMPACTION, never memory: compaction writes `chats.compactSummary`, its own
          summary — the Memory plane is a different subsystem (vocab repair, 2026-08-02). */}
      <Text voice="kicker">
        {compacted ? "Older messages compacted into a summary" : "In context from here"}
        {budgetLabel !== undefined ? ` · ${budgetLabel}` : ""}
      </Text>
      {compacted ? <CompactSummaryPeek summary={compactSummary} /> : null}
      <Separator className="flex-1 bg-(--color-primary)/35" />
    </Row>
  );
}
