// QueryErrorState (rollup-audit C2): the shared read-error block beside QueryBoundary. 6 near-identical
// `ErrorState` components + 28 inline `renderError=` arms + 8 settings-pane copies all hand-assemble
// this exact "muted label + Retry button" 10-line shape. `retry` comes straight from QueryBoundary's
// `renderError(error, retry)` — passing it through actually refetches (the reset handshake), never a
// bare re-render.

import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

export interface QueryErrorStateProps {
  /** What failed to load, e.g. "your chats" / "the character library" (rendered as "Couldn't load \{label\}."). */
  readonly label: string;
  /** Refetches the failed read — pass QueryBoundary's `renderError(error, retry)` retry straight through. */
  readonly onRetry: () => void;
}

/**
 * The read-error surface every `QueryBoundary`'s `renderError` renders — a Retry that actually
 * refetches, so a transient read failure is never a dead end (UI-Arch §4.3 rule 1).
 *
 * Usage: `renderError={(_error, retry) => <QueryErrorState label="your chats" onRetry={retry} />}`
 */
export function QueryErrorState({ label, onRetry }: QueryErrorStateProps): ReactElement {
  return (
    <Stack align="center" gap="row" justify="center" padding="section">
      <Text tone="muted">Couldn't load {label}.</Text>
      <Button intent="ghost" onClick={onRetry}>
        Retry
      </Button>
    </Stack>
  );
}
