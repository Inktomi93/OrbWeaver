// The static vllm/local-light model display — split out of role-slot-row.tsx (size gate: that file was
// over the 450-line cap). The facade default ghosted with a source chip, no chevron — vllm/local-light
// never open a picker (§2.3 auto-fill contract, role-slot-row.tsx's ModelCell header).
//
// These sources serve the model they were CONFIGURED with, so `defaultModelId` — not the stored value — is
// what a turn sends, and this cell renders that. A stored model from some earlier source is NOT quietly
// displayed as if it were the server config (which is how the live `{source:"vllm",
// model:"anthropic/claude-sonnet-5"}` row looked coherent while every turn 404'd): it is called out as an
// ignored pin, named, so the store is on screen and the next save clears it.

import { Badge } from "@orb/ui/badge";
import { AlertTriangle, Icon } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { RoleStatusDotProps } from "./role-status-dot.tsx";
import { RoleStatusDot } from "./role-status-dot.tsx";

type FacadeState = RoleStatusDotProps["state"];

export interface StaticModelDisplayProps {
  readonly source: string;
  readonly value: string;
  readonly defaultModelId: string | null;
  readonly dimensions: number | undefined;
  readonly state: FacadeState | undefined;
  readonly onScrollToKeys: () => void;
}

/** The static vllm/local-light model display — the served (configured) model with a source chip, no chevron,
 *  plus a loud advisory when a stored pin differs from it (that pin is what the resolver ignores). */
export function StaticModelDisplay({ source, value, defaultModelId, dimensions, state, onScrollToKeys }: StaticModelDisplayProps): ReactElement {
  // What a turn SENDS. The stored value never wins here: the resolver heals a foreign pin to the configured
  // model (connection/verbs/resolve-role.ts `healConfigDerivedModel`), so showing the pin as the model would
  // be the display lying about the connection — the one thing this pane exists to prevent.
  const served = defaultModelId ?? (value !== "" ? value : "—");
  const ignoredPin = value !== "" && value !== defaultModelId ? value : null;
  const chipLabel = source === "vllm" ? "server config" : "built-in";
  return (
    <Stack gap="field" className="min-w-0 flex-1">
      <Row gap="field" align="center" className="min-w-0">
        {/* The model id is the ONE flexible cell — it absorbs the squeeze and truncates cleanly (min-w-0
            truncate) at the real ~746px modal width, so the dimension text + chip never wrap or clip (FIX 2). */}
        <Text as="span" className="min-w-0 flex-1 truncate text-muted-foreground italic">
          {served}
        </Text>
        {dimensions !== undefined ? (
          <Text as="span" voice="gloss" className="shrink-0 whitespace-nowrap font-mono">
            {`${dimensions}-dim`}
          </Text>
        ) : null}
        <Badge intent="info" size="sm" className="shrink-0">
          {chipLabel}
        </Badge>
        {state !== undefined ? <RoleStatusDot state={state} source={source} onScrollToKeys={onScrollToKeys} /> : null}
      </Row>
      {ignoredPin === null ? null : (
        <Row gap="field" align="center" role="alert" data-slot="ignored-model-pin">
          <Badge intent="warning" size="sm">
            <Icon icon={AlertTriangle} size="xs" />
            ignored pin
          </Badge>
          <Text voice="gloss">
            {`“${ignoredPin}” is stored for this role but this provider only serves its configured model — saving this pane clears it.`}
          </Text>
        </Row>
      )}
    </Stack>
  );
}
