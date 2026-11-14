// A chat's import identity is the hash of its parsed content, and the bytes it hashes never change: every claim
// already stored in an owner's library must still match a re-import of the same file (D290). The hashes below were
// taken from the identity before it hashed in slices; the long transcript spans several slices.
// @subject packages/server/src/primitives/serde/chat/index.ts
// @subject packages/server/src/domain/chat/persistence/import-write.ts
import { createCharacterSchema } from "@orb/contracts/character";
import { chatImportClaims } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

const HANDLE = "lamp-keeper";
const SENT = "2025-07-19@12h00m01s";
const GOLDEN = {
  short: { messages: 3, importHash: "bb6819e1580bc78bfa03debf5b0bfe24329234ce18408d4230d85a98e7d1e7f0" },
  long: { messages: 6000, importHash: "aeec4a802de646047cd887353ffc4ffd3cad416a495ebaa1fd711f99a1ca9063" },
} as const;

// Accented and astral text and a second swipe, so the identity covers multi-byte encoding and variants.
function transcript(messages: number): Uint8Array {
  const lines = [`{"character_name":"${HANDLE}","user_name":"Nate","create_date":"${SENT}"}`];
  for (let turn = 0; turn < messages; turn += 1) {
    const user = turn % 2 === 0;
    lines.push(
      `{"name":"${user ? "Nate" : HANDLE}","is_user":${String(user)},"is_system":false,"mes":"ok ${String(turn)} \\u00e9\\ud83d\\ude00","send_date":"${SENT}","swipes":["ok ${String(turn)} \\u00e9\\ud83d\\ude00","other ${String(turn)}"],"swipe_id":0}`,
    );
  }
  return new TextEncoder().encode(lines.join("\n"));
}

for (const [size, golden] of Object.entries(GOLDEN)) {
  test(`a ${size} transcript claims its unchanged identity, and a re-import of it is a repeat`, async () => {
    await using root = await createServerHarness();
    const principal = await root.principalFor(root.ownerId);
    await root.services.character.create({ principal, input: createCharacterSchema.parse({ handle: HANDLE, name: HANDLE, description: "Keeps the lamp." }) });
    const descriptor = root.app.portability.find((entity) => entity.kind === "chat");
    if (descriptor === undefined) {
      throw new Error("the production chat import descriptor is missing");
    }
    const file = { filename: `${HANDLE}/${HANDLE} - 2025-07-19@12h00m00s.jsonl`, bytes: transcript(golden.messages) };

    expect(await descriptor.importFile(root.ownerId, file)).toMatchObject({ ok: true, created: true });
    const claims = await root.db.select({ importHash: chatImportClaims.importHash }).from(chatImportClaims);
    expect(claims).toEqual([{ importHash: golden.importHash }]);
    expect(await descriptor.importFile(root.ownerId, file)).toMatchObject({ ok: true, created: false });
  });
}
