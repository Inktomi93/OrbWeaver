// @subject packages/server/src/entry/http/card-frame.ts
// One account may hold only a few card-frame mints whose bodies are still being read: past the bound the mint
// answers 429 before it buffers anything, and another account's mint is unaffected. Each held mint streams its
// body from a stream the test closes, so the mints are in flight together by construction.
import { CARD_FRAME_MINTS_IN_FLIGHT, CARD_FRAME_ROUTE } from "@orb/contracts/chat";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { AuthModeRoot } from "@orb/testkit/node/auth";
import { createAuthModeRoot, mintMember, ownerSubject, signIn } from "@orb/testkit/node/auth";

const OK = 200;
const TOO_MANY_REQUESTS = 429;

interface HeldMint {
  readonly response: Promise<Response>;
  readonly finish: () => void;
}

function heldMint(root: AuthModeRoot, headers: Readonly<Record<string, string>>): HeldMint {
  const body = new TextEncoder().encode(JSON.stringify({ chatId: root.idSource.typeId(ID_PREFIX.chat), characterId: null, html: "<p>held</p>" }));
  let close: (() => void) | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller): void {
      close = (): void => {
        controller.enqueue(body);
        controller.close();
      };
    },
  });
  const response = Promise.resolve(
    root.http.request(CARD_FRAME_ROUTE, {
      method: "POST",
      headers: { ...headers, [CSRF_HEADER]: "1", "content-type": "application/json" },
      body: stream,
      duplex: "half",
    }),
  );
  return { response, finish: (): void => close?.() };
}

test("an account past its in-flight mints is refused at once, and another account's mint still lands", async () => {
  await using root = await createAuthModeRoot("local");
  const owner = await signIn(root, await ownerSubject(root));
  const member = await signIn(root, await mintMember(root));
  const held = Array.from({ length: CARD_FRAME_MINTS_IN_FLIGHT }, () => heldMint(root, owner.headers));
  const refused = heldMint(root, owner.headers);
  expect((await refused.response).status).toBe(TOO_MANY_REQUESTS);
  const other = heldMint(root, member.headers);
  other.finish();
  expect((await other.response).status).toBe(OK);
  for (const mint of held) {
    mint.finish();
  }
  for (const mint of held) {
    const response = await mint.response;
    await response.arrayBuffer();
    expect(response.status).toBe(OK);
  }
  // The bound is on mints in flight, not on mints: with the held ones answered, the next lands.
  const next = heldMint(root, owner.headers);
  next.finish();
  expect((await next.response).status).toBe(OK);
});
