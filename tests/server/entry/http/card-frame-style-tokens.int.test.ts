// @subject packages/server/src/entry/http/card-frame.ts
// The routed card mint carries the closed style slice through the real HTTP entry: the served document's root
// reads the clamped values, a key or value outside the slice is refused at the mint, and the
// response policy is the same bytes it is without the slice.
import type { CardFrameMintResponse } from "@orb/contracts/chat";
import { CARD_FRAME_ROUTE, cardFrameMintResponseSchema } from "@orb/contracts/chat";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY, CSRF_HEADER } from "@orb/contracts/identity";
import { buildCardFrameCsp, CARD_FRAME_SAFE_FLOOR, CARD_FRAME_STYLE_TOKEN, cardFrameResponseHeaders } from "@orb/kit/card-frame";
import { FONT_SCALE_PERCENT } from "@orb/kit/font-scale";
import type { ChatId } from "@orb/kit/ids";
import { IN_RANGE_CARD_FRAME_STYLE } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

type Root = Awaited<ReturnType<typeof createServerHarness>>;

const HEADERS = { [CSRF_HEADER]: "1", "content-type": "application/json" } as const;
const POLICY = "content-security-policy";

interface Served {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

async function openRoot(): Promise<Root> {
  return await createServerHarness({ env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner" }, physicalPeer: () => "127.0.0.1" });
}

async function openChat(root: Root): Promise<ChatId> {
  const principal = await root.principalFor(root.ownerId);
  return (await root.services.chat.startChat({ principal, characterIds: [], opening: "none" })).chat.id;
}

async function postMint(root: Root, body: Record<string, unknown>): Promise<Response> {
  return await root.http.request(CARD_FRAME_ROUTE, { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
}

async function serve(root: Root, mint: CardFrameMintResponse): Promise<Served> {
  const response = await root.http.request(mint.url);
  return { status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() };
}

async function mintAndServe(root: Root, chatId: ChatId, extra: Record<string, unknown>): Promise<Served> {
  const minted = await postMint(root, { chatId, characterId: null, html: "<p>styled card</p>", ...extra });
  expect(minted.status).toBe(200);
  return await serve(root, cardFrameMintResponseSchema.parse(await minted.json()));
}

/** The production headers the null selector's document goes out with, read in the response's own casing. */
function floorHeaders(): Readonly<Record<string, string>> {
  return {
    ...Object.fromEntries(Object.entries(cardFrameResponseHeaders()).map(([name, value]) => [name.toLowerCase(), value])),
    [POLICY]: buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, "document", "static"),
  };
}

test("an in-range style slice reaches the served document's root unchanged", async () => {
  await using root = await openRoot();
  const chatId = await openChat(root);
  const served = await mintAndServe(root, chatId, { styleTokens: IN_RANGE_CARD_FRAME_STYLE });
  expect(served.status).toBe(200);
  for (const [name, value] of Object.entries(IN_RANGE_CARD_FRAME_STYLE)) {
    expect(served.body).toContain(`${name}: ${value};`);
  }
});

test("an out-of-range root size is served at the nearest bound of the appearance range", async () => {
  await using root = await openRoot();
  const chatId = await openChat(root);
  const { min, max } = FONT_SCALE_PERCENT;
  for (const [planted, bounded] of [
    ["400%", `${max}%`],
    ["10%", `${min}%`],
  ] as const) {
    const served = await mintAndServe(root, chatId, { styleTokens: { ...IN_RANGE_CARD_FRAME_STYLE, [CARD_FRAME_STYLE_TOKEN.rootSize]: planted } });
    expect(served.body).toContain(`${CARD_FRAME_STYLE_TOKEN.rootSize}: ${bounded};`);
    expect(served.body).not.toContain(planted);
  }
});

test("an extra style key or a CSS-bearing value is refused at the mint", async () => {
  await using root = await openRoot();
  const chatId = await openChat(root);
  const control = await postMint(root, { chatId, characterId: null, html: "<p>x</p>", styleTokens: IN_RANGE_CARD_FRAME_STYLE });
  expect(control.status).toBe(200);
  await control.arrayBuffer();
  for (const styleTokens of [
    { ...IN_RANGE_CARD_FRAME_STYLE, "--sandbox-accent": "12px" },
    { ...IN_RANGE_CARD_FRAME_STYLE, [CARD_FRAME_STYLE_TOKEN.radius]: "8px} </style><script>x()</script>" },
    { ...IN_RANGE_CARD_FRAME_STYLE, [CARD_FRAME_STYLE_TOKEN.monoFamily]: "Mono; } body { background: url(//evil.test) }" },
    { ...IN_RANGE_CARD_FRAME_STYLE, [CARD_FRAME_STYLE_TOKEN.monoFamily]: 'a"' },
  ]) {
    const refused = await postMint(root, { chatId, characterId: null, html: "<p>x</p>", styleTokens });
    expect(refused.status, JSON.stringify(styleTokens)).toBe(400);
    await refused.arrayBuffer();
  }
});

test("an unbalanced quote in the font family never reaches the served style block", async () => {
  await using root = await openRoot();
  const chatId = await openChat(root);
  const control = await mintAndServe(root, chatId, { fontFamily: "'Geist Mono', monospace" });
  expect(control.body).toContain("font-family: 'Geist Mono', monospace, sans-serif;");
  const served = await mintAndServe(root, chatId, { fontFamily: 'a"' });
  expect(served.body).toContain("font-family: sans-serif;");
  expect(served.body).not.toContain('a"');
});

test("the served policy, sandbox and script hash are the production floor bytes, with or without the slice", async () => {
  await using root = await openRoot();
  const chatId = await openChat(root);
  const bare = await mintAndServe(root, chatId, {});
  const styled = await mintAndServe(root, chatId, { styleTokens: IN_RANGE_CARD_FRAME_STYLE });
  // Both documents carry exactly the production floor headers; per-request timing and id headers differ by design.
  expect(bare.headers).toMatchObject(floorHeaders());
  expect(styled.headers).toMatchObject(floorHeaders());
  expect(styled.body).not.toBe(bare.body);
  // The height script stays the only script, so the pinned hash still covers every script in the document.
  expect(styled.body.split("<script")).toHaveLength(2);
  expect(styled.body.split("</style>")).toHaveLength(2);
});
