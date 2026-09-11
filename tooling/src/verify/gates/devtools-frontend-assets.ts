// Gate: devtools-frontend-assets (#950) — the committed official frontend closure, exact browser tuple,
// hashes, normalized inventory, and complete license rows are one contract. The runtime calls the same
// validator before opening its loopback server; this gate makes the contract bite without running Snap.
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { verifyDevToolsAssetsSync } from "../../_shared/devtools-assets.ts";
import type { GateDescriptor } from "../contract/gate.ts";

const ASSET_ROOT = "tooling/src/snap/lib/devtools-frontend";
const PIN_REL = `${ASSET_ROOT}/pin.json`;
const REAL_TREE_ANCHOR = "tooling/src/snap/cli.ts";
const REVISION = "33c2f401a9c8ddad2159eb0ab83aa244a5247361";
const ASSET_REL = `${ASSET_ROOT}/assets/serve_rev/@${REVISION}/inspector.html`;
const NOTICE_REL = `${ASSET_ROOT}/licenses/devtools-frontend/LICENSE`;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function fixture(assetBody = "official fixture asset"): Readonly<Record<string, string>> {
  const noticeBody = "BSD fixture notice";
  const manifest = {
    schemaVersion: 1,
    resources: [
      {
        url: `/serve_rev/@${REVISION}/inspector.html`,
        file: `assets/serve_rev/@${REVISION}/inspector.html`,
        bytes: "official fixture asset".length,
        sha256: sha256("official fixture asset"),
        mimeType: "text/html",
        licenseFamily: "devtools-frontend",
      },
    ],
  };
  const manifestText = canonical(manifest);
  return {
    [PIN_REL]: canonical({
      schemaVersion: 1,
      playwrightVersion: "1.61.1",
      browserVersion: "149.0.7827.55",
      chromiumRevision: "3188f8a607ae7e067593be8aab7f02d2451fec07",
      devtoolsFrontendRevision: REVISION,
      protocolVersion: "1.3",
      resourceCount: 1,
      decodedBytes: "official fixture asset".length,
      manifestSha256: sha256(manifestText),
    }),
    [`${ASSET_ROOT}/manifest.json`]: manifestText,
    [`${ASSET_ROOT}/licenses.json`]: canonical({
      schemaVersion: 1,
      families: [
        {
          family: "devtools-frontend",
          assetPrefix: "",
          notices: [
            {
              file: "licenses/devtools-frontend/LICENSE",
              source: `https://chromium.googlesource.com/devtools/devtools-frontend/+/${REVISION}/LICENSE`,
              bytes: noticeBody.length,
              sha256: sha256(noticeBody),
            },
          ],
        },
      ],
    }),
    [ASSET_REL]: assetBody,
    [NOTICE_REL]: noticeBody,
  };
}

export const gate: GateDescriptor = {
  name: "devtools-frontend-assets",
  docRow: "Core-Enforcement-Active-Gates.md devtools-frontend-assets row",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "the revision-matched official DevTools frontend closure is missing, stale, hash-drifted, path-open, license-incomplete, or disagrees with the installed Playwright/Chromium tuple; cascade provenance would be blind or non-hermetic (docs/architecture/core/Core-Tooling-Law.md §2.6)",
  fix: "run `pnpm snap:devtools-assets` for the ratified tuple, inspect the closure/license delta, and commit the generated root as one change",
  run: (ctx) => {
    const root = join(ctx.root, ASSET_ROOT);
    if (!existsSync(join(ctx.root, PIN_REL))) {
      if (existsSync(join(ctx.root, REAL_TREE_ANCHOR))) {
        ctx.scan({ unit: "resource", candidates: 1, scanned: 0 });
        ctx.report({
          file: PIN_REL,
          line: 0,
          column: 0,
          token: "missing-closure",
          message: `the official DevTools asset pin is missing: ${PIN_REL} (docs/architecture/core/Core-Tooling-Law.md §2.6)`,
        });
      }
      return;
    }
    // @orb-waive caught-failure-ownership(error): every validator failure is converted into this gate's asset-contract finding and zero-scan receipt. Ends if the catch stops reporting the failure detail.
    try {
      const assets = verifyDevToolsAssetsSync(root);
      ctx.scan({ unit: "resource", candidates: assets.pin.resourceCount, scanned: assets.manifest.resources.length });
    } catch (error) {
      ctx.scan({ unit: "resource", candidates: 1, scanned: 0 });
      ctx.report({
        file: PIN_REL,
        line: 0,
        column: 0,
        token: "asset-contract",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  },
  mustFlag: [
    {
      files: fixture("mutated fixture asset"),
      expect: { token: "asset-contract", messageIncludes: "hash/size mismatch" },
      why: "a manifest member changed without regenerating its tuple hash/size; runtime bytes no longer equal reviewed bytes",
    },
  ],
  mustPass: [
    {
      files: fixture(),
      why: "a complete one-resource tuple with an exact inventory and revision-pinned license notice passes through the same validator the runtime uses",
    },
    {
      files: "export const unrelated = true;\n",
      at: "packages/ui/src/unrelated.ts",
      why: "a synthetic mini-project carrying no real Snap anchor and no closure is not this gate's corpus",
    },
  ],
};
