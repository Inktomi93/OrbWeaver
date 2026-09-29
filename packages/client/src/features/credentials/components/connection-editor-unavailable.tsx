// The saved connection still belongs to the caller, but its provider is absent from that caller's registry.
// Keep deletion available without asking provider-owned reads or writes that must refuse under D147/D265.

import { isPluginProviderId } from "@orb/contracts/inference";
import { Button } from "@orb/ui/button";
import { ArrowLeft, Icon } from "@orb/ui/icons";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, RefObject } from "react";
import { useRef, useState } from "react";
import { ConfirmDialog } from "#components";
import type { Invalidation, Trpc } from "#data";
import { useFocusOnSwap } from "#lib";
import { openConfigTo } from "#state";
import { useRemoveConnection } from "../hooks/use-connections-mutations.ts";

type ConnectionView = inferOutput<Trpc["connection"]["get"]>;

interface ConnectionEditorUnavailableProps {
  readonly connection: Pick<ConnectionView, "id" | "label" | "providerId">;
  readonly onDone: () => void;
  readonly onRemoved: (() => void) | undefined;
  readonly finalFocus: RefObject<HTMLElement | null> | undefined;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

/** Navigation shared by the available and unavailable saved-connection editors. */
export function ConnectionEditorHeader({ label, onDone }: { readonly label: string; readonly onDone: () => void }): ReactElement {
  const backRef = useRef<HTMLButtonElement>(null);
  useFocusOnSwap(backRef);
  return (
    <Row align="center" gap="field">
      <Button aria-label="Back to Connections" intent="ghost" onClick={onDone} ref={backRef} size="sm">
        <Icon icon={ArrowLeft} size="sm" />
      </Button>
      <Text voice="label">{label}</Text>
      <Row className="grow" gap="field" justify="end">
        <Button intent="secondary" onClick={onDone} size="sm">
          Done
        </Button>
      </Row>
    </Row>
  );
}

/** Keeps removal available when the saved connection's provider is absent from the caller's registry. */
export function ConnectionEditorUnavailable({ connection, onDone, onRemoved, finalFocus, trpc, invalidation }: ConnectionEditorUnavailableProps): ReactElement {
  const remove = useRemoveConnection({ trpc, invalidation });
  const removed = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const reason = isPluginProviderId(connection.providerId)
    ? "No enabled plugin on your account currently supplies this provider. This connection can't run or be edited until you enable that provider again."
    : "This provider is no longer registered on this server. This connection can't run or be edited until the provider is restored.";

  return (
    <Container className="@container/connection-editor" name="connection-editor">
      <Stack data-slot="connection-editor-unavailable" gap="block">
        <ConnectionEditorHeader label={connection.label} onDone={onDone} />

        <Stack gap="row">
          <Heading level={2} voice="label">
            Provider unavailable
          </Heading>
          <Text prose={true}>{reason}</Text>
          <Stack gap="tight">
            <Text voice="gloss">Saved provider</Text>
            <Text voice="datum">{connection.providerId}</Text>
          </Stack>
          <Row className="flex-wrap" gap="field">
            {isPluginProviderId(connection.providerId) ? (
              <Button intent="secondary" onClick={(): void => openConfigTo("plugins", "installed")}>
                Manage plugins
              </Button>
            ) : null}
            <Button intent="destructive" onClick={(): void => setConfirmOpen(true)}>
              Remove connection
            </Button>
          </Row>
          <ConfirmDialog
            confirmLabel="Remove"
            description="This removes the saved connection and unsets any model roles that use it. Past messages keep their attribution, and any saved key remains under Saved keys. This can't be undone."
            {...(finalFocus === undefined ? {} : { finalFocus })}
            onConfirm={async (): Promise<void> => {
              await remove.mutateAsync({ connectionId: connection.id });
              removed.current = true;
            }}
            onOpenChange={(open): void => {
              setConfirmOpen(open);
              if (!open && removed.current) {
                removed.current = false;
                (onRemoved ?? onDone)();
              }
            }}
            open={confirmOpen}
            title={`Remove "${connection.label}"?`}
          />
        </Stack>
      </Stack>
    </Container>
  );
}
