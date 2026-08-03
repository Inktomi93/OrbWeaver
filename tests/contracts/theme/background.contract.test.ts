// Contract: the BG-C carried-background SOURCE schema + its canonicalizer (contracts/theme/background).
// Load-bearing:
//   • fault isolation — an empty/garbage blob heals to `kind:"none"` (never throws; the parseChatMetadata
//     posture), and every field defaults (incl. the F-P0-2 `provenanceUrl`).
//   • `canonicalBackgroundSource` COHERENCE — only `kind:"asset"` may carry an asset ref AND its
//     materialize provenance; every other kind has assetId/assetHash/mime/provenanceUrl forced empty (the
//     GC-root smuggle guard + the "external never persists a paintable URL" invariant). Idempotent.

import type { ThemeBackground } from "@orb/contracts/theme";
import { canonicalBackgroundSource, themeBackgroundSchema } from "@orb/contracts/theme";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

describe("themeBackgroundSchema", () => {
  test("an empty blob parses to the all-default no-image source (incl. provenanceUrl)", () => {
    expect(themeBackgroundSchema.parse({})).toEqual({ kind: "none", seededId: "", externalUrl: "", assetId: "", assetHash: "", mime: "", provenanceUrl: "" });
  });

  test("fault isolation: a garbage kind heals to none, a malformed externalUrl heals to ''", () => {
    expect(themeBackgroundSchema.parse({ kind: "hologram" }).kind).toBe("none");
    expect(themeBackgroundSchema.parse({ kind: "external", externalUrl: "not a url" }).externalUrl).toBe("");
  });

  test("a valid asset source round-trips its provenanceUrl", () => {
    const parsed = themeBackgroundSchema.parse({
      kind: "asset",
      assetId: "asset_x",
      assetHash: "h",
      mime: "image/png",
      provenanceUrl: "https://cdn.example/x.png",
    });
    expect(parsed.provenanceUrl).toBe("https://cdn.example/x.png");
  });
});

describe("canonicalBackgroundSource", () => {
  const assetSource: ThemeBackground = {
    kind: "asset",
    seededId: "",
    externalUrl: "",
    assetId: "asset_keep",
    assetHash: "hash_keep",
    mime: "image/png",
    provenanceUrl: "https://cdn.example/orig.png",
  };

  test("kind:asset keeps its asset ref AND its materialize provenance", () => {
    expect(canonicalBackgroundSource(assetSource)).toEqual(assetSource);
  });

  test("every NON-asset kind has assetId/assetHash/mime AND provenanceUrl forced empty (GC-smuggle + external-never-paints guard)", () => {
    for (const kind of ["none", "seeded", "external"] as const) {
      const smuggled: ThemeBackground = { ...assetSource, kind };
      const clean = canonicalBackgroundSource(smuggled);
      expect(clean.assetId).toBe("");
      expect(clean.assetHash).toBe("");
      expect(clean.mime).toBe("");
      expect(clean.provenanceUrl).toBe("");
    }
  });

  test("is idempotent", () => {
    const once = canonicalBackgroundSource({ ...assetSource, kind: "none" });
    expect(canonicalBackgroundSource(once)).toEqual(once);
  });
});
