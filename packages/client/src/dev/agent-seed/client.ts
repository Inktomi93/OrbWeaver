import type { TrpcClient } from "#data";

type CharacterListResult = Awaited<ReturnType<TrpcClient["character"]["list"]["query"]>>;
type CharacterCreateResult = Awaited<ReturnType<TrpcClient["character"]["create"]["mutate"]>>;
type SessionMeResult = Awaited<ReturnType<TrpcClient["sessions"]["me"]["query"]>>;
type StartChatResult = Awaited<ReturnType<TrpcClient["chat"]["startChat"]["mutate"]>>;
type EditSnapshotResult = Awaited<ReturnType<TrpcClient["rpg"]["editSnapshot"]["mutate"]>>;
type PatchActorResult = Awaited<ReturnType<TrpcClient["rpg"]["patchActor"]["mutate"]>>;
type EditSnapshotPortResult =
  | Pick<Extract<EditSnapshotResult, { readonly ok: true }>, "ok">
  | Pick<Extract<EditSnapshotResult, { readonly ok: false }>, "ok" | "reason">;
type PatchActorPortResult =
  | Pick<Extract<PatchActorResult, { readonly ok: true }>, "ok">
  | Pick<Extract<PatchActorResult, { readonly ok: false }>, "ok" | "reason">;

/** The exact generated-client branches and result fields the dev seeder consumes. Inputs stay the real
 * generated procedure inputs; outputs select only fields this consumer reads, so a fixture cannot erase
 * relevant drift or fabricate hundreds of unrelated response fields. */
export interface AgentSeedClient {
  readonly character: {
    readonly list: {
      readonly query: (
        input: Parameters<TrpcClient["character"]["list"]["query"]>[0],
      ) => Promise<{ readonly items: readonly Pick<CharacterListResult["items"][number], "id" | "handle">[] }>;
    };
    readonly create: {
      readonly mutate: (input: Parameters<TrpcClient["character"]["create"]["mutate"]>[0]) => Promise<Pick<CharacterCreateResult, "id">>;
    };
  };
  readonly sessions: {
    readonly me: { readonly query: () => Promise<Pick<SessionMeResult, "userId">> };
  };
  readonly chat: {
    readonly startChat: {
      readonly mutate: (input: Parameters<TrpcClient["chat"]["startChat"]["mutate"]>[0]) => Promise<{ readonly chat: Pick<StartChatResult["chat"], "id"> }>;
    };
  };
  readonly rpg: {
    readonly createGame: { readonly mutate: (input: Parameters<TrpcClient["rpg"]["createGame"]["mutate"]>[0]) => Promise<unknown> };
    readonly updateConfig: { readonly mutate: (input: Parameters<TrpcClient["rpg"]["updateConfig"]["mutate"]>[0]) => Promise<unknown> };
    readonly patchSheet: { readonly mutate: (input: Parameters<TrpcClient["rpg"]["patchSheet"]["mutate"]>[0]) => Promise<unknown> };
    readonly editSnapshot: {
      readonly mutate: (input: Parameters<TrpcClient["rpg"]["editSnapshot"]["mutate"]>[0]) => Promise<EditSnapshotPortResult>;
    };
    readonly patchActor: {
      readonly mutate: (input: Parameters<TrpcClient["rpg"]["patchActor"]["mutate"]>[0]) => Promise<PatchActorPortResult>;
    };
    readonly upsertQuest: { readonly mutate: (input: Parameters<TrpcClient["rpg"]["upsertQuest"]["mutate"]>[0]) => Promise<unknown> };
    readonly addJournalEntry: { readonly mutate: (input: Parameters<TrpcClient["rpg"]["addJournalEntry"]["mutate"]>[0]) => Promise<unknown> };
  };
}
