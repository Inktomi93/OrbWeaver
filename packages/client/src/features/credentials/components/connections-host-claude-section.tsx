// The HOST CLAUDE section (Settings → Connections) — the owner-only max-pro-sub health check. The
// contribution gates it with `when: viewer.isOwner` (config-revamp-design.md §6.8: it used to render `null`
// for a non-owner under a LIST row that scrolled to nothing); the D17 owner gate also re-runs server-side,
// so the `when` is UX honesty over that floor, never the wall.

import type { VerifyAuthResult } from "@orb/contracts/providers";
import { modelDisplayName } from "@orb/kit/model-name";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Row, Section } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { configAnchorId } from "#state";
import { CONNECTIONS_HOST_CLAUDE_SUBCATEGORY } from "../lib/connections-nav.ts";

/** The max-pro-sub host-Claude health check. A MUTATION despite being read-shaped — it spends a tiny probe
 *  turn. Reconciles nothing; the result is rendered inline from the returned VerifyAuthResult. */
const useTestClaudeAuth = createEntityMutation<void, VerifyAuthResult>({
  options: (trpc) => trpc.connection.testClaudeAuth.mutationOptions(),
  invalidates: () => [],
  errorToast: "Couldn't reach host Claude — check the subscription login.",
});

export function ConnectionsHostClaudeSection(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const probe = useTestClaudeAuth({ trpc, invalidation });
  const [result, setResult] = useState<VerifyAuthResult | null>(null);

  const runTest = (): void => {
    void probe
      .mutateAsync()
      .then((next) => setResult(next))
      .catch(() => setResult(null));
  };
  const modelName = result === null ? null : modelDisplayName(result.model);

  return (
    <Section divider={true} heading={CONNECTIONS_HOST_CLAUDE_SUBCATEGORY.label} id={configAnchorId("connections", CONNECTIONS_HOST_CLAUDE_SUBCATEGORY.id)}>
      <Row gap="field" align="center" justify="between" className="flex-wrap">
        <Text voice="gloss">Check that this box's Claude subscription can reach a model. Sends one tiny probe turn.</Text>
        <Button intent="secondary" size="sm" onClick={runTest} disabled={probe.isPending}>
          Test Claude auth
        </Button>
      </Row>
      {result === null ? null : (
        <Row gap="field" align="center" role="status">
          <Badge intent={result.ok ? "success" : "danger"} size="sm">
            {result.ok ? "Reachable" : "Unreachable"}
          </Badge>
          <Text voice="gloss" {...(result.account !== undefined || modelName === result.model ? {} : { title: result.model })}>
            {result.account?.subscriptionType ?? modelName}
          </Text>
        </Row>
      )}
    </Section>
  );
}
