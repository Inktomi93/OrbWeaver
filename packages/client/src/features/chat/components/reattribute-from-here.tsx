// "Reattribute from here" on the viewer's own user line: restamp their lines from this message's seq onward to
// their current chat persona (`reattributePersona` with `{kind:"mine", fromSeq}`). The server resolves the rows,
// so the scope reaches lines this client never paged in; earlier lines keep the names they were written with.

import type { MessageView } from "@orb/contracts/chat";
import type { ChatId, PersonaId } from "@orb/kit/ids";
import { History, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { MenuItem } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useId } from "react";
import { ConfirmDialog } from "#components";
import type { Trpc } from "#data";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import type { ReattributeTarget } from "../hooks/use-reattribute-target.ts";
import { MESSAGE_REATTRIBUTE_NAME } from "../lib/message-action-names.ts";

// Bus-driven: the verb emits one `messageEdited` per restamped slot, which the open room's reads cover.
const useReattributeFromHere = createEntityMutation<inferInput<Trpc["chat"]["reattributePersona"]>, unknown>({
  options: (trpc) => trpc.chat.reattributePersona.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't reattribute those messages.",
});

const NO_PERSONA_REASON = "Pick a persona for this chat first.";

export interface ReattributeFromHereItemProps {
  /** `null` off the viewer's own user line, where the item does not exist. */
  readonly target: ReattributeTarget | null;
  readonly onSelect: () => void;
}

/** The menu door. With no chat persona it stays in the menu, disabled, and says why in visible copy. */
export function ReattributeFromHereItem({ target, onSelect }: ReattributeFromHereItemProps): ReactElement | null {
  const labelId = useId();
  const reasonId = useId();
  if (target === null) {
    return null;
  }
  if (target.personaId !== null) {
    return (
      <MenuItem onClick={onSelect}>
        <Icon icon={History} size="sm" />
        {MESSAGE_REATTRIBUTE_NAME}
      </MenuItem>
    );
  }
  return (
    <MenuItem aria-describedby={reasonId} aria-labelledby={labelId} disabled={true}>
      <Icon icon={History} size="sm" />
      <Stack gap="tight">
        <span id={labelId}>{MESSAGE_REATTRIBUTE_NAME}</span>
        <Text id={reasonId} voice="gloss">
          {NO_PERSONA_REASON}
        </Text>
      </Stack>
    </MenuItem>
  );
}

/** The persona's display name: the room's identity producer first (it covers every persona the room
 *  references), then the viewer's own persona list, then the honest floor. */
function usePersonaName(chatId: ChatId, personaId: PersonaId): string {
  const trpc = useTRPC();
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const { data: personas } = useQuery(trpc.persona.list.queryOptions());
  return (
    chat?.identities.find((entry) => entry.kind === "persona" && entry.id === personaId)?.name ??
    personas?.find((persona) => persona.id === personaId)?.name ??
    "your current persona"
  );
}

export interface ReattributeFromHereConfirmProps {
  readonly message: MessageView;
  readonly target: ReattributeTarget | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** The scoped confirm, mounted only once asked and only with a persona to restamp to. */
export function ReattributeFromHereConfirm({ message, target, open, onOpenChange }: ReattributeFromHereConfirmProps): ReactElement | null {
  if (!open || target === null || target.personaId === null) {
    return null;
  }
  return <ReattributeConfirmDialog message={message} onOpenChange={onOpenChange} personaId={target.personaId} />;
}

// Returning the write's promise keeps the dialog open as its own retry surface when the restamp fails.
function ReattributeConfirmDialog({
  message,
  personaId,
  onOpenChange,
}: {
  readonly message: MessageView;
  readonly personaId: PersonaId;
  readonly onOpenChange: (open: boolean) => void;
}): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const reattribute = useReattributeFromHere({ trpc, invalidation });
  const name = usePersonaName(message.chatId, personaId);
  return (
    <ConfirmDialog
      confirmIntent="primary"
      confirmLabel="Reattribute"
      confirmLoading={reattribute.isPending}
      description={`Restamps your own lines from this message onward to "${name}". Earlier lines keep their names. What you wrote is untouched; replies keep the names they were written with.`}
      onConfirm={async (): Promise<void> => {
        await reattribute.mutateAsync({ chatId: message.chatId, scope: { kind: "mine", fromSeq: message.seq }, personaId });
      }}
      onOpenChange={onOpenChange}
      open={true}
      title="Reattribute from here?"
    />
  );
}
