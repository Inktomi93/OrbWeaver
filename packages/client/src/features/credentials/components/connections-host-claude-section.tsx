// The HOST CLAUDE section (Settings → Connections) — the owner-only max-pro-sub health check. The
// contribution gates it with `when: viewer.isOwner` (config-revamp-design.md §6.8: it used to render `null`
// for a non-owner under a LIST row that scrolled to nothing); the D17 owner gate also re-runs server-side,
// so the `when` is UX honesty over that floor, never the wall.

import type { HostClaudeAuthReport, HostClaudeState } from "@orb/contracts/providers";
import { modelDisplayName } from "@orb/kit/model-name";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { configAnchorId } from "#state";
import { CONNECTIONS_HOST_CLAUDE_SUBCATEGORY } from "../lib/connections-nav.ts";

/** The max-pro-sub host-Claude health check. A MUTATION despite being read-shaped — it spends a tiny probe
 *  turn. Reconciles nothing; the result is rendered inline from the returned report. */
const useTestClaudeAuth = createEntityMutation<void, HostClaudeAuthReport>({
  options: (trpc) => trpc.connection.testClaudeAuth.mutationOptions(),
  invalidates: () => [],
  errorToast: "Couldn't reach host Claude — check the subscription login.",
});

/** The SETUP copy, single-homed here and keyed by the server's state member — the server ships the fact,
 *  the client ships the sentence (the `sendUnavailableReason` discipline). `ready` has no line: the probe
 *  result below IS its answer. Exhaustive over `HostClaudeState`, so a new state is a tsc error here. */
const SETUP_HINT: Record<HostClaudeState, string | null> = {
  ready: null,
  off: "The Claude subscription backend is turned off on this server (CLAUDE_BACKEND=off). Set CLAUDE_BACKEND=auto or on to use it.",
  "not-set-up":
    "No Claude subscription login was found on this server. Run `claude setup-token` on any machine with a browser and set CLAUDE_CODE_OAUTH_TOKEN here, or run `claude login` on the server itself. Already signed in on this machine? Set CLAUDE_BACKEND=on — a macOS login lives in the Keychain, where a server-side check can't see it.",
};

/** The probe VERDICT badge — its own component so the section stays under the complexity budget and so the
 *  three outcomes (no backend / reached / did not reach) each read as one line. */
function HostClaudeVerdict({ report }: { readonly report: HostClaudeAuthReport }): ReactElement {
  if (report.state !== "ready") {
    return (
      <Badge intent="neutral" size="sm">
        Not set up
      </Badge>
    );
  }
  const { verify } = report;
  const modelName = modelDisplayName(verify.model);
  return (
    <Row gap="field" align="center">
      <Badge intent={verify.ok ? "success" : "danger"} size="sm">
        {verify.ok ? "Reachable" : "Unreachable"}
      </Badge>
      <Text voice="gloss" {...(verify.account !== undefined || modelName === verify.model ? {} : { title: verify.model })}>
        {verify.account?.subscriptionType ?? modelName}
      </Text>
    </Row>
  );
}

export function ConnectionsHostClaudeSection(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const probe = useTestClaudeAuth({ trpc, invalidation });
  const [report, setReport] = useState<HostClaudeAuthReport | null>(null);

  const runTest = (): void => {
    void probe
      .mutateAsync()
      .then((next) => setReport(next))
      .catch(() => setReport(null));
  };
  const hint = report === null ? null : SETUP_HINT[report.state];

  return (
    <Section divider={true} heading={CONNECTIONS_HOST_CLAUDE_SUBCATEGORY.label} id={configAnchorId("connections", CONNECTIONS_HOST_CLAUDE_SUBCATEGORY.id)}>
      <Row gap="field" align="center" justify="between" className="flex-wrap">
        <Text voice="gloss">Check that this box's Claude subscription can reach a model. Sends one tiny probe turn.</Text>
        <Button intent="secondary" size="sm" onClick={runTest} disabled={probe.isPending}>
          Test Claude auth
        </Button>
      </Row>
      {report === null ? null : (
        <Stack gap="field" role="status">
          <HostClaudeVerdict report={report} />
          {hint === null ? null : <Text voice="gloss">{hint}</Text>}
        </Stack>
      )}
    </Section>
  );
}
