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
import { DIALOG_VERBS, useFocusOnSwap } from "#lib";
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
    <Row align="center" wrap={true} data-slot="connection-editor-header" gap="field">
      <Row align="center" className="min-inline-0" floor="title" grow={true} gap="field">
        <Button aria-label="Back to Connections" className="shrink-0" variant="ghost" onClick={onDone} ref={backRef} size="sm">
          <Icon icon={ArrowLeft} size="sm" />
        </Button>
        <Text className="min-inline-0" wrap="anywhere" voice="label">
          {label}
        </Text>
      </Row>
      <Row grow="fill" gap="field" justify="end">
        <Button variant="outline" onClick={onDone} size="sm">
          {DIALOG_VERBS.done}
        </Button>
      </Row>
    </Row>
  );
}

/** Keeps removal available when the saved connection's provider is absent from the caller's registry. */
export function ConnectionEditorUnavailable({ connection, onDone, onRemoved, finalFocus, trpc, invalidation }: ConnectionEditorUnavailableProps): ReactElement {
  const remove = useRemoveConnection({ trpc, invalidation, failureShownInline: "the remove-connection confirm's alert line" });
  const removed = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const reason = isPluginProviderId(connection.providerId)
    ? "No enabled plugin on your account currently supplies this provider. This connection can't run or be edited until you enable that provider again."
    : "This provider is no longer registered on this server. This connection can't run or be edited until the provider is restored.";

  return (
    <Container name="connection-editor">
      <Stack data-slot="connection-editor-unavailable" gap="block">
        <ConnectionEditorHeader label={connection.label} onDone={onDone} />

        <Stack gap="row">
          <Heading level={2} voice="label">
            Provider unavailable
          </Heading>
          <Text cap="prose" prose={true}>
            {reason}
          </Text>
          <Stack gap="tight">
            <Text voice="gloss">Saved provider</Text>
            <Text voice="code">{connection.providerId}</Text>
          </Stack>
          <Row wrap={true} gap="field">
            {isPluginProviderId(connection.providerId) ? (
              <Button variant="outline" onClick={(): void => openConfigTo("plugins", "installed")}>
                Manage plugins
              </Button>
            ) : null}
            <Button tone="destructive" onClick={(): void => setConfirmOpen(true)}>
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
