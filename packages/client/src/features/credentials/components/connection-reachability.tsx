// Reachability + the inline "Admit `<host>`" affordance — the Diagnostics tier's last block (inference
// program §5.3a · the step-3b mock `editor.html` Board C).
//
// THE REFUSAL COPY IS §5.3a's, VERBATIM: "Can't reach `<host>` — the server may be down."
// (`endpoint-unreachable`, renamed from `engine-down` in the same tuple sweep that retired `engine-off`).
//
// NO "WAKE IT" BUTTON, and that is a CORRECTION to the mock rather than an omission. The mock draws one
// beside "Check again". There is no wake verb on the connection router, and there is not supposed to be:
// `EndpointFeatures.sleep` already means "a sleeping server reads AVAILABLE and is woken before the request"
// (`@orb/contracts/inference/features.ts:49-51`) — the runtime warms the endpoint itself. A button implying
// the user must wake the box by hand would teach a false model of a mechanism that is already automatic, so
// the block states the FACT instead and the sentence is what a reader needs.
//
// THE ADMIT AFFORDANCE IS DELIBERATELY NARROW, and `connection-editor-model.ts::hostNamedInAllowlist` carries
// the reason: the admission RULE lives in `infra/network/egress.ts` (CIDR ranges, resolved addresses, a
// port-precedence rule), and a client-side copy of it would be a second truth that drifts. This asks only
// "is this exact name written down?", offers to write it down when it is not, and never claims the reverse.
// It mounts only for the box owner, because `AppSettings.privateEndpointAllowlist` is owner-gated at the
// verb (`domain/settings/verbs/app-settings.ts::OWNER_GATED_FIELDS`) and its read is `adminProcedure` — a
// member who needs their LAN box admitted needs the admin, which is the honest multi-tenant posture.

import type { CredentialHealth } from "@orb/contracts/credentials";
import type { UserConnectionId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary } from "#components";
import type { Invalidation, Trpc } from "#data";
import { useAdmitPrivateEndpoint, useProbeConnection } from "../hooks/use-connections-mutations.ts";
import { endpointHostOf, hostNamedInAllowlist } from "../lib/connection-editor-model.ts";

export interface ConnectionReachabilityProps {
  readonly connectionId: UserConnectionId;
  readonly baseUrl: string | null;
  /** The provider row states a sleep/wake pair, so a sleeping box is woken before the request rather than
   *  read as down. */
  readonly wakeable: boolean;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

export function ConnectionReachability({ connectionId, baseUrl, wakeable, trpc, invalidation }: ConnectionReachabilityProps): ReactElement {
  const probe = useProbeConnection({ trpc, invalidation });
  const host = endpointHostOf(baseUrl);
  const [verdict, setVerdict] = useState<CredentialHealth | null>(null);

  return (
    <Stack data-slot="connection-reachability" gap="tight">
      <Text voice="label">Reachability</Text>
      <ReachabilityVerdict host={host} verdict={verdict} />
      {wakeable ? (
        <Text voice="gloss">
          This server reports sleeping through its own check path, so a sleeping box is woken before a request runs — you don't have to start it by hand.
        </Text>
      ) : null}
      <Row gap="field">
        <Button
          disabled={probe.isPending}
          intent="secondary"
          onClick={(): void => probe.mutate({ connectionId }, { onSuccess: (health): void => setVerdict(health) })}
          size="sm"
        >
          Check again
        </Button>
      </Row>
      {/* Its own boundary, and no hand-rolled `renderError`: the read-error surface is the battery's
          `QueryErrorState`. The settings read inside only ever runs for the box OWNER — the member arm
          returns before mounting it — so this boundary is about a transient failure, not a 403. */}
      {host === null ? null : (
        <QueryBoundary fallback={<Text voice="gloss">Checking this deployment's allowed endpoints…</Text>}>
          <EndpointAdmission host={host} invalidation={invalidation} trpc={trpc} />
        </QueryBoundary>
      )}
    </Stack>
  );
}

/** §5.3a's sentence, verbatim where the cause is a FAILED DIAL; the other refusal arms say what they are
 *  rather than borrowing it (a revoked key is not an unreachable box, which is the exact product lie the
 *  honest `unchecked` health arm exists to prevent). */
function ReachabilityVerdict({ verdict, host }: { readonly verdict: CredentialHealth | null; readonly host: string | null }): ReactElement {
  if (verdict === null) {
    return <Text voice="gloss">Nothing has been checked yet on this connection.</Text>;
  }
  if (verdict.status === "ok") {
    return (
      <Text className="text-success" data-slot="connection-reachable" voice="gloss">
        Reached it.
      </Text>
    );
  }
  if (verdict.status === "throttled") {
    return (
      <Text className="text-warning" voice="gloss">
        The provider is rate-limiting us right now. Nothing is wrong with the connection.
      </Text>
    );
  }
  return (
    <Text className="text-warning" data-slot="connection-unreachable" voice="gloss">
      {verdict.status === "unreachable" ? `Can't reach ${host ?? "this server"} — the server may be down.` : verdict.reason}
    </Text>
  );
}

/** The admission read + write, mounted only where it can actually be answered. */
function EndpointAdmission({
  host,
  trpc,
  invalidation,
}: {
  readonly host: string;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}): ReactElement | null {
  const { data: me } = useSuspenseQuery(trpc.sessions.me.queryOptions());
  if (me.globalRole !== "owner") {
    return null;
  }
  return <OwnerEndpointAdmission host={host} invalidation={invalidation} trpc={trpc} />;
}

function OwnerEndpointAdmission({
  host,
  trpc,
  invalidation,
}: {
  readonly host: string;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}): ReactElement | null {
  const { data } = useSuspenseQuery(trpc.settings.getAppSettingsWithOverrides.queryOptions());
  const admit = useAdmitPrivateEndpoint({ trpc, invalidation });
  const entries = data.resolved.privateEndpointAllowlist;
  if (hostNamedInAllowlist(host, entries)) {
    return null;
  }
  return (
    <Stack data-slot="connection-admit-host" gap="tight">
      <Text voice="gloss">{host} isn't in this deployment's allowed private endpoints, so requests to it are refused before they leave the server.</Text>
      <Row gap="field">
        <Button
          disabled={admit.isPending}
          intent="secondary"
          onClick={(): void => admit.mutate({ partial: { privateEndpointAllowlist: [...entries, host] } })}
          size="sm"
        >
          Admit {host}
        </Button>
      </Row>
    </Stack>
  );
}
