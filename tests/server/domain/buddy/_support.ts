// Shared test harness for the buddy domain (NOT a test file — no `.test` suffix, so test-layout ignores
// it). Builds a real-db `BuddyContext` with: injected determinism (frozen clock + seeded turn/proposal
// ids), and FAKE recording cross-feature ops (resolveAgentConnection / agentTurn / buildToolServer /
// roleClients.summarize / agentEnv.startWorkload) — the sanctioned "fake at the edges, inject at the root"
// doctrine (testing §3). The fakes RECORD their calls so tests assert behavior (the firewall, the gate,
// owner-scoping, the agentTurn composition).
//
// THE FIREWALL TEST WIRING: `buildToolServer` returns the spec array verbatim as the opaque tool server,
// so the `agentTurn` fake can simulate the model calling a propose tool (`setToolCall`) by invoking the
// real handler — exercising the real propose→stash→peek→confirm path through the real verbs.

import type { ResolvedConnection } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { Principal, UserRole } from "@orb/contracts/identity";
import type { SummarizeResult } from "@orb/contracts/providers";
import type { Db } from "@orb/db";
import type { BuddyTurnId, Handle, UserId, WorkloadId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { BuddyAgentRequest, BuddyAgentResult, BuddyContext, BuddyToolServer, BuddyToolSpec } from "@orb/server/domain/buddy";
import { FROZEN_AT_MS } from "../../../support/clock.ts";
import { principal as makePrincipal } from "../../../support/factories/principal.ts";
import { seedUser as seedUserRow } from "../../../support/factories/user.ts";

const FROZEN_AT = FROZEN_AT_MS;
const DEFAULT_WINDOW = 32_768;

// Process-monotonic counters (deterministic; no clock/random — testing §3). Module-scope so ids stay
// unique across a file even though the agency Maps are module-scope (per-process) too.
let turnCounter = 0;
let proposalCounter = 0;
function nextTurnId(): BuddyTurnId {
  turnCounter += 1;
  return castId<BuddyTurnId>(`buddy_turn_${turnCounter}`);
}
function nextProposalId(): string {
  proposalCounter += 1;
  return `proposal_${proposalCounter}`;
}

// A fake vllm-shaped resolved credential (the brand is a phantom symbol; a test casts a matching shape —
// the firewall/gate behavior never inspects the brand).
const FAKE_CREDENTIAL = { source: "vllm", credentialId: null } as unknown as ResolvedCredential;

function fakeConnection(): ResolvedConnection {
  return {
    api: "agent-sdk",
    model: castId("claude-haiku-4-5"),
    credential: FAKE_CREDENTIAL,
    capability: {
      reasoning: { mode: "none", enabled: false },
      sampling: {},
      output: { maxTokens: { min: 1, max: 4096 } },
      context: { window: DEFAULT_WINDOW },
    },
  };
}

const OK_SUMMARIZE: SummarizeResult = {
  items: [
    {
      text: JSON.stringify({ name: "Sparkle", personality: "A bright little gremlin." }),
      usage: { tokensIn: null, tokensOut: null, costUsd: null },
    },
  ],
  model: "vllm-local",
};

/** The harness: the BuddyContext + recorders/setters for the faked injected ops. */
export interface BuddyHarness {
  readonly ctx: BuddyContext;
  /** Every request handed to the faked `agentTurn` (assert the firewall + the resolved pieces). */
  readonly turns: BuddyAgentRequest[];
  /** Set the reply text the faked `agentTurn` returns. */
  readonly setTurnText: (text: string) => void;
  /** Simulate the model calling one tool during the next `agentTurn` (name + args). */
  readonly setToolCall: (call: { name: string; args: Record<string, unknown> } | null) => void;
  /** Make the faked `roleClients.summarize` throw (engine-down → canned soul). */
  readonly setSummarizeThrows: (throws: boolean) => void;
  /** Calls handed to the faked `agentEnv.startWorkload`. */
  readonly startWorkloadCalls: { ownerId: UserId; kind: string }[];
  /** Make `agentEnv.startWorkload` throw the given error (e.g. a single-active conflict). */
  readonly setStartWorkloadError: (err: Error | null) => void;
  readonly advance: (ms: number) => void;
}

interface SeedUserOverrides {
  readonly id?: string;
  readonly handle?: string;
  readonly role?: UserRole;
}

/** Insert a `users` row (the FK target for `buddies.userId`); returns its branded id. Thin delegate over
 *  the canonical factory — buddy's call sites want the id back, not the row. */
export async function seedUser(db: Db, overrides: SeedUserOverrides = {}): Promise<UserId> {
  const id = castId<UserId>(overrides.id ?? `user_${overrides.role ?? "x"}`);
  const seeded = await seedUserRow(db, {
    id,
    handle: castId<Handle>(overrides.handle ?? id),
    role: overrides.role ?? "user",
  });
  return seeded.id;
}

/** Build a Principal for a user id + role (cookie-resolved by default). Delegates to the shared
 *  `support/factories/principal` — buddy keeps its existing positional `(id, role)` convention. */
export function principal(userId: UserId, role: UserRole = "user"): Principal {
  return makePrincipal(userId, { role });
}

/** Build the BuddyContext over a real db with recording fake ops + injected determinism. */
export function makeHarness(db: Db): BuddyHarness {
  let nowMs = FROZEN_AT;
  let turnText = "Hi there!";
  let toolCall: { name: string; args: Record<string, unknown> } | null = null;
  let summarizeThrows = false;
  let startWorkloadError: Error | null = null;
  const turns: BuddyAgentRequest[] = [];
  const startWorkloadCalls: { ownerId: UserId; kind: string }[] = [];

  const ctx: BuddyContext = {
    db,
    now: (): number => nowMs,
    newTurnId: nextTurnId,
    newProposalId: nextProposalId,
    resolveAgentConnection: (): Promise<ResolvedConnection> => Promise.resolve(fakeConnection()),
    agentTurn: async (req: BuddyAgentRequest): Promise<BuddyAgentResult> => {
      turns.push(req);
      // Simulate the agent loop invoking a tool the domain supplied (the toolServer IS the spec array
      // in the test wiring) — exercises the real propose→stash path.
      if (toolCall !== null) {
        const specs = req.toolServer as BuddyToolSpec[];
        const spec = specs.find((s) => s.name === toolCall?.name);
        if (spec !== undefined) {
          await spec.handler(toolCall.args);
        }
      }
      return { text: turnText };
    },
    buildToolServer: (tools: readonly BuddyToolSpec[]): BuddyToolServer => tools,
    roleClients: {
      embed: (): never => {
        throw new Error("embed not used in buddy tests");
      },
      rerank: (): never => {
        throw new Error("rerank not used in buddy tests");
      },
      imageEmbed: (): never => {
        throw new Error("imageEmbed not used in buddy tests");
      },
      summarize: (): Promise<SummarizeResult> => (summarizeThrows ? Promise.reject(new Error("engine down")) : Promise.resolve(OK_SUMMARIZE)),
      embedModel: "vllm-local",
      rerankModel: "vllm-local",
      imageEmbedModel: "vllm-local",
      summarizerModel: "vllm-local",
      summarizerContextTokens: 32_000,
    },
    agentEnv: {
      startWorkload: (args: { ownerId: UserId; kind: string }): Promise<{ readonly workloadId: WorkloadId }> => {
        startWorkloadCalls.push(args);
        if (startWorkloadError !== null) {
          return Promise.reject(startWorkloadError);
        }
        return Promise.resolve({ workloadId: castId<WorkloadId>("workload_1") });
      },
    },
  };

  return {
    ctx,
    turns,
    setTurnText: (text: string): void => {
      turnText = text;
    },
    setToolCall: (call: { name: string; args: Record<string, unknown> } | null): void => {
      toolCall = call;
    },
    setSummarizeThrows: (throws: boolean): void => {
      summarizeThrows = throws;
    },
    startWorkloadCalls,
    setStartWorkloadError: (err: Error | null): void => {
      startWorkloadError = err;
    },
    advance: (ms: number): void => {
      nowMs += ms;
    },
  };
}
