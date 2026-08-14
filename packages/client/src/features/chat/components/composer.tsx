// The chat composer: a TWO-ROW footer (wand v2). Row 1 = the ⋯ chat-options menu at the LEFT (D111's drawn
// map, owner-ruled 2026-08-09 — its ONE home; the topbar trail widget went with it) + the guided-action
// cluster (impersonate·swipe·response·continue + the ✨ menu) at the right, above the textarea. Row 2 = the growing textarea + SpeakAs + one right-side control that toggles Send
// <-> Stop off the live turn phase. The IMAGE controls (attach + generate-from-text) live INSIDE the ✨ menu,
// not loose on the bar; attach still uploads local images to CAS and rides the send as attachmentAssetIds.
//
// EMPTY-ENTER (PD-146 continue + W-E generate): a bare Enter on an empty composer either extends the tail
// assistant reply (`continueOnSend`) or prompts a fresh reply on a committed non-assistant tail
// (`generateOnEmptySend`) — the pure `resolveEmptySendAction` picks the arm; the ▷ Response icon is the
// always-visible equivalent.
//
// The composer serves a REAL ROOM, always (chat-creation-draft-mode-replacement.md §4.1): a chat row exists
// from the creation click, so there is no phase branch here, no lazy-create on first send, and no scope-key
// flip mid-send — which is what the `onChangeRef` stale-closure dance existed to survive (the "first send
// doesn't clear the composer" bug). All three are gone.
//
// SLASH COMMANDS (client-architecture-lockdown.md §6c): a send whose draft names a REGISTERED `/command`
// dispatches to that command's runner instead of posting. Non-command text takes the byte-identical old
// path; an UNKNOWN command is refused with a reason (never silently posted), and `//…` is the escape that
// sends a message legitimately starting with a slash. With zero registrants nothing here can fire — every
// draft classifies as a message, so the send path is exactly what it was.

import type { ChatId, MessageId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { Button } from "@orb/ui/button";
import { CrossfadeImage } from "@orb/ui/crossfade-image";
import { Icon, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Textarea } from "@orb/ui/textarea";
import type { KeyboardEvent, ReactElement } from "react";
import { useState } from "react";
import { useUploadCaps } from "#data";
import type { SlashCommandContribution } from "#lib";
import { IMAGE_GEN_NEEDS_TEXT, testId } from "#lib";
import { setComposerDraft, useComposerDraft } from "#state";
import { useChatBehaviorPrefs } from "../hooks/use-chat-behavior-prefs.ts";
import type { PendingAttachment } from "../hooks/use-composer-attachments.ts";
import { useComposerAttachments } from "../hooks/use-composer-attachments.ts";
import { useComposerFocusOnRequest } from "../hooks/use-composer-focus.ts";
import { useContinueTurn } from "../hooks/use-continue-turn.ts";
import { useGenerateImage } from "../hooks/use-generate-image.ts";
import { useSendAvailability } from "../hooks/use-send-availability.ts";
import { useSendMessage } from "../hooks/use-send-message.ts";
import { useSlashCommands } from "../hooks/use-slash-commands.tsx";
import { useStopTurn } from "../hooks/use-stop-turn.ts";
import { shouldSendOnEnter } from "../lib/composer-send-keys.ts";
import { resolveEmptySendAction } from "../lib/continue-on-empty.ts";
import { matchSlashCommands, nextSlashHighlight, resolveSlashHighlight, resolveSlashKey, slashComboboxAria } from "../lib/slash-command.ts";
import { ActiveChatOptionsMenu } from "./composer-chat-options.tsx";
import { ComposerGuidedCluster } from "./composer-guided-cluster.tsx";
import { ComposerSendControl } from "./composer-send-control.tsx";
import { ComposerSlashStrip } from "./composer-slash-strip.tsx";
import type { ComposerImageControls } from "./composer-utility-menu.tsx";
import { SpeakAsSelect } from "./speak-as-select.tsx";

// The composer's glue for the OPEN slash strip's combobox keys — kept at module scope (not a closure in the
// component) so its branching does not inflate the component's cognitive complexity. Classification is the
// pure `classifySlashKey`; this only translates the resulting action into effects and `preventDefault`, and
// returns whether it consumed the event (the composer then skips its native send path). Called ONLY while the
// strip is open, so a CLOSED-strip draft never reaches it and native cursor movement stays untouched.
interface SlashStripKeyDeps {
  readonly open: boolean;
  readonly matches: readonly SlashCommandContribution[];
  readonly highlighted: SlashCommandContribution | undefined;
  readonly setHighlight: (updater: (prev: number) => number) => void;
  /** Completes the draft to the picked command's token (the click path's effect). */
  readonly pick: (command: SlashCommandContribution) => void;
  readonly unavailableFor: (command: SlashCommandContribution) => string | null;
  /** Surfaces an UNAVAILABLE offer's reason instead of completing it (the disabled-affordance law). */
  readonly setNotice: (reason: string) => void;
}
// Complete a keyboard-selected offer, OR refuse an UNAVAILABLE one with its reason (never completing) — the
// same law the click path gets from the Button's `disabled`; a keyboard user must not force what a click can't.
function pickOrRefuse(command: SlashCommandContribution, deps: SlashStripKeyDeps): void {
  const reason = deps.unavailableFor(command);
  if (reason === null) {
    deps.pick(command);
  } else {
    deps.setNotice(reason);
  }
}
function handleSlashStripKey(event: KeyboardEvent<HTMLTextAreaElement>, deps: SlashStripKeyDeps): boolean {
  if (!deps.open) {
    return false;
  }
  // The pure lib resolves the key into an offer to complete and/or a highlight step (no exported union — §7.4).
  // A completed offer consumes the event even if unavailable (pickOrRefuse surfaces its reason), so Tab/Enter
  // never fall through to send.
  const { pick, cycle } = resolveSlashKey(
    { key: event.key, shiftKey: event.shiftKey, isComposing: event.nativeEvent.isComposing },
    deps.matches,
    deps.highlighted,
  );
  if (pick !== undefined) {
    event.preventDefault();
    pickOrRefuse(pick, deps);
    return true;
  }
  if (cycle !== undefined) {
    event.preventDefault();
    deps.setHighlight((prev) => nextSlashHighlight(prev, cycle, deps.matches.length));
    return true;
  }
  return false;
}

// The composer textarea's whole keydown policy — the strip's keys win first (when it's open), otherwise the
// enterSends pref decides whether Enter submits. Kept at module scope so its branching stays out of the
// component's cognitive-complexity budget.
function handleComposerKeyDown(
  event: KeyboardEvent<HTMLTextAreaElement>,
  deps: { readonly strip: SlashStripKeyDeps; readonly enterSends: boolean; readonly submit: () => void },
): void {
  if (handleSlashStripKey(event, deps.strip)) {
    return;
  }
  const sends = shouldSendOnEnter(
    { key: event.key, shiftKey: event.shiftKey, metaKey: event.metaKey, ctrlKey: event.ctrlKey, isComposing: event.nativeEvent.isComposing },
    deps.enterSends,
  );
  if (sends) {
    event.preventDefault();
    deps.submit();
  }
}

// The placeholder teaches the empty-Enter affordance in play. On an assistant tail with continue-on-empty
// live, an empty Enter continues; on a non-assistant tail with generate-on-empty live, an empty Enter
// prompts a reply (name the ▷ icon so the affordance is discoverable from the empty state).
function resolvePlaceholder(emptyAction: "continue" | "generate" | null): string {
  if (emptyAction === "continue") {
    return "Continue, or type a message…";
  }
  if (emptyAction === "generate") {
    // Name the ▷ Response icon in the cluster ABOVE — the adjacent Send button is a paper-plane, not ▷, so
    // "hit ▷" pointed at the wrong control (side-eye P3-placeholder). The ▷ affordance lives in row 1.
    return "Type a message, or hit ▷ above to let the reply come…";
  }
  return "Type a message…";
}

// The disabled generate-image button's hover reason (undefined when it's actionable, or when disabled only
// transiently mid-send/mid-generate): the typed text IS the image prompt, so an empty composer needs one.
// The old "send the first message first" arm is gone with draft mode — the room always has a chat row to
// post into (chat-creation-draft-mode-replacement.md §4.1).
function resolveImageGenReason(hasText: boolean): string | undefined {
  return hasText ? undefined : IMAGE_GEN_NEEDS_TEXT;
}

function AttachmentPreview({ attachment, onRemove }: { readonly attachment: PendingAttachment; readonly onRemove: () => void }): ReactElement {
  return (
    <Row gap="field" align="center" className="shrink-0" data-slot="composer-attachment">
      <CrossfadeImage src={attachment.url} alt={`Attachment preview: ${attachment.file.name}`} aspectRatio={1} fit="cover" className="size-16 rounded-card" />
      <Button type="button" intent="ghost" size="icon" aria-label={`Remove ${attachment.file.name}`} onClick={onRemove} className="rounded-full">
        <Icon icon={X} size="sm" />
      </Button>
    </Row>
  );
}

export interface ComposerProps {
  /** The room this composer belongs to — also its composer-draft SCOPE KEY (a room's id is stable for the
   *  pane's whole life now, so there is no separate key and no scope-flip to migrate across). */
  readonly chatId: ChatId;
  /** Null for an empty chat. */
  readonly tailRole?: MessageRole | null | undefined;
  /** The tail assistant message's id (continue-on-empty's target) — null unless the tail is an assistant turn. */
  readonly tailAssistantMessageId?: MessageId | null | undefined;
}

export function Composer({ chatId, tailRole = null, tailAssistantMessageId = null }: ComposerProps): ReactElement {
  // The draft read/write is scoped to THIS composer — the subscription is intentionally NOT lifted into the
  // shared ancestor, so a keystroke re-renders only this subtree and never cascades to the message thread.
  const value = useComposerDraft(chatId);
  const onChange = (text: string): void => setComposerDraft(chatId, text);
  // A composer attachment is an image, so the pre-check ceiling is the SERVED image cap (the tighter of the
  // route cap and the admin `maxImageBytes`); the server re-caps + magic-byte checks regardless.
  const maxAttachmentBytes = useUploadCaps().image;
  const slash = useSlashCommands(chatId);
  // The refusal from the LAST send attempt (unknown/unavailable command). Cleared on the next keystroke —
  // it explains one action, it is not a persistent state.
  const [slashNotice, setSlashNotice] = useState<string | null>(null);
  // The keyboard-highlighted completion offer (-1 = none, the passive-open state). Arrow keys move it while
  // focus STAYS in the textarea; the textarea's aria-activedescendant points at the highlighted row. Reset
  // to -1 on every keystroke (below) because the match set narrows as the token grows.
  const [slashHighlight, setSlashHighlight] = useState<number>(-1);
  const stopTurn = useStopTurn(chatId);
  const behaviorPrefs = useChatBehaviorPrefs();
  const continueOnEmpty = useContinueTurn();
  // The honest-refusal pre-send gate (#54): when the chat's resolved connection can't deterministically serve
  // a turn, SEND + the guided fire actions disable with the cause-specific reason (never a doomed late-failing
  // turn). It reaches EVERY room now: the gate used to be structurally blind on the one surface where it
  // mattered most (a fresh chat had no row to check against, §2.6 #1) — the room has a row from frame one.
  const sendAvailability = useSendAvailability(chatId);
  const { attachments, addFiles, removeAttachment, clearAttachments } = useComposerAttachments();

  // P5 CYOA compose-mode focus (§5.4): a choice click in `compose` mode seeds the draft (through `value`)
  // and bumps this room's focus nonce; the hook focuses the textarea on every bump so the reader lands in
  // the composer ready to append flavor. Keyed by the committed chatId — the only scope choices fire from.
  const textareaRef = useComposerFocusOnRequest(chatId);

  // Not cleared optimistically in submit — onDraftCommitted fires only once the bus confirms the
  // user's own row committed, so a failed send leaves the draft intact for retry.
  const sendMessage = useSendMessage({
    chatId,
    onDraftCommitted: () => {
      onChange("");
      clearAttachments();
    },
  });

  // Free-mode in-chat AI image generation (imagery I5 base slice): the typed composer text IS the prompt.
  // The verb posts one user message with asset: refs (D51), so it renders through the normal stream.
  const generateImage = useGenerateImage(chatId);

  const trimmed = value.trim();
  const hasAttachments = attachments.length > 0;
  const canSubmitText = trimmed.length > 0;
  const canSubmit = canSubmitText || hasAttachments;
  // Needs a committed chat to post into + prompt text; one action at a time (never mid-send/mid-generate).
  const canGenerateImage = canSubmitText && !sendMessage.isPending && !generateImage.isPending;
  // The disabled image button explains itself on hover (owner: "when it's disabled on hover tell why").
  // A DRAFT needs a committed chat to post into (send first); a committed-but-empty composer needs text
  // (the typed text IS the prompt). A mid-send/mid-generate disablement is transient — no reason then.
  const imageGenReason = resolveImageGenReason(canSubmitText);

  const generateFromText = (): void => {
    if (!canGenerateImage) {
      return;
    }
    // Clear ONLY on a green settle — a failed generate keeps the typed prompt for retry (F-P1).
    generateImage.generate(value, { onSuccess: () => onChange("") });
  };
  // Empty-Enter action: the pure resolver keeps the pref/tail/chat guards out of the component. `continue`
  // extends the tail assistant reply; `generate` (W-E) prompts a fresh reply on a committed non-assistant
  // tail. Both are the keyboard equivalents of the ▷ Response icon.
  const emptySend = resolveEmptySendAction({
    continueOnSend: behaviorPrefs.continueOnSend,
    generateOnEmptySend: behaviorPrefs.generateOnEmptySend,
    tailRole,
    hasText: canSubmitText,
    chatId,
    tailAssistantMessageId,
  });
  const canEmptySend = emptySend !== null && !continueOnEmpty.isPending;
  const stopping = stopTurn.phase === "stopping";
  // Stop stays visible (disabled + spinner) until the bus's turnAborted/turnCompleted closes the slot.
  const showStop = stopTurn.canStop || stopping;

  const placeholder = resolvePlaceholder(emptySend === null ? null : emptySend.kind);

  // The completion offer: the commands whose id extends the token the user is mid-way through typing
  // (a bare "/" matches them all). Empty when the draft isn't a command-in-progress.
  const slashMatches = matchSlashCommands(slash.commands, value);

  // Completes the draft to `/<id> ` and clears any highlight/notice. The click path only ever reaches this for
  // an AVAILABLE row (the Button is `disabled` otherwise); the keyboard path re-checks availability itself
  // (pickOrRefuse) before calling, matching the disabled-affordance law.
  const pickCommand = (command: SlashCommandContribution): void => {
    setSlashNotice(null);
    setSlashHighlight(-1);
    onChange(`/${command.id} `);
  };
  // A draft with TEXT goes through slash classification first; the three outcomes are refuse (with a
  // reason, never a silent post), run the command, or send exactly what the classifier handed back.
  const submitText = (files: readonly File[]): void => {
    const outcome = slash.dispatch(value);
    if (outcome.kind === "blocked") {
      setSlashNotice(outcome.reason);
      return;
    }
    setSlashNotice(null);
    if (outcome.kind === "ran") {
      // Cleared BEFORE the runner's own draft write lands, so a command that rewrites the draft
      // (the verb-then-insert shape) still wins.
      onChange("");
      return;
    }
    sendMessage.send(outcome.text, files);
  };

  const submit = (): void => {
    // The pre-send gate: a chat whose resolved connection can't serve refuses up front (the disabled Send is
    // the click path; this guards the Enter-key path the keydown handler calls). A draft is never unavailable.
    if (sendAvailability.unavailable) {
      return;
    }
    if (!canSubmit) {
      if (emptySend !== null && !continueOnEmpty.isPending) {
        if (emptySend.kind === "continue") {
          continueOnEmpty.continueTurn(emptySend.chatId, emptySend.messageId);
        } else {
          continueOnEmpty.generateReply(emptySend.chatId);
        }
      }
      return;
    }
    const files = attachments.map((a) => a.file);
    // An attachment-only draft can't name a command — straight to the original send path.
    if (canSubmitText) {
      submitText(files);
      return;
    }
    sendMessage.send(value, files);
  };

  const stripOpen = slashMatches.length > 0;
  const { command: highlightedCommand, activeOptionId: activeSlashOptionId } = resolveSlashHighlight(slashMatches, slashHighlight);

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    // The strip's keys first (Tab/arrows/Enter-on-highlight), then the send pref — see handleComposerKeyDown.
    handleComposerKeyDown(event, {
      strip: {
        open: stripOpen,
        matches: slashMatches,
        highlighted: highlightedCommand,
        setHighlight: setSlashHighlight,
        pick: pickCommand,
        unavailableFor: slash.unavailableFor,
        setNotice: setSlashNotice,
      },
      enterSends: behaviorPrefs.enterSends,
      submit,
    });
  };

  // The image controls, re-homed OFF the composer bar and INTO the ✨ utility menu (owner). Attach still uses
  // the sanctioned FileDropzone picker; generate-from-text still clears only on a green settle (F-P1). The
  // wand renders these as menu rows — the bar top row is just the guided icons + the ✨ menu.
  const imageControls: ComposerImageControls = {
    maxAttachmentBytes,
    uploadDisabled: sendMessage.isPending,
    onAddFiles: addFiles,
    canGenerate: canGenerateImage,
    generateReason: imageGenReason,
    generating: generateImage.isPending,
    onGenerate: generateFromText,
  };

  return (
    <footer data-testid={testId("composer")}>
      {/* The registered commands' invisible runner mounts — one fiber each, so a runner may use hooks.
          Zero registrants renders nothing at all. */}
      {slash.mounts}
      <Stack gap="field">
        <ComposerSlashStrip
          matches={slashMatches}
          notice={slashNotice}
          unavailableFor={slash.unavailableFor}
          highlightIndex={slashHighlight}
          onPick={pickCommand}
        />
        {hasAttachments ? (
          <Row gap="field" align="center" data-slot="composer-attachments" className="mx-auto w-full max-w-(--width-shell-content) flex-wrap">
            {attachments.map((attachment, index) => (
              <AttachmentPreview key={attachment.url} attachment={attachment} onRemove={(): void => removeAttachment(index)} />
            ))}
          </Row>
        ) : null}
        {/* TWO ROWS (wand v2): the guided cluster sits ABOVE the textarea so the busy controls aren't crammed
            beside it. One outer card holds both rows so the focus-lift/backing spans the whole composer. */}
        <Stack
          gap="field"
          data-slot="composer"
          // Reading-surface rule (D44 §12.1): the composer carries its OWN opaque backing (`bg-card`), never
          // leaning on the background scrim for legibility — the translucent `bg-input` tint left the typed
          // text unreadable over a bright background picture with scrim=0 (side-eye, 2026-07-18). The
          // interaction LIFT survives on the opaque `bg-muted` step + the border/ring/shadow focus cues.
          className="mx-auto w-full max-w-(--width-shell-content) rounded-card border border-border bg-card px-field py-field transition-colors duration-(--motion-fast) ease-out-expo hover:border-input hover:bg-muted focus-within:border-input focus-within:bg-muted focus-within:shadow-glow focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
        >
          {/* ROW 1 — D111 §3's control map, drawn left→right: the ⋯ chat-options menu in the LEFT gutter, then
              the guided cluster (four dual-mode icons impersonate·swipe·response·continue + the ✨ utility
              menu). The composer text is the steer. `justify="between"` keeps the cluster over the Send corner
              (side-eye UGLY-1, the detached-toolbar impression) and fills the gutter that left empty with the
              ⋯'s ONE home — the topbar trail widget was removed in the same change, never two. */}
          <Row gap="field" align="center" justify="between" data-slot="composer-actions">
            <ActiveChatOptionsMenu chatId={chatId} />
            <ComposerGuidedCluster
              chatId={chatId}
              value={value}
              onChange={onChange}
              busy={sendMessage.isPending}
              tailIsAssistant={tailRole === "assistant"}
              imageControls={imageControls}
              sendUnavailable={sendAvailability.unavailable}
              sendUnavailableReason={sendAvailability.reason}
            />
          </Row>
          {/* ROW 2 — the textarea + speaker picker + Send/Stop. */}
          <Row gap="field" align="center" data-slot="composer-input">
            <SpeakAsSelect chatId={chatId} />
            <Textarea
              ref={textareaRef}
              aria-label="Message"
              // Editable-combobox wiring for the slash strip (a11y): while the strip is open the textarea
              // advertises the listbox it CONTROLS and, when a row is highlighted, the active descendant — so a
              // screen reader announces the highlighted offer without focus ever leaving the textarea.
              {...slashComboboxAria(stripOpen)}
              aria-activedescendant={activeSlashOptionId}
              placeholder={placeholder}
              value={value}
              onChange={(e): void => {
                // The refusal explained the PREVIOUS send attempt — the next keystroke retires it. The highlight
                // resets too: the match set narrows as the token grows, so a stale index would point elsewhere.
                setSlashNotice(null);
                setSlashHighlight(-1);
                onChange(e.target.value);
              }}
              onKeyDown={onKeyDown}
              disabled={sendMessage.isPending}
              className="max-h-48 min-w-0 flex-1 resize-none border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              rows={1}
            />
            <ComposerSendControl
              showStop={showStop}
              stopping={stopping}
              onStop={stopTurn.stop}
              onSend={submit}
              sendDisabled={sendAvailability.unavailable || !(canSubmit || canEmptySend) || sendMessage.isPending || continueOnEmpty.isPending}
              sendPending={sendMessage.isPending || continueOnEmpty.isPending}
              unavailable={sendAvailability.unavailable}
              unavailableReason={sendAvailability.reason}
            />
          </Row>
        </Stack>
      </Stack>
    </footer>
  );
}
