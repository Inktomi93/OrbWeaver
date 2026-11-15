// @subject packages/server/src/entry/http/frame-handle-store.ts
// The frame-handle store's per-account byte and count ceilings, through the real card-frame mint and serve: one
// account flooding the store evicts its OWN oldest frames, never another member's open one.
import { CARD_FRAME_ROUTE, cardFrameMintRequestSchema, cardFrameMintResponseSchema } from "@orb/contracts/chat";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { AuthModeRoot } from "@orb/testkit/node/auth";
import { createAuthModeRoot, mintMember, ownerSubject, signIn } from "@orb/testkit/node/auth";

// The largest html the mint schema admits: one flood document is as big as a caller can make it.
const MAX_HTML = cardFrameMintRequestSchema.shape.html.maxLength ?? 0;
// Above the process-wide handle count, so a store without a per-account count lets one account evict another's.
const TINY_FLOOD = 1100;
const MISS = 404;
const OK = 200;

async function mint(root: AuthModeRoot, headers: Readonly<Record<string, string>>, html: string): Promise<string> {
  const body = { chatId: root.idSource.typeId(ID_PREFIX.chat), characterId: null, html };
  const response = await root.http.request(CARD_FRAME_ROUTE, {
    method: "POST",
    headers: { ...headers, [CSRF_HEADER]: "1", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(OK);
  return cardFrameMintResponseSchema.parse(await response.json()).url;
}

async function served(root: AuthModeRoot, headers: Readonly<Record<string, string>>, url: string): Promise<number> {
  const response = await root.http.request(url, { headers });
  await response.arrayBuffer();
  return response.status;
}

test("one account's flood of maximal frames evicts its own oldest frame and leaves another member's open", { tags: ["slow"] }, async () => {
  await using root = await createAuthModeRoot("local");
  const owner = await signIn(root, await ownerSubject(root));
  const member = await signIn(root, await mintMember(root));
  const ownerFirst = await mint(root, owner.headers, "<p>the owner's open reply</p>");
  const memberOpen = await mint(root, member.headers, "<p>the member's open reply</p>");
  // Positive control: both serve before the flood, so a later miss is the eviction's doing.
  expect(await served(root, owner.headers, ownerFirst)).toBe(OK);
  expect(await served(root, member.headers, memberOpen)).toBe(OK);
  const flood = "x".repeat(MAX_HTML);
  const floodUrls: string[] = [];
  // Enough maximal documents to pass any one account's ceiling several times over.
  for (let index = 0; index < 48; index += 1) {
    floodUrls.push(await mint(root, owner.headers, flood));
  }
  expect(await served(root, owner.headers, ownerFirst)).toBe(MISS);
  expect(await served(root, owner.headers, floodUrls.at(-1) ?? "")).toBe(OK);
  expect(await served(root, member.headers, memberOpen)).toBe(OK);
});

test("one account's flood of tiny frames evicts its own oldest frame and leaves another member's open", { tags: ["slow"] }, async () => {
  await using root = await createAuthModeRoot("local");
  const owner = await signIn(root, await ownerSubject(root));
  const member = await signIn(root, await mintMember(root));
  const memberOpen = await mint(root, member.headers, "<p>the member's open reply</p>");
  const ownerFirst = await mint(root, owner.headers, "<p>the owner's first reply</p>");
  expect(await served(root, member.headers, memberOpen)).toBe(OK);
  // More handles than the whole process holds, each a few bytes: only a count ceiling can refuse them.
  for (let index = 0; index < TINY_FLOOD; index += 1) {
    await mint(root, owner.headers, "<p>.</p>");
  }
  expect(await served(root, owner.headers, ownerFirst)).toBe(MISS);
  expect(await served(root, member.headers, memberOpen)).toBe(OK);
});
