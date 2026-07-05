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

/** UIP-306 placeholder voice, as a pure helper (avoids a nested ternary): a draft teaches the
 *  scene-writing flow; a continue-eligible committed tail offers continue; else the neutral prompt. */
function resolvePlaceholder(committed: boolean, continueEligible: boolean): string {
  if (!committed) {
    return "Write the scene, or type a message…";
  }
  return continueEligible ? "Continue, or type a message…" : "Type a message…";
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

  // UIP-306 placeholder voice: a DRAFT teaches the scene-writing flow; a committed chat whose tail is the
  // user's own turn offers continue; else the neutral prompt. (Lead-character personalization — "Write
  // Wren's next beat…" — needs the roster threaded to the composer, a follow-up; the composer takes no
  // roster prop today.)
  const placeholder = resolvePlaceholder(isCommitted(handle), continueEligible);

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
    // UIP-306: ONE rounded pill (`rounded-card` — the closest existing radius token; a textarea that grows
    // to ~8 rows can't be pill-round). The CONTAINER takes the focus ring (`focus-within:`), the textarea
    // is borderless/transparent inside. Same centered ≤48rem (`max-w-cq-lg`) column as the thread
    // (message-row-variants `bubble`) so the input aligns with the prose. The raw `<footer>` stays
    // semantic-only (no className — compose-only keystone); the pill chrome rides the layout `Row`.
    <footer data-testid={testId("composer")}>
      <Row
        gap="field"
        align="center"
        className="mx-auto w-full max-w-cq-lg rounded-card border border-border bg-input px-field py-field transition-colors duration-(--motion-fast) ease-out-expo focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
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
            {stopping ? <Spinner size="sm" label="Stopping…" /> : <Icon icon={Square} size="sm" />}
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
            // Circular primary send (UIP-306).
            className="rounded-full"
          >
            <Icon icon={Send} size="sm" />
          </Button>
        )}
      </Row>
    </footer>
  );
}
