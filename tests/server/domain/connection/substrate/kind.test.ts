// substrate: `curatedKindOf` — the model KIND as the PANE needs it. It is shared by the list view and the
// bindings writer precisely so the two cannot disagree about which slots a row may take, so the PRECEDENCE
// is the whole contract: the row's own `declared.kind` wins over the curated table (the user's box is the
// truth about the user's box), and an unrecognised model returns `undefined` — NOT `generation` — because
// every caller supplies its own `?? "generation"` fallback and a default baked in here would hide the
// difference between "known to be a chat model" and "nothing is known".

import type { ProviderDef, ProviderId, UserConnection } from "@orb/contracts/inference";
import { builtinProvider } from "@orb/contracts/inference";
import type { UserConnectionId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { curatedKindOf } from "../../../../../packages/server/src/domain/connection/substrate/kind.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId } from "../../../../support/inference-identities.ts";

function provider(id: string): ProviderDef {
  const row = builtinProvider(id);
  if (row === undefined) {
    throw new Error(`no built-in provider ${id}`);
  }
  return row;
}

function connection(overrides: Partial<UserConnection> = {}): UserConnection {
  return {
    id: castId<UserConnectionId>("user_connection_000001"),
    ownerId: castId<UserId>("user_a"),
    label: "row",
    providerId: castId<ProviderId>("local-light"),
    credentialId: null,
    baseUrl: null,
    model: testModelId("jinaai/jina-clip-v2"),
    api: "auto",
    declared: null,
    extras: null,
    transport: null,
    modelCheck: "listed",
    allowBackground: false,
    promptCache: null,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
    ...overrides,
  };
}

test("the curated table answers a known model", () => {
  expect(curatedKindOf(connection(), provider("local-light"))).toBe("embedding");
});

test("the row's own `declared.kind` WINS over the curated table", () => {
  const declared = connection({ declared: { kind: "rerank" } });
  expect(curatedKindOf(declared, provider("local-light"))).toBe("rerank");
});

test("an unknown model answers `undefined`, never a defaulted `generation`", () => {
  const unknown = connection({
    providerId: castId<ProviderId>("custom-openai"),
    model: testModelId("some-private-finetune"),
    baseUrl: "http://127.0.0.1:18703/v1",
  });
  expect(curatedKindOf(unknown, provider("custom-openai"))).toBeUndefined();
});

test("the curated lookup is keyed on the PROVIDER too — a model id alone does not decide", () => {
  const sameModelElsewhere = connection({ providerId: castId<ProviderId>("custom-openai"), baseUrl: "http://127.0.0.1:18703/v1" });
  expect(curatedKindOf(sameModelElsewhere, provider("custom-openai"))).not.toBe("embedding");
});
