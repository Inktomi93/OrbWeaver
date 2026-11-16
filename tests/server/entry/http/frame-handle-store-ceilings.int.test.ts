// @subject packages/server/src/entry/http/frame-handle-store.ts
// The frame-handle store's ceilings, through the real card-frame mint and serve: a screen of ten-split replies fits
// one viewer with no eviction; an account that floods past its byte or count ceiling evicts only its own oldest
// frames and never another member's; past the process ceiling the oldest frame of any account goes first; and a
// foreign, unknown or expired handle answers the one miss document.
import { CARD_FRAME_ROUTE, cardFrameMintRequestSchema, cardFrameMintResponseSchema, cardFrameUrl } from "@orb/contracts/chat";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { buildCardFrameDocument } from "@orb/kit/card-frame";
import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { AuthModeRoot, SignedIn } from "@orb/testkit/node/auth";
import { createAuthModeRoot, mintMember, ownerSubject, signIn } from "@orb/testkit/node/auth";
import { CARD_FRAME_CEILINGS, FRAME_HANDLE_TTL_MS } from "#server/entry/http/frame-handle-store.ts";

type Headers = SignedIn["headers"];
type Dimension = "bytes" | "entries";

// The largest html the mint schema admits: one flood document is as big as a caller can make it.
const MAX_HTML = cardFrameMintRequestSchema.shape.html.maxLength ?? 0;
const MISS = 404;
const OK = 200;
const { userBytes, userEntries, totalBytes, totalEntries } = CARD_FRAME_CEILINGS;

// The stored documents of one ten-split reply, measured on the public Sola V4 preset's sizes through the real
// transcript and mint: six runs that hold a panel and five that hold prose, each carrying the others' stylesheets.
const TEN_SPLIT_RUN_BYTES = [...Array.from({ length: 6 }, () => 177_309), ...Array.from({ length: 5 }, () => 158_823)] as const;
// The framed rows one viewer's screen is sized for: the visible rows, the rows past each edge, and the card rows kept
// mounted.
const SCREEN_ROWS = 16;
const SCREEN_DOCUMENTS = SCREEN_ROWS * TEN_SPLIT_RUN_BYTES.length;
const SCREEN_BYTES = SCREEN_ROWS * TEN_SPLIT_RUN_BYTES.reduce((sum, bytes) => sum + bytes, 0);
// What one reading account holds in the process cases: two such screens.
const SCREENS_PER_ACCOUNT = 2;

// The stored bytes the route's document adds around a mint that carries html alone.
const DOCUMENT_OVERHEAD = Buffer.byteLength(
  buildCardFrameDocument({ html: "", css: undefined, themeTokens: undefined, styleTokens: undefined, fontFamily: undefined, rootAttributes: undefined }),
  "utf8",
);
const MAX_DOCUMENT_BYTES = MAX_HTML + DOCUMENT_OVERHEAD;
const MAXIMAL = "x".repeat(MAX_HTML);
const TINY = "<p>.</p>";

/** A batch of equal documents one account mints. */
interface Batch {
  readonly html: string;
  readonly count: number;
}

// One account's flood past its own ceiling: maximal documents past the byte ceiling, or the smallest ones past the
// count ceiling.
const FLOODS: { readonly [Key in Dimension]: Batch } = {
  bytes: { html: MAXIMAL, count: Math.ceil(userBytes / MAX_HTML) + 1 },
  entries: { html: TINY, count: userEntries + 1 },
};

// One reading account's load in the process cases: the bytes of two screens as maximal documents, or the count of two
// screens' documents as the smallest ones.
const LOADS: { readonly [Key in Dimension]: Batch & { readonly accountsToFill: number } } = {
  bytes: (() => {
    const count = Math.ceil((SCREENS_PER_ACCOUNT * SCREEN_BYTES) / MAX_HTML);
    return { html: MAXIMAL, count, accountsToFill: Math.floor(totalBytes / (count * MAX_DOCUMENT_BYTES)) };
  })(),
  entries: (() => {
    const count = SCREENS_PER_ACCOUNT * SCREEN_DOCUMENTS;
    return { html: TINY, count, accountsToFill: Math.floor(totalEntries / count) };
  })(),
};

async function mint(root: AuthModeRoot, headers: Headers, html: string): Promise<string> {
  const body = { chatId: root.idSource.typeId(ID_PREFIX.chat), characterId: null, html };
  const response = await root.http.request(CARD_FRAME_ROUTE, {
    method: "POST",
    headers: { ...headers, [CSRF_HEADER]: "1", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(OK);
  return cardFrameMintResponseSchema.parse(await response.json()).url;
}

async function mintEach(root: AuthModeRoot, headers: Headers, batch: Batch): Promise<string[]> {
  const urls: string[] = [];
  for (let index = 0; index < batch.count; index += 1) {
    urls.push(await mint(root, headers, batch.html));
  }
  return urls;
}

/** One viewer's screen of ten-split replies, at the measured document sizes. */
async function mintScreen(root: AuthModeRoot, headers: Headers): Promise<string[]> {
  const urls: string[] = [];
  for (let row = 0; row < SCREEN_ROWS; row += 1) {
    for (const bytes of TEN_SPLIT_RUN_BYTES) {
      urls.push(await mint(root, headers, "x".repeat(bytes - DOCUMENT_OVERHEAD)));
    }
  }
  return urls;
}

async function fetched(root: AuthModeRoot, headers: Headers, url: string): Promise<{ readonly status: number; readonly body: string }> {
  const response = await root.http.request(url, { headers });
  return { status: response.status, body: await response.text() };
}

async function served(root: AuthModeRoot, headers: Headers, url: string): Promise<number> {
  return (await fetched(root, headers, url)).status;
}

/** How many of `urls` serve, and how many answer the miss. */
async function tally(root: AuthModeRoot, headers: Headers, urls: readonly string[]): Promise<{ readonly ok: number; readonly miss: number }> {
  let ok = 0;
  let miss = 0;
  for (const url of urls) {
    const status = await served(root, headers, url);
    ok += status === OK ? 1 : 0;
    miss += status === MISS ? 1 : 0;
  }
  return { ok, miss };
}

async function signedInMember(root: AuthModeRoot): Promise<SignedIn> {
  return await signIn(root, await mintMember(root));
}

test("a screen of ten-split replies mints with no eviction", { tags: ["slow"] }, async () => {
  await using root = await createAuthModeRoot("local");
  const viewer = await signIn(root, await ownerSubject(root));
  const screen = await mintScreen(root, viewer.headers);
  expect(await tally(root, viewer.headers, screen)).toEqual({ ok: SCREEN_DOCUMENTS, miss: 0 });
});

test.for(["bytes", "entries"] as const)(
  "an account holding a ten-split screen that floods past its %s ceiling evicts only its own oldest frames",
  { tags: ["slow"] },
  async (dimension) => {
    await using root = await createAuthModeRoot("local");
    const owner = await signIn(root, await ownerSubject(root));
    const member = await signedInMember(root);
    const memberOpen = await mint(root, member.headers, "<p>the member's open reply</p>");
    const screen = await mintScreen(root, owner.headers);
    // Positive control: the whole screen still serves, so the miss below is the flood's doing.
    expect(await tally(root, owner.headers, screen)).toEqual({ ok: SCREEN_DOCUMENTS, miss: 0 });
    const flood = await mintEach(root, owner.headers, FLOODS[dimension]);
    expect(await served(root, owner.headers, screen[0] ?? "")).toBe(MISS);
    expect([await served(root, owner.headers, flood.at(-1) ?? ""), await served(root, member.headers, memberOpen)]).toEqual([OK, OK]);
  },
);

test.for(["bytes", "entries"] as const)(
  "past the process %s ceiling the oldest frame of any account goes first and each account's newest still serves",
  { tags: ["slow"] },
  async (dimension) => {
    await using root = await createAuthModeRoot("local");
    const load = LOADS[dimension];
    const accounts = [await signIn(root, await ownerSubject(root))];
    while (accounts.length < load.accountsToFill) {
      accounts.push(await signedInMember(root));
    }
    const minted: string[][] = [];
    for (const account of accounts) {
      minted.push(await mintEach(root, account.headers, load));
    }
    const [first] = accounts;
    const oldest = minted[0]?.[0] ?? "";
    // Positive control: as many reading accounts as the process holds, and nothing has gone.
    expect(await served(root, first?.headers ?? {}, oldest)).toBe(OK);
    const late = await signedInMember(root);
    const lateUrls = await mintEach(root, late.headers, load);
    expect(await served(root, first?.headers ?? {}, oldest)).toBe(MISS);
    const newest: number[] = [];
    for (const [index, account] of accounts.entries()) {
      newest.push(await served(root, account.headers, minted[index]?.at(-1) ?? ""));
    }
    newest.push(await served(root, late.headers, lateUrls.at(-1) ?? ""));
    expect(newest).toEqual(Array.from({ length: accounts.length + 1 }, () => OK));
  },
);

test("a foreign, unknown or expired handle answers the same miss document", async () => {
  await using root = await createAuthModeRoot("local");
  const owner = await signIn(root, await ownerSubject(root));
  const member = await signedInMember(root);
  const url = await mint(root, owner.headers, "<p>the owner's reply</p>");
  const own = await fetched(root, owner.headers, url);
  const foreign = await fetched(root, member.headers, url);
  const unknown = await fetched(root, owner.headers, cardFrameUrl("0".repeat(url.split("/").at(-1)?.length ?? 0)));
  root.clock.advance(FRAME_HANDLE_TTL_MS);
  const expired = await fetched(root, owner.headers, url);
  // Positive control: the owner's own serve is the document, not the miss.
  expect(own.status).toBe(OK);
  expect(foreign.body).not.toBe(own.body);
  expect([foreign.status, unknown.status, expired.status]).toEqual([MISS, MISS, MISS]);
  expect(unknown.body).toBe(foreign.body);
  expect(expired.body).toBe(foreign.body);
});

test("one account's flood of tiny frames evicts its own oldest frame and leaves another member's open", { tags: ["slow"] }, async () => {
  await using root = await createAuthModeRoot("local");
  const owner = await signIn(root, await ownerSubject(root));
  const member = await signedInMember(root);
  const memberOpen = await mint(root, member.headers, "<p>the member's open reply</p>");
  const ownerFirst = await mint(root, owner.headers, "<p>the owner's first reply</p>");
  expect(await served(root, member.headers, memberOpen)).toBe(OK);
  // More handles than the whole process holds, each a few bytes: only a per-account count ceiling keeps the
  // member's frame.
  await mintEach(root, owner.headers, { html: TINY, count: totalEntries + 1 });
  expect(await served(root, owner.headers, ownerFirst)).toBe(MISS);
  expect(await served(root, member.headers, memberOpen)).toBe(OK);
});
