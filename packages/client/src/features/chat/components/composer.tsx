// The chat composer (scout §"composer"; UI-Arch §4/§4b — a CONTENT-region surface, not a shell
// region). A pill `<footer>` (semantic wrapper only — the `<Card>` primitive paints the pill chrome,
// UI-Gates §8 compose-only keystone: no className/style on the raw `<footer>`): a GROWING textarea
// (native `field-sizing: content` via `@orb/ui/textarea` — no JS measuring, D54) and ONE right-side
// control that toggles Send ⇄ Stop off the live turn phase (`useTurnPhase`, never a local boolean).
//
// The LEFT icon cluster: the guided-generations WAND (task #27, `<ComposerWand>`) reads this
// composer's DRAFT TEXT as its guidance input (the plain controlled `value`/`onChange` pair below is
// the seam it was reserved for) — see `components/composer-wand.tsx` + `hooks/use-guided-actions.ts`
// for the dispatch. ATTACH (#67): an image-attach BUTTON — a ghost icon button (ImagePlus) whose real
// control is an INVISIBLE `<FileDropzone>` laid over it (image mime only — the sanctioned upload primitive,
// never a raw `<input type=file>`, which is gate-banned in features). It picks local images into a pending
// strip (local object-URL thumbnails + a remove-before-send control); on send they upload to CAS
// (`useSendMessage`) and ride the
// send as `attachmentAssetIds`, persisted as `message_assets` rows + `asset:<id>` body refs server-side.
//
// Send (Pattern B) and Stop are `useSendMessage`/`useStopTurn` (hooks/); continue-on-empty eligibility
// is `lib/continue-on-empty.ts` — real, tested groundwork the Send button doesn't yet act on
// (continue-on-empty stays parked for Wave A; `chat.continueTurn` is already on the transport).

import type { ChatId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { Button } from "@orb/ui/button";
import { CrossfadeImage } from "@orb/ui/crossfade-image";
import type { FileDropzoneResult } from "@orb/ui/file-dropzone";
import { FileDropzone } from "@orb/ui/file-dropzone";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver can't follow @orb/ui/icons' lucide-react re-export barrel (external .d.ts); tsc/vite resolve it fine (the swipe-strip.tsx precedent).
import { Icon, ImagePlus, Send, Square, X } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Spinner } from "@orb/ui/spinner";
import { Textarea } from "@orb/ui/textarea";
import type { KeyboardEvent, ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { testId } from "#lib";
import type { ChatHandle } from "#state";
import { isCommitted } from "#state";
import type { DraftSeed } from "../hooks/use-send-message";
import { useSendMessage } from "../hooks/use-send-message";
import { useStopTurn } from "../hooks/use-stop-turn";
import { isContinueEligible } from "../lib/continue-on-empty";
import { ComposerWand } from "./composer-wand";
import { SpeakAsSelect } from "./speak-as-select";

/** UIP-306 placeholder voice, as a pure helper (avoids a nested ternary): a draft teaches the
 *  scene-writing flow; a continue-eligible committed tail offers continue; else the neutral prompt. */
function resolvePlaceholder(committed: boolean, continueEligible: boolean): string {
  if (!committed) {
    return "Write the scene, or type a message…";
  }
  return continueEligible ? "Continue, or type a message…" : "Type a message…";
}

/** Client-side pre-check ceiling for a picked attachment — mirrors the avatar-upload field's precedent
 *  (the server re-caps at 64 MiB + magic-byte checks; this is the friendly early reject). */
const MAX_ATTACHMENT_BYTES = 20_000_000;

/** One pending (picked, not-yet-uploaded) attachment: the File + its local object-URL preview. */
interface PendingAttachment {
  readonly file: File;
  readonly url: string;
}

/** A pending-attachment thumbnail (#67) — a local object-URL preview + a remove-before-send control. Own
 *  origin (a just-picked file), so a plain `<CrossfadeImage>` renders it directly; the remove button (in
 *  flow beside the thumbnail — not an overlay, so it stays reliably clickable) drops it from the pending set
 *  (revoking its object URL) before the send uploads anything. */
function AttachmentPreview({
  attachment,
  onRemove,
}: {
  readonly attachment: PendingAttachment;
  readonly onRemove: () => void;
}): ReactElement {
  return (
    <Row gap="field" align="center" className="shrink-0" data-slot="composer-attachment">
      <CrossfadeImage
        src={attachment.url}
        alt={`Attachment preview: ${attachment.file.name}`}
        aspectRatio={1}
        fit="cover"
        className="size-16 rounded-card"
      />
      <Button
        type="button"
        intent="ghost"
        size="icon"
        aria-label={`Remove ${attachment.file.name}`}
        onClick={onRemove}
        className="rounded-full"
      >
        <Icon icon={X} size="sm" />
      </Button>
    </Row>
  );
}

export interface ComposerProps {
  readonly handle: ChatHandle;
  /** The controlled draft text — lifted by the composing surface (the #27 wand read-seam). */
  readonly value: string;
  readonly onChange: (text: string) => void;
  readonly draftSeed?: DraftSeed | undefined;
  readonly onCommitted?: ((chatId: ChatId) => void) | undefined;
  /** The transcript's tail-turn role (continue-on-empty eligibility) — `null` for a draft or an empty
   *  chat. The composing surface supplies it (it already reads `listMessages`, same query key). */
  readonly tailRole?: MessageRole | null | undefined;
}

/** The pill composer: a growing textarea + the Send⇄Stop control. */
export function Composer({
  handle,
  value,
  onChange,
  draftSeed,
  onCommitted,
  tailRole = null,
}: ComposerProps): ReactElement {
  const chatId = isCommitted(handle) ? handle.id : null;
  const stopTurn = useStopTurn(chatId);
  // #67 — the pending (picked, not-yet-uploaded) attachments. Cleared on commit (below), NOT optimistically,
  // so a failed send keeps them for retry (mirrors the draft-text clear-on-commit rule).
  const [attachments, setAttachments] = useState<readonly PendingAttachment[]>([]);
  // Mirrors `attachments` for the unmount-cleanup effect below — an effect cleanup closes over the
  // render it was created in, so reading `attachments` there directly would revoke a STALE (already-
  // revoked-or-superseded) list on every attachments change, not the current one at actual unmount.
  // Synced in a post-commit effect, not mid-render — mutating a ref during render is a concurrent-safety
  // hazard react-hooks/refs bans; a no-dep effect keeps it current for the unmount-only reader below.
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
    setAttachments((prev) => [
      ...prev,
      ...accepted.map((file) => ({ file, url: URL.createObjectURL(file) })),
    ]);
  const removeAttachment = (index: number): void =>
    setAttachments((prev) => {
      const target = prev[index];
      if (target !== undefined) {
        URL.revokeObjectURL(target.url);
      }
      return prev.filter((_, i) => i !== index);
    });

  // Clear-on-commit (UI-Gates §11.1): the draft (text + attachments) is NOT cleared optimistically in
  // `submit` — the hook fires `onDraftCommitted` only once the bus confirms the user's own row committed, and
  // we clear HERE. A send that fails pre-commit never fires it, so the draft survives for retry (no race).
  const sendMessage = useSendMessage({
    handle,
    draftSeed,
    onCommitted,
    onDraftCommitted: () => {
      onChange("");
      clearAttachments();
    },
  });

  const trimmed = value.trim();
  const hasAttachments = attachments.length > 0;
  const canSubmitText = trimmed.length > 0;
  // #67 — an attachment-only message (empty text) is a valid send.
  const canSubmit = canSubmitText || hasAttachments;
  // Real, tested eligibility (lib/continue-on-empty.ts) — not yet actionable (see file header).
  const continueEligible = !canSubmitText && isContinueEligible(tailRole);
  const stopping = stopTurn.phase === "stopping";
  // Stop owns the button through the whole live turn (pending/streaming) AND while stopping — it
  // stays visible (disabled + spinner) until the bus's turnAborted/turnCompleted closes the slot.
  const showStop = stopTurn.canStop || stopping;

  // UIP-306 placeholder voice: a DRAFT teaches the scene-writing flow; a committed chat whose tail is the
  // user's own turn offers continue; else the neutral prompt. (Lead-character personalization — "Write
  // Wren's next beat…" — needs the roster threaded to the composer, a follow-up; the composer takes no
  // roster prop today.)
  const placeholder = resolvePlaceholder(isCommitted(handle), continueEligible);

  const submit = (): void => {
    if (!canSubmit) {
      return; // continue-on-empty stays disabled until chat.continueTurn lands (missing-API)
    }
    // No optimistic clear — the draft (text + attachments) is cleared by `onDraftCommitted` (clear-on-commit)
    // above, only once the bus confirms the user's row landed. A failed send keeps both for retry.
    sendMessage.send(
      value,
      attachments.map((a) => a.file),
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    // `isComposing` guards CJK/IME candidate-confirm Enter (the standard DOM composition check) —
    // without it, confirming a candidate mid-composition fires a half-composed send.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  return (
    // UIP-306: ONE rounded pill (`rounded-card` — the closest existing radius token; a textarea that grows
    // to ~8 rows can't be pill-round). The CONTAINER takes the focus ring (`focus-within:`), the textarea
    // is borderless/transparent inside. Same centered `--width-shell-content`-capped column as the thread
    // (message-row-variants `bubble`) so the input aligns with the prose. The raw `<footer>` stays
    // semantic-only (no className — compose-only keystone); the pill chrome rides the layout `Row`.
    <footer data-testid={testId("composer")}>
      <Stack gap="field">
        {hasAttachments ? (
          <Row
            gap="field"
            align="center"
            data-slot="composer-attachments"
            className="mx-auto w-full max-w-(--width-shell-content) flex-wrap"
          >
            {attachments.map((attachment, index) => (
              <AttachmentPreview
                key={attachment.url}
                attachment={attachment}
                onRemove={(): void => removeAttachment(index)}
              />
            ))}
          </Row>
        ) : null}
        <Row
          gap="field"
          align="center"
          data-slot="composer"
          // §B.5b composer escalation — quiet → hover → focus via a BORDER + BG-ALPHA step, never
          // `opacity` (which would also dim the placeholder/typed text). Quiet dials the `bg-input`
          // token's own alpha down (`/60`); hover/focus restore its full authored alpha + upgrade the
          // border from `border-border` to the more-opaque `border-input` token; focus additionally adds
          // the existing ring. Text/placeholder color is never touched by any step.
          // focus-within additionally paints the one rationed Ember glow (--shadow-glow) — the composer
          // gaining focus is the "you're about to write" moment that accent halo is reserved for (DESIGN.md
          // §5). Static (no new motion); the existing color transition already covers the border/bg step.
          className="mx-auto w-full max-w-(--width-shell-content) rounded-card border border-border bg-input/60 px-field py-field transition-colors duration-(--motion-fast) ease-out-expo hover:border-input hover:bg-input focus-within:border-input focus-within:bg-input focus-within:shadow-glow focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
        >
          <ComposerWand
            handle={handle}
            value={value}
            onChange={onChange}
            draftSeed={draftSeed}
            onCommitted={onCommitted}
            // Disable the wand while a Send is in flight (clear-on-commit reopened this window: without
            // the optimistic clear, the draft stays populated pre-commit, so the wand could otherwise
            // fire a guided action against it — whose own user-role `messageCommitted` could even satisfy
            // the send's clear correlation, a double-action). One send OR one guided action at a time.
            busy={sendMessage.isPending}
          />
          {/* #67 attach — an image-attach BUTTON. The affordance READS as a ghost icon button (ImagePlus,
              matching the wand cluster + the Send control's icon size), but the real control is an INVISIBLE
              `<FileDropzone>` laid over the whole target (a raw `<input type=file>` is gate-banned in
              features, D62 — FileDropzone's Base UI `Field.Control` input is the sanctioned picker). The
              dropzone root is `opacity-0` so its own Upload glyph/dashed chrome never shows; this wrapper
              carries the button skin + the keyboard focus ring (`has-[:focus-visible]`, since the invisible
              input can't paint its own). Drag-and-drop rides along for free (a drop on the input is native).
              Inert while a send is in flight (`has-[:disabled]` dims the whole control). */}
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
          {/* Speak-as (task #29) — summon a specific character to speak (chat.generate's
              speakerCharacterId). Size-gates itself to `null` for a solo/draft chat. */}
          <SpeakAsSelect handle={handle} />
          <Textarea
            aria-label="Message"
            placeholder={placeholder}
            value={value}
            onChange={(e): void => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={sendMessage.isPending}
            // Borderless/transparent inside the pill (the pill owns the border + focus ring); auto-grows via
            // the primitive's native `field-sizing: content`, capped at ~8 rows then scrolls.
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
              // Circular Stop, morphing in-place from Send so the pill doesn't reflow (UIP-306).
              className="rounded-full"
            >
              {stopping ? (
                <Spinner size="sm" label="Stopping…" />
              ) : (
                <Icon icon={Square} size="sm" />
              )}
            </Button>
          ) : (
            <Button
              type="button"
              intent="primary"
              size="icon"
              data-testid={testId("composerSend")}
              disabled={!canSubmit || sendMessage.isPending}
              loading={sendMessage.isPending}
              aria-label="Send message"
              onClick={submit}
              // Circular primary send (UIP-306).
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
