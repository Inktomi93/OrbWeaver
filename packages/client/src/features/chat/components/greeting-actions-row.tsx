// The DRAFT greeting's per-message action cluster — Edit + Copy + the greeting Studio (audit §3). Fork/
// Delete/Hide stay suppressed pre-commit (decision #2: there is no server row to fork from, delete, or hold
// out of an assembly that doesn't exist yet). Same reveal posture + quiet voice as the committed
// `MessageActionsRow` (UIP-305 progressive disclosure) so a draft greeting behaves identically to a real
// row; only the AVAILABLE actions differ, never the look.
//
// Edit flips the SAME id-keyed edit-draft store the committed row uses (`state/message-edit-draft`) —
// `message-row.tsx` reads that flag and swaps in `<MessageEditTextarea onSave={setDraftGreeting}>` (the
// pluggable save seam, decision #3), so the edit UI is byte-identical and only the SAVE target differs.
//
// Studio opens the `GreetingStudio` (character feature) in a dialog. On accept the studio's text is APPENDED
// to the card as a new alternate (durable — a fix here fixes every future chat, audit §3's whole point) via
// `character.update` (busDriven — `charactersChanged` covers the list/get), AND set as this draft's shown
// greeting so the owner sees it immediately. The original greetings are preserved (the source's swipe
// semantics). `character.update` takes the FULL greetings array, rebuilt from the binding's variants + text.

import type { MessageView } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Copy, Icon, Pencil, WandSparkles } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";
import { FormDialog, GreetingStudio } from "#components";
import type { Trpc } from "#data";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { setDraftGreeting, startEditingMessage } from "#state";
import { MESSAGE_ACTION_ICON_CLASS, messageActionsRevealClass } from "../lib/message-actions-reveal";

/** Append a greeting alternate to the card (busDriven — `charactersChanged` covers list + get). */
const useAppendGreeting = createEntityMutation<{ characterId: CharacterId; input: { greetings: { text: string }[] } }, unknown>({
  options: (trpc: Trpc) => trpc.character.update.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't save the greeting to the card.",
});

/** The draft greeting binding (characterId + the card's current greeting alternates) the studio appends to. */
interface DraftGreetingContext {
  readonly draftKey: string;
  readonly characterId: CharacterId;
  readonly variants: readonly string[];
}

export interface GreetingActionsRowProps {
  readonly message: MessageView;
  /** The draft greeting binding — present ⇒ the Studio action mounts (the founding character + its openings). */
  readonly greeting?: DraftGreetingContext | undefined;
  /** The `messageActions` appearance pref (D44 §12.1) — see `MessageActionsRowProps`. */
  readonly messageActions?: "expanded" | "hover" | undefined;
}

/** Edit · Copy · Studio for a draft greeting row — the pre-commit subset of the committed action cluster. */
export function GreetingActionsRow({ message, greeting, messageActions }: GreetingActionsRowProps): ReactElement {
  const [studioOpen, setStudioOpen] = useState(false);
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const append = useAppendGreeting({ trpc, invalidation });

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

  const onAccept = (text: string): void => {
    if (greeting !== undefined) {
      append.mutate({ characterId: greeting.characterId, input: { greetings: [...greeting.variants.map((t) => ({ text: t })), { text }] } });
      setDraftGreeting(greeting.draftKey, greeting.characterId, text);
    }
    setStudioOpen(false);
  };

  return (
    <Row gap="field" align="center" justify="end" data-slot="message-actions-row" className={messageActionsRevealClass(messageActions)}>
      <Button intent="ghost" size="icon" aria-label="Edit greeting" onClick={onEdit}>
        <Icon className={MESSAGE_ACTION_ICON_CLASS} icon={Pencil} size="sm" />
      </Button>
      <Button intent="ghost" size="icon" aria-label="Copy greeting" onClick={(): void => void onCopy()}>
        <Icon className={MESSAGE_ACTION_ICON_CLASS} icon={Copy} size="sm" />
      </Button>
      {greeting !== undefined ? (
        <>
          <Button intent="ghost" size="icon" aria-label="Greeting studio" onClick={(): void => setStudioOpen(true)}>
            <Icon className={MESSAGE_ACTION_ICON_CLASS} icon={WandSparkles} size="sm" />
          </Button>
          <FormDialog
            open={studioOpen}
            onOpenChange={setStudioOpen}
            title="Greeting studio"
            description="Rewrite this greeting or make a new one — the result is saved to the character card."
            size="md"
          >
            <GreetingStudio characterId={greeting.characterId} baseGreeting={message.content} onAccept={onAccept} />
          </FormDialog>
        </>
      ) : null}
    </Row>
  );
}
