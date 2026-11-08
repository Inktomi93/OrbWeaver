// QueryErrorState (rollup-audit C2): the shared read-error block beside QueryBoundary. 6 near-identical
// `ErrorState` components + 28 inline `renderError=` arms + 8 settings-pane copies all hand-assemble
// this exact "muted label + Retry button" 10-line shape. `retry` comes straight from QueryBoundary's
// `renderError(error, retry)` — passing it through actually refetches (the reset handshake), never a
// bare re-render.

import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { DIALOG_VERBS } from "#lib";
import { QUERY_WAITING_LINE, queryFailedLabel } from "./query-state-copy.ts";

export interface QueryErrorStateProps {
  /** What failed to load, e.g. "your chats" / "the character library" (rendered as "Couldn't load \{label\}."). */
  readonly label: string;
  /** Refetches the failed read — pass QueryBoundary's `renderError(error, retry)` retry straight through. */
  readonly onRetry: () => void;
  /** Replaces the default Retry button when a containing interaction primitive must own its key routing. */
  readonly renderRetry?: (onRetry: () => void) => ReactNode;
  /**
   * The plate it sits on over a room's art. A prop because a `renderError` arm renders this component directly, so
   * a surface never wraps it into a second hand-rolled error state.
   */
  readonly plate?: ComponentProps<typeof Stack>["plate"];
}

/**
 * The read-error surface every `QueryBoundary`'s `renderError` renders — a Retry that actually
 * refetches, so a transient read failure is never a dead end (UI-Arch §4.3 rule 1).
 *
 * Usage: `renderError={(_error, retry) => <QueryErrorState label="your chats" onRetry={retry} />}`
 */
export function QueryErrorState({ label, onRetry, renderRetry, plate }: QueryErrorStateProps): ReactElement {
  return (
    <Stack align="center" data-slot="query-error" gap="row" justify="center" padding="section" plate={plate}>
      <Text role="status" ink="muted">
        {queryFailedLabel(label)}
      </Text>
      {renderRetry?.(onRetry) ?? (
        <Button variant="ghost" onClick={onRetry}>
          {DIALOG_VERBS.retry}
        </Button>
      )}
    </Stack>
  );
}

export interface QueryUnavailableStateProps extends Pick<QueryErrorStateProps, "label" | "onRetry"> {
  /** The read is paused offline: it resumes when the connection returns, so a Retry would do nothing. */
  readonly paused: boolean;
}

/** A non-suspending surface's first read, settled with no data: paused offline it waits, failed it offers the retry. */
export function QueryUnavailableState({ label, onRetry, paused }: QueryUnavailableStateProps): ReactElement {
  return paused ? (
    <Text role="status" ink="muted" textAlign="center" voice="gloss">
      {QUERY_WAITING_LINE}
    </Text>
  ) : (
    <QueryErrorState label={label} onRetry={onRetry} />
  );
}
