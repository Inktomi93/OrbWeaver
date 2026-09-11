// The vendor CSS surface. Like the installed-package door, the POSITIVE arms read the real tree on
// purpose: the installed halves are reached through pnpm store symlinks, and a hand-built `node_modules`
// would not reproduce the indirection that breaks a naive implementation. The refusal arms hide one member
// of the real corpus through the reader's overlay, which is the planted control in the other direction.
import type { ResourceLoad } from "../../../../tooling/src/verify/contract/resource.ts";
import type { VendorCssSurface } from "../../../../tooling/src/verify/contract/resource-vendor.ts";
import { VENDOR_MIRROR_INDEX, VENDOR_MIRROR_ROOT } from "../../../../tooling/src/verify/contract/resource-vendor.ts";
import { createResourceReader } from "../../../../tooling/src/verify/ops/resource-reader.ts";
import { loadVendorCssSurface } from "../../../../tooling/src/verify/ops/resource-vendor.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = new URL("../../../../", import.meta.url).pathname.replace(/\/$/u, "");

function surface(root: string, overlay: Readonly<Record<string, string | null>> = {}): ResourceLoad<VendorCssSurface> {
  return loadVendorCssSurface(createResourceReader({ root, overlay }), root);
}

test("the committed mirror, the installed declarations and the vendor bundles arrive as ONE fact", () => {
  const fact = surface(ROOT);

  expect(fact.status).toBe("ready");
  if (fact.status !== "ready") {
    throw new Error(`vendor surface refused on the real tree: ${fact.reason}`);
  }
  expect(fact.value.mirrorRoot).toBe(VENDOR_MIRROR_ROOT);
  expect(fact.value.mirrorIndexText).toContain("Base UI docs mirror");
  expect(fact.value.packageVersion).toMatch(/^\d+\.\d+\.\d+/u);
  expect(fact.value.declarationFiles.length).toBeGreaterThan(0);
  expect(fact.value.declarationFiles.every((file) => file.path.endsWith("CssVars.d.ts"))).toBe(true);
  // The bundle set is discovered, never pinned to one hash-named chunk: a chunk name is a build artifact,
  // and a gate pinned to one goes silently blind at the next upgrade.
  expect(fact.value.selectorSources.length).toBeGreaterThan(1);
  expect(fact.value.selectorSources.some((file) => file.text.includes("data-streamdown"))).toBe(true);
  // Only the COMMITTED side publishes repo paths; the store paths belong to no policy's population.
  expect(fact.paths.every((path) => path.startsWith(`${VENDOR_MIRROR_ROOT}/`))).toBe(true);
  expect(fact.members).toBeGreaterThan(fact.paths.length);
});

test("an absent VERSION BANNER refuses, because a comparison with an absent left side PASSES", () => {
  // The planted control: the whole real corpus minus INDEX.md. Today's gate reads the banner as
  // `undefined` and then compares `undefined` against the installed version inside a guard that skips —
  // which is the worst outcome available to a contract whose job is to notice an upgrade.
  const fact = surface(ROOT, { [VENDOR_MIRROR_INDEX]: null });

  expect(fact.status).toBe("missing");
  expect(fact.status === "ready" ? "" : fact.reason).toContain("version banner");
});

test("an absent mirror and an unresolvable package are separate refusals", ({ scratch }) => {
  // Nothing at all: the mirror tree is the first thing read, so this is a mirror refusal.
  const bare = surface(scratch);
  expect(bare.status).toBe("missing");
  expect(bare.status === "ready" ? "" : bare.reason).toContain(VENDOR_MIRROR_ROOT);

  // A mirror that exists over a tree with no installed package: the refusal moves to the installed half and
  // names it, rather than reporting an empty declaration set as "no vendor properties".
  const mirrorOnly = surface(scratch, {
    [VENDOR_MIRROR_INDEX]: "# Base UI docs mirror — v1.7.0\n",
    [`${VENDOR_MIRROR_ROOT}/components/x.md`]: "| `--anchor-width` |\n",
  });
  expect(mirrorOnly.status).toBe("missing");
  expect(mirrorOnly.status === "ready" ? "" : mirrorOnly.reason).toContain("base-ui");
});
