// @instrument-proof: #2448 — the density-preview twin's persistence guard read the settings mutation's POST
// body as an ARRAY (`Array.isArray(body) ? body[0] : null`). A tRPC `httpBatchLink` body is never an array:
// `arrayToDict` (@trpc/client 11.18.0, dist/httpUtils-BNq9QC3d.mjs:24-38) posts `{"0": input}`, keyed by the
// procedure's POSITION in the comma-joined path, and this stack runs no transformer so there is no
// `{json:…}` envelope either. The guard therefore published `section=null density=null` on a body carrying
// both, `persistence-isolation` failed at both matrix endpoints, and the null read exactly like "the client
// posted no section" — a false accusation against the app, from the instrument.
//
// @instrument-absence-proof: the ARRAY arm below is the OLD reader's premise, planted deliberately. It must
// now come back as `unreadable:array` rather than as a silent pair of nulls — that is the whole difference
// between "the reader could not shape this body" and "the app sent nothing", and it is the distinction whose
// absence cost the diagnosis. The multi-procedure arm is the second control: a batch window can fold another
// call into the same request, so index 0 is an assumption, not a fact.
import type { MutationRequestRead } from "../../../../tooling/src/snap/ops/appearance-density-persistence.ts";
import { readMutationInput } from "../../../../tooling/src/snap/ops/appearance-density-persistence.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const PROCEDURE = "settings.updateUserSettingsSection";
const ORIGIN = "http://127.0.0.1:5273";
const APPEARANCE_INPUT = { section: "appearance", patch: { density: "comfortable" } } as const;

/** The two members `readMutationInput` reads, and nothing else. The reader takes the STRUCTURAL port rather
 *  than Playwright's `Request`, so this is a real value of the parameter's own type — not a double-cast
 *  fabrication that would survive the vendor class growing a required member. */
function request(path: string, body: unknown): MutationRequestRead {
  return {
    url: (): string => `${ORIGIN}/api/trpc/${path}?batch=1`,
    postDataJSON: (): unknown => body,
  };
}

test("the batched tRPC dict is read at the procedure's own position", () => {
  const single = readMutationInput(request(PROCEDURE, { "0": APPEARANCE_INPUT }));
  expect(single.shape).toBe("batch[0]");
  expect(single.input?.["section"]).toBe("appearance");

  // A batch window that folded another call in FIRST: the dict key is the path position, not zero.
  const folded = readMutationInput(request(`chat.listRooms,${PROCEDURE}`, { "0": { cursor: null }, "1": APPEARANCE_INPUT }));
  expect(folded.shape).toBe("batch[1]");
  expect(folded.input?.["section"]).toBe("appearance");
});

test("an unbatched body is read as itself", () => {
  const bare = readMutationInput(request(PROCEDURE, APPEARANCE_INPUT));
  expect(bare.shape).toBe("bare");
  expect(bare.input?.["section"]).toBe("appearance");
});

test("a body the reader cannot shape says so instead of returning nulls", () => {
  // PLANTED CONTROL — the OLD reader's premise. Under it this arm was the only readable one and every real
  // request fell through to null.
  const asArray = readMutationInput(request(PROCEDURE, [APPEARANCE_INPUT]));
  expect(asArray.shape).toBe("unreadable:array");
  expect(asArray.input).toBeNull();

  // An envelope nobody on this stack sends (superjson) is named by its own keys rather than mistaken for a
  // missing section — the reader reports what arrived.
  const enveloped = readMutationInput(request(PROCEDURE, { "0": { json: APPEARANCE_INPUT } }));
  expect(enveloped.shape).toBe("batch[0]");
  expect(enveloped.input?.["section"], "a superjson envelope carries no top-level section").toBeUndefined();

  const scalar = readMutationInput(request(PROCEDURE, "not-a-body"));
  expect(scalar.shape).toBe("unreadable:string");
  expect(scalar.input).toBeNull();
});
