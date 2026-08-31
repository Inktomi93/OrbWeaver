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
//   7. the served document carries `sandbox allow-scripts` + `frame-ancestors 'self'` — the isolation is a
//      property of the RESPONSE, so a direct top-level navigation is opaque-origin too — and the ONLY
//      nameable script source is the hash of our height script (2026-08-16 tier-B pass, #91)

import type { ParticipantView, RenderPolicy } from "@orb/contracts/chat";
import { CARD_FRAME_MINT_BODY_MAX_BYTES } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { CARD_FRAME_HEIGHT_SCRIPT, CARD_FRAME_HEIGHT_SCRIPT_CSP_HASH } from "@orb/kit/card-frame";
import type { CharacterId, ChatId, ChatParticipantId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { CardFrameDeps, PrincipalEnv } from "@orb/server/entry/http";
import { registerCardFrame, securityHeaders } from "@orb/server/entry/http";
import { Hono } from "hono";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

// REAL TypeIDs: the mint contract brands both selectors (`typeIdSchema`), so a placeholder like "chat_1"
// is now a 400 rather than a floor — the shapes here are what a live client actually sends.
const CHAT = castId<ChatId>("chat_01h455vb4pex5vsknk084sn02q");
const TRUSTED = castId<CharacterId>("character_01h455vb4pex5vsknk084sn02r");
const UNTRUSTED = castId<CharacterId>("character_01h455vb4pex5vsknk084sn02s");
const GHOST = castId<CharacterId>("character_01h455vb4pex5vsknk084sn02t");
const INTERACTIVE = castId<CharacterId>("character_01h455vb4pex5vsknk084sn02v");

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
  participant(TRUSTED, { htmlTrust: "trusted", forbidExternalMedia: false }),
  participant(UNTRUSTED, { htmlTrust: "untrusted", forbidExternalMedia: true }),
  // #111 leg 1: the host put THIS character on the ladder's TOP rung. Deliberately identical to TRUSTED in
  // every other axis, so a diff between their two policies can only be the posture — which is how the
  // "no grant yet" test can compare them byte-for-byte. (Interactive IMPLIES trusted, so this seat also
  // holds the `data:` door: that is the ladder, not an accident of the fixture.)
  participant(INTERACTIVE, { htmlTrust: "interactive", forbidExternalMedia: false }),
];

interface Harness {
  readonly mint: (body: unknown, opts?: { readonly csrf?: boolean; readonly as?: Principal | null }) => Promise<Response>;
  readonly serve: (url: string, as?: Principal | null) => Promise<Response>;
}

function harness(
  overrides: {
    readonly deployExternal?: boolean;
    /** The #111 leg-3 deployment ceiling. Defaults TRUE here so the posture tests are about the posture;
     *  its SHIPPED floor is false, and the ceiling's own tests pass it explicitly. */
    readonly deployInteractive?: boolean;
    readonly roster?: () => Promise<readonly ParticipantView[]>;
    /** Mount the APP's own `securityHeaders` above the route, exactly as `entry/app.ts` does — the arm that
     *  proves the served document keeps ITS policy rather than the app's (added 2026-08-28 with #679 U7). */
    readonly withAppHeaders?: boolean;
  } = {},
): Harness {
  let actor: Principal | null = ALICE;
  const deps: CardFrameDeps = {
    participants: { listParticipants: overrides.roster ?? ((): Promise<readonly ParticipantView[]> => Promise.resolve(ROSTER)) },
    allowExternalMedia: () => overrides.deployExternal ?? true,
    allowInteractiveCards: () => overrides.deployInteractive ?? true,
    now: () => 1_000_000,
  };
  const app = new Hono<PrincipalEnv>();
  if (overrides.withAppHeaders === true) {
    app.use("*", securityHeaders({ dev: false, allowExternalMedia: () => overrides.deployExternal ?? true }));
  }
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

  test("the route cap admits the schema's largest escaped document", async () => {
    const res = await harness().mint({ ...CARD, html: '"'.repeat(64_000), css: '"'.repeat(16_000) });
    expect(res.status).toBe(200);
  });

  test("a body over the contract-derived byte ceiling is rejected before schema parsing", async () => {
    const res = await harness().mint({ ...CARD, padding: "x".repeat(CARD_FRAME_MINT_BODY_MAX_BYTES) });
    expect(res.status).toBe(413);
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
    // `allow-scripts` since the 2026-08-16 tier-B pass (#91) — and NEVER paired with `allow-same-origin`,
    // which is the combo that would let the frame reach the app origin and shed its own sandbox.
    expect(csp.startsWith("sandbox allow-scripts;")).toBe(true);
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("base-uri 'none'");
    // Exactly ONE script source is nameable: the hash of our height script (`@orb/kit/card-frame` owns the
    // digest + its recompute test). A card-authored script hashes differently and is refused.
    const scriptSrc = csp.split("; ").find((directive) => directive.startsWith("script-src "));
    expect(scriptSrc).toBe(`script-src ${CARD_FRAME_HEIGHT_SCRIPT_CSP_HASH}`);
    expect(scriptSrc).not.toContain("unsafe");
    // The served document carries that one script and no other.
    const body = await res.text();
    expect(body.split("<script>")).toHaveLength(2);
    expect(body).toContain(`<script>${CARD_FRAME_HEIGHT_SCRIPT}</script>`);
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
    expect(res.headers.get("content-security-policy") ?? "").toContain("sandbox allow-scripts;");
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
  });

  // ADDED 2026-08-28 (with #679 U7, which gave this exemption a second member). Every assertion above ran
  // WITHOUT the app's `securityHeaders` mounted, so none of them touched the mechanism that actually lets this
  // document keep its own policy: `hono/secure-headers` writes AFTER the handler with `.set()`, and only the
  // path exemption in `security-headers.ts` stops it overwriting everything the tests above assert. Same
  // mechanism, same blindness, so the sibling gets the same pin.
  test("with the APP middleware mounted above it, the document STILL carries the frame policy — not the app's", async () => {
    const h = harness({ withAppHeaders: true });
    const res = await h.serve(await mintUrl(h));
    const csp = res.headers.get("content-security-policy") ?? "";
    expect(csp.startsWith("sandbox allow-scripts;")).toBe(true);
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
    // The app policy's own fingerprints are what a lost exemption would substitute in.
    expect(csp).not.toContain("default-src 'self'");
    expect(csp).not.toContain("script-src 'self'");
    expect(csp).not.toContain("frame-ancestors 'none'");
    // …and the MINT (a JSON reply, not a document) is NOT exempted — it keeps the full app header set.
    const mint = await h.mint(CARD);
    expect(mint.status).toBe(200);
    expect(mint.headers.get("content-security-policy")).toContain("default-src 'self'");
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
    // "no script tags" stopped being the assertion when the routed arm gained its one hash-pinned height
    // script; "no script but OURS" is, and a smuggled one would fail the hash anyway.
    expect(body.split("<script>")).toHaveLength(2);
    expect(body).toContain(`<script>${CARD_FRAME_HEIGHT_SCRIPT}</script>`);
    expect(body).not.toContain("alert(1)");
    expect(body).toContain("font-family: sans-serif;");
  });

  test("the response echoes what was GRANTED, so the client never infers a verdict it did not get", async () => {
    const granted = async (body: unknown): Promise<unknown> => ((await (await harness().mint(body)).json()) as { granted: unknown }).granted;
    expect(await granted(CARD)).toEqual({ externalMedia: true, inlineData: true, interactive: false });
    expect(await granted({ ...CARD, characterId: UNTRUSTED })).toEqual({ externalMedia: false, inlineData: false, interactive: false });
  });
});

// ── THE INTERACTIVE-CARD GRANT (#111 legs 1+3) ───────────────────────────────────────────────────────────
// Leg 1 made the per-card SELECTION real while both postures emitted the same hash. The leg-3 security pass
// granted the capability: an interactive document's `script-src` is `'unsafe-inline'` and the card's own
// scripts run. Two consents are required — the host's per-character opt-in AND the deployment ceiling — and
// the ceiling is re-applied HERE as well as inside `resolveRenderPolicy`, so these test the boundary's own
// belt rather than the resolver's (the roster fixture hands this route an ALREADY-RESOLVED `interactive`
// rung; if this route trusted that alone, the `deployInteractive: false` arms below would leak).
//
// The leg-1 "byte-identical postures" pin lived here and is REPLACED, not deleted (a sanctioned assertion
// update — the grant is exactly what it guarded the absence of). What replaces it is stronger: the ruled
// delta asserted directive-by-directive, plus the kill-switch asserted in both directions.

describe("card-frame — the interactive-card grant", () => {
  const grantedFor = async (characterId: CharacterId, deployInteractive = true): Promise<{ interactive: boolean }> =>
    ((await (await harness({ deployInteractive }).mint({ ...CARD, characterId })).json()) as { granted: { interactive: boolean } }).granted;

  const cspFor = async (characterId: CharacterId, deployInteractive = true): Promise<string> => {
    const h = harness({ deployInteractive });
    const res = await h.serve(await mintUrl(h, { ...CARD, characterId }));
    return res.headers.get("content-security-policy") ?? "";
  };

  const scriptSrcOf = (csp: string): string | undefined => csp.split("; ").find((directive) => directive.startsWith("script-src "));

  test("an opted-in character mints through the INTERACTIVE arm; every other selector stays static", async () => {
    expect((await grantedFor(INTERACTIVE)).interactive).toBe(true);
    // The default (never opted in), the trusted-but-not-interactive card, and an unknown character.
    expect((await grantedFor(UNTRUSTED)).interactive).toBe(false);
    expect((await grantedFor(TRUSTED)).interactive).toBe(false);
    expect((await grantedFor(GHOST)).interactive).toBe(false);
  });

  test("the CLIENT cannot ask for the interactive arm — the mint body is a selector, and an extra key is a 400", async () => {
    // `strictObject`: naming the posture (or the policy) in the body is refused outright, so the only path
    // to `interactive` is the server's own read of the character's column.
    expect((await harness().mint({ ...CARD, interactive: true })).status).toBe(400);
    expect((await harness().mint({ ...CARD, interactiveHtml: true })).status).toBe(400);
  });

  test("THE GRANT: an interactive document's script-src is 'unsafe-inline' — and the hash does NOT ride along", async () => {
    expect(scriptSrcOf(await cspFor(INTERACTIVE))).toBe("script-src 'unsafe-inline'");
    // Measured (Chromium 149): a hash-source in the list makes 'unsafe-inline' IGNORED, so shipping both
    // would refuse the very scripts this grant exists to run. The engine owns that record; this is the
    // wire-level pin that the SERVED HEADER never regains a hash.
    const scriptSrc = scriptSrcOf(await cspFor(INTERACTIVE));
    expect(scriptSrc).not.toContain("sha256-");
    for (const keyword of ["unsafe-eval", "unsafe-hashes", "strict-dynamic", "nonce-"]) {
      expect(scriptSrc).not.toContain(keyword);
    }
  });

  test("the STATIC arm did not move: a trusted-but-not-interactive card still gets the one hash", async () => {
    expect(scriptSrcOf(await cspFor(TRUSTED))).toBe(`script-src ${CARD_FRAME_HEIGHT_SCRIPT_CSP_HASH}`);
    expect(scriptSrcOf(await cspFor(UNTRUSTED))).toBe(`script-src ${CARD_FRAME_HEIGHT_SCRIPT_CSP_HASH}`);
    expect(scriptSrcOf(await cspFor(GHOST))).toBe(`script-src ${CARD_FRAME_HEIGHT_SCRIPT_CSP_HASH}`);
  });

  test("the grant moves EXACTLY script-src — TRUSTED and INTERACTIVE differ by one rung and one directive", async () => {
    // The two fixtures are identical on every other axis, so a whole-policy diff isolates the posture.
    const trusted = (await cspFor(TRUSTED)).split("; ");
    const interactive = (await cspFor(INTERACTIVE)).split("; ");
    expect(interactive).toHaveLength(trusted.length);
    expect(trusted.filter((directive, index) => directive !== interactive[index])).toEqual([`script-src ${CARD_FRAME_HEIGHT_SCRIPT_CSP_HASH}`]);
    // Spelled out for the ones that matter, because "same length, one diff" would also pass if the
    // isolation belts had been dropped from BOTH arms together.
    const csp = await cspFor(INTERACTIVE);
    expect(csp.startsWith("sandbox allow-scripts;")).toBe(true);
    expect(csp).not.toContain("allow-same-origin");
    expect(csp).toContain("default-src 'none'");
    expect(csp).not.toContain("connect-src");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("frame-ancestors 'self'");
  });

  test("THE KILL-SWITCH: with the deployment ceiling DOWN, an opted-in card is served the static posture", async () => {
    // The roster still resolves this seat to the `interactive` rung — the fixture says so — so this proves
    // the ROUTE's own belt, not the resolver's. Both observable channels agree: the echo and the header.
    expect((await grantedFor(INTERACTIVE, false)).interactive).toBe(false);
    expect(scriptSrcOf(await cspFor(INTERACTIVE, false))).toBe(`script-src ${CARD_FRAME_HEIGHT_SCRIPT_CSP_HASH}`);
    expect(await cspFor(INTERACTIVE, false)).not.toContain("unsafe-inline;");
    // …and the vetoed card keeps everything below the top rung: it is still a TRUSTED card, so the `data:`
    // door stays open. A kill-switch that also silently revoked card images would be a different change.
    expect(await cspFor(INTERACTIVE, false)).toContain("img-src 'self' data: https:");
  });

  test("the ceiling is a VETO, not a grant — it cannot lift a card that never opted in", async () => {
    expect((await grantedFor(TRUSTED, true)).interactive).toBe(false);
    expect((await grantedFor(UNTRUSTED, true)).interactive).toBe(false);
  });
});
