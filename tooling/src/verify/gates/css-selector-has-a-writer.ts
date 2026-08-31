// Gate: css-selector-has-a-writer (#956 / client-architecture-lockdown.md §4.7).
import type { GateDescriptor } from "../contract/gate.ts";
import { CLIENT_GLOBALS, SHELL, THEME, TIERS, UI_GLOBALS } from "../lib/css-family-census.ts";
import { beginHookOwnerCollection } from "../lib/css-family-source-provenance.ts";
import { auditCssSelectorWriters } from "../lib/css-selector-writer-policy.ts";
import { beginSelectorWriterCollection, visitSelectorWriterNode } from "../lib/css-selector-writers.ts";
import { STATIC_CLASS_KINDS } from "../lib/static-class-expression.ts";

const EMPTY_HOMES = { [THEME]: "", [UI_GLOBALS]: "", [TIERS]: "", [CLIENT_GLOBALS]: "", [SHELL]: "" } as const;
const SOURCE = "packages/client/src/features/probe.tsx";
const STREAMDOWN = "packages/ui/node_modules/streamdown/dist/chunk-BO2N2NFS.js";

export const gate: GateDescriptor = {
  name: "css-selector-has-a-writer",
  docRow: "client-architecture-lockdown.md §4.7 (#956)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message: "an authored product-CSS selector hook has no semantic producer/writer; inert text cannot counterfeit DOM ownership",
  fix: "write the exact hook from a rendering/DOM terminal, remove the dead selector, or update the narrow vendor contract in both directions",
  begin: (ctx) => {
    beginHookOwnerCollection(ctx);
    beginSelectorWriterCollection(ctx);
  },
  kinds: STATIC_CLASS_KINDS,
  visit: visitSelectorWriterNode,
  finalize: auditCssSelectorWriters,
  mustFlag: [
    {
      files: {
        ...EMPTY_HOMES,
        [TIERS]: '[data-density="birdie"] { --spacing-row: 1rem; }\n',
        [SOURCE]: 'const density: "compact" | "comfortable" = "compact";\nexport const probe = <div data-density={density} />;\n',
      },
      expect: { count: 1, token: 'data-density="birdie"' },
      why: "an exact density arm is dead when the rendered discriminant cannot produce that member",
    },
    {
      files: { ...EMPTY_HOMES, [SHELL]: ".shell-wrapper { display: grid; }\n", [SOURCE]: 'const prose = ".shell-wrapper";\nexport { prose };\n' },
      expect: { count: 1, token: "class:shell-wrapper" },
      why: "an inert class string cannot counterfeit a rendered shell wrapper",
    },
    {
      files: {
        ...EMPTY_HOMES,
        [CLIENT_GLOBALS]: "[data-birdie] { color: red; }\n",
        [SOURCE]: "// data-birdie is intentionally prose only\nexport const probe = null;\n",
      },
      expect: { count: 1, token: "data-birdie" },
      why: "comment-only data attribute text is not a writer",
    },
    {
      files: {
        ...EMPTY_HOMES,
        [CLIENT_GLOBALS]: '[data-spread="wide"] { color: red; }\n',
        [SOURCE]: 'const inert = { "data-spread": "wide" };\nexport { inert };\n',
      },
      expect: { count: 1, token: 'data-spread="wide"' },
      why: "an arbitrary object property is not ownership until it reaches a semantic spread terminal",
    },
    {
      files: {
        ...EMPTY_HOMES,
        [CLIENT_GLOBALS]: "[data-inert-properties] { color: red; }\n",
        [SOURCE]: 'const inert = { properties: { "data-inert-properties": true } };\nexport { inert };\n',
      },
      expect: { count: 1, token: "data-inert-properties" },
      why: "an arbitrary object named properties is not a HAST element writer without the rendered element shape",
    },
    {
      files: {
        ...EMPTY_HOMES,
        [CLIENT_GLOBALS]: '[data-mode="compact"] { color: red; }\n',
        [SOURCE]: "declare const tail: string;\nexport const probe = <div data-mode={`com${tail}`} />;\n",
      },
      expect: { count: 1, token: 'data-mode="compact"' },
      why: "unsupported dynamic construction stays honestly opaque instead of guessing a value",
    },
    {
      files: EMPTY_HOMES,
      expect: { count: 1, token: "selector-population:0" },
      why: "zero selector population is blindness, not green",
    },
    {
      files: { ...EMPTY_HOMES, [UI_GLOBALS]: '[data-streamdown="code-block"] { contain: paint; }\n', [STREAMDOWN]: "export const vendor = {};\n" },
      expect: { count: 2, token: 'data-streamdown="code-block"' },
      why: "a selector cannot outlive the installed vendor emission contract",
    },
    {
      files: {
        ...EMPTY_HOMES,
        [UI_GLOBALS]: ".vendor-stale-control { color: inherit; }\n",
        [SOURCE]: 'export const probe = <div className="vendor-stale-control" />;\n',
        [STREAMDOWN]: 'export const vendor={"data-streamdown":"code-block"};\n',
      },
      expect: { count: 1, token: 'data-streamdown="code-block"' },
      why: "the vendor contract reds when its selector side goes stale",
    },
  ],
  mustPass: [
    {
      files: {
        ...EMPTY_HOMES,
        [CLIENT_GLOBALS]: '[data-density="compact"] { color: red; }\n',
        [SOURCE]: 'const density: "compact" | "comfortable" = "compact";\nexport const probe = <div data-density={density} />;\n',
      },
      why: "a rendered literal-union member is an exact semantic writer",
    },
    {
      files: { ...EMPTY_HOMES, [SHELL]: ".shell-wrapper { display: grid; }\n", [SOURCE]: 'export const probe = <div className="shell-wrapper" />;\n' },
      why: "a real JSX class terminal writes the shell hook",
    },
    {
      files: {
        ...EMPTY_HOMES,
        [CLIENT_GLOBALS]: '[data-spread="wide"] { color: red; }\n',
        [SOURCE]: 'const attributes = { "data-spread": "wide" } as const;\nexport const probe = <div {...attributes} />;\n',
      },
      why: "the shared exact-terminal resolver follows an object only when JSX actually spreads it",
    },
    {
      files: {
        ...EMPTY_HOMES,
        [UI_GLOBALS]: '[data-streamdown="code-block"] { contain: paint; }\n',
        [STREAMDOWN]: 'export const vendor={"data-streamdown":"code-block"};\n',
      },
      why: "the narrow installed Streamdown emission contract owns its exact selector identity",
    },
  ],
};
