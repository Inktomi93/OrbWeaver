// The connection editor's embedder refusal: a write the server undid because the embedder does not make the width it
// would state, or did not answer the probe. A refusal from a fact row is said under that row, where focus returns, and
// so is the status line while the server is still checking.

import type { EmbedTargetRefusal } from "@orb/contracts/inference";
import { Button } from "@orb/ui/button";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { EMBED_REFUSAL_SLOTS, embedderCheckingText, embedRefusalRowText, embedRefusalText } from "#lib";

// The editor is as wide as the settings body; a sentence capped at the prose measure never runs across it.

/** A refused embedder write, and the fact row it came from: `null` for a field above Advanced. */
export interface EditorEmbedRefusal {
  readonly refusal: EmbedTargetRefusal;
  readonly path: string | null;
}

/** A write the server is still checking, and the fact row it came from (`null` for a field above Advanced). */
export interface EditorEmbedderCheck {
  readonly path: string | null;
}

/** On its row the refusal says what was kept, because the rollback already put the row back; at the top of the
 *  editor it also says what to set. */
export function EmbedRefusalAlert({ refusal, onRow }: { readonly refusal: EmbedTargetRefusal; readonly onRow: boolean }): ReactElement {
  return (
    <Text cap="prose" tone="warning" data-refusal={EMBED_REFUSAL_SLOTS[refusal.kind]} role="alert" voice="gloss">
      {onRow ? embedRefusalRowText(refusal) : embedRefusalText(refusal)}
    </Text>
  );
}

/** What the editor's failure line says, and whether the connection is gone so the line carries the way out. */
export interface EditorFailureLineSpec {
  readonly sentence: string;
  readonly goesBack: boolean;
}

/** The line mounts afresh for each failure (the editor keys it), so focus follows the failure. */
function focusOnMount(node: HTMLDivElement | null): void {
  node?.scrollIntoView({ block: "nearest" });
  node?.focus({ preventScroll: true });
}

/** The editor's one line for a failed write no field holds, set at the field-error size and focusable by script only: the
 *  editor moves focus here when it appears, because it can sit off screen above the tiers. A connection that is gone
 *  carries the way out. */
export function EditorFailureLine({ line, onBack }: { readonly line: EditorFailureLineSpec | null; readonly onBack: () => void }): ReactNode {
  return line === null ? null : (
    <Row align="center" data-slot="connection-editor-refusal" gap="field" ref={focusOnMount} tabIndex={-1} wrap={true}>
      <Text cap="prose" role="alert" tone="destructive" voice="label">
        {line.sentence}
      </Text>
      {line.goesBack ? (
        <Button onClick={onBack} size="sm" type="button" variant="outline">
          Back to Connections
        </Button>
      ) : null}
    </Row>
  );
}

/** Where a refusal will appear, said while the server checks the embedder before the write lands. */
export function EmbedderCheckingStatus(): ReactElement {
  return (
    <Text cap="prose" data-embedder-check="" role="status" voice="gloss">
      {embedderCheckingText()}
    </Text>
  );
}

/** The top of the editor's line, for a field above Advanced: the check while it runs, else the last refusal. */
export function TopEmbedderNote({
  checking,
  refused,
}: {
  readonly checking: EditorEmbedderCheck | null;
  readonly refused: EditorEmbedRefusal | null;
}): ReactNode {
  if (checking !== null) {
    return checking.path === null ? <EmbedderCheckingStatus /> : null;
  }
  return refused === null || refused.path !== null ? null : <EmbedRefusalAlert onRow={false} refusal={refused.refusal} />;
}
