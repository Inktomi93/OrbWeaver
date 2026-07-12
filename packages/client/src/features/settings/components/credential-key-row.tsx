// One row of the Settings → Connections → Saved keys library — a stored provider credential as the
// REDACTED list view (05-observability §5: the secret NEVER reaches the client — the server's
// `CredentialView` projection drops ciphertext/key, so this renders only metadata: label · active/revoked
// state · a health probe · set-active · remove). The list groups by provider (one ACTIVE credential per
// provider); this row exposes the per-credential actions. IMMEDIATE-COMMIT (the tag-settings-row
// precedent): each control is an independent `trpc.credentials.*` mutation, no draft/submit lifecycle.
//
// The view TYPE comes from tRPC INFERENCE (`inferOutput<credentials.list>[number]`), not a `@orb/contracts`
// import — the redacted shape is domain-internal (`domain/credentials/contract/views`), reached across the
// wire by inference, never a `#server/*` deep import (the cake; persona-panel-row.tsx precedent).

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

// The redacted credential row as the client receives it (tRPC inference — no secret fields). LOCAL,
// non-exported (the type-home gate: an EXPORTED feature type must live in contract/; a local inference
// alias is fine — the persona-panel-row.tsx precedent). The surface re-derives the same alias where it
// needs it, never a cross-component type import.
type CredentialListItem = inferOutput<Trpc["credentials"]["list"]>[number];

export interface CredentialKeyRowProps {
  readonly credential: CredentialListItem;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

/** The Test-result the row holds (session-ephemeral — GAP-1 owner ruling: no persistence, `revokedAt` stays
 *  the durable marker). custom_openai rows report a reachability line from `fetchModels`; every other
 *  provider reports the `CredentialHealth` probe verbatim. */
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
  // The last Test result — SESSION-EPHEMERAL row state (GAP-1 owner ruling; never persisted).
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const revoked = credential.revokedAt !== null;
  const label = credential.label ?? "default";
  const isCustom = credential.provider === "custom_openai";
  const testing = testHealth.isPending || fetchModels.isPending;

  // Route Test per provider (GAP-4): custom_openai probes /models (reachable ⇒ a model count); every other
  // provider runs the health probe (openrouter probes for real; others return `ok` without probing — the
  // verb's honest "ok (not probed)" for those).
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

/** The Test-result text — the health status (relative time via the sealed `time.ts` seam) or the custom
 *  reachability line. Honest about the "ok (not probed)" case for providers the probe doesn't reach. */
function formatTestResult(result: TestResult, isCustom: boolean): string {
  if (result.kind === "custom") {
    return result.modelCount === null
      ? "unreachable or no /models"
      : `reachable — ${result.modelCount} model${result.modelCount === 1 ? "" : "s"}`;
  }
  return formatHealth(result.health, isCustom);
}

/** Format a `CredentialHealth` probe result (a dedicated function so the full status union is visible). */
function formatHealth(health: CredentialHealth, isCustom: boolean): string {
  if (health.status === "ok") {
    // Non-openrouter providers return `ok` without an outbound probe — say so honestly.
    return isCustom ? "ok" : `checked ${timeLib.formatRelative(health.checkedAt)}`;
  }
  if (health.status === "throttled") {
    return "throttled — retry in a minute";
  }
  return `${health.status} — ${health.reason}`;
}

/** The Test-result tone — success for a healthy/reachable probe, warning/danger for the failure states. */
function testResultTone(result: TestResult): "success" | "warning" | "destructive" {
  if (result.kind === "custom") {
    return result.modelCount === null ? "warning" : "success";
  }
  if (result.health.status === "ok") {
    return "success";
  }
  return result.health.status === "revoked" ? "destructive" : "warning";
}
