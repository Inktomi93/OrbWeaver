import { engineAdoptionMismatch } from "@orb/tooling/stack";
import { expect, test } from "../../support/tool-fixtures.ts";

const MODEL_MISMATCH_RE = /model mismatch/u;
const CAPABILITY_MISMATCH_RE = /capability mismatch/u;

test("engine adoption proves both served model identity and role capability", () => {
  expect(engineAdoptionMismatch("embed", ["embed-model"], { modelIds: ["embed-model"], paths: ["/v1/embeddings"] })).toBeNull();
  expect(engineAdoptionMismatch("embed", ["embed-model"], { modelIds: ["foreign-model"], paths: ["/v1/embeddings"] })).toMatch(MODEL_MISMATCH_RE);
  expect(engineAdoptionMismatch("embed", ["embed-model"], { modelIds: ["embed-model"], paths: ["/v1/chat/completions"] })).toMatch(CAPABILITY_MISMATCH_RE);
});
