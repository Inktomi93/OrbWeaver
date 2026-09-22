// CT: the Corpus CONTENT region — the ANALYSIS-STATE SWAP, the chrome diet, and the region's own inset
// (program #102 corpus leg, issue #127; mockup A "The Cartographer" + the ruled invitation-focal state).
//
// WHAT THIS FILE PINS, and why each one is here rather than in the unit suite:
//   • THE SWAP AS RENDERED. `lib/corpus-analysis-state.test.ts` proves the PREDICATE at every boundary;
//     only a mount can prove that the predicate reaches the DOM — which island exists, which one carries
//     the focal treatment, and that the other one is still present and merely quiet.
//   • CD3 BY COUNT. Exactly one `[data-corpus-focal]` element in EVERY phase. Two would mean the surface
//     has no focal (UI-Density-Law.md §3.2), and that is a defect no assertion on either island alone
//     can see.
//   • THE FOCAL TREATMENT BY COMPUTED VALUE — never a class list. An authored `before:shadow-glow` string
//     stays green through a visual regression; a measured ::before opacity and box-shadow do not. (The
//     carrier changed at #244 P2-1 — the accent stripe was a banned `side-tab` — and the claim did not.)
//   • THE PORTRAIT ON THE PAYLOAD AND ITS DEGRADATION. `ArchetypeMember.avatarHash` (issue #134) carries the
//     face, so the plates draw from `visualArchetypes` alone — no `portraitAlignment` join, and that verb is
//     deliberately UNSTUBBED here so a re-introduced second read renders nothing and fails. One family member
//     carries a NULL hash in every fixture, so the initials fallback is EXERCISED rather than assumed.
//   • THE ZERO WALL STAYING GONE. The first-run pane used to print a coverage strip of display zeros plus
//     seven muted "No … computed yet." notes. Both absences are asserted, with the analysed fixture as the
//     control that the blocks are CONDITIONAL rather than deleted.
//   • THE REGION'S INSET and the containing-block fence, carried over unchanged from the 2026-08-08 pass.
//
// DETERMINISM: the gem rows print a relative stamp, so the page clock is frozen at FROZEN_AT_MS and every
// `lastActiveAt` is derived from it. No ambient clock is read anywhere in this file. SUPERSEDED (issue
// #132): `test-determinism` no longer patrols comment PROSE — it blanks comment spans before the scan, so
// naming `Date.now()` in a comment is legal. The "one paste away" worry this header used to record is not
// lost: a commented-OUT statement is `commented-code`'s territory and REDs there.

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { readPhantomScrollers } from "../../../../support/browser/scroll-containing-block.ts";
import type { TrpcRecorder, TrpcRoutes } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { userSettingsView } from "../../../../support/node/user-settings-view.ts";
import { CorpusContentNarrowStory, CorpusContentStory } from "../_ct-stories.tsx";

/** The frozen page clock. Every stamp below is derived from it; no test here reads a wall clock. */
const FROZEN_AT_MS = 1_760_000_000_000;
const ONE_DAY_MS = 86_400_000;
const TWO_WEEKS_MS = 14 * ONE_DAY_MS;

/** The three characters in the fixtures' visual families. `ORPHAN` carries a NULL `avatarHash` on purpose —
 *  that is what exercises the initials fallback. */
const JFC = "character_jfc";
const ELIAS = "character_elias";
const ORPHAN = "character_orphan";
const JFC_HASH = "aaaa1111";
const ELIAS_HASH = "bbbb2222";

const FAMILIES = [
  {
    label: "mixed",
    genre: null,
    tone: null,
    artStyle: null,
    palette: null,
    mood: null,
    size: 2,
    members: [
      { characterId: JFC, name: "JFC", avatarHash: JFC_HASH },
      { characterId: ELIAS, name: "Elias Thorn", avatarHash: ELIAS_HASH },
    ],
    model: "Qwen/Qwen3-VL-Embedding-2B",
  },
  {
    label: "mixed",
    genre: null,
    tone: null,
    artStyle: null,
    palette: null,
    mood: null,
    size: 1,
    members: [{ characterId: ORPHAN, name: "Morgatha", avatarHash: null }],
    model: "Qwen/Qwen3-VL-Embedding-2B",
  },
];

/** A library with real characters, a completed VISUAL pass, and NOTHING semantic — the audited first run. */
const UNANALYSED: TrpcRoutes<
  | "discovery.home"
  | "discovery.catalog"
  | "discovery.visualArchetypes"
  | "discovery.forgottenGems"
  | "discovery.unusedCharacters"
  | "discovery.modelRouting"
  | "discovery.topKeywords"
  | "discovery.themeDrift"
  | "settings.getUserSettings"
  | "workloads.list"
> = {
  "discovery.home": {
    coverage: { characters: 10, digests: 0, segments: 0 },
    sceneThemes: [],
    arcThemes: [],
    duplicateCounts: { characters: 0, chats: 0, identicalCharacterPairs: 0 },
  },
  "discovery.catalog": { totalDistilled: 0, genres: [], tones: [], topTags: [] },
  "discovery.visualArchetypes": FAMILIES,
  "discovery.forgottenGems": [],
  "discovery.unusedCharacters": [],
  "discovery.modelRouting": [],
  "discovery.topKeywords": [],
  "discovery.themeDrift": [],
  // The chain reads BOTH of these now (issue #166): memory's switch decides whether the pass has a themes
  // stage at all, and the queue is what tells the readiness rail whether the dedup pass has ever RUN — a zero
  // from a pass that never ran is "not run", not "none found".
  "settings.getUserSettings": userSettingsView({ memory: { enabled: true } }, { userId: castId<UserId>("user_me"), updatedAt: 1 }),
  "workloads.list": [],
};

/** …and the same library after both passes ran — the control for every absence below. */
const ANALYSED: TrpcRoutes<"discovery.home" | "discovery.catalog"> = {
  ...UNANALYSED,
  "discovery.home": {
    coverage: { characters: 10, digests: 40, segments: 12 },
    sceneThemes: [{ id: "theme_1", clusterIdx: 0, level: "scene", name: "The long road", size: 7 }],
    arcThemes: [],
    duplicateCounts: { characters: 0, chats: 0, identicalCharacterPairs: 0 },
  },
  "discovery.catalog": { totalDistilled: 6, genres: [{ value: "fantasy", count: 6 }], tones: [], topTags: [] },
};

/** THE THIN IN-BETWEEN the ruling calls out: distillation ran, the story-theme pass did not. */
const THIN: TrpcRoutes<"discovery.catalog"> = {
  ...UNANALYSED,
  "discovery.catalog": { totalDistilled: 3, genres: [], tones: [], topTags: [] },
};

/** A library with nothing in it at all — not the same thing as an un-analysed one. */
const EMPTY_LIBRARY: TrpcRoutes<"discovery.home" | "discovery.visualArchetypes"> = {
  ...UNANALYSED,
  "discovery.home": {
    coverage: { characters: 0, digests: 0, segments: 0 },
    sceneThemes: [],
    arcThemes: [],
    duplicateCounts: { characters: 0, chats: 0, identicalCharacterPairs: 0 },
  },
  "discovery.visualArchetypes": [],
};

const GEMS = [
  {
    characterId: "character_quiet",
    name: "Quiet star",
    avatarHash: null,
    messageCount: 42,
    tokensOut: 1200,
    tokensOutProvenance: "measured" as const,
    lastActiveAt: FROZEN_AT_MS - TWO_WEEKS_MS,
    costUsd: 0.25,
  },
];

const LARGE_UNUSED_LIBRARY = Array.from({ length: 206 }, (_, index) => ({
  characterId: `character_${index.toString().padStart(3, "0")}`,
  name: `Unplayed ${index.toString()}`,
  avatarHash: null,
}));

/** The dead-end note shape the diet deleted. */
const COMPUTED_YET_NOTE = /computed yet/;
/** The dead cost column — `$0.00` on every row of a local-model instance. */
const MONEY_CELL = /\$\d/;

/** A 1x1 transparent PNG — the smallest thing a CAS blob route can serve. */
const PIXEL_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

async function stub(page: Page, shape: TrpcRoutes): Promise<TrpcRecorder> {
  // The clock is frozen BEFORE any mount so the gem stamp is a fixed string in every run.
  await page.clock.setFixedTime(new Date(FROZEN_AT_MS));
  // THE CAS BLOB ROUTE HAS TO ANSWER, or the join is unobservable: Base UI's Avatar swaps to its initials
  // fallback when the image ERRORS, so an unstubbed 404 makes a correctly-joined portrait look exactly like
  // a missing one, and the assertion would pass for the wrong reason.
  await page.route("**/api/blob/*", async (route) => {
    // The PATHNAME's last segment, not the raw URL's: an avatar asks for a display rung (`?w=48`) since
    // C6, and splitting the whole URL would hand this comparison "aaaa1111?w=48" and 404 a live portrait.
    const hash = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    if (hash === JFC_HASH || hash === ELIAS_HASH) {
      await route.fulfill({ body: PIXEL_PNG, contentType: "image/png", status: 200 });
      return;
    }
    await route.fulfill({ status: 404 });
  });
  // #649 — the viewer-identity read the invitation's run-the-pass door resolves off. Unfed it answered
  // `routeTrpc`'s null, so this surface's viewer resolved through its no-data branch and nothing here
  // exercised the identity-dependent path. Listed FIRST, so a caller's own `shape` still wins.
  return routeTrpc(page, { "sessions.me": { userId: "user_ct_corpus", handle: "ct_corpus", globalRole: "user" }, ...shape });
}

test("UN-ANALYSED: the invitation holds the focal and the family map renders quiet beneath it", async ({ mount, page }) => {
  await stub(page, UNANALYSED);
  const component = await mount(<CorpusContentStory />);

  // SETTLED: the masthead is the surface's first heading past the suspense arm.
  await expect(component.getByRole("heading", { level: 1 })).toHaveText("Ten characters, grouped into two visual families.");

  // CD3: exactly one focal, and it is the invitation.
  await expect(page.locator("[data-corpus-focal]")).toHaveCount(1);
  await expect(page.locator('[data-corpus-focal="invitation"]')).toBeVisible();
  await expect(component.getByRole("heading", { name: "Read your library back to you." })).toBeVisible();

  // The map is STILL THERE — demoted, not hidden. That is the difference between a state and a fork.
  await expect(page.locator('[data-corpus-family-map="quiet"]')).toBeVisible();
  await expect(component.getByRole("heading", { name: "The shape of your library" })).toBeVisible();

  // ONE door on the screen, and it names the two jobs by the picker's own labels. NO ELLIPSIS since #155:
  // the button RUNS the pass now (it used to open the Settings → Jobs picker, and the ellipsis said so).
  await expect(component.getByRole("button", { name: "Run the understanding pass" })).toHaveCount(1);
  // The prose names each stage's REAL input (issue #166): themes clusters chat summaries, not cards, and the
  // old copy claimed both jobs "read the same portrait and card embeddings".
  await expect(component.getByText("then Memory backfill over your chats, then Compute themes over those chat summaries", { exact: false })).toBeVisible();
  await expect(component.getByRole("button", { name: "Run the passes again" })).toHaveCount(0);
});

test("ANALYSED: the map reclaims the focal, the invitation is gone, and the rail keeps the re-run door", async ({ mount, page }) => {
  await stub(page, ANALYSED);
  const component = await mount(<CorpusContentStory />);
  await expect(component.getByRole("heading", { level: 1 })).toHaveText("Ten characters, distilled into one story theme.");

  await expect(page.locator("[data-corpus-focal]")).toHaveCount(1);
  await expect(page.locator('[data-corpus-focal="familyMap"]')).toBeVisible();
  await expect(page.locator('[data-corpus-focal="invitation"]')).toHaveCount(0);
  await expect(page.locator('[data-corpus-family-map="quiet"]')).toHaveCount(0);

  await expect(component.getByRole("button", { name: "Run the understanding pass" })).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Run the passes again" })).toBeVisible();

  // The analysis drills are back — the diet is CONDITIONAL, not a removal.
  await expect(component.getByRole("heading", { name: "Story themes", exact: true })).toBeVisible();
  await expect(component.getByText("The long road")).toBeVisible();
});

test("THE THIN IN-BETWEEN: distilled but no story themes — the map takes the focal, the rail stays honest", async ({ mount, page }) => {
  await stub(page, THIN);
  const component = await mount(<CorpusContentStory />);
  await expect(component.getByRole("heading", { level: 1 })).toHaveText("Ten characters, three cards distilled.");

  await expect(page.locator('[data-corpus-focal="familyMap"]')).toBeVisible();
  await expect(page.locator("[data-corpus-focal]")).toHaveCount(1);

  // Graceful degradation is not silence: the rail names the pass that has not run, with its real partial.
  // THREE rows read "not run" — story themes, KEYWORDS (split out 2026-08-18: the row used to be labelled
  // "Story themes & keywords" and read story themes alone, marking the keyword pass done on the theme
  // pass's evidence) and near-duplicates, whose zero used to print the reassuring "none found" for a pass
  // that had never run (issue #164 item 4) — so the count is the assertion.
  await expect(component.getByText("Keywords", { exact: true })).toBeVisible();
  await expect(component.getByText("Story themes & keywords")).toHaveCount(0);
  await expect(component.getByText("not run")).toHaveCount(3);
  await expect(component.getByText("none found")).toHaveCount(0);
  // EXACT (side-eye populated arm 2026-08-23, #535's surviving half): the families row now names its own
  // base too ("2 families · 3 of 10 characters"), so a substring match on the distilled partial resolves
  // two rows. The distilled row is the one this test is about.
  await expect(component.getByText("3 of 10", { exact: true })).toBeVisible();
  // …and the story-theme BLOCK is simply absent rather than printing its own zero note.
  await expect(component.getByRole("heading", { name: "Story themes", exact: true })).toHaveCount(0);
  await expect(component.getByText(COMPUTED_YET_NOTE)).toHaveCount(0);
});

test("AN EMPTY LIBRARY is not an un-analysed one: no invitation, no focal island, one honest door", async ({ mount, page }) => {
  await stub(page, EMPTY_LIBRARY);
  const component = await mount(<CorpusContentStory />);

  await expect(component.getByText("Nothing in your library yet")).toBeVisible();
  await expect(page.locator("[data-corpus-focal]")).toHaveCount(0);
  await expect(component.getByRole("button", { name: "Go to Characters" })).toBeVisible();
  await expect(component.getByRole("button", { name: "Run the understanding pass" })).toHaveCount(0);
});

// SUPERSEDED CARRIER, SAME CLAIM (#244 P2-1). This test used to assert the focal island painted a
// `--immersive-stripe-width` accent border-left, measured against the resolved token. That stripe is GONE:
// on a rounded Card it is `design-audit`'s `side-tab` — a §6 ABSOLUTE ban — and it was carrying the focal
// signal only because the sanctioned ::before ring beside it had been dimmed to `opacity: 0.3` (effective
// ring alpha 0.12). The claim is unchanged and still the one that matters — THE FOCAL IS PAINTED, not
// merely marked — so it is re-pinned on the carrier that is allowed to make it, at the strength that makes
// it visible. The geometry half (no single-edge accent) lives in `surfaces/corpus-home-surface.ct.tsx`,
// which measures both phases at the real pane width.
test("THE FOCAL IS PAINTED, not merely marked: the sanctioned ring carries it at full strength", async ({ mount, page }) => {
  await stub(page, UNANALYSED);
  const component = await mount(<CorpusContentStory />);
  await expect(component.getByRole("heading", { name: "Read your library back to you." })).toBeVisible();

  const island = page.locator('[data-corpus-focal="invitation"]');
  const painted = await island.evaluate((el) => {
    const style = globalThis.getComputedStyle(el);
    const halo = globalThis.getComputedStyle(el, "::before");
    return { start: style.borderInlineStartWidth, end: style.borderInlineEndWidth, opacity: halo.opacity, shadow: halo.boxShadow };
  });
  expect(painted.shadow, "the rationed glow rides the sanctioned ::before carrier").not.toBe("none");
  expect(painted.opacity, "…at the token's own strength — 0.3 is what made it invisible enough to need a banned stripe").toBe("1");
  expect(painted.start, "…and no accent side-tab survives on the rounded island").toBe(painted.end);
});

test("THE PORTRAIT ON THE PAYLOAD: a member carrying a hash draws its blob; a null one draws initials", async ({ mount, page }) => {
  const recorder = await stub(page, UNANALYSED);
  const component = await mount(<CorpusContentStory />);
  await expect(component.getByRole("heading", { name: "The shape of your library" })).toBeVisible();

  // The hash off `visualArchetypes.members[].avatarHash` reached the <img> — no second read did this.
  await expect(page.locator(`img[src^="/api/blob/${JFC_HASH}"]`)).toHaveCount(1);
  await expect(page.locator(`img[src^="/api/blob/${ELIAS_HASH}"]`)).toHaveCount(1);

  // NULL hash — Morgatha's seat degrades to hue-seeded initials rather than a broken image or an invented
  // portrait. The plate that names her still renders — in its GLOSS now, not as the plate's title
  // (side-eye populated arm 2026-08-23, [P2-1]: the member-run arm was displacing the family's real label,
  // which the Archetypes tab was printing 30px away, so one family had two names in one frame).
  await expect(component.getByText("Morgatha", { exact: false })).toBeVisible();
  const morgathaSeat = page.locator('[data-slot="avatar-stack-item"]', { has: page.locator('text="M"') });
  await expect(morgathaSeat.locator("img")).toHaveCount(0);

  // …and the surface asked for the alignment report ZERO times — the pin that the second owner-scoped read
  // is GONE, not merely redundant. (The Visuals CONTEXT tab still reads that verb; it is not mounted here.)
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled by construction — every query on this surface is a `useSuspenseQuery` fired in the first render and batched into ONE http request by httpBatchLink, and the portraits asserted above only paint after that batch's response. A `portraitAlignment` call could only have ridden that same flight, so by the time a face is visible the recorder has seen everything this mount will ever ask for.
  expect(recorder.count("discovery.portraitAlignment")).toBe(0);
});

test("THE FAMILY PLATES ARE VISIBLE ISLANDS — the nested fill actually resolves", async ({ mount, page }) => {
  // `bg-surface-raised` had no other consumer in the app: a token that does not generate a utility renders
  // a transparent plate inside a same-coloured island, which looks exactly like a working build.
  await stub(page, ANALYSED);
  const component = await mount(<CorpusContentStory />);
  await expect(component.getByRole("heading", { name: "The shape of your library" })).toBeVisible();

  const plate = page.locator('[data-corpus-focal="familyMap"] [data-slot="card-root"][data-nested]').first();
  const paint = await plate.evaluate((el) => {
    const own = globalThis.getComputedStyle(el).backgroundColor;
    const host = el.closest('[data-corpus-focal="familyMap"]');
    return { own, host: host === null ? "" : globalThis.getComputedStyle(host).backgroundColor };
  });
  expect(paint.own, "a plate must paint a real fill").not.toBe("rgba(0, 0, 0, 0)");
  expect(paint.own, "…and a DIFFERENT one from the island it sits in, or it is not an island").not.toBe(paint.host);
});

test("THE ZERO WALL IS GONE: no coverage strip, no dead-end notes, no cost column", async ({ mount, page }) => {
  await stub(page, { ...UNANALYSED, "discovery.forgottenGems": GEMS });
  const component = await mount(<CorpusContentStory />);
  await expect(component.getByRole("heading", { level: 1 })).toBeVisible();

  // The display-size coverage strip and its five structural zeros.
  await expect(component.getByRole("heading", { name: "Coverage" })).toHaveCount(0);
  // The seven muted dead ends.
  await expect(component.getByText(COMPUTED_YET_NOTE)).toHaveCount(0);
  await expect(component.getByText("None distilled.")).toHaveCount(0);
  await expect(component.getByText("No tags distilled")).toHaveCount(0);
  await expect(component.getByText("Nothing analyzed yet")).toHaveCount(0);
  // The dead $0.00 column: the gem's trailing magnitude is TOKENS RETURNED, and no money is printed
  // anywhere. The label is pinned as tokens (#174) — the field is `tokensOut`, and it shipped calling
  // itself "words", which overstates a real word count by ~30-40% on the live corpus.
  await expect(component.getByText(MONEY_CELL)).toHaveCount(0);
  // TWO LINES SINCE B1 (side-eye corpus re-pass 2026-08-19): the magnitudes and the last-opened fact each
  // get their own, because one truncating 10.5px line inside the tile's button always cut the tail — which
  // is the very fact the shelf ranks by. Both are asserted; the split is the fix, not a loss.
  await expect(component.getByText("1,200 tokens returned · 42 exchanges")).toBeVisible();
  await expect(component.getByText("last opened 2w ago")).toBeVisible();
  await expect(component.getByText("1,200 words", { exact: false })).toHaveCount(0);
  // The lifetime framing is stated ONCE, so the aggregate is not mistaken for one conversation.
  await expect(component.getByText("Lifetime totals per character", { exact: false })).toBeVisible();
});

test("an estimated imported token total keeps its approximation marker", async ({ mount, page }) => {
  await stub(page, {
    ...UNANALYSED,
    "discovery.forgottenGems": GEMS.map((gem) => ({ ...gem, tokensOutProvenance: "estimated" as const })),
  });
  const component = await mount(<CorpusContentStory />);
  await expect(component.getByText("~1,200 tokens returned · 42 exchanges")).toBeVisible();
});

test("an unsettled legacy token number renders neither a claimed count nor a comparison bar", async ({ mount, page }) => {
  await stub(page, {
    ...UNANALYSED,
    "discovery.forgottenGems": GEMS.map((gem) => ({ ...gem, tokensOutProvenance: "unrecorded" as const })),
  });
  const component = await mount(<CorpusContentStory />);
  await expect(component.getByText("tokens not recorded · 42 exchanges")).toBeVisible();
  await expect(component.locator('[data-slot="track-bar"]')).toHaveCount(0);
});

test("clickable insight collections expose named lists with real listitem children", async ({ mount, page }) => {
  await stub(page, { ...ANALYSED, "discovery.forgottenGems": GEMS });
  const component = await mount(<CorpusContentStory />);

  const themes = component.getByRole("list", { name: "Scenes story themes" });
  await expect(themes.getByRole("listitem")).toHaveCount(1);
  await expect(themes.getByRole("button", { name: "The long road" })).toBeVisible();

  const gems = component.getByRole("list", { name: "Invested but quiet characters" });
  await expect(gems.getByRole("listitem")).toHaveCount(1);
  await expect(gems.getByRole("button", { name: "Quiet star", exact: false })).toBeVisible();
});

/** A populated analysed library: the state in which the deleted tail USED to render 6,900px of bars. */
const POPULATED: TrpcRoutes<"discovery.catalog"> = {
  ...ANALYSED,
  "discovery.catalog": {
    totalDistilled: 6,
    genres: [{ value: "fantasy", count: 6 }],
    tones: [{ value: "melancholic", count: 4 }],
    topTags: [{ tag: "tsundere", count: 9 }],
  },
};

test("THE UN-DRAWN TAIL IS GONE: no facet bars, no duplicate theme chart (forensics R4)", async ({ mount, page }) => {
  // Every datum below is still reachable — the Genre/Tone/Tag SELECTS in the browse view carry the same
  // counts and narrow the list, and the theme ROWS above carry the same clusters and open them. What the
  // bars added was 2,300px of a chart nobody could click.
  await stub(page, POPULATED);
  const component = await mount(<CorpusContentStory />);
  await expect(component.getByRole("heading", { level: 1 })).toBeVisible();

  await expect(component.getByRole("heading", { name: "Catalog" })).toHaveCount(0);
  await expect(component.getByText("Top tags")).toHaveCount(0);
  await expect(component.getByText("Genres")).toHaveCount(0);
  await expect(component.getByRole("heading", { name: "All story themes" })).toHaveCount(0);
  await expect(component.getByText("Story theme sizes")).toHaveCount(0);
  // …and the interactive twin that absorbed them is still there.
  await expect(component.getByRole("button", { name: "The long road" })).toBeVisible();
});

/** Two routes with real generations and no spend — a local-model instance, exactly. */
const FREE_ROUTES = [
  {
    genre: "fantasy",
    model: "local/qwen",
    provider: null,
    generations: 40,
    tokensOut: 9000,
    tokensOutProvenance: "measured" as const,
    avgGenTimeMs: 800,
    costUsd: 0,
  },
  {
    genre: "romance",
    model: "local/qwen",
    provider: null,
    generations: 12,
    tokensOut: 2000,
    tokensOutProvenance: "measured" as const,
    avgGenTimeMs: 700,
    costUsd: 0,
  },
];

// ── THE SPEND GUARD IS REVERSED, AND BOTH RULINGS ARE RECORDED (side-eye populated arm 2026-08-23, #553)
// THE OLD PIN (verbatim, so the reversal is legible): "MODEL ECONOMICS IS GUARDED ON SPEND, not on row
//   count (forensics §7)" — `modelRouting` returns a row per (genre × model) whether or not money moved,
//   so the original `routing.length` guard rendered 134 rows, 133 of them exactly $0.00, at 4,304px.
// WHAT KILLED ITS PREMISE: on the 327-character library 141 of 142 routes carry `costUsd: null` (a local
//   model has no dollar cost; OpenRouter rows arrive estimated) while `generations` and `tokensOut` are
//   populated on ALL of them. The spend guard therefore reduced 11,321 generations and 7.96M tokens to
//   ONE bar reading $0.08 — full width, in accent orange, the page's heaviest visual weight spent on its
//   smallest number. The wall the old ruling deleted was made by LENGTH, not by currency.
// WHAT SURVIVES UNCHANGED, and is pinned harder below: the section must never fabricate a dollar figure
//   for a route whose cost was never recorded. That was the real content of "133 of them exactly $0.00",
//   and it is now enforced on a section that renders.
test("MODEL ECONOMICS REPORTS WHAT THE ROUTES DID, and invents no dollars to do it (#553)", async ({ mount, page }) => {
  await stub(page, { ...POPULATED, "discovery.modelRouting": FREE_ROUTES });
  const component = await mount(<CorpusContentStory />);
  await expect(component.getByRole("heading", { level: 1 })).toBeVisible();

  // It RENDERS on a library that never spent a cent — the quantities it charts are the ones every route
  // carries, and a corpus with no cost accounting still has economics.
  await expect(component.getByRole("heading", { name: "Model economics" })).toBeVisible();
  // …and not one currency figure appears: the zero-cost routes contribute a generation count, never a
  // fabricated `$0.00` (the old ruling's real concern, kept).
  await expect(component.getByText(MONEY_CELL)).toHaveCount(0);
  // AND THE COST CLAUSE IS ABSENT, not zeroed (side-eye se-verify-4 N6). It used to read "cost recorded
  // for 0 of 2 routes" — a coverage statement about an empty column, which is a sentence about nothing.
  await expect(component.getByText("routes", { exact: false }).filter({ hasText: "cost" })).toHaveCount(0);
});

test("…and a PAID route is annotated, never promoted over the quantities (#553)", async ({ mount, page }) => {
  await stub(page, {
    ...POPULATED,
    "discovery.modelRouting": [
      ...FREE_ROUTES,
      { ...FREE_ROUTES[0], model: "anthropic/claude", costUsd: 0.04 },
      { ...FREE_ROUTES[0], model: "unknown-cost", costUsd: null },
    ],
  });
  const component = await mount(<CorpusContentStory />);
  await expect(component.getByRole("heading", { name: "Model economics" })).toBeVisible();

  // The canvas's hidden table equivalent is the honest read of the series. Every route is a row — the
  // reader is no longer shown 1 of 4 — and the VALUE column is generations, not dollars.
  const table = component.getByRole("table", { name: "Busiest routes" });
  await expect(table.getByRole("row"), "a header row plus all four routes").toHaveCount(5);
  await expect(table.getByRole("cell")).toHaveText(["40", "40", "40", "12"]);
  // The one recorded price rides its own route's LABEL, and the route whose cost is absent stays silent
  // rather than acquiring a $0.00.
  await expect(table.getByRole("rowheader").filter({ hasText: "$0.04" })).toHaveCount(1);
  await expect(table.getByRole("rowheader").filter({ hasText: "unknown-cost" })).not.toContainText("$");
  // THE CLAUSE NAMES THE ROUTE IT IS ABOUT (side-eye se-verify-4 N6). "cost recorded for 1 of 142 routes"
  // pointed at a row no control on the page could reach — the chart draws the BUSIEST head, and the lone
  // priced route is nowhere near it. With exactly one, the clause carries the money and the route's name.
  await expect(component.getByText("$0.04 recorded across 1 of 4 routes", { exact: false })).toBeVisible();
  await expect(component.getByText("claude", { exact: false }).filter({ hasText: "recorded across" })).toBeVisible();
});

test("a large never-played library is windowed instead of mounting every avatar row", async ({ mount, page }) => {
  await stub(page, { ...ANALYSED, "discovery.unusedCharacters": LARGE_UNUSED_LIBRARY });
  const component = await mount(<CorpusContentStory />);

  const list = component.getByRole("list", { name: "Never played characters" });
  await expect(list).toBeVisible();
  await expect(list).toHaveAttribute("data-more", "");
  await expect.poll(() => list.getByRole("listitem").count()).toBeLessThan(LARGE_UNUSED_LIBRARY.length);
  await expect(list.getByRole("listitem").first()).toHaveAttribute("aria-setsize", LARGE_UNUSED_LIBRARY.length.toString());
});

test("the CONTENT region insets its own body — no row starts flush at the pane edge", async ({ mount, page }) => {
  await stub(page, ANALYSED);
  const component = await mount(<CorpusContentStory />);
  const masthead = component.getByRole("heading", { level: 1 });
  await expect(masthead).toBeVisible();

  // The RESOLVED token, never a hardcoded px: the region pads on the `section` step.
  const measured = await page.locator('[data-slot="corpus-content"]').evaluate((el) => {
    const style = globalThis.getComputedStyle(el);
    const probe = document.createElement("div");
    probe.style.width = "var(--spacing-section)";
    el.append(probe);
    const expected = globalThis.getComputedStyle(probe).width;
    probe.remove();
    return { left: style.paddingLeft, right: style.paddingRight, expected };
  });
  await expect
    .poll(
      async () =>
        (
          await page.locator('[data-slot="corpus-content"]').evaluate((el) => {
            const style = globalThis.getComputedStyle(el);
            const probe = document.createElement("div");
            probe.style.width = "var(--spacing-section)";
            el.append(probe);
            const expected = globalThis.getComputedStyle(probe).width;
            probe.remove();
            return { left: style.paddingLeft, right: style.paddingRight, expected };
          })
        ).left,
    )
    .toBe(measured.expected);
  await expect
    .poll(
      async () =>
        (
          await page.locator('[data-slot="corpus-content"]').evaluate((el) => {
            const style = globalThis.getComputedStyle(el);
            const probe = document.createElement("div");
            probe.style.width = "var(--spacing-section)";
            el.append(probe);
            const expected = globalThis.getComputedStyle(probe).width;
            probe.remove();
            return { left: style.paddingLeft, right: style.paddingRight, expected };
          })
        ).right,
    )
    .toBe(measured.expected);

  const [regionBox, headingBox] = await Promise.all([page.locator('[data-slot="corpus-content"]').boundingBox(), masthead.boundingBox()]);
  if (regionBox === null || headingBox === null) {
    throw new Error("the corpus content region or its masthead did not render a box");
  }
  expect(headingBox.x, "the body is inset from the pane's left edge").toBeGreaterThan(regionBox.x);
});

test("AT THE NARROWEST REAL MOUNT nothing overflows the pane and the focal is still one", async ({ mount, page }) => {
  // A 430px CONTENT pane is the phone shape. The masthead's figure cluster, the invitation's action column
  // and the family plates all carry shrink-0 clusters; a fixed-width host with visible overflow is what
  // makes a collision measurable instead of quietly reflowing.
  await stub(page, { ...UNANALYSED, "discovery.forgottenGems": GEMS });
  const component = await mount(<CorpusContentNarrowStory />);
  await expect(component.getByRole("heading", { level: 1 })).toBeVisible();

  await expect(page.locator("[data-corpus-focal]")).toHaveCount(1);
  const overflow = await page.locator('[data-slot="corpus-content"]').evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(overflow, "the corpus body must not scroll horizontally at a phone-width pane").toBeLessThanOrEqual(0);
});

// THE CONTAINING-BLOCK PIN (phantom-scroll CLASS sweep, 2026-08-14), carried over unchanged. An `overflow`
// scroller only absorbs the scrollable overflow of an absolutely-positioned descendant whose CONTAINING
// BLOCK is inside it; a `position: static` scroller establishes none, so `sr-only` absolute boxes resolve
// theirs further up and add their static positions to a POSITIONED ancestor's scrollable area.
// HONEST LABEL: a FENCE, not a defect proof — this surface paints read-only content, so no Base UI form
// primitive exists here to escape. It is what stops the class coming back the day a form control lands in
// this pane, which is exactly how the settings pane acquired it.
test("no absolutely-positioned box escapes the corpus content scroller (the containing-block pin)", async ({ mount, page }) => {
  await stub(page, ANALYSED);
  const component = await mount(<CorpusContentStory />);
  await expect(component.getByRole("heading", { level: 1 })).toBeVisible();

  expect(await readPhantomScrollers(page)).toEqual([]);
});
