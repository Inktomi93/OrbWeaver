// HTTP admission and socket recovery are independently ordered; response loss never authorizes a retry.
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { isTRPCClientError } from "@trpc/client";
import type { ReactElement } from "react";
import { useId, useRef, useState } from "react";
import { ConfirmDialog } from "#components";
import { useBusRoom, useInvalidation, useTRPC } from "#data";
import { useRestartServer } from "../hooks/use-admin-mutations.ts";

const RESTART_SERVER_LABEL = "Restart server";
const RESTART_NOT_READY_COPY = "Waiting for live updates before restart becomes available.";
const RESTART_PHASES = ["idle", "requesting", "waiting", "response-unavailable", "recovered", "recovered-uncertain"] as const;
type RestartPhase = (typeof RESTART_PHASES)[number];
const RESTART_ADMISSIONS = ["pending", "accepted", "uncertain"] as const;
interface RestartOperation {
  admission: (typeof RESTART_ADMISSIONS)[number];
  readonly originServerInstanceId: string;
  recovered: boolean;
}
const RESTART_COPY: Record<RestartPhase, string> = {
  idle: "Restart the app without changing its login mode or sharing settings.",
  requesting: "Sending the restart request…",
  waiting: "Restart accepted. Waiting for the server to reconnect…",
  "response-unavailable": "The restart response was lost. The server may be restarting. Waiting for its live connection; no second request was sent.",
  recovered: "Server is back online.",
  "recovered-uncertain": "Server is back online. The response was lost, so the restart itself could not be confirmed.",
};

export function RestartServerControl(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const restart = useRestartServer({ trpc, invalidation });
  const operation = useRef<RestartOperation | null>(null);
  const serverInstanceId = useRef<string | null>(null);
  const hintId = useId();
  const [hasLiveIdentity, setHasLiveIdentity] = useState(false);
  const [phase, setPhase] = useState<RestartPhase>("idle");

  const reconcile = (current: RestartOperation): void => {
    if (current.admission === "pending") {
      return;
    }
    if (current.recovered) {
      operation.current = null;
      setPhase(current.admission === "accepted" ? "recovered" : "recovered-uncertain");
    } else {
      setPhase(current.admission === "accepted" ? "waiting" : "response-unavailable");
    }
  };

  useBusRoom(
    { channel: "user" },
    {
      onEvent: (): void => undefined,
      onServerReady: (id): void => {
        serverInstanceId.current = id;
        setHasLiveIdentity(id !== null);
        const current = operation.current;
        if (id !== null && current !== null && id !== current.originServerInstanceId) {
          current.recovered = true;
          reconcile(current);
        }
      },
    },
  );

  const confirmRestart = async (): Promise<void> => {
    if (serverInstanceId.current === null || operation.current !== null) {
      return;
    }
    // The existing handler reads this ref even before React publishes the next render's handler.
    const current: RestartOperation = { admission: "pending", originServerInstanceId: serverInstanceId.current, recovered: false };
    operation.current = current;
    setPhase("requesting");
    try {
      await restart.mutateAsync({ confirm: true, expectedServerInstanceId: current.originServerInstanceId });
      current.admission = "accepted";
    } catch (error) {
      if (isTRPCClientError(error) && error.shape !== undefined) {
        operation.current = null;
        setPhase("idle");
        throw error;
      }
      // No server error response means admission is unknown; resolve the dialog into the uncertainty surface.
      current.admission = "uncertain";
      setPhase("response-unavailable");
    }
    reconcile(current);
  };

  const busy = phase === "requesting" || phase === "waiting" || phase === "response-unavailable";
  const statusCopy = busy || hasLiveIdentity ? RESTART_COPY[phase] : RESTART_NOT_READY_COPY;
  return (
    <Stack gap="tight">
      <ConfirmDialog
        title="Restart the server?"
        description={
          !(hasLiveIdentity || busy) ? (
            RESTART_NOT_READY_COPY
          ) : (
            <>
              {phase === "requesting" ? <span role="status">{RESTART_COPY.requesting}</span> : null} Active requests stop while the server starts again.
              Everyone reconnects afterward. An in-app sharing link ends.
            </>
          )
        }
        confirmLabel={RESTART_SERVER_LABEL}
        confirmDisabled={busy || !hasLiveIdentity}
        confirmLoading={restart.isPending}
        onConfirm={confirmRestart}
        trigger={
          <Button type="button" intent="secondary" size="sm" disabled={busy || !hasLiveIdentity} focusableWhenDisabled={true} aria-describedby={hintId}>
            {RESTART_SERVER_LABEL}
          </Button>
        }
      />
      <Text className="max-w-(--reading-measure-prose)" id={hintId} voice={phase === "idle" ? "gloss" : "quiet"} role={phase === "idle" ? undefined : "status"}>
        {statusCopy}
      </Text>
    </Stack>
  );
}
