import type { ResolveEmbeddingConnectionOp } from "@orb/contracts/embeddings";
import type { UserConnection } from "@orb/contracts/inference";
import type { UserConnectionId, UserId } from "@orb/kit/ids";
import { expectTypeOf, test } from "vitest";

interface Snapshot {
  readonly model: string;
}

declare const resolve: ResolveEmbeddingConnectionOp<Snapshot, AbortSignal>;
declare const signal: AbortSignal;
declare const ownerId: UserId;
declare const connectionId: UserConnectionId;
declare const maybeConnectionId: UserConnectionId | undefined;
declare const previewConnection: UserConnection;

test("only an explicit connection id with no previewed connection may answer null", () => {
  expectTypeOf(resolve(ownerId, "embed", { signal })).toEqualTypeOf<Promise<Snapshot>>();
  expectTypeOf(resolve(ownerId, "embed", { signal, connectionId, previewConnection })).toEqualTypeOf<Promise<Snapshot>>();
  expectTypeOf(resolve(ownerId, "embed", { signal, connectionId })).toEqualTypeOf<Promise<Snapshot | null>>();
  expectTypeOf(resolve(ownerId, "embed", { signal, connectionId: maybeConnectionId })).toEqualTypeOf<Promise<Snapshot | null>>();
});

test("the resolve can wake an encoder, so it takes the caller's signal", () => {
  // @ts-expect-error a resolve with no signal cannot be stopped by the request that asked for it
  expectTypeOf(resolve).toBeCallableWith(ownerId, "embed", { connectionId });
});
