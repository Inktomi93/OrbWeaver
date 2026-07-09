import type { DocOrigin, ScraperKind } from "@orb/contracts/databank";
import {
  DOC_ORIGINS,
  docOriginSchema,
  SCRAPER_KINDS,
  scraperKindSchema,
} from "@orb/contracts/databank";
import { expect, test } from "../../support/fixtures";

test("DOC_ORIGINS is exactly the pinned origin axis [upload, web, youtube, wiki, text]", () => {
  expect(DOC_ORIGINS).toEqual(["upload", "web", "youtube", "wiki", "text"]);
  expect(docOriginSchema.options).toEqual(DOC_ORIGINS);
});

test("docOriginSchema round-trips every valid origin and rejects non-members", () => {
  for (const origin of DOC_ORIGINS) {
    expect(docOriginSchema.parse(origin)).toBe(origin);
  }
  expect(docOriginSchema.safeParse("pdf").success).toBe(false);
  expect(docOriginSchema.safeParse("").success).toBe(false);
});

// Exhaustiveness: a `Record<DocOrigin, …>` is tsc-red if a member is added/removed (no inline re-spelling).
const ORIGIN_SEEN: Record<DocOrigin, true> = {
  upload: true,
  web: true,
  youtube: true,
  wiki: true,
  text: true,
};
test("DocOrigin has no member beyond the tuple", () => {
  expect(Object.keys(ORIGIN_SEEN).sort()).toEqual([...DOC_ORIGINS].sort());
});

test("SCRAPER_KINDS is the fetched-bytes subset of the origin axis (web/youtube/wiki)", () => {
  expect(SCRAPER_KINDS).toEqual(["web", "youtube", "wiki"]);
  expect(scraperKindSchema.options).toEqual(SCRAPER_KINDS);
  // Every scraper kind is a real origin (the `satisfies readonly DocOrigin[]` pin, verified at runtime).
  for (const kind of SCRAPER_KINDS) {
    expect(docOriginSchema.safeParse(kind).success).toBe(true);
  }
});

const SCRAPER_SEEN: Record<ScraperKind, true> = { web: true, youtube: true, wiki: true };
test("ScraperKind has no member beyond the tuple", () => {
  expect(Object.keys(SCRAPER_SEEN).sort()).toEqual([...SCRAPER_KINDS].sort());
});
