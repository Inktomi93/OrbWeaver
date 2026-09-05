// One row of the Settings → Connections → Saved keys library — a stored provider credential as the
// redacted list view: the secret never reaches the client, so this renders only metadata (label ·
// active/revoked state · a health probe · set-active · mark-revoked/clear-revoked · remove).
// Immediate-commit: each control is an independent trpc.credentials.* mutation, no draft/submit lifecycle.

import type { CredentialHealth, CredRevokedReason } from "@orb/contracts/credentials";
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
  useMarkRevokedByUser,
  useRemoveCredential,
  useSetActiveCredential,
  useTestCredentialHealth,
} from "../hooks/use-connections-mutations.ts";
import { EndpointInspectorDialog } from "./endpoint-inspector-dialog.tsx";

type CredentialListItem = inferOutput<Trpc["credentials"]["list"]>[number];

export interface CredentialKeyRowProps {
  readonly credential: CredentialListItem;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

/** The Test-result the row holds (session-ephemeral, never persisted) — the honest `testHealth` probe
 *  verbatim for EVERY provider now (custom_openai included: it used to call `fetchModels`, a reachability
 *  proxy with no ok/unreachable/unchecked classification and no throttle/breaker side-effects — the
 *  SID-01 honesty invariant `testHealth` itself carries). `fetchModels` stays the "Test endpoint" dialog's
 *  own read (a model LIST, not a health verdict), never this row's Test button. */
type TestResult = { readonly kind: "health"; readonly health: CredentialHealth } | { readonly kind: "error" };

/** A provider credential's row: label + status chips, a health probe, set-active, and a confirmed remove. */
export function CredentialKeyRow({ credential, trpc, invalidation }: CredentialKeyRowProps): ReactElement {
  const deps = { trpc, invalidation };
  const setActive = useSetActiveCredential(deps);
  const remove = useRemoveCredential(deps);
  const testHealth = useTestCredentialHealth(deps);
  const markRevoked = useMarkRevokedByUser(deps);
  const clearRevoked = useClearRevokedCredential(deps);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [inspectOpen, setInspectOpen] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  const revoked = credential.revokedAt !== null;
  const label = credential.label ?? "default";
  const isCustom = credential.provider === "custom_openai";
  const testing = testHealth.isPending;

  const runTest = (): void => {
    void testHealth
      .mutateAsync({ credentialId: credential.id })
      .then((health): void => setTestResult({ kind: "health", health }))
      .catch((): void => setTestResult({ kind: "error" }));
  };

  const subtitle = keyRowSubtitle(credential);

  return (
    <ListRow
      title={label}
      {...(subtitle.text !== undefined ? { subtitle: subtitle.text } : {})}
      subtitleWrap={subtitle.wrap}
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
            <Text voice="gloss" role={testResult.kind === "error" ? "alert" : undefined} className={testResultToneClass(testResult)}>
              {formatTestResult(testResult, isCustom)}
            </Text>
          ) : null}
          <Button intent="ghost" size="sm" disabled={testing} onClick={runTest}>
            {testResult?.kind === "error" ? "Retry" : "Test"}
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

/** The row's secondary line: WHAT the row is, plus — when revoked — WHY. The bare Revoked chip could not
 *  tell "you revoked this" from "the provider rejected your key", and those want opposite actions from the
 *  reader (press Clear revoked, versus paste a new key). `wrap` rides along because the line becomes a
 *  sentence once a cause joins it, and a clipped explanation of a dead credential is worse than none. */
function keyRowSubtitle(credential: CredentialListItem): { readonly text: string | undefined; readonly wrap: boolean } {
  const cause = credential.revokedAt !== null && credential.revokedReason !== null ? revokedReasonCopy(credential.revokedReason) : null;
  const parts = [credential.hasMetadata ? "Custom endpoint" : null, cause].filter((part) => part !== null);
  return { text: parts.length > 0 ? parts.join(" · ") : undefined, wrap: cause !== null };
}

/** The user-facing sentence for each revocation cause — a closed dispatch over `CredRevokedReason`, so a new
 *  member is a `tsc` error here rather than a row that renders a cause the pane has no words for.
 *
 *  The copy is derived ENTIRELY from the enum member: nothing the provider or the endpoint said is echoed,
 *  so this line cannot become the credential-echo leak class (a user endpoint that reflects the request back
 *  has repeatedly turned display-bound response text into a key disclosure).
 *
 *  The unknown arm returns null — a wire value outside the union is not parsed at this boundary, and the
 *  honest answer to "why?" we cannot read is silence, never the raw string on screen. */
function revokedReasonCopy(reason: CredRevokedReason): string | null {
  switch (reason) {
    case "auth_failed":
      // Names the KEY as the problem: the fix is a new key, not "try again in a minute".
      return "Revoked — the provider rejected this key";
    case "unreachable":
      // Deliberately NOT "rejected": nothing answered, so nothing judged the key. Saying otherwise would send
      // a user to rotate a perfectly good key because their own box was off.
      return "Revoked — the endpoint stopped responding";
    case "user":
      return "Revoked by you";
    default: {
      const unhandled: never = reason;
      void unhandled;
      return null;
    }
  }
}

/** The Test-result text — the honest health status for every provider. */
function formatTestResult(result: TestResult, isCustom: boolean): string {
  return result.kind === "error" ? "Test failed — try again" : formatHealth(result.health, isCustom);
}

function formatHealth(health: CredentialHealth, isCustom: boolean): string {
  if (health.status === "ok") {
    return isCustom ? "ok" : `checked ${timeLib.formatRelative(health.checkedAt)}`;
  }
  if (health.status === "throttled") {
    return "throttled — retry in a minute";
  }
  // `unchecked` reads as "not checked", never as a pass: the server dialled nothing (or learned nothing), and
  // its reason says which. Rendering it like an `ok` is the exact product lie the honest arm exists to end.
  if (health.status === "unchecked") {
    return `not checked — ${health.reason}`;
  }
  return `${health.status} — ${health.reason}`;
}

// The result's colour as a TOKEN CLASS, not a `tone` prop: a voice carries its own colour, so the outcome
// tint rides className and wins over `gloss`'s muted default (UI-Density-Law.md §2.3).
function testResultToneClass(result: TestResult): string {
  if (result.kind === "error") {
    return "text-destructive";
  }
  if (result.health.status === "ok") {
    return "text-success";
  }
  if (result.health.status === "revoked") {
    return "text-destructive";
  }
  // `unchecked` is the absence of a verdict, not a failure — it keeps `gloss`'s own muted colour rather than
  // borrowing success (a lie) or warning (a scare) for "nobody probed this".
  return result.health.status === "unchecked" ? "" : "text-warning";
}
