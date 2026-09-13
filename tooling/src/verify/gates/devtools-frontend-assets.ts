// Gate: devtools-frontend-assets (#950) — the committed official frontend closure, exact browser tuple,
// hashes, normalized inventory, and complete license rows are one contract. The runtime calls the same
// adjudicator before opening its loopback server; this gate makes the contract bite without running Snap.
//
// FAMILY: singleton, and honestly so. Its subject is one vendored generated closure plus the installed
// Playwright tuple it is pinned against; no `lib/` reader is involved, and the nearest sibling
// (`tokens-contract`) judges a different generated artifact through a different door. The shared
// computation it DOES have is `_shared/devtools-assets.ts#adjudicateDevToolsClosure` — but that is the
// runtime's own validator, not a gate-family reader, which is exactly why it lives there (§12.7: a
// world-program guarantee is an INPUT to conversion, preserved rather than reimplemented).
//
// POPULATION PORT: BYTE-IDENTICAL, legacy at 1692583d6. The legacy descriptor was `fsBacked: true` +
// `scopeSafety: "whole-project"` and read `join(ctx.root, "tooling/src/snap/lib/devtools-frontend")` off
// disk; the final declares `{ kind: "devtools-closure" }`, whose provider walks exactly
// `contract/resource-artifact.ts`'s `DEVTOOLS_CLOSURE_ROOT` — the same directory, every regular member,
// symlinks refused on both sides. There is no compiler population: `population: { of: "none" }`, and the
// module reads no `ctx.files`. The two `installed-package` declarations replace the legacy validator's
// `import.meta.resolve("@playwright/test/package.json")` walk with the SAME two documents
// (`contract/resource-installed.ts:59-61` minted those ids for this gate and says so in its comments).
//
// WHAT THE CONVERSION MOVED, AND IT IS THE WHOLE INTERESTING PART. The legacy `run` did four things a final
// policy structurally cannot: `readFileSync`/`lstatSync`/`readdirSync`/`realpathSync` over the closure,
// `import.meta.resolve` into `node_modules`, an `existsSync` pre-check for the pin, and a real-tree anchor
// guard so synthetic mini-projects stayed quiet (§12.3 bans every one). None of it was DELETED: the
// ADJUDICATION was extracted into `_shared/devtools-assets.ts#adjudicateDevToolsClosure`, a pure function
// over already-read bytes, and `verifyDevToolsAssetsSync` keeps its signature and delegates to it before
// reading the member bodies the static server needs. So the two callers reach the same verdict through the
// same code — the one thing §12.7 requires of a replaced implementation — and the runtime path keeps its
// independent regression proof at tests/tooling/_shared/devtools-assets.test.ts (hash drift, tuple drift,
// a missing notice, an unexpected member, a symlink, and the served closure itself).
//
// THE MISSING-PIN ARM IS NOW A REFUSAL, NOT A FINDING, AND THAT IS LOUDER. The legacy descriptor reported
// `token: "missing-closure"` at the pin path when `pin.json` was absent AND a real-tree anchor
// (`tooling/src/snap/cli.ts`) was present — the anchor existing only to keep a synthetic corpus quiet. Under
// this contract an absent pin makes the `devtools-closure` fact non-ready, `resolveResourceDeclarations`
// throws at the POPULATION phase and the owner is withheld before `create` runs (guide §3's acquisition-refusal rule), so
// the run is a TOOL ERROR — "I could not judge" rather than "the tree is wrong". `mustRefuse[0]` is that
// arm's successor proof, and the anchor guard retires with it because a `mode: "resource"` fixture
// materialises its own root and can never be a stray mini-project.
//
// FIX / AUTHORITY: `hard` by construction. Every finding anchors at the pin with `token: "asset-contract"`,
// a synthetic label that appears in no source file, so `locateFinding` could never bind an ordinary
// position to it — and a hash/licence/inventory violation in a VENDORED generated closure is not a site an
// author may absolve; the repair is `pnpm snap:devtools-assets`, not a waiver. Marker census 0 = 0 = 0
// (measured 2026-09-13: zero `@orb-gate-ignore devtools-frontend-assets` and zero
// `@orb-waive devtools-frontend-assets` anywhere on the tree, positive controls 132 files carrying the
// legacy opener and 774 carrying the final one), so no door is orphaned and no marker needed translating.
//
// ANCHOR MOVE, recorded rather than bucketed as metadata (§4.6 category 6): findings moved from
// `line: 0, column: 0` to `line: 1, column: 1`, the house one-based spelling. Nothing binds to either —
// the position is unwaivable under a `hard` policy and the census above is zero on both sides.
//
// DECLARED LIMITS, each naming the row that holds it: (1) the adjudicator throws on its FIRST violation, so
// one broken closure is exactly one finding however many members are wrong — `mustFlag[0]`'s `count: 1`
// over a single mutated asset is that claim, and it is why no row asserts a plural count. (2) The policy
// cannot distinguish an absent closure from an unreadable one; both are population-phase refusals and
// `mustRefuse[0]`/`mustRefuse[1]` pin the two doors that produce them (the closure, and the installed
// tuple, which is an UNPOPULATED kind acquired at the call rather than at planning).
import { createHash } from "node:crypto";
import type { DevToolsClosureInput, DevToolsInstalledTuple } from "../../_shared/devtools-assets.ts";
import { adjudicateDevToolsClosure, readChromiumBrowserVersion } from "../../_shared/devtools-assets.ts";
import { defineGate } from "../contract/policy.ts";
import { DEVTOOLS_CLOSURE_LICENSES, DEVTOOLS_CLOSURE_MANIFEST, DEVTOOLS_CLOSURE_PIN, DEVTOOLS_CLOSURE_ROOT } from "../contract/resource-artifact.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const MESSAGE =
  "the revision-matched official DevTools frontend closure is missing, stale, hash-drifted, path-open, license-incomplete, or disagrees with the installed Playwright/Chromium tuple; cascade provenance would be blind or non-hermetic (docs/architecture/core/Core-Tooling-Law.md §2.6)";

const REVISION = "33c2f401a9c8ddad2159eb0ab83aa244a5247361";
const ASSET_BODY = "official fixture asset";
const NOTICE_BODY = "BSD fixture notice";
const NOTICE_REL = "licenses/devtools-frontend/LICENSE";
const PLAYWRIGHT_VERSION = "1.61.1";
const BROWSER_VERSION = "149.0.7827.55";

/** Which single thing this fixture breaks. Exactly one arm per row, so a row cannot pass because a
 *  DIFFERENT violation fired first — the adjudicator throws on its first, so an overlapping fixture would
 *  silently re-point its own `messageIncludes`. */
interface ClosureFixtureBreak {
  readonly assetBody?: string;
  readonly decodedBytes?: number;
  readonly duplicateUrl?: boolean;
  readonly extraMember?: boolean;
  readonly escapingMember?: boolean;
  readonly licenseFamily?: string;
  readonly manifestSha256?: string;
  readonly mismatchedAssetFile?: boolean;
  readonly noticeSource?: string;
  readonly playwrightVersion?: string;
  readonly dropPin?: boolean;
  readonly dropInstalledCore?: boolean;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonical(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** A complete, self-consistent fixture closure plus the installed halves the tuple is held against, with at
 *  most one clause broken. The installed packages are planted under `node_modules/` on purpose: the
 *  conformance runner writes every fixture path to a real temp root and keeps non-authored segments OUT of
 *  the resource overlay, so node's own resolver — which is the only resolution this door performs — finds
 *  them exactly as it finds the real ones. */
function fixtureFiles(broken: ClosureFixtureBreak): Readonly<Record<string, string>> {
  const assetRel = `assets/serve_rev/@${REVISION}/inspector.html`;
  const manifestFile = broken.mismatchedAssetFile === true ? `assets/serve_rev/@${REVISION}/other.html` : assetRel;
  const resource = {
    url: `/serve_rev/@${REVISION}/inspector.html`,
    file: manifestFile,
    bytes: ASSET_BODY.length,
    sha256: sha256(ASSET_BODY),
    mimeType: "text/html",
    licenseFamily: broken.licenseFamily ?? "devtools-frontend",
  };
  const manifest = {
    schemaVersion: 1,
    resources: broken.duplicateUrl === true ? [resource, { ...resource }] : [resource],
  };
  const manifestText = canonical(manifest);
  const pin = canonical({
    schemaVersion: 1,
    playwrightVersion: broken.playwrightVersion ?? PLAYWRIGHT_VERSION,
    browserVersion: BROWSER_VERSION,
    chromiumRevision: "3188f8a607ae7e067593be8aab7f02d2451fec07",
    devtoolsFrontendRevision: REVISION,
    protocolVersion: "1.3",
    resourceCount: manifest.resources.length,
    decodedBytes: broken.decodedBytes ?? ASSET_BODY.length * manifest.resources.length,
    manifestSha256: broken.manifestSha256 ?? sha256(manifestText),
  });
  const licenses = canonical({
    schemaVersion: 1,
    families: [
      {
        family: "devtools-frontend",
        assetPrefix: "",
        notices: [
          {
            // A LICENCE notice's path carries no url/prefix correspondence, so it is the position where the
            // canonical-relative fence is the FIRST thing that can refuse — an escaping ASSET path is caught
            // one clause earlier by the `assets${url}` correspondence test and would pin that instead.
            file: broken.escapingMember === true ? `../escape/${NOTICE_REL}` : NOTICE_REL,
            source: broken.noticeSource ?? `https://chromium.googlesource.com/devtools/devtools-frontend/+/${REVISION}/LICENSE`,
            bytes: NOTICE_BODY.length,
            sha256: sha256(NOTICE_BODY),
          },
        ],
      },
    ],
  });
  return {
    ...(broken.dropPin === true ? {} : { [`${DEVTOOLS_CLOSURE_ROOT}/pin.json`]: pin }),
    [DEVTOOLS_CLOSURE_MANIFEST]: manifestText,
    [DEVTOOLS_CLOSURE_LICENSES]: licenses,
    [`${DEVTOOLS_CLOSURE_ROOT}/${assetRel}`]: broken.assetBody ?? ASSET_BODY,
    [`${DEVTOOLS_CLOSURE_ROOT}/${NOTICE_REL}`]: NOTICE_BODY,
    ...(broken.extraMember === true ? { [`${DEVTOOLS_CLOSURE_ROOT}/unreviewed.txt`]: "nobody granted this byte\n" } : {}),
    "package.json": canonical({ name: "orb-devtools-closure-proof", version: "0.0.0" }),
    "node_modules/@playwright/test/package.json": canonical({ name: "@playwright/test", version: PLAYWRIGHT_VERSION }),
    ...(broken.dropInstalledCore === true
      ? {}
      : {
          "node_modules/playwright-core/package.json": canonical({ name: "playwright-core", version: PLAYWRIGHT_VERSION }),
          "node_modules/playwright-core/browsers.json": canonical({ browsers: [{ name: "chromium", browserVersion: BROWSER_VERSION }] }),
        }),
  };
}

export const gate = defineGate({
  id: "devtools-frontend-assets",
  family: "devtools-frontend-assets",
  authority: "hard",
  severity: "error",
  population: {
    of: "none",
    why: "the DevTools closure is a vendored generated artifact plus the installed browser tuple it is pinned against — two closed ResourceHost facts, never a compiler population",
  },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [
    { kind: "devtools-closure" },
    { kind: "installed-package", id: "playwright-test", mode: "metadata" },
    { kind: "installed-package", id: "playwright-core", mode: "text", file: "browsers.json" },
  ],
  message: MESSAGE,
  fix: "run `pnpm snap:devtools-assets` for the ratified tuple, inspect the closure/license delta, and commit the generated root as one change",
  create: (ctx) => ({
    evaluate: () => {
      const closure: DevToolsClosureInput = readyResourceValue(ctx.resources.devtoolsClosure());
      const test = readyResourceValue(ctx.resources.installedPackage({ id: "playwright-test", mode: "metadata" }));
      const core = readyResourceValue(ctx.resources.installedPackage({ id: "playwright-core", mode: "text", file: "browsers.json" }));
      // `members` is the exact file census the closure door hashed — what this policy MEASURED, never a
      // verdict about it. The installed tuple contributes two documents the door already receipted.
      ctx.receipt({ kind: "resource", source: "devtools-frontend-assets", resources: closure.files.length, unresolved: 0 });
      const installed: DevToolsInstalledTuple = {
        version: test.mode === "metadata" ? test.version : "",
        browserVersion: core.mode === "text" ? readChromiumBrowserVersion(core.text) : "",
      };
      // @orb-waive caught-failure-ownership(error): every adjudicator failure is converted into this policy's asset-contract finding, which is the D950 ruling — an unprovable vendored closure IS the violation, not a broken checker. Ends if this catch stops reporting the failure detail.
      try {
        adjudicateDevToolsClosure(closure, installed);
      } catch (error) {
        ctx.report.file(DEVTOOLS_CLOSURE_PIN, {
          line: 1,
          column: 1,
          token: "asset-contract",
          message: `${error instanceof Error ? error.message : String(error)} — ${DEVTOOLS_CLOSURE_ROOT}`,
        });
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: fixtureFiles({ assetBody: "mutated fixture asset" }),
      // The count is the CLAIM and it is 1 by DESIGN, not by luck: the adjudicator throws on its first
      // violation, so a closure with any number of broken members produces exactly one finding. A row
      // asserting a plural count here would be asserting a shape this validator has never had.
      expect: { count: 1, token: "asset-contract", messageIncludes: "hash/size mismatch" },
      why: "a manifest member changed without regenerating its tuple hash/size; runtime bytes no longer equal reviewed bytes",
    },
    {
      mode: "resource",
      files: fixtureFiles({ extraMember: true }),
      expect: { count: 1, token: "asset-contract", messageIncludes: "missing or unexpected resources" },
      why: "THE EXACT-INVENTORY ARM: an unowned member nobody reviewed is as much a defect as a missing one — the closure's guarantee is that every served byte is an owned byte, and this row is what proves the census the resource door publishes is compared rather than merely acquired",
    },
    {
      mode: "resource",
      files: fixtureFiles({ escapingMember: true }),
      expect: { count: 1, token: "asset-contract", messageIncludes: "is not a canonical relative path" },
      why: "THE PATH FENCE, pinned for the first time by this conversion (§4.1): `safeMember` rejects a manifest member that is absolute, non-normalized or carries a `..` segment. The former `resolve(root, member)` escape branch beneath it was MUTUALLY REDUNDANT — any member surviving these four clauses is a strictly descending relative path — and was deleted with the root argument rather than carried as dead decoration, so this row is the whole fence",
    },
    {
      mode: "resource",
      files: fixtureFiles({ playwrightVersion: "0.0.0-planted-drift" }),
      expect: { count: 1, token: "asset-contract", messageIncludes: "Playwright/Chromium tuple drift" },
      why: "THE INSTALLED-TUPLE ARM: the pin is held against the package the repository actually installed, read through the two `installed-package` doors minted for this gate. Without this row both declarations could be acquired and their VALUES ignored, and the gate would pass on a closure built for a different browser",
    },
    {
      mode: "resource",
      files: fixtureFiles({ manifestSha256: sha256("planted wrong manifest") }),
      expect: { count: 1, token: "asset-contract", messageIncludes: "manifest checksum does not match the tuple pin" },
      why: "the manifest bytes differ from the checksum ratified in the tuple pin; acquiring both documents is not proof that the adjudicator compares them",
    },
    {
      mode: "resource",
      files: fixtureFiles({ decodedBytes: ASSET_BODY.length + 1 }),
      expect: { count: 1, token: "asset-contract", messageIncludes: "decoded-byte total drift" },
      why: "the per-resource rows agree but their total differs from the tuple pin, so a truncated or expanded generated closure cannot pass on internally consistent member hashes alone",
    },
    {
      mode: "resource",
      files: fixtureFiles({ noticeSource: "https://chromium.googlesource.com/devtools/devtools-frontend/+/wrong-revision/LICENSE" }),
      expect: { count: 1, token: "asset-contract", messageIncludes: "license source is not revision-pinned" },
      why: "the notice names a different upstream revision from the closure pin; a valid local notice hash does not establish provenance for the shipped revision",
    },
    {
      mode: "resource",
      files: fixtureFiles({ mismatchedAssetFile: true }),
      expect: { count: 1, token: "asset-contract", messageIncludes: "non-canonical or duplicate DevTools resource" },
      why: "the manifest file path is not the canonical `assets${url}` image of its served URL, so the reviewed file and the served route could diverge",
    },
    {
      mode: "resource",
      files: fixtureFiles({ duplicateUrl: true }),
      expect: { count: 1, token: "asset-contract", messageIncludes: "non-canonical or duplicate DevTools resource" },
      why: "two manifest rows claim the same served URL; the second row must not silently replace the first in the runtime's URL map",
    },
    {
      mode: "resource",
      files: fixtureFiles({ licenseFamily: "absent-family" }),
      expect: { count: 1, token: "asset-contract", messageIncludes: "absent or mismatched license family" },
      why: "an asset names no declared license family, so complete notice files alone cannot make its own provenance known",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: fixtureFiles({}),
      why: "a complete one-resource tuple with an exact inventory and revision-pinned license notice passes through the same adjudicator the runtime uses",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: fixtureFiles({ dropPin: true }),
      // The legacy `missing-closure` finding's successor. A tool error says "I could not judge"; the legacy
      // finding said "the tree is wrong" about a tree it had not read.
      expect: { messageIncludes: "devtools-closure is" },
      why: "an absent pin makes the closure fact non-ready, so the owner is withheld at the population phase instead of reporting a finding about a closure it never loaded",
    },
    {
      mode: "resource",
      files: fixtureFiles({ dropInstalledCore: true }),
      // `installed-package` is an UNPOPULATED kind, so it is NOT pre-acquired at the population phase — it
      // is acquired at the call, and its non-ready fact reaches `readyResourceValue`, which throws. Two
      // different refusal doors, which is why both are pinned.
      expect: { messageIncludes: "installed-package:playwright-core" },
      why: "an uninstalled browser half refuses loudly at the call rather than letting the tuple comparison run against an empty version string",
    },
  ],
});
