// The endpoint inspector beside Request & response shaping (inference program §5.3a, Diagnostics tier): the
// request a turn would send with this row's shaping applied, and what the server answered. The server
// redacts the key and every key-shaped header before the request reaches this view.

import type { EndpointInspection } from "@orb/contracts/providers";
import type { UserConnectionId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import type { Invalidation, Trpc } from "#data";
import { useInspectEndpoint } from "../hooks/use-connections-mutations.ts";

export interface ConnectionInspectorProps {
  readonly connectionId: UserConnectionId;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

export function ConnectionInspector({ connectionId, trpc, invalidation }: ConnectionInspectorProps): ReactElement {
  const inspect = useInspectEndpoint({ trpc, invalidation });
  const [inspection, setInspection] = useState<EndpointInspection | null>(null);
  return (
    <Stack data-slot="connection-inspector" gap="tight">
      <Row gap="field">
        <Button
          disabled={inspect.isPending}
          intent="secondary"
          onClick={(): void => inspect.mutate({ connectionId }, { onSuccess: (result): void => setInspection(result) })}
          size="sm"
        >
          Send a test request
        </Button>
      </Row>
      {inspection === null ? null : <InspectionResult inspection={inspection} />}
    </Stack>
  );
}

function InspectionResult({ inspection }: { readonly inspection: EndpointInspection }): ReactElement {
  const { request, response } = inspection;
  const headerLines = Object.entries(request.headers).map(([name, value]) => `${name}: ${value}`);
  return (
    <Stack data-ok={inspection.ok} data-slot="connection-inspection" gap="tight">
      <Text className={inspection.ok ? "text-success" : "text-warning"} data-slot="connection-inspection-verdict" voice="gloss">
        {response === null
          ? `The request never got an answer — ${inspection.error ?? "no reason was given"}.`
          : `The server answered ${String(response.status)} ${response.statusText}.`}
      </Text>
      <Text voice="label">Request</Text>
      <Text as="div" className="whitespace-pre-wrap break-all" voice="datum">
        {[`POST ${request.url}`, ...headerLines, "", request.body].join("\n")}
      </Text>
      {response === null ? null : (
        <>
          <Text voice="label">Response</Text>
          <Text as="div" className="whitespace-pre-wrap break-all" data-slot="connection-inspection-response" voice="datum">
            {response.bodyPreview === "" ? "(an empty body)" : response.bodyPreview}
          </Text>
        </>
      )}
    </Stack>
  );
}
