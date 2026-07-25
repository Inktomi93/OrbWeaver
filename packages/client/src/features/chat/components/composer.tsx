// The chat composer: a pill footer with a growing textarea and one right-side control that toggles
// Send <-> Stop off the live turn phase. Attach picks local images into a pending strip; on send they
// upload to CAS and ride the send as attachmentAssetIds. continue-on-empty is real, tested groundwork
// the Send button doesn't yet act on (parked until chat.continueTurn is exposed here).
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
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Icon, ImagePlus, Send, Sparkles, Square, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Spinner } from "@orb/ui/spinner";
import { Textarea } from "@orb/ui/textarea";
import type { KeyboardEvent, ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import type { SlashCommandContribution } from "#lib";
import { IMAGE_GEN_NEEDS_CHAT, IMAGE_GEN_NEEDS_TEXT, testId } from "#lib";
import type { ChatHandle } from "#state";
import { isCommitted } from "#state";
import { useChatBehaviorPrefs } from "../hooks/use-chat-behavior-prefs";
import type { PendingAttachment } from "../hooks/use-composer-attachments";
import { useComposerAttachments } from "../hooks/use-composer-attachments";
import { useContinueTurn } from "../hooks/use-continue-turn";
import { useGenerateImage } from "../hooks/use-generate-image";
import type { DraftSeed } from "../hooks/use-send-message";
import { useSendMessage } from "../hooks/use-send-message";
import { useSlashCommands } from "../hooks/use-slash-commands";
import { useStopTurn } from "../hooks/use-stop-turn";
import { shouldSendOnEnter } from "../lib/composer-send-keys";
import { resolveContinueTarget } from "../lib/continue-on-empty";
import { matchSlashCommands } from "../lib/slash-command";
import { ComposerSlashStrip } from "./composer-slash-strip";
import { ComposerWand } from "./composer-wand";
import { SpeakAsSelect } from "./speak-as-select";

function resolvePlaceholder(committed: boolean, canContinue: boolean): string {
  if (!committed) {
    return "Write the scene, or type a message…";
  }
  return canContinue ? "Continue, or type a message…" : "Type a message…";
}

// The disabled generate-image button's hover reason (undefined when it's actionable, or when disabled only
// transiently mid-send/mid-generate). A DRAFT (no committed chat) needs the first send; a committed-but-empty
// composer needs prompt text. Ordered so the draft's "send first" wins over "type first" for a fresh draft.
function resolveImageGenReason(hasChat: boolean, hasText: boolean): string | undefined {
  if (!hasChat) {
    return IMAGE_GEN_NEEDS_CHAT;
  }
  return hasText ? undefined : IMAGE_GEN_NEEDS_TEXT;
}

// Client-side pre-check ceiling; the server re-caps at 64 MiB + magic-byte checks regardless.
const MAX_ATTACHMENT_BYTES = 20_000_000;

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
  readonly handle: ChatHandle;
  readonly value: string;
  readonly onChange: (text: string) => void;
  readonly draftSeed?: DraftSeed | undefined;
  readonly onCommitted?: ((chatId: ChatId) => void) | undefined;
  /** Null for a draft or an empty chat. */
  readonly tailRole?: MessageRole | null | undefined;
  /** The tail assistant message's id (continue-on-empty's target) — null unless the tail is an assistant turn. */
  readonly tailAssistantMessageId?: MessageId | null | undefined;
}

export function Composer({ handle, value, onChange, draftSeed, onCommitted, tailRole = null, tailAssistantMessageId = null }: ComposerProps): ReactElement {
  const chatId = isCommitted(handle) ? handle.id : null;
  const slash = useSlashCommands(chatId);
  // The refusal from the LAST send attempt (unknown/unavailable command). Cleared on the next keystroke —
  // it explains one action, it is not a persistent state.
  const [slashNotice, setSlashNotice] = useState<string | null>(null);
  const stopTurn = useStopTurn(chatId);
  const behaviorPrefs = useChatBehaviorPrefs();
  const continueOnEmpty = useContinueTurn();
  const { attachments, addFiles, removeAttachment, clearAttachments } = useComposerAttachments();

  // The commit signal fires AFTER the draft→committed promotion has flipped the composer's scope key
  // (setHandle → re-render), but the send hook holds the onDraftCommitted closure captured at SEND time
  // (draft scope). Clearing through that stale closure would empty the OLD draftKey while the migrate
  // already carried the sent text onto the NEW committed-chat key — so the just-sent text re-populates the
  // fresh chat's composer (the "first send doesn't clear" bug). A ref to the LATEST onChange lets the clear
  // target the current (committed) scope key, so the new chat starts empty.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  // Not cleared optimistically in submit — onDraftCommitted fires only once the bus confirms the
  // user's own row committed, so a failed send leaves the draft intact for retry.
  const sendMessage = useSendMessage({
    handle,
    draftSeed,
    onCommitted,
    onDraftCommitted: () => {
      onChangeRef.current("");
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
  const canGenerateImage = chatId !== null && canSubmitText && !sendMessage.isPending && !generateImage.isPending;
  // The disabled image button explains itself on hover (owner: "when it's disabled on hover tell why").
  // A DRAFT needs a committed chat to post into (send first); a committed-but-empty composer needs text
  // (the typed text IS the prompt). A mid-send/mid-generate disablement is transient — no reason then.
  const imageGenReason = resolveImageGenReason(chatId !== null, canSubmitText);

  const generateFromText = (): void => {
    if (!canGenerateImage) {
      return;
    }
    // Clear ONLY on a green settle — a failed generate keeps the typed prompt for retry (F-P1).
    generateImage.generate(value, { onSuccess: () => onChange("") });
  };
  // Continue-on-empty target: the pure resolver keeps the pref/tail/chat guards out of the component.
  const continueTarget = resolveContinueTarget({
    continueOnSend: behaviorPrefs.continueOnSend,
    tailRole,
    hasText: canSubmitText,
    chatId,
    tailAssistantMessageId,
  });
  const canContinue = continueTarget !== null && !continueOnEmpty.isPending;
  const stopping = stopTurn.phase === "stopping";
  // Stop stays visible (disabled + spinner) until the bus's turnAborted/turnCompleted closes the slot.
  const showStop = stopTurn.canStop || stopping;

  const placeholder = resolvePlaceholder(isCommitted(handle), canContinue);

  // The completion offer: the commands whose id extends the token the user is mid-way through typing
  // (a bare "/" matches them all). Empty when the draft isn't a command-in-progress.
  const slashMatches = matchSlashCommands(slash.commands, value);

  const pickCommand = (command: SlashCommandContribution): void => {
    setSlashNotice(null);
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
    if (!canSubmit) {
      if (canContinue) {
        continueOnEmpty.continueTurn(continueTarget.chatId, continueTarget.messageId);
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

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    // Tab completes the first offer. Deliberately NOT Enter: Enter's meaning is owned by the enterSends
    // pref, and overloading it would make "send" mean "complete" for one draft shape only.
    const firstMatch = slashMatches[0];
    if (event.key === "Tab" && firstMatch !== undefined) {
      event.preventDefault();
      pickCommand(firstMatch);
      return;
    }
    if (
      shouldSendOnEnter(
        { key: event.key, shiftKey: event.shiftKey, metaKey: event.metaKey, ctrlKey: event.ctrlKey, isComposing: event.nativeEvent.isComposing },
        behaviorPrefs.enterSends,
      )
    ) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <footer data-testid={testId("composer")}>
      {/* The registered commands' invisible runner mounts — one fiber each, so a runner may use hooks.
          Zero registrants renders nothing at all. */}
      {slash.mounts}
      <Stack gap="field">
        <ComposerSlashStrip matches={slashMatches} notice={slashNotice} unavailableFor={slash.unavailableFor} onPick={pickCommand} />
        {hasAttachments ? (
          <Row gap="field" align="center" data-slot="composer-attachments" className="mx-auto w-full max-w-(--width-shell-content) flex-wrap">
            {attachments.map((attachment, index) => (
              <AttachmentPreview key={attachment.url} attachment={attachment} onRemove={(): void => removeAttachment(index)} />
            ))}
          </Row>
        ) : null}
        <Row
          gap="field"
          align="center"
          data-slot="composer"
          // Reading-surface rule (D44 §12.1): the composer carries its OWN opaque backing (`bg-card`), never
          // leaning on the background scrim for legibility — the translucent `bg-input` tint left the typed
          // text unreadable over a bright background picture with scrim=0 (side-eye, 2026-07-18). The
          // interaction LIFT survives on the opaque `bg-muted` step + the border/ring/shadow focus cues.
          className="mx-auto w-full max-w-(--width-shell-content) rounded-card border border-border bg-card px-field py-field transition-colors duration-(--motion-fast) ease-out-expo hover:border-input hover:bg-muted focus-within:border-input focus-within:bg-muted focus-within:shadow-glow focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
        >
          <ComposerWand
            handle={handle}
            value={value}
            onChange={onChange}
            draftSeed={draftSeed}
            onCommitted={onCommitted}
            // Disabled while a send is in flight: the draft stays populated pre-commit, so the wand
            // could otherwise fire a guided action against it (one send OR one guided action at a time).
            busy={sendMessage.isPending}
          />
          {/* A raw <input type=file> is gate-banned in features; FileDropzone is the sanctioned picker,
              laid invisibly over a ghost icon-button skin. */}
          <Row
            justify="center"
            data-slot="composer-attach"
            className="relative size-control-md shrink-0 rounded-full text-muted-foreground transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent hover:text-accent-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50"
          >
            <Icon icon={ImagePlus} size="sm" />
            <FileDropzone
              accept="image/*"
              multiple={true}
              maxSizeBytes={MAX_ATTACHMENT_BYTES}
              disabled={sendMessage.isPending}
              onFilesSelected={addFiles}
              instructions=""
              aria-label="Attach images"
              className="absolute inset-0 size-full rounded-full border-0 bg-transparent p-0 opacity-0"
            />
          </Row>
          {/* Generate an image FROM the typed text (free mode) — a secondary/ghost action distinct from the
              attach-local affordance above; Send stays the one primary (A2). */}
          <Button
            type="button"
            intent="ghost"
            size="icon"
            data-testid={testId("composerGenerateImage")}
            disabled={!canGenerateImage}
            // focusableWhenDisabled ⇒ aria-disabled (not native `disabled`), so the button stays hoverable
            // and the reason `title` surfaces on hover; the click stays a guarded no-op (generateFromText
            // already early-returns when !canGenerateImage).
            focusableWhenDisabled={true}
            title={imageGenReason}
            loading={generateImage.isPending}
            aria-label={generateImage.isPending ? "Generating image…" : "Generate image from text"}
            onClick={generateFromText}
            className="shrink-0 rounded-full"
          >
            <Icon icon={Sparkles} size="sm" />
          </Button>
          <SpeakAsSelect handle={handle} />
          <Textarea
            aria-label="Message"
            placeholder={placeholder}
            value={value}
            onChange={(e): void => {
              // The refusal explained the PREVIOUS send attempt — the next keystroke retires it.
              setSlashNotice(null);
              onChange(e.target.value);
            }}
            onKeyDown={onKeyDown}
            disabled={sendMessage.isPending}
            className="max-h-48 min-w-0 flex-1 resize-none border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            rows={1}
          />
          {showStop ? (
            <Button
              type="button"
              intent="secondary"
              size="icon"
              loading={stopping}
              disabled={stopping}
              aria-label={stopping ? "Stopping…" : "Stop generating"}
              onClick={stopTurn.stop}
              className="rounded-full"
            >
              {stopping ? <Spinner size="sm" label="Stopping…" /> : <Icon icon={Square} size="sm" />}
            </Button>
          ) : (
            <Button
              type="button"
              intent="primary"
              size="icon"
              data-testid={testId("composerSend")}
              disabled={!(canSubmit || canContinue) || sendMessage.isPending || continueOnEmpty.isPending}
              loading={sendMessage.isPending || continueOnEmpty.isPending}
              aria-label="Send message"
              onClick={submit}
              className="rounded-full"
            >
              <Icon icon={Send} size="sm" />
            </Button>
          )}
        </Row>
      </Stack>
    </footer>
  );
}
