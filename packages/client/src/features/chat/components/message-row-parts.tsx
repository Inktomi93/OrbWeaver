// message-row.tsx's render helpers, split out to stay under the component-size cap. No state of its
// own — every export is a pure (args) => ReactElement/ReactNode the row calls with already-resolved data.

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

import type { RowAttribution } from "../lib/attribution.ts";
import type { GreetingBinding } from "../lib/greeting-window.ts";
import { BG_PHOTO_CHROME_PLATE, STICKY_ATTRIBUTION_CHROME } from "../lib/message-row-backing.ts";
import type { BubbleDecoration, RowSkin } from "../lib/message-row-variants.ts";
import { avatarPortraitSrcProp, avatarSrcProp } from "../lib/message-row-variants.ts";
import { CompactSummaryPeek } from "./compact-summary-peek.tsx";
import { GreetingSwipeStrip } from "./greeting-swipe-strip.tsx";
import { MessageActionsRow } from "./message-actions-row.tsx";
import { MessageContent } from "./message-content.tsx";
import { MessageEditTextarea } from "./message-edit-textarea.tsx";
import { MessageTimestamp } from "./message-metadata-row.tsx";
import { renderSingleBubble } from "./message-row-bubble.tsx";
import { ReasoningBlock } from "./reasoning-block.tsx";
import { SwipeStrip } from "./swipe-strip.tsx";

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
    // now, so editing one IS a message edit (chat-creation-draft-mode-replacement.md §4.8, R1).
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
              cardOrigin={{ chatId: args.message.chatId, characterId: args.message.characterId }}
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
function renderRowIdentity(args: { readonly attribution: RowAttribution; readonly message: MessageView; readonly showTimestamp: boolean }): ReactNode {
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

/** The name row's FRAME — the ONE home for the chrome row's anatomy, shared by the settled row
 *  ({@link renderRowNameRow}) and the streaming ghost ({@link renderGhostNameRow}, #116). Both must carry
 *  the same `data-slot`, the same two stacking backings and the same sticky mechanics, because #113's pin
 *  is keyed off exactly this element: a ghost with its own hand-spelled name row would be a second home
 *  that silently stops inheriting the next fix to this one.
 *
 *  Two backings can land on it, and they are ALTERNATIVES, not layers (#168):
 *   · `BG_PHOTO_CHROME_PLATE` — the wallpaper-gated legibility chip (plate + paired ink, #204 derive
 *     law). UNCONDITIONAL here since #167: the speaker name and its timestamp are a GUARANTEE over any
 *     art in any skin, and the name row is above the bubble box in every mode, so no mode's fill can
 *     back it (the old per-skin `RowSkin.chromeBacking` opt-in left both roles naked in the five
 *     bubble-family skins — see message-row-backing.ts for the reversal and its live receipt).
 *     Self-gated on the shell's `data-has-bg-image`: no wallpaper, no chip.
 *   · `STICKY_ATTRIBUTION_CHROME` (#113) — pin + OPAQUE chip, any mode, only for a row the virtualizer
 *     measured as taller than the scrollport. It is the row's one RAISED layer (z-order:
 *     message-row-backing.ts).
 *
 *  The sticky chip SUPERSEDES the wallpaper one because an opaque fill is a strict superset of a
 *  translucent plate, and both spell the same property: applied together,
 *  `in-data-[has-bg-image]:bg-reading-plate` outranks a plain `bg-reading-band` on specificity (the two
 *  are the same COLOUR since #241 — but not the same ALPHA, which is the whole ruling), so over ART —
 *  the exact mount #168's live receipt came from — the band would stay translucent and keep showing the
 *  prose scrolling under it. Layout neutrality is unchanged by the swap: over art both arms carry one
 *  `py-row`, and without art the sticky arm's own `-my-row` cancels its `py-row` (pinned by the
 *  "supersedes without doubling the box" CT).
 *
 *  THE ACTION CLUSTER CONTRIBUTES NO HEIGHT (#204 — the owner's "phantom empty scrim bands" and "the
 *  name is separated from the messages", both one mechanism). The hover-reveal cluster is a 34px row of
 *  icon buttons that is `opacity: 0` at rest but stayed IN FLOW at full height — so the painted chip
 *  measured 50px around a 16px name (50 = 34 + 2×py-row): the empty top/bottom thirds were the phantom
 *  bands, and the ~17px of painted-then-empty space below the name was the detachment. The cluster now
 *  rides a ZERO-HEIGHT flex wrapper (`h-0` + centered items): it keeps its full WIDTH in flow (the A3
 *  geometry pin — a name can never be starved sideways), its buttons paint/hit-test centered on the
 *  text line (overflow is visible; ±1px past the chip box), and reveal remains opacity-only, so hover
 *  still reflows NOTHING. The chip hugs `name + 2×py-row` (~32px) in BOTH backing arms — the sticky
 *  arm's layout-neutrality measurement holds because both arms shrink together. */
function nameRowFrame(args: { readonly identity: ReactNode; readonly actions: ReactNode; readonly stickyAttribution: boolean }): ReactElement {
  return (
    <Row
      justify="between"
      align="center"
      gap="field"
      data-slot="message-name-row"
      data-sticky={args.stickyAttribution ? "" : undefined}
      className={args.stickyAttribution ? STICKY_ATTRIBUTION_CHROME : BG_PHOTO_CHROME_PLATE}
    >
      {args.identity}
      {args.actions === null ? null : (
        <Row align="center" className="h-0" data-slot="message-actions-slot">
          {args.actions}
        </Row>
      )}
    </Row>
  );
}

/** The settled row's chrome row: the identity cluster on the left, the action cluster on the right. Split
 *  out of `message-row.tsx` so that row's body stays under the cognitive-complexity ceiling. */
export function renderRowNameRow(args: {
  readonly attribution: RowAttribution;
  readonly message: MessageView;
  readonly showTimestamp: boolean;
  readonly stickyAttribution: boolean;
  readonly actions: ReactNode;
}): ReactElement {
  return nameRowFrame({
    identity: renderRowIdentity({ attribution: args.attribution, message: args.message, showTimestamp: args.showTimestamp }),
    actions: args.actions,
    stickyAttribution: args.stickyAttribution,
  });
}

/** THE LIVE TURN'S NAME ROW (#116) — the same anatomy as the settled row's, minus the two clusters a
 *  pre-commit turn has no data for: there is no `MessageView` yet, so no timestamp, and the action cluster
 *  (edit/swipe/kebab) only exists for canon. What is left is exactly the fact the ghost was missing: WHO is
 *  speaking, for the whole minutes-long generation, in a group room where arbitration picks the speaker.
 *
 *  Riding the shared frame is what buys #113's sticky pin for the live turn for free — once the growing
 *  ghost exceeds the scrollport the surface passes `stickyAttribution` and the name pins to the top of the
 *  scrollport with the stream flowing under it, layout-neutral (`-my-row` cancels `py-row`).
 *
 *  ARIA: plain text inside the transcript's `role="log"`/`aria-live="polite"` region, and nothing more. It
 *  is deliberately NOT given a second accessible home (no `role="article"`/`aria-label` on the ghost, the
 *  way the settled row has one): the region is not `aria-atomic`, so the name enters the announcement
 *  stream exactly ONCE, when the row appears, and every later delta announces only the delta. */
export function renderGhostNameRow(args: { readonly attribution: RowAttribution | undefined; readonly stickyAttribution: boolean }): ReactElement | null {
  const attribution = args.attribution;
  if (attribution === undefined || attribution.name === null) {
    return null;
  }
  return nameRowFrame({
    identity: (
      <Row gap="field" align="baseline" data-slot="message-attribution">
        {renderAttributionName(attribution)}
      </Row>
    ),
    actions: null,
    stickyAttribution: args.stickyAttribution,
  });
}

export function renderRowActions(args: {
  readonly editing: boolean;
  readonly selecting: boolean;
  readonly message: MessageView;
  readonly onChatForked: ((chatId: ChatId) => void) | undefined;
  readonly messageActions: "expanded" | "hover" | undefined;
  /** WIREBTN — gates the kebab's host-only "View wire trace…" item (see `MessageActionsRow`). */
  readonly viewerIsHost: boolean | undefined;
  /** #167 — the raw model identifier this reply is credited to, already gated by the `showModelIcon`
   *  appearance toggle upstream; null ⇒ no credit. The cluster derives its DISPLAY name. */
  readonly modelCredit: string | null;
}): ReactNode {
  if (args.editing || args.selecting) {
    return null;
  }
  return (
    <MessageActionsRow
      message={args.message}
      onChatForked={args.onChatForked}
      messageActions={args.messageActions}
      viewerIsHost={args.viewerIsHost}
      modelCredit={args.modelCredit}
    />
  );
}

// TWO STRIPS, ONE SLOT (chat-creation-draft-mode-replacement.md §4.8/F6, R3). A row in the GREETING WINDOW
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
