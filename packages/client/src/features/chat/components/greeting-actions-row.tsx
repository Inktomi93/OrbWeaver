// The DRAFT greeting's per-message action cluster — Edit + Copy ONLY (decision #2: Fork/Delete/Hide are
// suppressed pre-commit; there is no server row to fork from, delete, or hold out of an assembly that
// doesn't exist yet). Same reveal posture + quiet voice as the committed `MessageActionsRow` (UIP-305
// progressive disclosure — hidden at rest, revealed on hover/focus-within, always-on for coarse pointers)
// so a draft greeting behaves identically to a real row; only the AVAILABLE actions differ, never the look.
//
// Edit flips the SAME id-keyed edit-draft store the committed row uses (`state/message-edit-draft`) —
// `message-row.tsx` reads that flag and swaps in `<MessageEditTextarea onSave={setDraftGreeting}>` (the
// pluggable save seam, decision #3), so the edit UI is byte-identical and only the SAVE target differs.

import type { MessageView } from "@orb/contracts/chat";
import { Button } from "@orb/ui/button";
import { Copy, Icon, Pencil } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { notify } from "#lib";
import { startEditingMessage } from "#state";
import {
  MESSAGE_ACTION_ICON_CLASS,
  messageActionsRevealClass,
} from "../lib/message-actions-reveal";

export interface GreetingActionsRowProps {
  readonly message: MessageView;
  /** The `messageActions` appearance pref (D44 §12.1) — see `MessageActionsRowProps`. */
  readonly messageActions?: "expanded" | "hover" | undefined;
}

/** Edit · Copy for a draft greeting row — the pre-commit subset of the committed action cluster. */
export function GreetingActionsRow({
  message,
  messageActions,
}: GreetingActionsRowProps): ReactElement {
  const onEdit = (): void => {
    startEditingMessage(message.id, message.content);
  };

  const onCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(message.content);
      notify.success("Copied to clipboard.");
    } catch {
      notify.error("Couldn't copy to clipboard.");
    }
  };

  return (
    <Row
      gap="field"
      align="center"
      justify="end"
      data-slot="message-actions-row"
      className={messageActionsRevealClass(messageActions)}
    >
      <Button intent="ghost" size="icon" aria-label="Edit greeting" onClick={onEdit}>
        <Icon className={MESSAGE_ACTION_ICON_CLASS} icon={Pencil} size="sm" />
      </Button>
      <Button
        intent="ghost"
        size="icon"
        aria-label="Copy greeting"
        onClick={(): void => void onCopy()}
      >
        <Icon className={MESSAGE_ACTION_ICON_CLASS} icon={Copy} size="sm" />
      </Button>
    </Row>
  );
}
