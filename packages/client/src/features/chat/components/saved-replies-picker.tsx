// Greeting recovery is distinct from card-opening stepping (D166). This picker only selects stored
// variant IDs; it cannot generate at the tip or preview private sibling content. Its caller mounts it
// beside the row menu, whose portal unmounts when its action opens this dialog.

import type { MessageVariantSummary, MessageView } from "@orb/contracts/chat";
import type { MessageVariantId } from "@orb/kit/ids";
import { History, Icon } from "@orb/ui/icons";
import { MenuItem } from "@orb/ui/menu";
import { Select } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import type { ComponentProps, ReactElement } from "react";
import { useId } from "react";
import { PickerDialog } from "#components";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { viewerTimeZone } from "#lib";
import { useSelectVariantMutation } from "../hooks/use-select-variant.ts";
import { useVariantHistory } from "../hooks/use-variant-history.ts";

interface SavedRepliesSelectProps {
  readonly variants: readonly MessageVariantSummary[];
  readonly selectedVariantId: MessageVariantId;
  readonly pending: boolean;
  readonly onSelect: (variantId: MessageVariantId) => void;
}

/** The bounded single-select control: real stored IDs, named indexes and the current selection. */
function SavedRepliesSelect({ variants, selectedVariantId, pending, onSelect }: SavedRepliesSelectProps): ReactElement {
  const statusId = useId();
  return (
    <>
      <Select
        label="Saved reply"
        value={selectedVariantId}
        items={variants.map(({ idx, variantId }) => ({
          value: variantId,
          label: `Reply ${String(idx + 1)}${variantId === selectedVariantId ? " (current)" : ""}`,
        }))}
        disabled={pending}
        {...(pending ? { "aria-describedby": statusId } : {})}
        onValueChange={(variantId): void => {
          if (!pending && variantId !== null && variantId !== selectedVariantId) {
            onSelect(variantId);
          }
        }}
      />
      {pending ? (
        <Text id={statusId} role="status">
          Switching saved reply…
        </Text>
      ) : null}
    </>
  );
}

interface SavedRepliesPickerProps {
  readonly message: MessageView;
  readonly onOpenChange: (open: boolean) => void;
  readonly finalFocus: NonNullable<ComponentProps<typeof PickerDialog>["popupProps"]>["finalFocus"];
}

/** A second saved sibling needs recovery only where card stepping takes the ordinary pager's place. */
export function SavedRepliesItem({
  message,
  greetingBound,
  onSelect,
}: {
  readonly message: Pick<MessageView, "variantCount">;
  readonly greetingBound: boolean;
  readonly onSelect: () => void;
}): ReactElement | null {
  if (!greetingBound || message.variantCount <= 1) {
    return null;
  }
  return (
    <MenuItem onClick={onSelect}>
      <Icon icon={History} size="sm" />
      Saved replies…
    </MenuItem>
  );
}

function SavedRepliesBody({ message, onOpenChange }: Pick<SavedRepliesPickerProps, "message" | "onOpenChange">): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const selectVariant = useSelectVariantMutation({ trpc, invalidation, failureShownInline: true });
  const history = useVariantHistory(message);
  if (history.isError) {
    return <QueryErrorState label="saved replies" onRetry={history.retry} />;
  }
  if (history.isPending) {
    return <SkeletonRows count={2} />;
  }
  return (
    <>
      <SavedRepliesSelect
        variants={history.variants}
        selectedVariantId={message.selectedVariantId}
        pending={selectVariant.isPending}
        onSelect={(variantId): void => {
          selectVariant.mutate(
            { chatId: message.chatId, messageId: message.id, variantId, timeZone: viewerTimeZone() },
            { onSuccess: (): void => onOpenChange(false) },
          );
        }}
      />
      {selectVariant.error !== null ? <Text role="alert">Couldn't switch to that reply. Choose it again to retry.</Text> : null}
    </>
  );
}

export function SavedRepliesPicker({ message, onOpenChange, finalFocus }: SavedRepliesPickerProps): ReactElement {
  return (
    <PickerDialog title="Saved replies" open={true} onOpenChange={onOpenChange} popupProps={{ size: "sm", finalFocus }}>
      <SavedRepliesBody message={message} onOpenChange={onOpenChange} />
    </PickerDialog>
  );
}
