// The static vllm/local-light model display — split out of role-slot-row.tsx (size gate: that file was
// over the 450-line cap). The facade default ghosted with a source chip, no chevron — vllm/local-light
// never open a picker (§2.3 auto-fill contract, role-slot-row.tsx's ModelCell header).

import { Badge } from "@orb/ui/badge";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { RoleStatusDotProps } from "./role-status-dot";
import { RoleStatusDot } from "./role-status-dot";

type FacadeState = RoleStatusDotProps["state"];

export interface StaticModelDisplayProps {
  readonly source: string;
  readonly value: string;
  readonly defaultModelId: string | null;
  readonly dimensions: number | undefined;
  readonly state: FacadeState | undefined;
  readonly onScrollToKeys: () => void;
}

/** The static vllm/local-light model display — the facade default ghosted with a source chip, no chevron. */
export function StaticModelDisplay({
  source,
  value,
  defaultModelId,
  dimensions,
  state,
  onScrollToKeys,
}: StaticModelDisplayProps): ReactElement {
  const shown = value !== "" ? value : (defaultModelId ?? "—");
  const chipLabel = source === "vllm" ? "server config" : "built-in";
  return (
    <Row gap="field" align="center" className="min-w-0 flex-1">
      {/* The model id is the ONE flexible cell — it absorbs the squeeze and truncates cleanly (min-w-0
          truncate) at the real ~746px modal width, so the dimension text + chip never wrap or clip (FIX 2). */}
      <Text as="span" size="body" tone="muted" className="min-w-0 flex-1 truncate italic">
        {shown}
      </Text>
      {dimensions !== undefined ? (
        <Text as="span" size="micro" tone="muted" className="shrink-0 whitespace-nowrap font-mono">
          {`${dimensions}-dim`}
        </Text>
      ) : null}
      <Badge intent="info" size="sm" className="shrink-0">
        {chipLabel}
      </Badge>
      {value !== "" ? (
        <Text as="span" size="micro" tone="muted" className="shrink-0 whitespace-nowrap">
          clears to server config
        </Text>
      ) : null}
      {state !== undefined ? (
        <RoleStatusDot state={state} source={source} onScrollToKeys={onScrollToKeys} />
      ) : null}
    </Row>
  );
}
