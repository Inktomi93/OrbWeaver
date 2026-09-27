// The chat composer is a TWO-ROW footer. Row 1 owns Chat actions plus three wrapping action groups: Your
// message (Draft + its conditional stream Stop), Their reply (reroll/generate/continue + speaker), and Attach
// and send (message tools + the terminal Send/turn-Stop slot). Row 2 is the growing textarea alone. Image
// controls (attach + generate-from-text) live inside Message tools; attach still uploads local images to CAS
// and rides the send as attachmentAssetIds. Under the card, a quiet line names the connection and model the
// next reply uses (`ComposerNextTurnLine`).
//
// ATTACH HAS THREE GESTURES (#376), one seam: the ✨ menu's picker, a file DRAGGED onto the composer card,
// and a clipboard PASTE. All three land in `receiveAttachFiles` → `triageAttachFiles` (lib/attach-media.ts),
// which owns the accepted-type vocabulary and both byte ceilings — the picker's `accept` attribute only
// filters the OS dialog, so drop/paste need that gate made explicit rather than re-spelled per gesture.
//
// EMPTY-ENTER (continue + W-E generate): a bare Enter on an empty composer either extends the tail
// assistant reply (`continueOnSend`) or prompts a fresh reply on a committed non-assistant tail
// (`generateOnEmptySend`) — the pure `resolveEmptySendAction` picks the arm; the ▷ Response icon is the
// always-visible equivalent.
//
// The composer serves a REAL ROOM, always (D166): a chat row exists
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
import { AriaAnnouncer } from "@orb/ui/aria-announcer";
import type { FileDropzoneResult } from "@orb/ui/file-dropzone";
import { Row, Stack } from "@orb/ui/layout";
import { Textarea } from "@orb/ui/textarea";
import type { KeyboardEvent, ReactElement } from "react";
import { useId, useState } from "react";
import { useUploadCaps } from "#data";
import type { SlashArgOffer, SlashCommandContribution } from "#lib";
import { IMAGE_GEN_NEEDS_TEXT, notify, testId } from "#lib";
import { openImagine, setComposerDraft, useComposerDraft } from "#state";
import { useChatBehaviorPrefs } from "../hooks/use-chat-behavior-prefs.ts";
import { useComposerAttachments } from "../hooks/use-composer-attachments.ts";
import { useComposerFocusOnRequest } from "../hooks/use-composer-focus.ts";
import { useComposerMediaDrop } from "../hooks/use-composer-media-drop.ts";
import { useContinueTurn } from "../hooks/use-continue-turn.ts";
import { useGenerateImage } from "../hooks/use-generate-image.ts";
import { useSendAvailability } from "../hooks/use-send-availability.ts";
import { useSendMessage } from "../hooks/use-send-message.ts";
import { useSharedRoom } from "../hooks/use-shared-room.ts";
import { useSlashCommands } from "../hooks/use-slash-commands.tsx";
import { useStopTurn } from "../hooks/use-stop-turn.ts";
import { ATTACH_BUSY_MESSAGE, dropzoneRefusalMessage, triageAttachFiles } from "../lib/attach-media.ts";
import { handleComposerKeyDown } from "../lib/composer-keydown.ts";
import { resolveEmptySendAction } from "../lib/continue-on-empty.ts";
import { nextTurnStatesRefusal } from "../lib/next-turn-line.ts";
import { matchSlashCommands, resolveSlashHighlight, slashArgsInProgress, slashCompletionAria } from "../lib/slash-command.ts";
import { ComposerArgHintStrip } from "./composer-arg-hint-strip.tsx";
import { ComposerAttachmentStrip } from "./composer-attachment-strip.tsx";
import { ActiveChatOptionsMenu } from "./composer-chat-options.tsx";
import { ComposerDropTarget } from "./composer-drop-target.tsx";
import { ComposerGuidedCluster } from "./composer-guided-cluster.tsx";
import { ComposerNextTurnLine } from "./composer-next-turn-line.tsx";
import { ComposerSendControl } from "./composer-send-control.tsx";
import { ComposerSlashStrip } from "./composer-slash-strip.tsx";
import type { ComposerImageControls } from "./composer-utility-menu.tsx";

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
// post into (D166).
function resolveImageGenReason(hasText: boolean): string | undefined {
  return hasText ? undefined : IMAGE_GEN_NEEDS_TEXT;
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
  // A composer attachment is an image OR a video (#317). The shared picker's ceiling is the single-asset
  // route cap (videos are the bigger class); IMAGE files are additionally pre-checked per file against the
  // tighter admin-tunable image cap in `addAttachmentFiles`. The server re-caps + magic-byte checks regardless.
  const uploadCaps = useUploadCaps();
  const maxAttachmentBytes = uploadCaps.assetUpload;
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
  // While the next-turn line states the refusal it is the room's one statement of it: the band's own refusal
  // line stands down and every disabled control is described by the line.
  const nextTurnId = useId();
  const refusalStatedBy = nextTurnStatesRefusal(sendAvailability.cause) ? nextTurnId : undefined;
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
  const sharedRoom = useSharedRoom(chatId);

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
  // #791 — the ARG-hint offers, once the draft has moved past the command token into a declared arg grammar
  // (`/plugin <slug> <cmd> …`). Mutually exclusive with `slashMatches` by construction (that set is non-empty only
  // while the token is unfinished, before any space); empty for a command with no declared arg grammar.
  const argInProgress = slashArgsInProgress(value);
  const argOffers: readonly SlashArgOffer[] = argInProgress === null ? [] : slash.argOffers(argInProgress.commandId, argInProgress.argsText);
  // Complete the draft to the picked offer — the completer reconstructed the whole remainder, so this stays a
  // dumb `/<id> <insert>` setter (no token-boundary math in the composer). The next keystroke retires any notice.
  const pickArg = (offer: SlashArgOffer): void => {
    if (argInProgress !== null) {
      setSlashNotice(null);
      onChange(`/${argInProgress.commandId} ${offer.insert}`);
    }
  };

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

  // The ONE attach seam all three gestures converge on (#376): the ✨ picker, a drop onto the composer, a
  // clipboard paste. `triageAttachFiles` owns the type gate and both byte ceilings, so no gesture can drift
  // in what it accepts; every refusal surfaces as a warn toast (the picker's own rejection line is invisible
  // — it renders `hidden` inside the ✨ menu — so a silent vanish is the failure mode being closed).
  // A drop landing mid-send is refused with its reason rather than queued: the send's own commit signal
  // clears the strip, which would swallow it (the picker row is `disabled` in that window for the same reason).
  const receiveAttachFiles = (files: readonly File[]): void => {
    if (sendMessage.isPending) {
      notify.warn(ATTACH_BUSY_MESSAGE);
      return;
    }
    const { accepted, refusals } = triageAttachFiles(files, uploadCaps);
    for (const refusal of refusals) {
      notify.warn(refusal);
    }
    if (accepted.length > 0) {
      addFiles({ accepted: [...accepted], rejected: [] });
    }
  };
  // The picker's adapter: the dropzone already split its batch on the accept vocabulary AND the route cap
  // (#423), so its rejections are toasted here in the shared voice, and its accepted half re-enters the shared
  // triage (idempotent for size, load-bearing for the image cap).
  const addAttachmentFiles = (result: FileDropzoneResult): void => {
    for (const rejection of result.rejected) {
      notify.warn(dropzoneRefusalMessage(rejection, maxAttachmentBytes));
    }
    receiveAttachFiles(result.accepted);
  };
  // Drag-drop onto the composer surface + Ctrl/Cmd+V in the textarea, both feeding the seam above.
  const mediaDrop = useComposerMediaDrop(receiveAttachFiles);

  // The image controls, re-homed OFF the composer bar and INTO the ✨ utility menu (owner). Attach still uses
  // the sanctioned FileDropzone picker; generate-from-text still clears only on a green settle (F-P1). The
  // wand renders these as menu rows — the bar top row is just the guided icons + the ✨ menu.
  const imageControls: ComposerImageControls = {
    maxAttachmentBytes,
    uploadDisabled: sendMessage.isPending,
    onAddFiles: addAttachmentFiles,
    canGenerate: canGenerateImage,
    generateReason: imageGenReason,
    generating: generateImage.isPending,
    onGenerate: generateFromText,
    sharedRoom,
    // The SECOND image door (#623) — the same `openImagine` #state action the `/imagine` slash runner fires
    // (never a `#features/imagery` import, §5.1). Seeded, not cleared: nothing has been spent yet.
    onOpenImagine: (): void => openImagine({ chatId, mode: "free", prompt: trimmed }),
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
        {/* #791 — the arg-hint strip, shown once the draft moves past the token into `/plugin <slug> <cmd> …`. */}
        <ComposerArgHintStrip offers={argOffers} onPick={pickArg} />
        {/* The strip's APPEARANCE, announced (the macro-textarea status-line pattern): with `aria-expanded`
            invalid on a `textbox`, `aria-controls` alone is a relationship, not an event — this polite count
            is what tells a non-sighted user that typing `/` surfaced offers. The primitive stays mounted so
            the text CHANGE announces (its own header states the never-unmount rule). */}
        <AriaAnnouncer message={stripOpen ? `${String(slashMatches.length)} slash commands` : ""} />
        <ComposerAttachmentStrip attachments={attachments} onRemove={removeAttachment} />
        {/* TWO ROWS (wand v2): the guided cluster sits ABOVE the textarea so the busy controls aren't crammed
            beside it. One outer card holds both rows so the focus-lift/backing spans the whole composer.
            DOM ORDER is textarea-first (#1382): Tab from the message field reaches the action buttons (Send,
            Swipe, Response…) instead of dropping focus out of the chat. CSS `order-last` on the textarea row
            keeps the visual layout — actions on top, textarea below — while the DOM order fixes the tab
            sequence for keyboard and screen-reader users. */}
        <ComposerDropTarget dragActive={mediaDrop.dragActive} dropTargetProps={mediaDrop.dropTargetProps}>
          {/* ROW 2 (DOM-first for tab order) — the textarea owns the full input line. */}
          <Row gap="field" align="center" data-slot="composer-input" className="order-last">
            <Textarea
              ref={textareaRef}
              aria-label="Message"
              // Editable-combobox wiring for the slash strip (a11y): while the strip is open the textarea
              // advertises the listbox it CONTROLS and, when a row is highlighted, the active descendant — so a
              // screen reader announces the highlighted offer without focus ever leaving the textarea.
              {...slashCompletionAria(stripOpen)}
              aria-activedescendant={activeSlashOptionId}
              // SOFT-KEYBOARD HYGIENE (#1871 item 6, owner ruling 2026-09-19). NOTHING upstream sets these:
              // `@orb/ui`'s Textarea renders a plain <textarea> through Base UI `Field.Control`, and
              // Field.Control sets no input-hygiene attribute at all (in @base-ui/react 1.7.0 the three
              // components that DO are OTPFieldInput, AriaCombobox — `autoCorrect: 'off'` +
              // `autoCapitalize: 'none'` — and NumberFieldInput; the field/ tree carries none of them). So
              // the composer states them itself.
              // The Enter label FOLLOWS THE SETTING rather than being pinned: `enterSends` decides whether a
              // bare Enter submits (composer-send-keys.ts), so a fixed "send" key lies for every reader who
              // turned it off, and a fixed "enter" lies for the default. One live value, one truth.
              enterKeyHint={behaviorPrefs.enterSends ? "send" : "enter"}
              // A chat draft is prose the reader is composing in their own voice — autocorrect rewriting a
              // character name and autocapitalise re-casing a deliberate lowercase line are both corruption
              // of the message, not help. (Spellcheck is deliberately left ON: it MARKS, it never rewrites.)
              autoCorrect="off"
              autoCapitalize="off"
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
              // Ctrl/Cmd+V attach (#376). Deliberately does NOT preventDefault: a clipboard carrying text
              // AND an image must attach the image and still paste the text (see the hook's header).
              onPaste={mediaDrop.onPaste}
              disabled={sendMessage.isPending}
              className="max-h-48 min-w-0 flex-1 resize-none border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              rows={1}
            />
          </Row>
          {/* ROW 1 (DOM-second for tab order) — four truthful action homes on explicit container-responsive tracks. */}
          <ComposerGuidedCluster
            chatId={chatId}
            value={value}
            onChange={onChange}
            busy={sendMessage.isPending}
            tailIsAssistant={tailRole === "assistant"}
            imageControls={imageControls}
            sendUnavailable={sendAvailability.unavailable}
            sendUnavailableReason={sendAvailability.reason}
            refusalStatedBy={refusalStatedBy}
            chatControl={<ActiveChatOptionsMenu chatId={chatId} />}
            sendControl={
              <ComposerSendControl
                showStop={showStop}
                stopping={stopping}
                onStop={stopTurn.stop}
                onSend={submit}
                sendDisabled={sendAvailability.unavailable || !(canSubmit || canEmptySend) || sendMessage.isPending || continueOnEmpty.isPending}
                sendPending={sendMessage.isPending || continueOnEmpty.isPending}
                unavailable={sendAvailability.unavailable}
                unavailableReason={sendAvailability.reason}
                unavailableStatedBy={refusalStatedBy}
              />
            }
          />
        </ComposerDropTarget>
        <ComposerNextTurnLine chatId={chatId} availability={sendAvailability} id={nextTurnId} />
      </Stack>
    </footer>
  );
}
