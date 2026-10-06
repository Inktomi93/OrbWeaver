// The execution writer is composed before inference. Stats is an injected append op, so embeddings
// records its own canon without importing another domain or depending on the vector service lifecycle.

import type { ApplyStatsDelta } from "@orb/contracts/stats";
import type { Db } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import type { EmbeddingCallId, EmbeddingInvocationId } from "@orb/kit/ids";

export interface EmbeddingAccountingContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newCallId: () => EmbeddingCallId;
  readonly newInvocationId: () => EmbeddingInvocationId;
  readonly applyStatsDelta: ApplyStatsDelta<BatchStmt[], Db>;
}
