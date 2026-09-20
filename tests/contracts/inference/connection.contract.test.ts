// contracts/inference/connection — the user's CONNECTION row and the per-actor BINDING row as they cross
// the boundary. Three things are load-bearing and pinned: a connection row carries NO SECRET (it names its
// credential by id, and a schema that let a `secret`/`apiKey` key survive would put a key on every wire that
// renders a row); the ids are prefix-validated so a foreign TypeID cannot ride in as a connection; and a
// binding whose `connectionId` is NULL — the SET-NULL state after its row was deleted — MUST still parse,
// because the binding survives as `no-connection` and a schema that refused it would make the pane
// unrenderable for exactly the user who just deleted a connection.

import { connectionBindingSchema, userConnectionSchema } from "@orb/contracts/inference";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "../../support/fixtures.ts";

const ROW = {
  id: mintTypeId(ID_PREFIX.userConnection),
  ownerId: "user_a",
  label: "My box",
  providerId: "custom-openai",
  credentialId: null,
  baseUrl: "http://127.0.0.1:8000/v1",
  model: "qwen3",
  api: "auto",
  declared: null,
  extras: null,
  transport: null,
  modelListed: true,
  allowBackground: false,
  createdAt: 1,
  updatedAt: 2,
};

test("a row round-trips and carries no secret — the credential is named by id", () => {
  const parsed = userConnectionSchema.parse({ ...ROW, secret: "sk-leak", apiKey: "sk-leak" });
  expect(parsed).not.toHaveProperty("secret");
  expect(parsed).not.toHaveProperty("apiKey");
  expect(parsed.credentialId).toBeNull();
});

test("the api is the closed union plus `auto`", () => {
  expect(userConnectionSchema.parse({ ...ROW, api: "chat-completions" }).api).toBe("chat-completions");
  expect(userConnectionSchema.parse({ ...ROW, api: "auto" }).api).toBe("auto");
  expect(userConnectionSchema.safeParse({ ...ROW, api: "telepathy" }).success).toBe(false);
});

test("a blank label or model is refused — neither is defaultable (F16: there is no default model)", () => {
  expect(userConnectionSchema.safeParse({ ...ROW, label: "" }).success).toBe(false);
  expect(userConnectionSchema.safeParse({ ...ROW, model: "" }).success).toBe(false);
});

test("a foreign TypeID cannot ride in as the row's id", () => {
  expect(userConnectionSchema.safeParse({ ...ROW, id: mintTypeId(ID_PREFIX.connectionBinding) }).success).toBe(false);
});

test("the JSON columns are nullable documents, and `transport` keeps its closed four-field shape", () => {
  const withDocs = userConnectionSchema.parse({
    ...ROW,
    extras: { temperature: 0.5 },
    transport: { headers: { "x-key": "v" }, excludeBody: ["top_k"] },
    declared: { kind: "embedding" },
  });
  expect(withDocs.extras).toEqual({ temperature: 0.5 });
  expect(withDocs.transport).toEqual({ headers: { "x-key": "v" }, excludeBody: ["top_k"] });
  expect(withDocs.declared).toMatchObject({ kind: "embedding" });
});

test("a binding with a NULL connection parses — the SET-NULL state the pane renders as `no-connection`", () => {
  const binding = {
    id: mintTypeId(ID_PREFIX.connectionBinding),
    actorKind: "user",
    userId: "user_a",
    ruleId: null,
    pluginId: null,
    task: "chat",
    connectionId: null,
  };
  expect(connectionBindingSchema.parse(binding).connectionId).toBeNull();
  expect(connectionBindingSchema.safeParse({ ...binding, task: "agent" }).success, "`agent` is not routable — it rides chat's binding").toBe(false);
});
