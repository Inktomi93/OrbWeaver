// substrate: manifest — the source-agnostic bundle funnel (02 §1 + the owner-ruled hardening riders). Builds
// real zips with fflate and drives parseBundle: the happy path, the strict entry allow-list (extra / traversal
// / missing entries), the decompression-bomb caps, malformed manifest JSON / schema failures, and the
// downgrade-refusal semver helper.

import { PLUGIN_UI_ASSET_MAX_BYTES, PLUGIN_UI_ASSETS_MAX_COUNT, PLUGIN_UI_ASSETS_TOTAL_MAX_BYTES } from "@orb/contracts/plugin";
import { strToU8, zipSync } from "fflate";
import { describe } from "vitest";
import { HostVersionUnservedError, ManifestInvalidError } from "../../../../../packages/server/src/domain/plugin/contract/errors.ts";
import { isVersionDowngrade, parseBundle } from "../../../../../packages/server/src/domain/plugin/substrate/manifest.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { magicBytes } from "../../../../support/magic-bytes.ts";

const VALID_MANIFEST = {
  id: "my-plugin",
  name: "My Plugin",
  version: "1.0.0",
  hostVersion: 1,
  entry: "main.js",
  description: "does a thing",
  capabilities: ["chat.read"],
};

function makeBundle(entries: Record<string, Uint8Array>): Uint8Array {
  return zipSync(entries);
}

function validBundle(mainJs = "const host = orb.host(1);"): Uint8Array {
  return makeBundle({ "manifest.json": strToU8(JSON.stringify(VALID_MANIFEST)), "main.js": strToU8(mainJs) });
}

describe("parseBundle — happy path", () => {
  test("a well-formed bundle yields the validated manifest + the main.js source", () => {
    const parsed = parseBundle(validBundle("const x = 1;"));
    expect(parsed.manifest.id).toBe("my-plugin");
    expect(parsed.manifest.capabilities).toEqual(["chat.read"]);
    expect(parsed.mainJs).toBe("const x = 1;");
  });
});

describe("parseBundle — strict entry allow-list (traversal impossible by construction)", () => {
  test("an extra entry beyond manifest.json + main.js is refused", () => {
    const bundle = makeBundle({
      "manifest.json": strToU8(JSON.stringify(VALID_MANIFEST)),
      "main.js": strToU8("const x = 1;"),
      "evil.js": strToU8("steal()"),
    });
    expect(() => parseBundle(bundle)).toThrow(ManifestInvalidError);
  });

  test("a path-traversal entry name is refused (never admitted)", () => {
    const bundle = makeBundle({
      "manifest.json": strToU8(JSON.stringify(VALID_MANIFEST)),
      "main.js": strToU8("const x = 1;"),
      "../../etc/passwd": strToU8("root"),
    });
    expect(() => parseBundle(bundle)).toThrow(ManifestInvalidError);
  });

  test("a missing required entry is refused", () => {
    expect(() => parseBundle(makeBundle({ "manifest.json": strToU8(JSON.stringify(VALID_MANIFEST)) }))).toThrow(ManifestInvalidError);
    expect(() => parseBundle(makeBundle({ "main.js": strToU8("const x = 1;") }))).toThrow(ManifestInvalidError);
  });
});

describe("parseBundle — the OPTIONAL third entry (U4)", () => {
  const uiManifest = { ...VALID_MANIFEST, capabilities: ["chat.read", "ui.surface"], uiEntry: "ui.js" };
  const uiSource = "orb.ui(1).render('panel', { kind: 'text', value: 'hi' });";

  test("a declared + present ui.js is admitted and returned", () => {
    const parsed = parseBundle(
      makeBundle({ "manifest.json": strToU8(JSON.stringify(uiManifest)), "main.js": strToU8("const x = 1;"), "ui.js": strToU8(uiSource) }),
    );
    expect(parsed.manifest.uiEntry).toBe("ui.js");
    expect(parsed.uiJs).toBe(uiSource);
  });

  test("a two-entry bundle still parses unchanged, with no uiJs — the field is ADDITIVE-optional", () => {
    // The 01 §3 host-evolution law in practice: every plugin authored before U4 must install byte-for-byte the
    // same way. If this ever goes red, the third entry stopped being optional.
    const parsed = parseBundle(validBundle("const x = 1;"));
    expect(parsed.uiJs).toBeUndefined();
    expect(parsed.manifest.uiEntry).toBeUndefined();
  });

  test("BOTH halves of the biconditional are refused at the trust edge", () => {
    // A declaration with no file: a scripted surface that could only ever fail at mount, AFTER the user granted
    // `ui.surface` on the strength of the declaration.
    expect(() => parseBundle(makeBundle({ "manifest.json": strToU8(JSON.stringify(uiManifest)), "main.js": strToU8("const x = 1;") }))).toThrow(
      ManifestInvalidError,
    );
    // A file with no declaration: guest code inside the consent unit that nothing disclosed and nothing loads.
    expect(() =>
      parseBundle(makeBundle({ "manifest.json": strToU8(JSON.stringify(VALID_MANIFEST)), "main.js": strToU8("const x = 1;"), "ui.js": strToU8(uiSource) })),
    ).toThrow(ManifestInvalidError);
  });

  test("uiEntry without the ui.surface capability is refused (the manifest's own refinement)", () => {
    // Code that could never draw anything — `ui.register` is what a scripted surface is registered through, and
    // the capability gates it. Refused at the schema, before the zip's third entry is even considered.
    const noCapability = { ...VALID_MANIFEST, uiEntry: "ui.js" };
    expect(() =>
      parseBundle(makeBundle({ "manifest.json": strToU8(JSON.stringify(noCapability)), "main.js": strToU8("const x = 1;"), "ui.js": strToU8(uiSource) })),
    ).toThrow(ManifestInvalidError);
  });

  test("the ui.js entry carries the SAME 1 MiB decompressed cap as main.js", () => {
    const huge = "a".repeat(1024 * 1024 + 1);
    expect(() =>
      parseBundle(makeBundle({ "manifest.json": strToU8(JSON.stringify(uiManifest)), "main.js": strToU8("const x = 1;"), "ui.js": strToU8(huge) })),
    ).toThrow(ManifestInvalidError);
  });

  test("a FOURTH entry is still refused — widening to three did not open the allow-list", () => {
    expect(() =>
      parseBundle(
        makeBundle({
          "manifest.json": strToU8(JSON.stringify(uiManifest)),
          "main.js": strToU8("const x = 1;"),
          "ui.js": strToU8(uiSource),
          "evil.js": strToU8("steal()"),
        }),
      ),
    ).toThrow(ManifestInvalidError);
  });
});

describe("parseBundle — the ui/assets/ BUNDLE-ASSET class (#820 seam 11)", () => {
  const assetsBundle = (assets: Record<string, Uint8Array>): Uint8Array =>
    makeBundle({ "manifest.json": strToU8(JSON.stringify(VALID_MANIFEST)), "main.js": strToU8("const x = 1;"), ...assets });

  test("the four sniffable raster formats are admitted, path-sorted, with the SNIFFED mime", () => {
    const parsed = parseBundle(
      assetsBundle({
        "ui/assets/c.gif": magicBytes("gif"),
        "ui/assets/a.png": magicBytes("png"),
        "ui/assets/d.webp": magicBytes("webp"),
        "ui/assets/b.jpg": magicBytes("jpeg"),
      }),
    );
    expect(parsed.uiAssets.map((asset) => [asset.path, asset.mime])).toEqual([
      ["ui/assets/a.png", "image/png"],
      ["ui/assets/b.jpg", "image/jpeg"],
      ["ui/assets/c.gif", "image/gif"],
      ["ui/assets/d.webp", "image/webp"],
    ]);
  });

  test("a bundle shipping NO assets parses unchanged with an EMPTY set — the class is additive", () => {
    // Every plugin authored before #820 must install byte-for-byte the same way (the 01 §3 host-evolution law,
    // the same receipt `ui.js` carries one describe up).
    expect(parseBundle(validBundle("const x = 1;")).uiAssets).toEqual([]);
  });

  test("THE MIME IS THE BYTES, NEVER THE EXTENSION — a .png carrying GIF bytes is stored as image/gif", () => {
    // The whole point of sniffing: if the extension decided, a plugin could name a file anything and have the
    // CAS serve it under a mime the bytes do not support.
    const parsed = parseBundle(assetsBundle({ "ui/assets/lying.png": magicBytes("gif") }));
    expect(parsed.uiAssets[0]?.mime).toBe("image/gif");
  });

  test("SVG is REFUSED, by name, because it is a script carrier", () => {
    // Not a taste call: a stored blob is served from the app's OWN origin, where an SVG's embedded script runs
    // with the owner's cookies (#709). It carries no binary signature, so the sniff can never admit it — and
    // the refusal says SVG out loud so nobody re-adds it as a convenience.
    expect(() => parseBundle(assetsBundle({ "ui/assets/evil.svg": magicBytes("svg") }))).toThrow(/SVG is refused/u);
  });

  test("a nested ZIP, and text with no signature at all, are refused", () => {
    expect(() => parseBundle(assetsBundle({ "ui/assets/nested.png": magicBytes("zip") }))).toThrow(ManifestInvalidError);
    expect(() => parseBundle(assetsBundle({ "ui/assets/notes.png": strToU8("just some text") }))).toThrow(ManifestInvalidError);
  });

  test("every traversal / escape spelling of the path is REFUSED — the pattern cannot express one", () => {
    // Each of these is a name a filter-the-bad-shapes wall would have to enumerate. The anchored, flat,
    // alphanumeric-led regex makes them unspellable instead, so the refusal is structural.
    const escapes = [
      "ui/assets/../../etc/passwd",
      "ui/assets/../main.js",
      "ui/assets/..",
      "/ui/assets/a.png",
      "./ui/assets/a.png",
      "ui/assets/sub/a.png",
      "ui/assets/.hidden.png",
      "ui/assets/", // the directory entry itself
      "ui/assets/a b.png", // a space is outside the alphabet
      "UI/assets/a.png", // the prefix is case-sensitive
    ];
    for (const name of escapes) {
      expect(() => parseBundle(assetsBundle({ [name]: magicBytes("png") })), `expected "${name}" to be refused`).toThrow(ManifestInvalidError);
    }
  });

  test("a Windows-separator path is refused (it is not a bundle-asset name at all)", () => {
    expect(() => parseBundle(assetsBundle({ "ui\\assets\\a.png": magicBytes("png") }))).toThrow(ManifestInvalidError);
  });

  test("the ENTRY-COUNT cap bites — 65 assets is refused where 64 is admitted", () => {
    const under: Record<string, Uint8Array> = {};
    for (let i = 0; i < PLUGIN_UI_ASSETS_MAX_COUNT; i += 1) {
      under[`ui/assets/s${i}.png`] = magicBytes("png");
    }
    expect(parseBundle(assetsBundle(under)).uiAssets).toHaveLength(PLUGIN_UI_ASSETS_MAX_COUNT);
    expect(() => parseBundle(assetsBundle({ ...under, "ui/assets/one-too-many.png": magicBytes("png") }))).toThrow(ManifestInvalidError);
  });

  test("the PER-ENTRY decompressed cap bites — one over-cap asset is refused before it is inflated", () => {
    // The classic bomb: ~2 MiB of zeros compresses to a few hundred bytes, so the COMPRESSED bundle sails
    // under the 1 MiB input cap and only the entry's own header size stops it.
    expect(() => parseBundle(assetsBundle({ "ui/assets/bomb.png": magicBytes("png", PLUGIN_UI_ASSET_MAX_BYTES + 1) }))).toThrow(ManifestInvalidError);
  });

  test("the AGGREGATE cap bites — assets that are each legal but together exceed the total budget", () => {
    // The arm a per-entry cap alone cannot see, and the reason the aggregate exists: five entries at exactly
    // the per-entry ceiling each pass their own check and sum to 10 MiB out of a 1 MiB upload.
    const each = PLUGIN_UI_ASSET_MAX_BYTES;
    const assets: Record<string, Uint8Array> = {};
    for (let i = 0; i < 5; i += 1) {
      assets[`ui/assets/big${i}.png`] = magicBytes("png", each);
    }
    expect(each * 5).toBeGreaterThan(PLUGIN_UI_ASSETS_TOTAL_MAX_BYTES);
    expect(() => parseBundle(assetsBundle(assets))).toThrow(/total decompressed cap/u);
  });

  test("a NON-asset extra entry is still refused — the fourth class did not open the allow-list", () => {
    expect(() => parseBundle(assetsBundle({ "ui/assets/a.png": magicBytes("png"), "evil.js": strToU8("steal()") }))).toThrow(ManifestInvalidError);
  });

  test("TWO paths with IDENTICAL bytes are both kept — the CAS will dedup the id, the paths must not collapse", () => {
    // The shape that forced the `plugin_assets` PK to carry `bundle_path` (#820): content-addressed storage
    // returns ONE assetId for both, so a key without the path would silently lose the second name and a node
    // pointing at it would paint a placeholder forever.
    const parsed = parseBundle(assetsBundle({ "ui/assets/happy.png": magicBytes("png"), "ui/assets/also-happy.png": magicBytes("png") }));
    expect(parsed.uiAssets.map((asset) => asset.path)).toEqual(["ui/assets/also-happy.png", "ui/assets/happy.png"]);
    expect(parsed.uiAssets[0]?.bytes).toEqual(parsed.uiAssets[1]?.bytes);
  });
});

describe("parseBundle — decompression-bomb guard", () => {
  test("a main.js whose DECOMPRESSED size exceeds the 1 MiB cap is refused before allocation", () => {
    // 'a' × (1 MiB + 1) compresses to a few KB, so the compressed bundle passes the input cap; the entry's
    // header originalSize trips the per-entry cap.
    const huge = "a".repeat(1024 * 1024 + 1);
    expect(() => parseBundle(validBundle(huge))).toThrow(ManifestInvalidError);
  });

  test("an empty bundle is refused", () => {
    expect(() => parseBundle(new Uint8Array(0))).toThrow(ManifestInvalidError);
  });

  test("non-zip bytes are refused (not a valid archive)", () => {
    expect(() => parseBundle(strToU8("this is not a zip"))).toThrow(ManifestInvalidError);
  });
});

describe("parseBundle — manifest validation", () => {
  test("malformed manifest JSON is refused", () => {
    const bundle = makeBundle({ "manifest.json": strToU8("{ not json"), "main.js": strToU8("const x = 1;") });
    expect(() => parseBundle(bundle)).toThrow(ManifestInvalidError);
  });

  test("a manifest that fails the schema (bad slug) is refused", () => {
    const bundle = makeBundle({
      "manifest.json": strToU8(JSON.stringify({ ...VALID_MANIFEST, id: "BadSlug" })),
      "main.js": strToU8("const x = 1;"),
    });
    expect(() => parseBundle(bundle)).toThrow(ManifestInvalidError);
  });

  test("an unsupported but well-formed hostVersion reaches the distinct lifecycle refusal", () => {
    const bundle = makeBundle({
      "manifest.json": strToU8(JSON.stringify({ ...VALID_MANIFEST, hostVersion: 2 })),
      "main.js": strToU8("const x = 1;"),
    });

    let refusal: unknown;
    try {
      parseBundle(bundle);
    } catch (error) {
      refusal = error;
    }

    // This is the planted collapse control: generic manifest validation must never swallow a parseable major.
    expect(refusal).toBeInstanceOf(HostVersionUnservedError);
    expect(refusal).not.toBeInstanceOf(ManifestInvalidError);
    expect(refusal).toMatchObject({
      code: "plugin_host_version_unserved",
      message: "plugin host version 2 not served (served: 1)",
    });
  });

  test("a malformed hostVersion remains a structural manifest refusal", () => {
    const bundle = makeBundle({
      "manifest.json": strToU8(JSON.stringify({ ...VALID_MANIFEST, hostVersion: "2" })),
      "main.js": strToU8("const x = 1;"),
    });

    expect(() => parseBundle(bundle)).toThrow(ManifestInvalidError);
    expect(() => parseBundle(bundle)).not.toThrow(HostVersionUnservedError);
  });

  test("a builtAgainst provenance block round-trips through the bundle", () => {
    const bundle = makeBundle({
      "manifest.json": strToU8(JSON.stringify({ ...VALID_MANIFEST, builtAgainst: { engineVersion: "0.1.0", engineCommit: "abc1234" } })),
      "main.js": strToU8("const x = 1;"),
    });
    expect(parseBundle(bundle).manifest.builtAgainst).toEqual({ engineVersion: "0.1.0", engineCommit: "abc1234" });
  });
});

describe("isVersionDowngrade", () => {
  test("a lower candidate over a higher installed is a downgrade", () => {
    expect(isVersionDowngrade("1.0.0", "1.2.0")).toBe(true);
    expect(isVersionDowngrade("1.1.9", "1.2.0")).toBe(true);
    expect(isVersionDowngrade("0.9.9", "1.0.0")).toBe(true);
  });

  test("an equal or higher candidate is NOT a downgrade (equal is a legal re-install)", () => {
    expect(isVersionDowngrade("1.2.0", "1.2.0")).toBe(false);
    expect(isVersionDowngrade("1.2.1", "1.2.0")).toBe(false);
    expect(isVersionDowngrade("2.0.0", "1.9.9")).toBe(false);
  });
});
