// The connection editor's embedder refusal: a write the server undid because the embedder does not make the width it
// would state, or did not answer the probe. A refusal from a fact row is said under that row, where focus returns, and
// so is the status line while the server is still checking.

import type { EmbedTargetRefusal } from "@orb/contracts/inference";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { EMBED_REFUSAL_SLOTS, embedderCheckingText, embedRefusalRowText, embedRefusalText } from "#lib";

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
    <Text className="text-warning" data-refusal={EMBED_REFUSAL_SLOTS[refusal.kind]} role="alert" voice="gloss">
      {onRow ? embedRefusalRowText(refusal) : embedRefusalText(refusal)}
    </Text>
  );
}

/** Where a refusal will appear, said while the server checks the embedder before the write lands. */
export function EmbedderCheckingStatus(): ReactElement {
  return (
    <Text data-embedder-check="" role="status" voice="gloss">
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
