// THE POST-GENERATION CREDENTIAL STRIKE-OUT (#1373) — the seam `packages/db/src/schema/credentials.ts` has
// advertised since the column was minted ("Set when the credential is revoked (auth_failed strike-out or user
// action)") and which was DEAD two ways until this suite existed:
//
//   BREAK 1 — nothing in `domain/chat` ever invoked `ctx.maybeRevokeOnAuthFailed`. The op was declared on
//     `ChatContext`, filled at the composition root and called by NOBODY, so a rejected key was re-spent on
//     every subsequent turn forever.
//   BREAK 2 — the composition-root adapter classified from the HTTP STATUS (`401 → "unauthorized"`,
//     `403 → "forbidden"`) while the verb short-circuits on `errorKind !== "auth_failed"`. Those two
//     vocabularies could never meet, and `MaybeRevokeParams.errorKind: string` (an open discriminator on an
//     injected op) is exactly what let `tsc` see nothing wrong. The union is now `ProviderErrorKind`.
//
// `.suite.int` — it spans `engine/engine.ts` (the three generation catch seams), the `ChatContext` op contract,
// and the credentials verb's policy vocabulary; there is no single source module it mirrors.
//
// WHAT IT PINS, in one sentence each: the provider's OWN classification travels (never a re-derived status);
// only a classified provider failure strikes at all; an ABORT never strikes; the credential struck is the one
// the generation actually authenticated with (never a re-resolve, which is how a rotate loses a good key); and
// the strike is a PASSENGER — it can never alter, mask or delay the failure the caller is about to see.

import type { AssembleContext, ChatBusEvent } from "@orb/contracts/chat";
import type { ResolvedConnection } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Db } from "@orb/db";
import type { CharacterId, ChatId, Handle, ModelId, UserCredentialId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { ProviderError } from "@orb/server/infra/providers";
import { beforeEach, describe, vi } from "vitest";
import type { ChatContext } from "../../../../../packages/server/src/domain/chat/context.ts";
import type { TurnPrep, TurnStreamChunk } from "../../../../../packages/server/src/domain/chat/contract/results.ts";
import { createTurnEngine } from "../../../../../packages/server/src/domain/chat/engine/engine.ts";
import { createMemoryRecallWarningEpisode } from "../../../../../packages/server/src/domain/chat/memory/recall/rerank-warning.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { fakeRecallResult, makeChatContext, seedChat, seedMessage, seedParticipant, seedUser, stubRunCompaction, testConnection } from "../_support.ts";

const HOST = castId<UserId>("user_host");
/** The credential the seeded BYO connection authenticates with — the id every strike must name. */
const BYO_CREDENTIAL = castId<UserCredentialId>("user_credential_turn");
/** A DIFFERENT live row: the one a post-turn RE-RESOLVE would have found after a rotate/set-active. No test
 *  may ever see this id reach the strike — revoking it is locking the user out of the key they just fixed. */
const ROTATED_CREDENTIAL = castId<UserCredentialId>("user_credential_rotated");

const ASSEMBLE_CTX: AssembleContext = {
  character: { name: "Aria", description: "a bold knight" },
  promptConfig: DEFAULT_PROMPT_CONFIG,
  activePersona: { name: "Nate", description: "the user" },
  recentMessages: [],
};

/** One recorded strike — exactly the argument object the engine handed the injected op. */
type StrikeCall = Parameters<ChatContext["maybeRevokeOnAuthFailed"]>[0];

/** A BYO (`custom_openai`) connection whose credential carries a REAL row id, so "which id was struck" is an
 *  answerable question. `testConnection`'s shared double is keyless (`credentialId: null`) by design. */
function byoConnection(api: ResolvedConnection["api"] = "chat-completions"): ResolvedConnection {
  return {
    ...testConnection("custom_openai", api),
    // FABRICATION-OK: minimal ResolvedCredential double — the engine reads only `.source`/`.credentialId`.
    credential: { source: "custom_openai", credentialId: BYO_CREDENTIAL } as unknown as ResolvedCredential,
  };
}

/** The keyless twin (vllm/local-light/max-pro-sub): no row exists to revoke, so the id is structurally null. */
function keylessConnection(): ResolvedConnection {
  return { ...testConnection("vllm"), model: castId<ModelId>("test-model") };
}

function prepOf(chatId: ChatId, over: Partial<TurnPrep> = {}): TurnPrep {
  return {
    chatId,
    assembleContext: ASSEMBLE_CTX,
    connection: byoConnection(),
    triggeredBy: HOST,
    runAsUserId: HOST,
    kind: "send",
    intent: {},
    speakerCharacterId: null,
    ...over,
  };
}

/** A turn that streams a little and then dies mid-flight with `err` — the realistic provider-fault shape. */
function throwingTurn(err: unknown): ChatContext["runChatTurn"] {
  return () =>
    (async function* (): AsyncGenerator<TurnStreamChunk> {
      await Promise.resolve();
      yield { kind: "text", text: "partial" };
      throw err;
    })();
}

/** A turn that completes normally (so the POST-turn compaction hook is reachable). */
const succeedingTurn: ChatContext["runChatTurn"] = () =>
  (async function* (): AsyncGenerator<TurnStreamChunk> {
    await Promise.resolve();
    yield { kind: "text", text: "Hi" };
    yield { kind: "final", economics: { content: "Hi there", model: "test-model", tokensIn: 4, tokensOut: 2 } };
  })();

let db: Db;
let strikes: StrikeCall[];
/** The op the engine calls; overridable per-test to prove the strike is a passenger. */
let strikeImpl: (params: StrikeCall) => Promise<void>;

/** The `prep` overrides that make `resolveSpeakerMemory` actually CALL `deps.recallMemory`: a scoped-shape
 *  group turn voiced by a real seated character, with the round's recall inputs staged. Any gate off and the
 *  round-level memory passes through untouched — i.e. the side-role call never happens and the arm below
 *  would prove nothing. */
function scopedRecallPrep(): Partial<TurnPrep> {
  const speaker = castId<CharacterId>("character_speaker");
  return {
    speakerCharacterId: speaker,
    shape: {
      output: "per-speaker",
      cardScope: "scoped",
      scopedTargetId: speaker,
      speakerName: "Aria",
      speakerRef: { kind: "character", characterId: speaker },
    },
    memoryRecall: {
      groupCharacterId: castId<CharacterId>("character_group"),
      recent: [],
      names: new Map<CharacterId, string>(),
      config: null,
      warningEpisode: createMemoryRecallWarningEpisode(),
    },
  };
}

function engineOver(
  runChatTurn: ChatContext["runChatTurn"],
  runCompaction: Parameters<typeof createTurnEngine>[1]["runCompaction"] = stubRunCompaction,
  depsOver: Partial<Parameters<typeof createTurnEngine>[1]> = {},
): ReturnType<typeof createTurnEngine> {
  const ctx = makeChatContext(db, {
    runChatTurn,
    maybeRevokeOnAuthFailed: (params: StrikeCall): Promise<void> => {
      strikes.push(params);
      return strikeImpl(params);
    },
  });
  return createTurnEngine(ctx, {
    emit: (_event: ChatBusEvent): Promise<void> => Promise.resolve(),
    debitBudget: () => Promise.resolve(),
    resolveTurnPolicy: () => Promise.resolve({ budget: null, allowNonOwnerMaxProSub: false }),
    holder: "replica-1",
    lockTtlMs: 60_000,
    generateSegments: async () => ({ written: 0, skipped: 0 }),
    generateDigests: async () => ({ written: 0, skipped: 0 }),
    loadWitnessHorizons: () => Promise.resolve([]),
    recallMemory: () => Promise.resolve(fakeRecallResult("")),
    runCompaction,
    ...depsOver,
  });
}

beforeEach(async () => {
  db = await freshDb();
  strikes = [];
  strikeImpl = (): Promise<void> => Promise.resolve();
});

const authFailed = (message = "the endpoint rejected the key (401)"): ProviderError =>
  new ProviderError({ kind: "auth_failed", retryable: false, message, apiErrorStatus: 401 });

describe("the main turn's fault path strikes out the credential it ran under", () => {
  test("a provider `auth_failed` carries the PROVIDER's own classification to the credentials op", async () => {
    const chatId = await seedChat(db, "strike-auth");
    const engine = engineOver(throwingTurn(authFailed()));

    await expect(engine.runTurn(prepOf(chatId))).rejects.toThrow("rejected the key");

    // `auth_failed` — the normalized kind minted inside infra, NOT an HTTP status re-derived at the seam. The
    // dead adapter spelled this position "unauthorized"/"forbidden", which the verb could never match.
    // `ownerId` is the turn's frozen `runAsUserId` — the scope the credentials verb turns into its WHERE, so
    // a strike can only ever reach a row THIS principal owns (`injected-op-caller-param`).
    expect(strikes).toEqual([{ ownerId: HOST, credentialId: BYO_CREDENTIAL, errorKind: "auth_failed", errorMessage: "the endpoint rejected the key (401)" }]);
  });

  test("a WRAPPED provider fault still classifies (the cause-chain walk, not a single deref)", async () => {
    const chatId = await seedChat(db, "strike-wrapped");
    const engine = engineOver(throwingTurn(new Error("bridge re-wrap", { cause: authFailed("401 from upstream") })));

    await expect(engine.runTurn(prepOf(chatId))).rejects.toThrow("bridge re-wrap");

    expect(strikes.at(0)).toMatchObject({ ownerId: HOST, credentialId: BYO_CREDENTIAL, errorKind: "auth_failed" });
  });

  test("a NON-auth provider failure reaches the op with its OWN kind — the policy lives in the verb, not here", async () => {
    // Deliberate: the engine does not pre-filter. `maybe-revoke-on-auth-failed.ts` is the ONE home of "which
    // kind revokes", so every turn path follows the same policy without re-spelling the conditional. The
    // no-revoke half is pinned over the REAL db in the verb's own mapped-Record test.
    const chatId = await seedChat(db, "strike-ratelimit");
    const engine = engineOver(throwingTurn(new ProviderError({ kind: "rate_limit", retryable: true, message: "429" })));

    await expect(engine.runTurn(prepOf(chatId))).rejects.toThrow("429");

    expect(strikes.at(0)).toMatchObject({ errorKind: "rate_limit" });
  });

  test("a NON-provider fault (a DB fault or a bug) strikes NOTHING — there is no classification to act on", async () => {
    const chatId = await seedChat(db, "strike-plain");
    const engine = engineOver(throwingTurn(new Error("model exploded")));

    await expect(engine.runTurn(prepOf(chatId))).rejects.toThrow("model exploded");

    // Striking here would revoke a working key over OUR bug. Silence is the only honest answer.
    expect(strikes).toEqual([]);
  });

  test("a CALLER CANCEL never strikes — an aborted turn is not evidence about the key", async () => {
    const chatId = await seedChat(db, "strike-cancel");
    const controller = new AbortController();
    const cancelling: ChatContext["runChatTurn"] = () =>
      (async function* (): AsyncGenerator<TurnStreamChunk> {
        await Promise.resolve();
        yield { kind: "text", text: "partial" };
        controller.abort();
        // A backend that had ALREADY classified an auth failure when the cancel landed: the engine must still
        // read this turn as an abort and leave the credential alone (fail-safe on an ambiguous outcome).
        throw authFailed();
      })();
    const engine = engineOver(cancelling);

    await engine.runTurn(prepOf(chatId, { signal: controller.signal }));

    expect(strikes).toEqual([]);
  });

  test("a KEYLESS source strikes with a null id — vllm/local-light/max-pro-sub own no row to revoke", async () => {
    const chatId = await seedChat(db, "strike-keyless");
    const engine = engineOver(throwingTurn(authFailed()));

    await expect(engine.runTurn(prepOf(chatId, { connection: keylessConnection() }))).rejects.toThrow("rejected the key");

    // The null id is the whole guard: the verb no-ops on it by construction, so a keyless auth failure can
    // never revoke somebody's stored key by accident.
    expect(strikes.at(0)?.credentialId).toBeNull();
  });

  test("THE ROTATE RACE: the struck id is the one the turn AUTHENTICATED WITH, never a fresh resolve", async () => {
    // The defect this forecloses: the dead adapter re-resolved `{runAsUserId, source}` AFTER the turn failed.
    // A user who rotates the key (or flips `active` to a second row) between the 401 and the strike would have
    // had their BRAND-NEW, GOOD credential revoked by the OLD key's rejection. The engine now carries
    // `connection.credential.credentialId` — the id is frozen at dispatch, so the race has no window.
    const chatId = await seedChat(db, "strike-rotate");
    const engine = engineOver(throwingTurn(authFailed()));
    const prep = prepOf(chatId);

    await expect(engine.runTurn(prep)).rejects.toThrow("rejected the key");

    expect(strikes.at(0)?.credentialId).toBe(BYO_CREDENTIAL);
    expect(strikes.at(0)?.credentialId).not.toBe(ROTATED_CREDENTIAL);
    expect(prep.connection.credential.credentialId).toBe(BYO_CREDENTIAL);
  });

  test("THE SCOPE the credentials verb revokes under is the turn's own runAsUserId, never a wider one", async () => {
    // `injected-op-caller-param`: the op is the domain boundary, so the boundary carries the tenant scope.
    // `prep.runAsUserId` is the frozen principal `resolveChat` resolved this credential under, which is what
    // makes it a legitimate WHERE predicate rather than a second unverified id.
    const chatId = await seedChat(db, "strike-scope");
    const otherHost = castId<UserId>("user_someone_else");
    const engine = engineOver(throwingTurn(authFailed()));

    await expect(engine.runTurn(prepOf(chatId, { runAsUserId: otherHost, triggeredBy: otherHost }))).rejects.toThrow("rejected the key");

    expect(strikes.at(0)?.ownerId).toBe(otherHost);
    expect(strikes.at(0)?.ownerId).not.toBe(HOST);
  });

  test("A SIDE-ROLE's auth failure inside the turn body strikes NOTHING — it is not this credential's rejection", async () => {
    // THE HOLE (#1373 chunk J). `strikeOutOnTurnFault` fires from `executeTurn`'s WHOLE-BODY catch, and the
    // body also runs the per-speaker memory recall — `resolveSpeakerMemory` → `deps.recallMemory` →
    // `ctx.searchDigests` → `ctx.roleClients.embed` (`search/verbs/digests.ts:84`, awaited with no catch).
    // Role clients resolve their OWN credential per call, so an embed role pinned to a DIFFERENT provider can
    // 401 on ITS key and escape into this catch — where the strike revoked the CHAT's credential, a key the
    // provider never saw, and stamped `revoked_reason: auth_failed` so the pane said it had been rejected.
    // Self-inflicted lockout plus a false product statement, and it contradicted this seam's own header.
    const chatId = await seedChat(db, "strike-side-role");
    const engine = engineOver(succeedingTurn, stubRunCompaction, {
      // The embed role's key is dead; the CHAT's key is fine.
      recallMemory: () => Promise.reject(authFailed("the EMBED role's key was rejected (401)")),
    });

    await expect(engine.runTurn(prepOf(chatId, scopedRecallPrep()))).rejects.toThrow("EMBED role's key");

    // The turn still fails loudly (the throw is the caller's), but no credential is touched: this failure did
    // not come from the generation, so it says nothing about the key the generation ran under.
    expect(strikes).toEqual([]);
  });

  test("…and the GENERATION's own auth failure on the same shaped turn still strikes (the positive control)", async () => {
    // Without this arm the test above would pass just as well against a strike-out that never fires at all.
    // Same prep, same recall wiring — only the origin of the throw moves.
    const chatId = await seedChat(db, "strike-side-role-control");
    const engine = engineOver(throwingTurn(authFailed()), stubRunCompaction, { recallMemory: () => Promise.resolve(fakeRecallResult("remembered")) });

    await expect(engine.runTurn(prepOf(chatId, scopedRecallPrep()))).rejects.toThrow("rejected the key");

    expect(strikes.at(0)).toMatchObject({ ownerId: HOST, credentialId: BYO_CREDENTIAL, errorKind: "auth_failed" });
  });

  test("THE STRIKE IS A PASSENGER: a throwing revoke never replaces the failure the caller sees", async () => {
    // It runs INSIDE the turn's catch, so an unguarded throw would swap the provider's error for a revoke
    // error on its way to tRPC — the operator would be told the wrong thing about their own turn.
    const chatId = await seedChat(db, "strike-passenger");
    const boom = authFailed();
    strikeImpl = (): Promise<void> => Promise.reject(new Error("the credentials db is down"));
    const engine = engineOver(throwingTurn(boom));

    await expect(engine.runTurn(prepOf(chatId))).rejects.toBe(boom);
    expect(strikes).toHaveLength(1);
  });
});

/** A chat with enough aged canon that the managed-compaction arms have a real span to compact. */
async function seedChatWithHistory(key: string, count: number): Promise<ChatId> {
  const host = await seedUser(db, castId<Handle>(`host_${key}`));
  const chatId = await seedChat(db, key);
  await seedParticipant(db, { chatId, key: "h", userId: host, role: "host" });
  for (let seq = 1; seq <= count; seq += 1) {
    await seedMessage(db, chatId, seq, {
      role: seq % 2 === 1 ? "user" : "assistant",
      ...(seq % 2 === 1 ? { authorUserId: host } : {}),
      content: `turn ${seq} — ${"lorem ipsum dolor sit amet ".repeat(8)}`,
    });
  }
  return chatId;
}

const AGENT_SDK_BYO = byoConnection("agent-sdk");
const SMALL_CAP = 200;
const MANAGED = { compaction: { mode: "managed" as const }, maxContextTokens: SMALL_CAP };

describe("the compaction arms strike too — they burn the same credential on the same connection", () => {
  test("the PRE-TURN compaction's failure-honest catch strikes on `auth_failed`", async () => {
    // The pre-turn arm swallows its failure by design (it must never block a turn that could still succeed) —
    // which is exactly why the strike has to live INSIDE that catch: without it, a chat wedged over its window
    // burns the dead key on every attempt and reports only a warn line.
    const chatId = await seedChatWithHistory("strike-pre", 16);
    let call = 0;
    const engine = engineOver(succeedingTurn, () => {
      call += 1;
      return call === 1 ? Promise.reject(authFailed("compaction: 401")) : Promise.resolve({ summary: "", compactedAtSeq: 0, updated: false });
    });

    const outcome = await engine.runTurn(prepOf(chatId, { connection: AGENT_SDK_BYO, intent: MANAGED }));

    // Failure-honest: the turn still committed. And the dead key was struck rather than silently re-spent.
    expect(outcome.aborted).toBe(false);
    expect(strikes.at(0)).toEqual({ ownerId: HOST, credentialId: BYO_CREDENTIAL, errorKind: "auth_failed", errorMessage: "compaction: 401" });
  });

  test("the POST-TURN compaction hook strikes on `auth_failed`", async () => {
    const chatId = await seedChatWithHistory("strike-post", 16);
    let call = 0;
    const engine = engineOver(succeedingTurn, () => {
      call += 1;
      // Let the PRE-turn arm pass cleanly so the recorded strike can only have come from the post-turn hook.
      return call === 1 ? Promise.resolve({ summary: "", compactedAtSeq: 0, updated: false }) : Promise.reject(authFailed("compaction: 401"));
    });

    await engine.runTurn(prepOf(chatId, { connection: AGENT_SDK_BYO, intent: MANAGED }));

    // Fire-and-forget by design — the hook outlives `runTurn`.
    await vi.waitFor(() => {
      expect(strikes.at(0)).toEqual({ ownerId: HOST, credentialId: BYO_CREDENTIAL, errorKind: "auth_failed", errorMessage: "compaction: 401" });
    });
  });

  test("a compaction failure with no provider classification strikes nothing", async () => {
    const chatId = await seedChatWithHistory("strike-pre-plain", 16);
    const engine = engineOver(succeedingTurn, () => Promise.reject(new Error("the digest write failed")));

    await engine.runTurn(prepOf(chatId, { connection: AGENT_SDK_BYO, intent: MANAGED }));

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(strikes).toEqual([]);
  });
});
