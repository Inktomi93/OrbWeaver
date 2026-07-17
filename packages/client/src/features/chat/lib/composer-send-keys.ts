// `shouldSendOnEnter` — the composer's Enter-key send decision (PD-146 enterSends), pure + DOM-free so it
// gets a `.test.ts` not a CT (Spine-Testing.md §7). Mirrors neo's semantics:
//   • enterSends ON  → plain Enter sends; ⌘/Ctrl+Enter also sends; Shift+Enter is a newline.
//   • enterSends OFF → Enter is a newline; ⌘/Ctrl+Enter sends; Shift+Enter is a newline.
// A CJK/IME candidate-confirm Enter (isComposing) never sends.

/** The keyboard-event fields the decision reads — a structural subset, so a test needs no real DOM event. */
export interface EnterKeyInput {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly isComposing: boolean;
}

export function shouldSendOnEnter(event: EnterKeyInput, enterSends: boolean): boolean {
  if (event.key !== "Enter" || event.isComposing || event.shiftKey) {
    return false;
  }
  return enterSends || event.metaKey || event.ctrlKey;
}
