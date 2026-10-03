// The offer an import makes once it wrote real conversations while Memory is on: build those chats' memory now,
// behind the model-run confirm with the server's count for exactly that import's scope. An import never enqueues the
// paid build itself; without a yes, each chat builds at its next reply. Renders nothing while Memory is off or nothing landed.

import type { ImportWindow } from "@orb/contracts/chat";
import type { WorkloadId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { inferInput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Trpc } from "#data";
import { createEntityMutation, trpcErrorCode, useInvalidation, useTRPC } from "#data";
import { testId } from "#lib";
import { ModelRunConfirmDialog } from "./model-run-confirm-dialog.tsx";
import { useModelRunConfirm } from "./use-model-run-confirm.ts";

const OFFER_LABEL = "Build memory for imported chats";
const OFFER_NOTE = "The chats you imported build their memory at their next reply, or you can build it for all of them now.";
const STARTED_NOTE = "Memory for the imported chats is building in the background. Its progress is under Jobs.";
const ALREADY_RUNNING_NOTE = "Memory for these imported chats is already building. Its progress is under Jobs.";

/** The server's single-active lock already holds this scope's build (`DomainConflictError` → CONFLICT). */
function isAlreadyRunning(error: unknown): boolean {
  return trpcErrorCode(error) === "CONFLICT";
}

// A conflict is not a failure here: the offer says the build is already running instead of toasting.
const useStartImportedChatsMemory = createEntityMutation<inferInput<Trpc["workloads"]["start"]>, { readonly id: WorkloadId }>({
  options: (trpc) => trpc.workloads.start.mutationOptions(),
  invalidates: (trpc) => [trpc.workloads.list.pathFilter()],
  errorToast: (error) => (isAlreadyRunning(error) ? null : "Memory for the imported chats didn't start. Run Memory backfill under Jobs."),
});

function scopeKey(scope: ImportWindow): string {
  return `${String(scope.from)}-${String(scope.to)}`;
}

export interface ImportedChatsMemoryOfferProps {
  /** The import's scope handle (`memoryScope` on its result); null when it wrote no real conversation. */
  readonly scope: ImportWindow | null;
  /** Called once a build over `scope` is running, whether this offer started it or found it already going. */
  readonly onStarted?: (() => void) | undefined;
  /** Set when the offer sits inside another open dialog, so the confirm's backdrop still renders. */
  readonly nested?: boolean | undefined;
}

export function ImportedChatsMemoryOffer({ scope, onStarted, nested }: ImportedChatsMemoryOfferProps): ReactElement | null {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  // Read only once an import wrote chats: a host that mounts this before any import asks nothing.
  const settings = useQuery({ ...trpc.settings.getUserSettings.queryOptions(), enabled: scope !== null });
  const start = useStartImportedChatsMemory({ trpc, invalidation });
  const paidRun = useModelRunConfirm();
  // Keyed by scope: a new import's scope is a new offer, never the last one's status.
  const [settled, setSettled] = useState<{ readonly key: string; readonly note: string } | null>(null);
  if (scope === null || settings.data?.config.memory.enabled !== true) {
    return null;
  }
  const key = scopeKey(scope);
  const note = settled?.key === key ? settled.note : null;
  const input = { kind: "memory-backfill", params: { importWindow: scope } } as const;
  const runBuild = async (): Promise<void> => {
    // @orb-waive caught-failure-ownership(error): a CONFLICT is owned by the offer's own state (the already-running
    // note); every other failure rethrows to `confirmThen` and the mutation's errorToast. Ends if the conflict arm
    // stops setting that state.
    try {
      await start.mutateAsync({ input, mode: "singular" });
      setSettled({ key, note: STARTED_NOTE });
    } catch (error) {
      if (!isAlreadyRunning(error)) {
        throw error;
      }
      setSettled({ key, note: ALREADY_RUNNING_NOTE });
    }
    onStarted?.();
  };
  const build = (): void => {
    // @orb-waive caught-failure-ownership(confirmThen): the start mutation's errorToast surfaces a failed run, a
    // conflict renders as the already-running note, and `confirmThen` toasts a failed count. Ends if any of those
    // stops surfacing its own failure.
    paidRun
      .confirmThen({ title: "Build memory for the imported chats?", confirmLabel: "Build memory", estimates: [{ input, mode: "singular" }], run: runBuild })
      .catch(() => undefined);
  };
  return (
    <Stack aria-label="Memory for imported chats" data-testid={testId("importedChatsMemoryOffer")} gap="field" role="group">
      <Text voice="reading">{note ?? OFFER_NOTE}</Text>
      {note === null ? (
        <Row justify="start">
          <Button intent="secondary" onClick={build}>
            {OFFER_LABEL}
          </Button>
        </Row>
      ) : null}
      <ModelRunConfirmDialog {...paidRun.dialog} nested={nested} />
    </Stack>
  );
}
