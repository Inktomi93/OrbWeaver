// QueryErrorState (rollup-audit C2): the shared read-error block beside QueryBoundary. 6 near-identical
// `ErrorState` components + 28 inline `renderError=` arms + 8 settings-pane copies all hand-assemble
// this exact "muted label + Retry button" 10-line shape. `retry` comes straight from QueryBoundary's
// `renderError(error, retry)` — passing it through actually refetches (the reset handshake), never a
// bare re-render.

import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ComponentProps, ReactElement, ReactNode } from "react";

export interface QueryErrorStateProps {
  /** What failed to load, e.g. "your chats" / "the character library" (rendered as "Couldn't load \{label\}."). */
  readonly label: string;
  /** Refetches the failed read — pass QueryBoundary's `renderError(error, retry)` retry straight through. */
  readonly onRetry: () => void;
  /** Replaces the default Retry button when a containing interaction primitive must own its key routing. */
  readonly renderRetry?: (onRetry: () => void) => ReactNode;
  /**
   * The CALLER'S OWN PLACE for this block: its column track (`className`, layout only) and the plate it sits on
   * over a room's art (`plate`). They are props because a `renderError` arm renders this component directly, so
   * a surface never wraps it into a second hand-rolled error state.
   */
  readonly className?: string;
  readonly plate?: ComponentProps<typeof Stack>["plate"];
}

/**
 * The read-error surface every `QueryBoundary`'s `renderError` renders — a Retry that actually
 * refetches, so a transient read failure is never a dead end (UI-Arch §4.3 rule 1).
 *
 * Usage: `renderError={(_error, retry) => <QueryErrorState label="your chats" onRetry={retry} />}`
 */
export function QueryErrorState({ label, onRetry, renderRetry, className, plate }: QueryErrorStateProps): ReactElement {
  return (
    <Stack align="center" className={className} data-slot="query-error" gap="row" justify="center" padding="section" plate={plate}>
      <Text role="status" tone="muted">
        Couldn't load {label}.
      </Text>
      {renderRetry?.(onRetry) ?? (
        <Button intent="ghost" onClick={onRetry}>
          Retry
        </Button>
      )}
    </Stack>
  );
}
