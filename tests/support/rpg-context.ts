// tests/support/rpg-context — a full `RpgContext` for the rpg service tests, with deterministic defaults and
// per-op overrides. The R3 spine widened `RpgContext` from `{ db }` to the full injected-op bundle (02 §3);
// this builds one over a real db with stub cross-feature ops (the REAL `can()` — host/member is real
// behavior), so a verb test overrides only the ops it exercises. A determinism seam (tests/support/), exempt
// from the test-* gates.

import type { ParticipantRole } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import type { ChatId, MessageId, MessageVariantId, PresetId, TypeIdOf, WorkloadId, WorldBookId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { can } from "../../packages/server/src/domain/admin/guard.ts";
import type { Rng } from "../../packages/server/src/domain/rpg/contract/rng.ts";
import type { RpgContext } from "../../packages/server/src/domain/rpg/contract/service.ts";
import { createRpgTurnStaging } from "../../packages/server/src/domain/rpg/staging.ts";
import { createResolvePartyActorKind } from "../../packages/server/src/entry/compose/rpg-identity.ts";
import { FROZEN_AT_MS } from "./clock.ts";

/** Deterministic ids: `<prefix>_<26-char counter>` (never asserted-on; FK-clean within a test). The suffix is
 *  zero-padded to the typeid width so a minted id that becomes a snapshot JSON key/value (parsed through
 *  `typeIdSchema` on flush — widget ids, party-member ids) passes the length check. */
const TYPEID_SUFFIX_WIDTH = 26;
function makeNewId(): RpgContext["newId"] {
  let n = 0;
  return <P extends string>(prefix: P): TypeIdOf<P> => {
    n += 1;
    return castId<TypeIdOf<P>>(`${prefix}_${String(n).padStart(TYPEID_SUFFIX_WIDTH, "0")}`);
  };
}

/** A trivial deterministic rng (min / first / never) — a verb test that needs specific rolls overrides it. */
const STUB_RNG: Rng = {
  int: (minIncl: number): number => minIncl,
  pick: <T>(arr: readonly T[]): T => arr[0] as T,
  chance: (): boolean => false,
};

/** The REAL FK-walk identity op over `db` — the SHARED compose factory itself (agent-principal-design/05 §2), not
 *  a hand-copied mirror (audit F6). The agent-GM tests wire THIS (not a literal stub) so the seat re-keys +
 *  assignGmSeat's disabled-agent refusal are proven against real persisted state through the exact production op. */
export function rpgRealIdentity(db: Db): RpgContext["identity"] {
  return { resolvePartyActorKind: createResolvePartyActorKind(db) };
}

/** The override shape: any top-level op replaces wholesale, but the `chat` + `character` op bundles (which grow
 *  new ops per chunk — R10 added fork/override/roster/create) DEEP-merge, so a focused test provides only the
 *  ops it cares about and the rest fall through to the defaults (no fixture churn when the bundle widens). */
export type RpgContextOverrides = Partial<Omit<RpgContext, "chat" | "character">> & {
  readonly chat?: Partial<RpgContext["chat"]>;
  readonly character?: Partial<RpgContext["character"]>;
};

/** A full `RpgContext` over `db` with stub cross-feature ops; override any field for a focused test. */
export function makeRpgContext(db: Db, overrides: RpgContextOverrides = {}): RpgContext {
  const { chat: chatOverride, character: characterOverride, ...restOverrides } = overrides;
  const base: RpgContext = {
    db,
    now: () => FROZEN_AT_MS,
    rng: STUB_RNG,
    newId: makeNewId(),
    emitBus: () => undefined,
    emitDomainEvent: () => undefined,
    staging: createRpgTurnStaging(),
    can,
    // Default: every seat/party holder resolves as a plain human (the AI/human seat paths — the agent-GM tests
    // override this to return `{ kind: "agent", enabled }`). `null` here would also read as human (fail-closed).
    identity: {
      resolvePartyActorKind: async () => ({ kind: "human" }),
    },
    chat: {
      getMembership: async () => null,
      postNarratorMessage: async () => ({ messageId: castId<MessageId>("message_stub"), variantId: castId<MessageVariantId>("message_variant_stub") }),
      setGroupConfig: async () => undefined,
      getPendingUserText: async () => null,
      // The R6 crew readers' host + roster (06 §3/§4) — default to no host / solo table; a crew reader/applier
      // test overrides these with a real host + roster.
      resolveHost: async () => null,
      listRoster: async () => [],
      // The illustration cadence turn-gap scan (08 §3): default to 0 narrator turns since the last media (⇒ the
      // turn-gap arm is closed unless a gather test overrides it).
      countNarratorTurnsSinceMedia: async () => 0,
      // GAP #4: the createGame game-pointer stamp — a no-op by default; a compose test asserts the real chat op.
      setRpgGamePointer: async () => undefined,
      // R10 scenes (07 §2.2): fork/override/roster ops — a scene test overrides forkChat + removeCharacter with
      // real fork/roster stubs; the mutation ops no-op by default.
      forkChat: async () => ({ forkChatId: castId<ChatId>("chat_fork_stub") }),
      setRoomOverrides: async () => undefined,
      addCharacterToChat: async () => undefined,
      removeCharacter: async () => undefined,
    },
    character: {
      getCard: () => Promise.reject(new Error("makeRpgContext: character.getCard not stubbed")),
      // R10 recruit (07 §3): a recruit test overrides this with a real card-create stub.
      create: () => Promise.reject(new Error("makeRpgContext: character.create not stubbed")),
    },
    preset: {
      clonePackaged: async () => castId<PresetId>("preset_stub"),
    },
    connection: {
      resolveChatCapability: () => Promise.reject(new Error("makeRpgContext: connection.resolveChatCapability not stubbed")),
      // Default: no resolvable host connection ⇒ a lite turn derives read-only trackers. A lite gather test that
      // exercises the tool-capable arm overrides this with a `{ tools }` capability.
      resolveHostCapability: async () => null,
    },
    // R6 crew (06 §3): enqueue is a no-op by default (createGame/start/conclude-session tests assert it was
    // called via an override); world-info constant canon is empty by default.
    workloads: {
      // Returns a deterministic minted id (planScene surfaces it; the fire-and-forget callers ignore it). A test
      // that asserts the enqueue args overrides this with its own capture.
      enqueue: async () => ({ workloadId: castId<WorkloadId>("workload_default") }),
      // Default: no distill run visible (the concluding-banner READ reads `distilling`); a getSessionWrap
      // `ready`/`failed` test overrides this to return a run with a status + result.
      latestSessionDistill: async () => null,
    },
    worldInfo: {
      listConstantCanon: async () => [],
      // R7 lorebook-upkeep (06 §3): the shared machine-writer ops — no-op defaults; a keeper test overrides.
      upsertEntries: async () => ({ inserted: 0, updated: 0, skippedHandEdited: 0 }),
      createBook: async () => castId<WorldBookId>("world_book_stub"),
      attachToChat: async () => undefined,
      listEntryTitles: async () => [],
    },
    // The chat-crew mutual-exclusion predicate (05 §h): default no crew enabled (createGame's refusal test
    // overrides this to `true` to prove the reverse guard bites).
    crew: {
      hasEnabledMembers: async () => false,
    },
    // R9 generative layer (08 §2): default to NO image capability (⇒ the honest refusal path) + a deterministic,
    // identity-sensitive hash (a portrait/illustration test overrides generatePicture + resolveImageCapability).
    imagery: {
      generatePicture: () => Promise.reject(new Error("makeRpgContext: imagery.generatePicture not stubbed")),
      readProvenance: async () => null,
      identityHashFor: (npcId, identity) => `hash:${npcId}:${identity.name}:${identity.description}:${identity.gender ?? ""}:${identity.pronouns ?? ""}`,
      resolveImageCapability: async () => null,
    },
    assets: {
      readBytes: () => Promise.reject(new Error("makeRpgContext: assets.readBytes not stubbed")),
    },
  };
  return {
    ...base,
    ...restOverrides,
    chat: { ...base.chat, ...chatOverride },
    character: { ...base.character, ...characterOverride },
  };
}

/** A ctx whose injected membership read reports `role` for the caller — the common gated-verb test setup.
 *  Override any op (e.g. a real `postNarratorMessage` for the restore path) via `overrides`. */
export function rpgContextAs(db: Db, role: ParticipantRole, overrides: RpgContextOverrides = {}): RpgContext {
  const { chat: chatOverride, ...rest } = overrides;
  // Only `getMembership` differs from the base defaults; the rest of the chat bundle (incl. the R10
  // fork/override/roster ops) deep-merges through `makeRpgContext`. A caller's `chat` override wins on top.
  return makeRpgContext(db, { ...rest, chat: { getMembership: async () => ({ role }), ...chatOverride } });
}
