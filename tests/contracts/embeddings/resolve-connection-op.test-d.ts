import type { ResolveEmbeddingConnectionOp } from "@orb/contracts/embeddings";
import type { UserConnection } from "@orb/contracts/inference";
import type { UserConnectionId, UserId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

interface Snapshot {
  readonly model: string;
}

declare const resolve: ResolveEmbeddingConnectionOp<Snapshot>;
declare const ownerId: UserId;
declare const connectionId: UserConnectionId;
declare const maybeConnectionId: UserConnectionId | undefined;
declare const previewConnection: UserConnection;

test("only an explicit connection id with no previewed connection may answer null", () => {
  expectTypeOf(resolve(ownerId, "embed")).toEqualTypeOf<Promise<Snapshot>>();
  expectTypeOf(resolve(ownerId, "embed", connectionId, { previewConnection })).toEqualTypeOf<Promise<Snapshot>>();
  expectTypeOf(resolve(ownerId, "embed", connectionId)).toEqualTypeOf<Promise<Snapshot | null>>();
  expectTypeOf(resolve(ownerId, "embed", maybeConnectionId)).toEqualTypeOf<Promise<Snapshot | null>>();
});
