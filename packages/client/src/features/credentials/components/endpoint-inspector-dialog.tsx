// The custom-endpoint "Test endpoint" inspector (Tier-3b-Providers.md §10 / Esoteric #10 — custom-byo is
// FULLY user-declared). Distinct from the Saved-keys row's `/models` reachability probe: this fires the
// ACTUAL shaped round-trip and renders the server's `EndpointInspection` — the REDACTED outbound request
// (url · headers · pretty body) plus the raw response (status + preview) or the transport error.
//
// The secret never round-trips: the server masks Authorization/key-shaped headers (kit `redactHeaders`)
// BEFORE building the inspection, and this render only displays those already-redacted headers verbatim —
// it never reconstructs or holds a raw key. A `FormDialog` VIEW body (G24 seals raw @orb/ui/dialog).

import type { EndpointInspection } from "@orb/contracts/providers";
import type { UserCredentialId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { FormDialog } from "#components";
import type { Invalidation, Trpc } from "#data";
import { testId } from "#lib";
import { useInspectEndpoint } from "../hooks/use-connections-mutations";

/** A 2xx inspection carries a real `response`; the fallback verdict number when the shape ever lacks one. */
const OK_STATUS_FALLBACK = 200;

/** Fire one shaped probe and land its ASYNC settle — never a synchronous setState in an effect body
 *  (react-hooks/set-state-in-effect). `isPending` masks any stale result while a fresh probe is in flight, so
 *  a re-open never flashes the prior wire (no synchronous pre-clear needed). Module-scope over the mutation +
 *  the two setters (both stable) so no effect ever takes a per-render callback as a dependency (D54). */
function runProbe(
  mutateAsync: ReturnType<typeof useInspectEndpoint>["mutateAsync"],
  credentialId: UserCredentialId,
  setResult: (next: EndpointInspection | null) => void,
  setFailed: (next: boolean) => void,
): void {
  void mutateAsync({ credentialId })
    .then((next): void => {
      setFailed(false);
      setResult(next);
    })
    .catch((): void => {
      setResult(null);
      setFailed(true);
    });
}

export interface EndpointInspectorDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly credentialId: UserCredentialId;
  /** The label of the row being tested — shown in the dialog copy so the user knows which endpoint. */
  readonly label: string;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

/** The inspector dialog. On open it fires one shaped probe; the result (or the domain error) lands inline —
 *  the dialog stays open so the user can read the wire and re-run. */
export function EndpointInspectorDialog({ open, onOpenChange, credentialId, label, trpc, invalidation }: EndpointInspectorDialogProps): ReactElement {
  const inspect = useInspectEndpoint({ trpc, invalidation });
  const { mutateAsync } = inspect;
  const [result, setResult] = useState<EndpointInspection | null>(null);
  const [failed, setFailed] = useState(false);

  // Fire one probe on the open edge — the effect only synchronizes with the network, never setState. The deps
  // are `runProbe`'s real inputs — exactly what the retired manual-memo callback identity keyed on.
  useEffect(() => {
    if (open) {
      runProbe(mutateAsync, credentialId, setResult, setFailed);
    }
  }, [open, mutateAsync, credentialId]);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Test endpoint"
      description={`Sends the real one-message request "${label}" would send and shows the redacted wire — your API key is masked before it leaves the server and never appears here.`}
      testKey="endpointInspectorDialog"
      size="lg"
    >
      <Stack gap="block" data-testid={testId("endpointInspectorDialog")}>
        <Row gap="field" align="center" justify="between" className="flex-wrap">
          <InspectorStatus pending={inspect.isPending} failed={failed} result={result} />
          <Button intent="secondary" size="sm" disabled={inspect.isPending} onClick={(): void => runProbe(mutateAsync, credentialId, setResult, setFailed)}>
            {inspect.isPending ? "Testing…" : "Run again"}
          </Button>
        </Row>
        {inspect.isPending ? (
          <Text voice="gloss" role="status">
            Sending the shaped request…
          </Text>
        ) : null}
        {result !== null ? <InspectionView inspection={result} /> : null}
      </Stack>
    </FormDialog>
  );
}

interface StatusInput {
  readonly pending: boolean;
  readonly failed: boolean;
  readonly result: EndpointInspection | null;
}

/** The one-line verdict chip — pending / domain-error / transport-error / reachable-but-non-2xx / ok. */
function InspectorStatus(input: StatusInput): ReactElement {
  const verdict = statusVerdict(input);
  return (
    <Badge intent={verdict.intent} size="sm" data-testid={testId("endpointInspectorStatus")}>
      {verdict.label}
    </Badge>
  );
}

interface StatusVerdict {
  readonly intent: "neutral" | "success" | "warning" | "danger";
  readonly label: string;
}

function statusVerdict({ pending, failed, result }: StatusInput): StatusVerdict {
  if (pending) {
    return { intent: "neutral", label: "Testing…" };
  }
  if (failed) {
    return { intent: "danger", label: "Test failed" };
  }
  if (result === null) {
    return { intent: "neutral", label: "Ready" };
  }
  if (result.ok) {
    return { intent: "success", label: `OK · ${result.response?.status ?? OK_STATUS_FALLBACK}` };
  }
  if (result.response === null) {
    return { intent: "danger", label: "No response" };
  }
  return { intent: "warning", label: `HTTP ${result.response.status}` };
}

/** The redacted request + raw response, laid out as labelled code blocks. */
function InspectionView({ inspection }: { readonly inspection: EndpointInspection }): ReactElement {
  const responsePreview =
    inspection.response !== null && inspection.response.bodyPreview.length > 0 ? inspection.response.bodyPreview : "(empty response body)";
  return (
    <Stack gap="block">
      <Stack gap="field">
        <Text voice="kicker">Request</Text>
        <CodeBlock ariaLabel="Request URL">{inspection.request.url}</CodeBlock>
        <CodeBlock ariaLabel="Request headers (redacted)">{formatHeaders(inspection.request.headers)}</CodeBlock>
        <CodeBlock ariaLabel="Request body">{inspection.request.body}</CodeBlock>
      </Stack>
      <Stack gap="field">
        <Text voice="kicker">Response</Text>
        {inspection.response === null ? (
          <Text role="alert" className="text-destructive">
            {inspection.error ?? "The request never completed."}
          </Text>
        ) : (
          <>
            <Text voice="gloss">
              {inspection.response.status} {inspection.response.statusText}
            </Text>
            <CodeBlock ariaLabel="Response body preview">{responsePreview}</CodeBlock>
          </>
        )}
      </Stack>
    </Stack>
  );
}

/** A read-only monospace, wrapped + scroll-capped block. Not the CodeMirror editor (that's an editing
 *  surface wired only for CSS) — a static preview of already-redacted server text. */
function CodeBlock({ ariaLabel, children }: { readonly ariaLabel: string; readonly children: string }): ReactElement {
  return (
    <Text
      as="div"
      voice="datum"
      aria-label={ariaLabel}
      className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-control border border-border bg-muted p-field"
    >
      {children}
    </Text>
  );
}

/** One `name: value` line per header — the values are already server-redacted. */
function formatHeaders(headers: Record<string, string>): string {
  return Object.entries(headers)
    .map(([name, value]) => `${name}: ${value}`)
    .join("\n");
}
