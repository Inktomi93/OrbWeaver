// The chat composer (scout §"composer"; UI-Arch §4/§4b — a CONTENT-region surface, not a shell
// region). A pill `<footer>` (semantic wrapper only — the `<Card>` primitive paints the pill chrome,
// UI-Gates §8 compose-only keystone: no className/style on the raw `<footer>`): a GROWING textarea
// (native `field-sizing: content` via `@orb/ui/textarea` — no JS measuring, D54) and ONE right-side
// control that toggles Send ⇄ Stop off the live turn phase (`useTurnPhase`, never a local boolean).
//
// The LEFT icon cluster: the guided-generations WAND (task #27, `<ComposerWand>`) reads this
// composer's DRAFT TEXT as its guidance input (the plain controlled `value`/`onChange` pair below is
// the seam it was reserved for) — see `components/composer-wand.tsx` + `hooks/use-guided-actions.ts`
// for the dispatch. `attach` (file uploads) is still a separately-owned, unbuilt capability —
// fabricating a placeholder button for it would be the invention the missing-API protocol forbids.
//
// Send (Pattern B) and Stop are `useSendMessage`/`useStopTurn` (hooks/); continue-on-empty eligibility
// is `lib/continue-on-empty.ts` — real, tested groundwork the Send button doesn't yet act on (the
// `chat.continueTurn` verb isn't on the transport — MISSING-API, flagged at its source).

import type { ChatId } from "@orb/kit/ids";
import type { MessageRole } from "@orb/kit/message-role";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver can't follow @orb/ui/icons' lucide-react re-export barrel (external .d.ts); tsc/vite resolve it fine (the swipe-strip.tsx precedent).
import { Icon, Send, Square } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Spinner } from "@orb/ui/spinner";
import { Textarea } from "@orb/ui/textarea";
import type { KeyboardEvent, ReactElement } from "react";
import { testId } from "#lib";
import type { ChatHandle } from "#state";
import { isCommitted } from "#state";
import type { DraftSeed } from "../hooks/use-send-message";
import { useSendMessage } from "../hooks/use-send-message";
import { useStopTurn } from "../hooks/use-stop-turn";
import { isContinueEligible } from "../lib/continue-on-empty";
import { ComposerWand } from "./composer-wand";
import { SpeakAsSelect } from "./speak-as-select";

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
  // Clear-on-commit (UI-Gates §11.1): the draft is NOT cleared optimistically in `submit` — the hook
  // fires `onDraftCommitted` only once the bus confirms the user's own row committed, and we clear HERE.
  // A send that fails pre-commit never fires it, so the draft survives for retry (no restore, no race).
  const sendMessage = useSendMessage({
    handle,
    draftSeed,
    onCommitted,
    onDraftCommitted: () => onChange(""),
  });

  const trimmed = value.trim();
  const canSubmitText = trimmed.length > 0;
  // Real, tested eligibility (lib/continue-on-empty.ts) — not yet actionable (see file header).
  const continueEligible = !canSubmitText && isContinueEligible(tailRole);
  const stopping = stopTurn.phase === "stopping";
  // Stop owns the button through the whole live turn (pending/streaming) AND while stopping — it
  // stays visible (disabled + spinner) until the bus's turnAborted/turnCompleted closes the slot.
  const showStop = stopTurn.canStop || stopping;

  const submit = (): void => {
    if (!canSubmitText) {
      return; // continue-on-empty stays disabled until chat.continueTurn lands (missing-API)
    }
    // No optimistic clear — the draft is cleared by `onDraftCommitted` (clear-on-commit) above, only
    // once the bus confirms the user's row landed. A failed send thus keeps the text for retry.
    sendMessage.send(value);
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
    <footer data-testid={testId("composer")}>
      <Card padding="block">
        <Row gap="field" align="end">
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
          {/* Speak-as (task #29) — summon a specific character to speak (chat.generate's
              speakerCharacterId). Size-gates itself to `null` for a solo/draft chat. */}
          <SpeakAsSelect handle={handle} />
          <Textarea
            aria-label="Message"
            placeholder={continueEligible ? "Continue, or type a message…" : "Type a message…"}
            value={value}
            onChange={(e): void => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={sendMessage.isPending}
            className="flex-1"
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
              disabled={!canSubmitText || sendMessage.isPending}
              loading={sendMessage.isPending}
              aria-label="Send message"
              onClick={submit}
            >
              <Icon icon={Send} size="sm" />
            </Button>
          )}
        </Row>
      </Card>
    </footer>
  );
}
