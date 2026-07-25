// One row of the Settings → Connections → Saved keys library — a stored provider credential as the
// redacted list view: the secret never reaches the client, so this renders only metadata (label ·
// active/revoked state · a health probe · set-active · mark-revoked/clear-revoked · remove).
// Immediate-commit: each control is an independent trpc.credentials.* mutation, no draft/submit lifecycle.

import type { CredentialHealth } from "@orb/contracts/credentials";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Icon, Trash2 } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfirmDialog } from "#components";
import type { Invalidation, Trpc } from "#data";
import { testId, timeLib } from "#lib";
import {
  useClearRevokedCredential,
  useFetchModels,
  useMarkRevokedByUser,
  useRemoveCredential,
  useSetActiveCredential,
  useTestCredentialHealth,
} from "../hooks/use-connections-mutations";
import { EndpointInspectorDialog } from "./endpoint-inspector-dialog";

type CredentialListItem = inferOutput<Trpc["credentials"]["list"]>[number];

export interface CredentialKeyRowProps {
  readonly credential: CredentialListItem;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

/** The Test-result the row holds (session-ephemeral, never persisted). custom_openai rows report a reachability line from fetchModels; every other provider reports CredentialHealth verbatim. */
type TestResult = { readonly kind: "health"; readonly health: CredentialHealth } | { readonly kind: "custom"; readonly modelCount: number | null };

/** A provider credential's row: label + status chips, a health probe, set-active, and a confirmed remove. */
export function CredentialKeyRow({ credential, trpc, invalidation }: CredentialKeyRowProps): ReactElement {
  const deps = { trpc, invalidation };
  const setActive = useSetActiveCredential(deps);
  const remove = useRemoveCredential(deps);
  const testHealth = useTestCredentialHealth(deps);
  const fetchModels = useFetchModels(deps);
  const markRevoked = useMarkRevokedByUser(deps);
  const clearRevoked = useClearRevokedCredential(deps);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const revoked = credential.revokedAt !== null;
  const label = credential.label ?? "default";
  const isCustom = credential.provider === "custom_openai";
  const testing = testHealth.isPending || fetchModels.isPending;

  const runTest = (): void => {
    if (isCustom) {
      void fetchModels
        .mutateAsync({ credentialId: credential.id })
        .then((models): void => setTestResult({ kind: "custom", modelCount: models.length }))
        .catch((): void => setTestResult({ kind: "custom", modelCount: null }));
      return;
    }
    void testHealth
      .mutateAsync({ credentialId: credential.id })
      .then((health): void => setTestResult({ kind: "health", health }))
      .catch((): void => setTestResult(null));
  };

  const subtitle = credential.hasMetadata ? "Custom endpoint" : undefined;

  return (
    <ListRow
      title={label}
      {...(subtitle !== undefined ? { subtitle } : {})}
      leading={
        <Row gap="field" align="center">
          {credential.active ? (
            <Badge intent="success" size="sm">
              Active
            </Badge>
          ) : null}
          {revoked ? (
            <Badge intent="danger" size="sm">
              Revoked
            </Badge>
          ) : null}
        </Row>
      }
      actions={
        <Row gap="field" align="center">
          {testResult !== null ? (
            <Text size="micro" tone={testResultTone(testResult)}>
              {formatTestResult(testResult, isCustom)}
            </Text>
          ) : null}
          <Button intent="ghost" size="sm" disabled={testing} onClick={runTest}>
            Test
          </Button>
          {isCustom ? (
            <Button intent="ghost" size="sm" onClick={(): void => setInspectOpen(true)}>
              Test endpoint
            </Button>
          ) : null}
          {credential.active || revoked ? null : (
            <Button intent="secondary" size="sm" disabled={setActive.isPending} onClick={(): void => setActive.mutate({ credentialId: credential.id })}>
              Set active
            </Button>
          )}
          {revoked ? (
            <Button
              data-testid={testId("credentialClearRevoked")}
              intent="secondary"
              size="sm"
              disabled={clearRevoked.isPending}
              onClick={(): void => clearRevoked.mutate({ credentialId: credential.id })}
            >
              Clear revoked
            </Button>
          ) : (
            <Button
              data-testid={testId("credentialMarkRevoked")}
              intent="ghost"
              size="sm"
              disabled={markRevoked.isPending}
              onClick={(): void => setRevokeOpen(true)}
            >
              Mark revoked
            </Button>
          )}
          <Button intent="ghost" size="sm" aria-label={`Remove the ${label} key`} onClick={(): void => setDeleteOpen(true)}>
            <Icon icon={Trash2} size="sm" />
          </Button>
          <ConfirmDialog
            confirmLabel="Remove"
            description="This deletes the stored key. Any role using this provider falls back to another active key or the default. This can't be undone."
            onConfirm={(): void => remove.mutate({ credentialId: credential.id })}
            onOpenChange={setDeleteOpen}
            open={deleteOpen}
            title={`Remove "${label}"?`}
          />
          <ConfirmDialog
            confirmLabel="Mark revoked"
            description="Marks this key as revoked so no turn uses it — do this when you know it was rotated or leaked. Any role using this provider falls back to another active key or the default. You can clear the flag later."
            onConfirm={(): void => markRevoked.mutate({ credentialId: credential.id })}
            onOpenChange={setRevokeOpen}
            open={revokeOpen}
            title={`Mark "${label}" revoked?`}
          />
          {isCustom ? (
            <EndpointInspectorDialog
              open={inspectOpen}
              onOpenChange={setInspectOpen}
              credentialId={credential.id}
              label={label}
              trpc={trpc}
              invalidation={invalidation}
            />
          ) : null}
        </Row>
      }
    />
  );
}

/** The Test-result text — the health status or the custom reachability line. */
function formatTestResult(result: TestResult, isCustom: boolean): string {
  if (result.kind === "custom") {
    return result.modelCount === null ? "unreachable or no /models" : `reachable — ${result.modelCount} model${result.modelCount === 1 ? "" : "s"}`;
  }
  return formatHealth(result.health, isCustom);
}

function formatHealth(health: CredentialHealth, isCustom: boolean): string {
  if (health.status === "ok") {
    return isCustom ? "ok" : `checked ${timeLib.formatRelative(health.checkedAt)}`;
  }
  if (health.status === "throttled") {
    return "throttled — retry in a minute";
  }
  return `${health.status} — ${health.reason}`;
}

function testResultTone(result: TestResult): "success" | "warning" | "destructive" {
  if (result.kind === "custom") {
    return result.modelCount === null ? "warning" : "success";
  }
  if (result.health.status === "ok") {
    return "success";
  }
  return result.health.status === "revoked" ? "destructive" : "warning";
}
