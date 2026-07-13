// One row of the Settings → Connections → Saved keys library — a stored provider credential as the
// redacted list view: the secret never reaches the client, so this renders only metadata (label ·
// active/revoked state · a health probe · set-active · remove). Immediate-commit: each control is an
// independent trpc.credentials.* mutation, no draft/submit lifecycle.

import type { CredentialHealth } from "@orb/contracts/credentials";
import {
  AlertDialog,
  AlertDialogActions,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@orb/ui/alert-dialog";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve Icon/Trash2 fine (the tag-settings-row.tsx precedent).
import { Icon, Trash2 } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Invalidation, Trpc } from "#data";
import { timeLib } from "#lib";
import {
  useFetchModels,
  useRemoveCredential,
  useSetActiveCredential,
  useTestCredentialHealth,
} from "../hooks/use-connections-mutations";

type CredentialListItem = inferOutput<Trpc["credentials"]["list"]>[number];

export interface CredentialKeyRowProps {
  readonly credential: CredentialListItem;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

/** The Test-result the row holds (session-ephemeral, never persisted). custom_openai rows report a reachability line from fetchModels; every other provider reports CredentialHealth verbatim. */
type TestResult =
  | { readonly kind: "health"; readonly health: CredentialHealth }
  | { readonly kind: "custom"; readonly modelCount: number | null };

/** A provider credential's row: label + status chips, a health probe, set-active, and a confirmed remove. */
export function CredentialKeyRow({
  credential,
  trpc,
  invalidation,
}: CredentialKeyRowProps): ReactElement {
  const deps = { trpc, invalidation };
  const setActive = useSetActiveCredential(deps);
  const remove = useRemoveCredential(deps);
  const testHealth = useTestCredentialHealth(deps);
  const fetchModels = useFetchModels(deps);
  const [deleteOpen, setDeleteOpen] = useState(false);
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
          {credential.active || revoked ? null : (
            <Button
              intent="secondary"
              size="sm"
              disabled={setActive.isPending}
              onClick={(): void => setActive.mutate({ credentialId: credential.id })}
            >
              Set active
            </Button>
          )}
          <Button
            intent="ghost"
            size="sm"
            aria-label={`Remove the ${label} key`}
            onClick={(): void => setDeleteOpen(true)}
          >
            <Icon icon={Trash2} size="sm" />
          </Button>
          <AlertDialog onOpenChange={setDeleteOpen} open={deleteOpen}>
            <AlertDialogPopup>
              <AlertDialogTitle>{`Remove "${label}"?`}</AlertDialogTitle>
              <AlertDialogDescription>
                This deletes the stored key. Any role using this provider falls back to another
                active key or the default. This can't be undone.
              </AlertDialogDescription>
              <AlertDialogActions>
                <AlertDialogClose render={<Button intent="ghost">Cancel</Button>} />
                <AlertDialogClose
                  render={
                    <Button
                      intent="destructive"
                      onClick={(): void => remove.mutate({ credentialId: credential.id })}
                    >
                      Remove
                    </Button>
                  }
                />
              </AlertDialogActions>
            </AlertDialogPopup>
          </AlertDialog>
        </Row>
      }
    />
  );
}

/** The Test-result text — the health status or the custom reachability line. */
function formatTestResult(result: TestResult, isCustom: boolean): string {
  if (result.kind === "custom") {
    return result.modelCount === null
      ? "unreachable or no /models"
      : `reachable — ${result.modelCount} model${result.modelCount === 1 ? "" : "s"}`;
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
