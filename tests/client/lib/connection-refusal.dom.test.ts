// Entry: `connectionFieldRefusalOf` and `connectionEditorRefusalLine`, the readers the add form and the editor both say a
// connection write's refusal through. Layer: client lib (node, dom). Red: the editor line for a refusal of a control it has
// no picker for falling back to the add form's "pick" words, or the saved-key copy claiming a key is not the caller's
// when the server answers one code for a key that is foreign and for one that no longer exists.
import { connectionEditorRefusalLine, connectionFieldRefusalOf } from "@orb/client/lib";
import { CONNECTION_OP_CODES } from "@orb/contracts/inference";
import { expect, test } from "@orb/testkit/node";

const PICKS = /\bpick\b/iu;

function refusalOf(reason: string): NonNullable<ReturnType<typeof connectionFieldRefusalOf>> {
  const refusal = connectionFieldRefusalOf({ data: { code: "BAD_REQUEST", reason } });
  if (refusal === null) {
    throw new Error(`${reason} is a connection write refusal`);
  }
  return refusal;
}

test("the editor has no picker for the provider, the protocol or the saved key, so its line says what the editor can do", () => {
  for (const reason of [CONNECTION_OP_CODES.providerUnknown, CONNECTION_OP_CODES.apiIncoherent, CONNECTION_OP_CODES.credentialForeign]) {
    const refusal = refusalOf(reason);
    // The add form has those controls and says to pick; the editor does not.
    expect(refusal.copy).toMatch(PICKS);
    expect(connectionEditorRefusalLine(refusal, null)).not.toMatch(PICKS);
  }
});

test("the saved-key refusal is true for a key that is foreign and for one that no longer exists", () => {
  const { copy } = refusalOf(CONNECTION_OP_CODES.credentialForeign);
  expect(copy).not.toMatch(/\byours?\b/iu);
  expect(connectionEditorRefusalLine(refusalOf(CONNECTION_OP_CODES.credentialForeign), null)).not.toMatch(/\byours?\b/iu);
});

test("a refused field quotes the draft it dropped and says the saved value is back", () => {
  const refusal = refusalOf(CONNECTION_OP_CODES.baseUrlShape);
  const line = connectionEditorRefusalLine(refusal, "http://host:9999/v1");
  expect(line).toContain('"http://host:9999/v1"');
  expect(line).toContain(refusal.copy);
  expect(line).toMatch(/saved one is back/u);
});
