// The chat composer: a pill footer with a growing textarea and one right-side control that toggles
// Send <-> Stop off the live turn phase. Attach picks local images into a pending strip; on send they
// upload to CAS and ride the send as attachmentAssetIds. continue-on-empty is real, tested groundwork
// the Send button doesn't yet act on (parked until chat.continueTurn is exposed here).

import type { ChatId, MessageId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { Button } from "@orb/ui/button";
import { CrossfadeImage } from "@orb/ui/crossfade-image";
import type { FileDropzoneResult } from "@orb/ui/file-dropzone";
import { FileDropzone } from "@orb/ui/file-dropzone";
import { Icon, ImagePlus, Send, Sparkles, Square, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Spinner } from "@orb/ui/spinner";
import { Textarea } from "@orb/ui/textarea";
import type { KeyboardEvent, ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { testId } from "#lib";
import type { ChatHandle } from "#state";
import { isCommitted } from "#state";
import { useChatBehaviorPrefs } from "../hooks/use-chat-behavior-prefs";
import { useContinueTurn } from "../hooks/use-continue-turn";
import { useGenerateImage } from "../hooks/use-generate-image";
import type { DraftSeed } from "../hooks/use-send-message";
import { useSendMessage } from "../hooks/use-send-message";
import { useStopTurn } from "../hooks/use-stop-turn";
import { shouldSendOnEnter } from "../lib/composer-send-keys";
import { resolveContinueTarget } from "../lib/continue-on-empty";
import { ComposerWand } from "./composer-wand";
import { SpeakAsSelect } from "./speak-as-select";

function resolvePlaceholder(committed: boolean, canContinue: boolean): string {
  if (!committed) {
    return "Write the scene, or type a message…";
  }
  return canContinue ? "Continue, or type a message…" : "Type a message…";
}

// Client-side pre-check ceiling; the server re-caps at 64 MiB + magic-byte checks regardless.
const MAX_ATTACHMENT_BYTES = 20_000_000;

interface PendingAttachment {
  readonly file: File;
  readonly url: string;
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
  const stopTurn = useStopTurn(chatId);
  const behaviorPrefs = useChatBehaviorPrefs();
  const continueOnEmpty = useContinueTurn();
  const [attachments, setAttachments] = useState<readonly PendingAttachment[]>([]);
  // Mirrors `attachments` for the unmount-cleanup effect below — a cleanup closure would otherwise
  // revoke a stale list instead of the current one at actual unmount.
  const attachmentsRef = useRef(attachments);
  useEffect(() => {
    attachmentsRef.current = attachments;
  });
  useEffect(
    () => (): void => {
      for (const a of attachmentsRef.current) {
        URL.revokeObjectURL(a.url);
      }
    },
    [],
  );
  const clearAttachments = (): void =>
    setAttachments((prev) => {
      for (const a of prev) {
        URL.revokeObjectURL(a.url);
      }
      return [];
    });
  const addFiles = ({ accepted }: FileDropzoneResult): void =>
    setAttachments((prev) => [...prev, ...accepted.map((file) => ({ file, url: URL.createObjectURL(file) }))]);
  const removeAttachment = (index: number): void =>
    setAttachments((prev) => {
      const target = prev[index];
      if (target !== undefined) {
        URL.revokeObjectURL(target.url);
      }
      return prev.filter((_, i) => i !== index);
    });

  // Not cleared optimistically in submit — onDraftCommitted fires only once the bus confirms the
  // user's own row committed, so a failed send leaves the draft intact for retry.
  const sendMessage = useSendMessage({
    handle,
    draftSeed,
    onCommitted,
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
  const canGenerateImage = chatId !== null && canSubmitText && !sendMessage.isPending && !generateImage.isPending;

  const generateFromText = (): void => {
    if (!canGenerateImage) {
      return;
    }
    generateImage.generate(value);
    onChange("");
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

  const submit = (): void => {
    if (canSubmit) {
      sendMessage.send(
        value,
        attachments.map((a) => a.file),
      );
      return;
    }
    if (canContinue) {
      continueOnEmpty.continueTurn(continueTarget.chatId, continueTarget.messageId);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
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
      <Stack gap="field">
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
          className="mx-auto w-full max-w-(--width-shell-content) rounded-card border border-border bg-input/60 px-field py-field transition-colors duration-(--motion-fast) ease-out-expo hover:border-input hover:bg-input focus-within:border-input focus-within:bg-input focus-within:shadow-glow focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
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
            onChange={(e): void => onChange(e.target.value)}
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
