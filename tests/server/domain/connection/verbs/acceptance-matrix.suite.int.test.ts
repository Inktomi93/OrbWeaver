// The connection ACCEPTANCE MATRIX: every built-in provider × every model kind × every routable task, driven
// through the real door. Each cell creates the row with `create` (the add-time checks: provider, URL shape,
// credential, closed catalog) and then binds each routable task with `setBinding`, which must accept exactly
// the tasks the table names and refuse every other with `taskUnservable`. The table is the stated intent; a
// provider row or wire change that moves a cell reds here and has to be restated on purpose.

import type { ModelKind, ProviderDef, RoutableTask } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS, CONNECTION_OP_CODES, LOCAL_LIGHT_SEED_ROWS, MODEL_KINDS, ROUTABLE_TASKS } from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import { userCredentials } from "@orb/db";
import type { UserCredentialId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { BYO_BASE_URL, makeHarness, seedOwner } from "../_support.ts";

type KindAcceptance = Readonly<Record<ModelKind, readonly RoutableTask[]>>;

/** A generic openai-compat row: the wire serves every task, so the kind alone decides. */
const OPENAI_COMPAT_OPEN: KindAcceptance = {
  generation: ["chat", "summarize", "generateImage"],
  embedding: ["embed", "imageEmbed"],
  rerank: ["rerank"],
};

/** The chat wires serve text generation only. */
const TEXT_ONLY: KindAcceptance = { generation: ["chat", "summarize"], embedding: [], rerank: [] };

/** What each built-in provider accepts for a row of each model kind, keyed by provider id. */
const ACCEPTANCE: ReadonlyMap<string, KindAcceptance> = new Map([
  ["openrouter", OPENAI_COMPAT_OPEN],
  // OpenAI's row narrows the wire: no image embeddings and no rerank endpoint.
  ["openai", { generation: ["chat", "summarize", "generateImage"], embedding: ["embed"], rerank: [] }],
  ["anthropic", TEXT_ONLY],
  ["claude-sub", TEXT_ONLY],
  ["vllm", OPENAI_COMPAT_OPEN],
  ["lm-studio", OPENAI_COMPAT_OPEN],
  ["ollama", OPENAI_COMPAT_OPEN],
  ["custom-openai", OPENAI_COMPAT_OPEN],
  // The in-process runtime serves vectors and reranking, never generation.
  ["local-light", { generation: [], embedding: ["embed", "imageEmbed"], rerank: ["rerank"] }],
]);

const CREDENTIAL = castId<UserCredentialId>("user_credential_000001");

/** A hosted row names a credential the owner holds (the FK is real; the harness judges ownership). */
async function seedCredential(db: Db, ownerId: UserId, provider: ProviderDef): Promise<UserCredentialId> {
  await db.insert(userCredentials).values({ id: CREDENTIAL, ownerId, provider: provider.id, ciphertext: "ct", iv: "iv", tag: "tag" });
  return CREDENTIAL;
}

/** The add-time fields each auth kind needs: a URL for an endpoint, a key for a hosted row, and a model the
 *  provider's catalog admits (a closed built-in catalog admits only what it runs). */
async function addFields(
  db: Db,
  ownerId: UserId,
  provider: ProviderDef,
): Promise<{ readonly baseUrl: string | null; readonly credentialId: UserCredentialId | null; readonly model: string }> {
  const hosted = provider.auth === "apiKey" || provider.auth === "oauthToken";
  return {
    baseUrl: provider.auth === "endpoint" ? BYO_BASE_URL : null,
    credentialId: hosted ? await seedCredential(db, ownerId, provider) : null,
    model: provider.catalog === "builtin" ? LOCAL_LIGHT_SEED_ROWS[0].model : "matrix-model",
  };
}

/** Each routable task's answer at the door: `accepted`, or the refusal's code. */
function expectedOutcomes(accepted: readonly RoutableTask[]): Record<string, string> {
  return Object.fromEntries(ROUTABLE_TASKS.map((task) => [task, accepted.includes(task) ? "accepted" : CONNECTION_OP_CODES.taskUnservable]));
}

describe("the provider-by-task acceptance matrix", () => {
  test("the table names every built-in provider, and nothing else", () => {
    expect([...ACCEPTANCE.keys()].toSorted()).toEqual(BUILTIN_PROVIDERS.map((provider) => provider.id as string).toSorted());
  });

  for (const provider of BUILTIN_PROVIDERS) {
    for (const kind of MODEL_KINDS) {
      const accepted = ACCEPTANCE.get(provider.id)?.[kind] ?? [];
      test(`${provider.id} × ${kind}: the add is accepted, and the bindings accept ${accepted.length === 0 ? "nothing" : accepted.join(", ")}`, async () => {
        const db = await freshDb();
        const h = await makeHarness(db, { localLight: provider.catalog === "builtin", claudeExecutable: "/usr/bin/claude" });
        const owner = await seedOwner(db);
        const fields = await addFields(db, owner.userId, provider);
        // Background work on, so a refusal can only be the task's servability, never `canFund`.
        const row = await h.svc.create({ principal: owner.principal, providerId: provider.id, ...fields, declared: { kind }, allowBackground: true });

        const outcomes: Record<string, string> = {};
        for (const task of ROUTABLE_TASKS) {
          outcomes[task] = await h.svc.setBinding({ principal: owner.principal, task, connectionId: row.id }).then(
            (): string => "accepted",
            (err: unknown): string => (err as { readonly code?: string }).code ?? String(err),
          );
        }
        expect(outcomes).toEqual(expectedOutcomes(accepted));
      });
    }
  }
});
