// P5 CYOA compose-mode focus (§5.4) — the composer's focus-on-request hook. A choice click in `compose`
// mode seeds this room's composer draft AND bumps its focus nonce (`requestComposerFocus`); this hook reads
// the nonce (`useComposerFocusRequest`) and focuses the returned textarea ref on every bump, so the reader
// lands in the composer ready to append flavor before sending. Keyed by the committed chatId — the only
// scope a `:::choices` block fires from; a draft (null) reads the empty scope, whose nonce never bumps.

import type { ChatId } from "@orb/kit/ids";
import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import { useComposerFocusRequest } from "#state";

/** Returns the textarea ref to attach; focuses it whenever this room's focus nonce bumps. */
export function useComposerFocusOnRequest(chatId: ChatId | null): RefObject<HTMLTextAreaElement | null> {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const focusNonce = useComposerFocusRequest(chatId ?? "");
  useEffect(() => {
    if (focusNonce > 0) {
      textareaRef.current?.focus();
    }
  }, [focusNonce]);
  return textareaRef;
}
