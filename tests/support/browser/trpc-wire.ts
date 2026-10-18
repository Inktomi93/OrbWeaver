// Types the e2e harness derives from the `AppRouter` (the type-only bridge the client uses), keyed by dotted procedure
// path. Nothing here is declared by hand: a field changed on the server changes these and reds the specs that read it.
// `@trpc/server` is not a root dependency, so the router's own `_def` is read instead of `inferRouterOutputs`.

import type { AppRouter } from "@orb/server";

type RouterRecord = AppRouter["_def"]["record"];

interface ProcedureNode {
  readonly _def: { readonly procedure: true; readonly $types: { readonly input: unknown; readonly output: unknown } };
}

type ProcedurePaths<TRecord> = {
  [K in keyof TRecord & string]: TRecord[K] extends ProcedureNode
    ? K
    : TRecord[K] extends Record<string, unknown>
      ? `${K}.${ProcedurePaths<TRecord[K]>}`
      : never;
}[keyof TRecord & string];

type ProcedureAt<TRecord, TPath extends string> = TPath extends `${infer Head}.${infer Tail}`
  ? Head extends keyof TRecord
    ? ProcedureAt<TRecord[Head], Tail>
    : never
  : TPath extends keyof TRecord
    ? TRecord[TPath]
    : never;

/** Every procedure the `AppRouter` mounts, as its dotted path (`chat.listMessages`). */
export type TrpcPath = ProcedurePaths<RouterRecord>;

/** What one procedure answers, derived from the router. */
export type TrpcOutput<TPath extends TrpcPath> = Extract<ProcedureAt<RouterRecord, TPath>, ProcedureNode>["_def"]["$types"]["output"];

/** What one procedure accepts, derived from the router. */
export type TrpcInput<TPath extends TrpcPath> = Extract<ProcedureAt<RouterRecord, TPath>, ProcedureNode>["_def"]["$types"]["input"];

/** One canon message row — the fields the honesty specs read come straight off `chat.listMessages`. */
export type CanonMessage = TrpcOutput<"chat.listMessages">["messages"][number];

/** The managed-compaction per-send intent knob (`chat.send`'s `intent.compaction`) the specs drive. */
export type CompactionIntent = NonNullable<NonNullable<TrpcInput<"chat.send">["intent"]>["compaction"]>;

/** What `connection.create` is sent. */
export type NewConnection = TrpcInput<"connection.create">;

/** One Model-roles row (`connection.listBindings` — one per ROUTABLE task, bound or not). `resolved` is what
 *  a turn would ride RIGHT NOW against the PERSISTED read; `unavailableCause` is why it would not (§5.3a). */
export type TaskBinding = TrpcOutput<"connection.listBindings">[number];

/** One PRESENT roster seat. The `id` is the `chat_participants` row id — the key `chat.setSeatKnobs` writes by
 *  (D80), NOT the characterId. */
export type RosterSeat = TrpcOutput<"chat.getChat">["participants"][number];

/** The whole-object group config `chat.setGroupConfig` takes. */
export type GroupConfigInput = TrpcInput<"chat.setGroupConfig">["config"];

/** One guided steer as the wire schema accepts it — the same typed shape the composer wand sends on a real turn. */
export type GuidedSteerInput = NonNullable<TrpcInput<"chat.previewAssembly">["guided"]>;

/** The FULL persisted-snapshot projection `rpg.getTrackerView` returns. */
export type TrackerView = TrpcOutput<"rpg.getTrackerView">;

/** ONE actor row in the tracker view — one shape for EVERY actor: roster members and scene NPCs, on stage and off. */
export type TrackerActor = TrackerView["actors"][number];

/** An actor ref as the wire union accepts it. */
export type ActorRefInput = TrpcInput<"rpg.patchSheet">["actorRef"];

/** The host config patch `rpg.updateConfig` takes. */
export type RpgConfigPatch = NonNullable<TrpcInput<"rpg.updateConfig">["patch"]>;

/** One tracker definition as `rpg.updateConfig.patch.trackers` takes it. */
export type TrackerDefInput = NonNullable<RpgConfigPatch["trackers"]>[number];

/** `Omit` that distributes over a union input, so each arm keeps its own keys. */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
