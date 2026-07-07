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
// biome-ignore lint/correctness/noUnresolvedImports: biome can't follow @orb/ui/icons' re-export of the lucide-react glyphs (external .d.ts); tsc resolves the barrel (same class as message-actions-row.tsx).
import { Copy, Icon, Pencil } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { notify } from "#lib";
import { startEditingMessage } from "#state";

export interface GreetingActionsRowProps {
  readonly message: MessageView;
}

/** Edit · Copy for a draft greeting row — the pre-commit subset of the committed action cluster. */
export function GreetingActionsRow({ message }: GreetingActionsRowProps): ReactElement {
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
      className="pointer-events-none opacity-0 transition-opacity duration-(--motion-fast) ease-out-expo group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100"
    >
      <Button intent="ghost" size="icon" aria-label="Edit greeting" onClick={onEdit}>
        <Icon icon={Pencil} size="sm" />
      </Button>
      <Button
        intent="ghost"
        size="icon"
        aria-label="Copy greeting"
        onClick={(): void => void onCopy()}
      >
        <Icon icon={Copy} size="sm" />
      </Button>
    </Row>
  );
}
