// Gate: client-package-no-side-effects — `packages/client/package.json` must not declare `sideEffects`.
// Rolldown applies the nearest manifest's field to the app's own modules (vitejs/vite#22620), so any value
// lets the bundler drop `main.tsx`'s bare `import "./styles/index.ts"`: #1752 shipped production with no
// stylesheet for five days behind a `sideEffects` allowlist. The owner removed the field (2026-09-05). ONE
// ARM: the field is present, whatever its value (`false`, `true`, an allowlist). DECLARED LIMIT: the other
// workspace packages are libraries, which `.claude/rules/tooling.md` requires to declare the field, so only
// the client manifest is read (`mustPass[1]`). The build-output half is `quality:boot-chunk`'s stylesheet
// check (tooling/src/verify/ops/boot-chunk-ratchet.ts), which catches every other way the sheet is lost.
// FAMILY: singleton — the subject is one field of one workspace manifest and no other policy reads package sideEffects.
// POPULATION: new policy; none, the manifest is the declared `package-metadata:client` resource.
// RETIRED MARKERS: none.
import { defineGate } from "../contract/policy.ts";
import { PACKAGE_RESOURCE_PATHS } from "../contract/resource-config.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const CLIENT_MANIFEST = PACKAGE_RESOURCE_PATHS.client;
const MESSAGE =
  "the client package declares `sideEffects`; the bundler applies it to the app's own modules and can drop the " +
  "bare CSS front-door import, shipping production without its stylesheet (#1752, packages/client/src/styles/index.ts)";

export const gate = defineGate({
  id: "client-package-no-side-effects",
  family: "client-package-no-side-effects",
  // No waiver: the owner ruled the field gone for good, and a whole-manifest verdict has no token to bind.
  authority: "hard",
  severity: "error",
  population: { of: "none", why: "the subject is one field of the client manifest, a declared ResourceHost fact" },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "package-metadata", id: "client" }],
  message: MESSAGE,
  fix: "delete the `sideEffects` field from packages/client/package.json. An app is not a library: every module in it is side-effectful by default.",
  create: (ctx) => ({
    evaluate: () => {
      if (readyResourceValue(ctx.resources.packageMetadata("client")).declaresSideEffects) {
        ctx.report.file(CLIENT_MANIFEST, { line: 1, column: 1 });
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: { "packages/client/package.json": '{"name":"@orb/client","private":true,"sideEffects":["**/*.css"]}\n' },
      expect: { count: 1 },
      why: "the #1752 founding shape: a CSS-only allowlist whose glob cannot match the `.ts` front door",
    },
    {
      mode: "resource",
      files: { "packages/client/package.json": '{"name":"@orb/client","private":true,"sideEffects":false}\n' },
      expect: { count: 1 },
      why: "`false` declares every module droppable, the widest form of the same defect",
    },
    {
      mode: "resource",
      files: { "packages/client/package.json": '{"name":"@orb/client","private":true,"sideEffects":true}\n' },
      expect: { count: 1 },
      why: "`true` is still a declaration: the ban is on the field, so a later edit to its value cannot slip past",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: { "packages/client/package.json": '{"name":"@orb/client","private":true,"exports":{".":"./src/index.ts"}}\n' },
      why: "a client manifest with no `sideEffects` key is the ruled shape",
    },
    {
      mode: "resource",
      files: {
        "packages/client/package.json": '{"name":"@orb/client","private":true}\n',
        "packages/ui/package.json": '{"name":"@orb/ui","private":true,"sideEffects":["**/*.css"]}\n',
      },
      why: "a LIBRARY package keeps its `sideEffects` field; only the client manifest is read",
    },
  ],
  mustRefuse: [
    {
      mode: "resource",
      files: { "packages/ui/package.json": '{"name":"@orb/ui","private":true}\n' },
      expect: { messageIncludes: "package-metadata:client" },
      why: "an absent client manifest refuses at the population phase instead of reading as a clean manifest",
    },
  ],
});
