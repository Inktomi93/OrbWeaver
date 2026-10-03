// The offer an import makes once it wrote real conversations while Memory is on: build those chats' memory now,
// behind the model-run confirm with the server's count for exactly those chats. An import never enqueues the build
// itself; without a yes, each chat builds at its next reply. Renders nothing while Memory is off or nothing landed.

import type { ChatId, WorkloadId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { testId } from "#lib";
import { ModelRunConfirmDialog } from "./model-run-confirm-dialog.tsx";
import { useModelRunConfirm } from "./use-model-run-confirm.ts";

const OFFER_LABEL = "Build memory for imported chats";
const STARTED_NOTE = "Memory for the imported chats is building in the background. Its progress is under Jobs.";

const useStartImportedChatsMemory = createEntityMutation<inferInput<Trpc["workloads"]["start"]>, { readonly id: WorkloadId }>({
  options: (trpc) => trpc.workloads.start.mutationOptions(),
  invalidates: (trpc) => [trpc.workloads.list.pathFilter()],
  errorToast: "Memory for the imported chats didn't start. Run Memory backfill under Jobs.",
});

function offerSentence(chats: number): string {
  return chats === 1
    ? "The chat you imported builds its memory at its next reply, or you can build it now."
    : `The ${String(chats)} chats you imported build their memory at their next reply, or you can build it for all of them now.`;
}

export interface ImportedChatsMemoryOfferProps {
  /** The real conversations the import wrote (`memoryChatIds` on its result). */
  readonly chatIds: readonly ChatId[];
  /** Set when the offer sits inside another open dialog, so the confirm's backdrop still renders. */
  readonly nested?: boolean | undefined;
}

export function ImportedChatsMemoryOffer({ chatIds, nested }: ImportedChatsMemoryOfferProps): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  // Read only once an import wrote chats: a host that mounts this before any import asks nothing.
  const settings = useQuery({ ...trpc.settings.getUserSettings.queryOptions(), enabled: chatIds.length > 0 });
  const start = useStartImportedChatsMemory({ trpc, invalidation });
  const paidRun = useModelRunConfirm();
  const [started, setStarted] = useState(false);
  if (chatIds.length === 0 || settings.data?.config.memory.enabled !== true) {
    return null;
  }
  const input = { kind: "memory-backfill", params: { chatIds: [...chatIds] } } as const;
  const build = (): void => {
    // @orb-waive caught-failure-ownership(confirmThen): the start mutation's errorToast surfaces a failed run and
    // `confirmThen` toasts a failed count. Ends if either stops surfacing its own failure.
    paidRun
      .confirmThen({
        title: "Build memory for the imported chats?",
        confirmLabel: "Build memory",
        estimates: [{ input, mode: "singular" }],
        run: async (): Promise<void> => {
          await start.mutateAsync({ input, mode: "singular" });
          setStarted(true);
        },
      })
      .catch(() => undefined);
  };
  return (
    <Stack aria-label="Memory for imported chats" data-testid={testId("importedChatsMemoryOffer")} gap="field" role="group">
      <Text voice="reading">{started ? STARTED_NOTE : offerSentence(chatIds.length)}</Text>
      {started ? null : (
        <Row justify="start">
          <Button intent="secondary" onClick={build}>
            {OFFER_LABEL}
          </Button>
        </Row>
      )}
      <ModelRunConfirmDialog {...paidRun.dialog} nested={nested} />
    </Stack>
  );
}
