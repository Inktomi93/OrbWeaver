// "Add another model on this key" (inference program §5.3a): which saved rows offer the action, and in whose
// words. The failure this guards is an action that cannot work — a hosted row whose key is gone has no
// catalog to list and nothing to share — and an action that names a key the row does not have.

import { PROVIDER_AUTHS } from "@orb/contracts/inference";
import {
  addModelActionGloss,
  addModelActionLabel,
  addModelScope,
  validateAddModelOnKey,
} from "../../../../../packages/client/src/features/credentials/lib/add-model-on-key-form-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const KEY_ID = "user_credential_ctaddmodel01";

test("every auth kind decides its scope, with and without a key", () => {
  const scopes = PROVIDER_AUTHS.map((auth) => [auth, addModelScope({ auth, credentialId: KEY_ID }), addModelScope({ auth, credentialId: null })]);
  expect(scopes).toEqual([
    ["apiKey", "key", null],
    ["oauthToken", "key", null],
    ["endpoint", "key", "server"],
    ["none", "builtin", "builtin"],
  ]);
});

test("the key scope is §5.3a's string verbatim, and every gloss names the provider", () => {
  expect(addModelActionLabel("key")).toBe("Add another model on this key");
  expect(addModelActionGloss("key", "OpenRouter")).toBe("A new connection on OpenRouter with the same key — you only pick the model.");
  expect(addModelActionGloss("server", "vLLM")).toContain("vLLM");
  expect(addModelActionGloss("builtin", "Built-in (this device)")).toContain("Built-in (this device)");
});

test("the dialog refuses to submit without a model, and a whitespace id is no model", () => {
  expect(validateAddModelOnKey({ model: "  ", label: "", allowBackground: false })).toEqual({ fields: { model: "Pick a model or type its id." } });
  expect(validateAddModelOnKey({ model: "qwen/qwen3-32b", label: "", allowBackground: false })).toBeUndefined();
});
