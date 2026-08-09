// entry/http/card-frame — the trust-gated card-frame doorway. A REAL Hono app runs the registrar so every
// assertion is about the response a browser receives (status, headers, body), not an internal object.
//
// What these pin, in the order an attacker would try them:
//   1. no session → nothing (mint and serve both 401)
//   2. no CSRF header → the mint is refused
//   3. ANOTHER user's handle → 404, indistinguishable from a handle that never existed
//   4. the client cannot assert its own policy — it names a character, the SERVER reads that character's
//      renderPolicy off the membership-gated roster
//   5. the deployment ceiling beats a per-character allow (tighten-only)
//   6. a non-member selector (the roster read throws) → the safe floor, never an open frame
//   7. the served document carries `sandbox` + `frame-ancestors 'self'` — the isolation is a property of
//      the RESPONSE, so a direct top-level navigation is opaque-origin too

import type { ParticipantView, RenderPolicy } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import { CSRF_HEADER } from "@orb/contracts/identity";
import type { CharacterId, ChatId, ChatParticipantId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { CardFrameDeps, PrincipalEnv } from "@orb/server/entry/http";
import { registerCardFrame } from "@orb/server/entry/http";
import { Hono } from "hono";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

// REAL TypeIDs: the mint contract brands both selectors (`typeIdSchema`), so a placeholder like "chat_1"
// is now a 400 rather than a floor — the shapes here are what a live client actually sends.
const CHAT = castId<ChatId>("chat_01h455vb4pex5vsknk084sn02q");
const TRUSTED = castId<CharacterId>("character_01h455vb4pex5vsknk084sn02r");
const UNTRUSTED = castId<CharacterId>("character_01h455vb4pex5vsknk084sn02s");
const GHOST = castId<CharacterId>("character_01h455vb4pex5vsknk084sn02t");

function principal(id: string): Principal {
  return { userId: castId<UserId>(id), role: "owner", handle: castId<Handle>(id), externalId: null, via: "fallback" };
}
const ALICE = principal("usr_alice");
const MALLORY = principal("usr_mallory");

function participant(characterId: CharacterId, renderPolicy: RenderPolicy): ParticipantView {
  // Only the two fields the doorway reads are meaningful; the rest is the row's required shape, spelled
  // out rather than cast so a NEW required field REDs this file instead of being silently fabricated.
  return {
    id: castId<ChatParticipantId>("chat_participant_01h455vb4pex5vsknk084sn02q"),
    chatId: CHAT,
    kind: "character",
    userId: null,
    characterId,
    role: "member",
    activePersonaId: null,
    talkativeness: 0.5,
    disabled: false,
    joinedAt: 0,
    joinSeq: 0,
    leftSeq: null,
    joinHistoryVisibility: "full",
    displayName: "X",
    handle: null,
    avatarAssetId: null,
    avatarHash: null,
    renderPolicy,
  };
}

const ROSTER: readonly ParticipantView[] = [
  participant(TRUSTED, { trustHtml: true, forbidExternalMedia: false }),
  participant(UNTRUSTED, { trustHtml: false, forbidExternalMedia: true }),
];

interface Harness {
  readonly mint: (body: unknown, opts?: { readonly csrf?: boolean; readonly as?: Principal | null }) => Promise<Response>;
  readonly serve: (url: string, as?: Principal | null) => Promise<Response>;
}

function harness(overrides: { readonly deployExternal?: boolean; readonly roster?: () => Promise<readonly ParticipantView[]> } = {}): Harness {
  let actor: Principal | null = ALICE;
  const deps: CardFrameDeps = {
    roster: { listParticipants: overrides.roster ?? ((): Promise<readonly ParticipantView[]> => Promise.resolve(ROSTER)) },
    allowExternalMedia: () => overrides.deployExternal ?? true,
    now: () => 1_000_000,
  };
  const app = new Hono<PrincipalEnv>();
  app.use("*", async (c, next) => {
    c.set("principal", actor);
    await next();
  });
  registerCardFrame(app, deps);
  return {
    mint: async (body, opts = {}): Promise<Response> => {
      actor = opts.as ?? ("as" in opts ? null : ALICE);
      return await app.request("/api/card-frame", {
        method: "POST",
        headers: opts.csrf === false ? { "Content-Type": "application/json" } : { [CSRF_HEADER]: "1", "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    },
    serve: async (url, as = ALICE): Promise<Response> => {
      actor = as;
      return await app.request(url);
    },
  };
}

const CARD = { chatId: CHAT, characterId: TRUSTED, html: "<p>a sealed letter</p>" };

async function mintUrl(h: Harness, body: unknown = CARD): Promise<string> {
  const res = await h.mint(body);
  expect(res.status).toBe(200);
  return ((await res.json()) as { url: string }).url;
}

describe("card-frame — the credential gates", () => {
  test("an anonymous caller can neither mint nor serve", async () => {
    const h = harness();
    expect((await h.mint(CARD, { as: null })).status).toBe(401);
    expect((await h.serve("/api/card-frame/0123456789abcdef0123456789abcdef", null)).status).toBe(401);
  });

  test("the mint refuses without the CSRF header — a cross-site form POST cannot set one", async () => {
    const res = await harness().mint(CARD, { csrf: false });
    expect(res.status).toBe(403);
  });

  test("ANOTHER user's handle 404s, exactly like one that never existed", async () => {
    const h = harness();
    const url = await mintUrl(h);
    // The victim's own request works…
    expect((await h.serve(url, ALICE)).status).toBe(200);
    // …and the identical URL, handed to an attacker, is indistinguishable from a bogus one.
    const stolen = await h.serve(url, MALLORY);
    const bogus = await h.serve("/api/card-frame/ffffffffffffffffffffffffffffffff", MALLORY);
    expect(stolen.status).toBe(404);
    expect(bogus.status).toBe(404);
    expect(await stolen.text()).toBe(await bogus.text());
  });

  test("a malformed handle never reaches the store", async () => {
    const h = harness();
    const shapes = ["../../etc/passwd", "ABCDEF0123456789abcdef0123456789", "short", ""];
    const results = await Promise.all(shapes.map(async (id) => [id, (await h.serve(`/api/card-frame/${id}`)).status] as const));
    for (const [id, status] of results) {
      expect(status, id).not.toBe(200);
    }
  });

  test("a body that is not a valid mint is refused, unknown keys included", async () => {
    const h = harness();
    expect((await h.mint({ chatId: CHAT, characterId: TRUSTED })).status).toBe(400); // no html
    expect((await h.mint({ ...CARD, html: "x".repeat(64_001) })).status).toBe(400); // over the cap
    expect((await h.mint({ ...CARD, trustHtml: true })).status).toBe(400); // strictObject: no smuggled policy
  });
});

describe("card-frame — the server owns the policy", () => {
  async function cspFor(h: Harness, body: unknown): Promise<string> {
    const res = await h.serve(await mintUrl(h, body));
    expect(res.status).toBe(200);
    return res.headers.get("content-security-policy") ?? "";
  }

  test("a TRUSTED character opens the door: data: on img/media — the doorway's whole point", async () => {
    const csp = await cspFor(harness(), CARD);
    expect(csp).toContain("img-src 'self' data: https:");
    expect(csp).toContain("media-src 'self' data: https:");
  });

  test("an UNTRUSTED character gets the floor from the SAME request shape — only the selector changed", async () => {
    const csp = await cspFor(harness(), { ...CARD, characterId: UNTRUSTED });
    expect(csp).toContain("img-src 'self';");
    expect(csp).not.toContain("data:");
  });

  test("a null selector, an unknown character, and a non-member chat all resolve to the floor", async () => {
    const h = harness();
    const thrower = harness({ roster: () => Promise.reject(new Error("not a participant")) });
    const policies = await Promise.all([cspFor(h, { ...CARD, characterId: null }), cspFor(h, { ...CARD, characterId: GHOST }), cspFor(thrower, CARD)]);
    for (const csp of policies) {
      expect(csp).toContain("img-src 'self';");
      expect(csp).not.toContain("data:");
      expect(csp).not.toContain("https:");
    }
  });

  test("the DEPLOYMENT ceiling beats a per-character allow — tighten-only, re-applied at this boundary", async () => {
    // The trusted character's own row says external media is fine; the deployment says no.
    const csp = await cspFor(harness({ deployExternal: false }), CARD);
    expect(csp).not.toContain("https:");
    // …and the trust axis is INDEPENDENT: blocking external media does not revoke the data: grant.
    expect(csp).toContain("img-src 'self' data:;");
  });
});

describe("card-frame — the served document", () => {
  test("carries the response-level sandbox + frame-ancestors, so a DIRECT navigation is opaque-origin too", async () => {
    const h = harness();
    const res = await h.serve(await mintUrl(h));
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp.startsWith("sandbox;")).toBe(true);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("base-uri 'none'");
    // No script source is nameable at all — `default-src 'none'` covers script-src, and nothing widens it.
    expect(csp).not.toContain("script-src");
    expect(csp).not.toContain("unsafe-inline'; script");
  });

  test("is html, un-sniffable, un-cached, and referrer-free", async () => {
    const h = harness();
    const res = await h.serve(await mintUrl(h));
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await res.text()).toContain("<p>a sealed letter</p>");
  });

  test("the MISS arm is policied too — a 404 frame is never an un-headered document", async () => {
    const res = await harness().serve("/api/card-frame/ffffffffffffffffffffffffffffffff");
    expect(res.status).toBe(404);
    expect(res.headers.get("content-security-policy") ?? "").toContain("sandbox;");
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
  });

  test("hostile theme tokens are re-clamped SERVER-side — the client's clamp is not why the document is safe", async () => {
    const h = harness();
    const url = await mintUrl(h, {
      ...CARD,
      themeTokens: { "--sandbox-bg": "#101014", "--evil": "red}</style><script>alert(1)</script>" },
      fontFamily: "Inter; } body { background: url(https://evil/)",
    });
    const body = await (await h.serve(url)).text();
    expect(body).toContain("--sandbox-bg: #101014;");
    expect(body).not.toContain("<script>");
    expect(body).not.toContain("alert(1)");
    expect(body).toContain("font-family: sans-serif;");
  });

  test("the response echoes what was GRANTED, so the client never infers a verdict it did not get", async () => {
    const granted = async (body: unknown): Promise<unknown> => ((await (await harness().mint(body)).json()) as { granted: unknown }).granted;
    expect(await granted(CARD)).toEqual({ externalMedia: true, inlineData: true });
    expect(await granted({ ...CARD, characterId: UNTRUSTED })).toEqual({ externalMedia: false, inlineData: false });
  });
});
