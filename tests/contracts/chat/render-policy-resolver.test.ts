// The HTML-trust model's resolvers, one case per row of the trust table in docs/law/UI-Theming-and-Content.md §12.2: what
// each author kind draws under each "Default for characters" step, whose setting holds external media out, and when a
// viewer's own script consent counts. Every table is exhaustive by type, so a new step or failure fails `tsc` here.
// @subject packages/contracts/src/chat/roster.ts
// @subject packages/contracts/src/settings/index.ts
import type { DeploymentRenderPolicy, HtmlTrustStep, RenderPolicyOverride } from "@orb/contracts/chat";
import { HTML_TRUST_STEPS, renderPolicyOverrideForStep, resolveCardMediaVerdict, resolveRenderPolicy, resolveSeatRenderPolicy } from "@orb/contracts/chat";
import { DEFAULT_USER_SETTINGS, viewerRunsCardScripts } from "@orb/contracts/settings";
import type { VersionedParseFailure } from "@orb/contracts/versioned-config";
import { VERSIONED_PARSE_FAILURES } from "@orb/contracts/versioned-config";
import { expect, test } from "@orb/testkit/node";

type CardMediaVerdict = ReturnType<typeof resolveCardMediaVerdict>;

const INHERIT: RenderPolicyOverride = { trustHtml: null, forbidExternalMedia: null, interactiveHtml: null };

// The character answers a stored row can hold, beside the two seats no card covers.
const CHARACTER_ANSWERS = {
  "Inherit default": INHERIT,
  "Plain text": { ...INHERIT, ...renderPolicyOverrideForStep("untrusted") },
  "Rich HTML": { ...INHERIT, ...renderPolicyOverrideForStep("trusted") },
  ["Interactive"]: { ...INHERIT, ...renderPolicyOverrideForStep("interactive") },
  // A handoff copy keeps the render answer and drops the top step (D294).
  "a handoff copy of Rich HTML": { ...INHERIT, trustHtml: true },
  // Reachable only by a direct write; the Trust tab shows it as Inherit default.
  "render inherited, Interactive refused": { ...INHERIT, interactiveHtml: false },
  // Reachable only by a direct write; the top step wins inside the ceiling.
  "Interactive over Plain text": { ...INHERIT, trustHtml: false, interactiveHtml: true },
} as const satisfies Record<string, RenderPolicyOverride>;
type CharacterAnswer = keyof typeof CHARACTER_ANSWERS;
const NO_CARD_BASES = ["no-card", "no-host"] as const;
type Author = CharacterAnswer | (typeof NO_CARD_BASES)[number];

// The step each author draws at, by the install's "Default for characters". A new step fails `tsc` until it has a row.
const DRAWS = {
  interactive: {
    "Inherit default": "interactive",
    "Plain text": "untrusted",
    "Rich HTML": "trusted",
    ["Interactive"]: "interactive",
    "a handoff copy of Rich HTML": "trusted",
    "render inherited, Interactive refused": "trusted",
    "Interactive over Plain text": "interactive",
    "no-card": "untrusted",
    "no-host": "untrusted",
  },
  trusted: {
    "Inherit default": "trusted",
    "Plain text": "untrusted",
    "Rich HTML": "trusted",
    ["Interactive"]: "trusted",
    "a handoff copy of Rich HTML": "trusted",
    "render inherited, Interactive refused": "trusted",
    "Interactive over Plain text": "untrusted",
    "no-card": "untrusted",
    "no-host": "untrusted",
  },
  untrusted: {
    "Inherit default": "untrusted",
    "Plain text": "untrusted",
    "Rich HTML": "trusted",
    ["Interactive"]: "trusted",
    "a handoff copy of Rich HTML": "trusted",
    "render inherited, Interactive refused": "untrusted",
    "Interactive over Plain text": "untrusted",
    "no-card": "untrusted",
    "no-host": "untrusted",
  },
} as const satisfies Record<HtmlTrustStep, Record<Author, HtmlTrustStep>>;

function isCharacterAnswer(name: string): name is CharacterAnswer {
  return Object.hasOwn(CHARACTER_ANSWERS, name);
}

function drawnStep(deployment: DeploymentRenderPolicy, author: string): HtmlTrustStep {
  const basis = NO_CARD_BASES.find((candidate) => candidate === author);
  if (basis !== undefined) {
    return resolveSeatRenderPolicy(deployment, basis).renderPolicy.htmlTrust;
  }
  if (!isCharacterAnswer(author)) {
    throw new Error(`no stored answer named ${author}`);
  }
  return resolveRenderPolicy(deployment, CHARACTER_ANSWERS[author]).htmlTrust;
}

for (const defaultHtmlStep of HTML_TRUST_STEPS) {
  for (const [author, step] of Object.entries(DRAWS[defaultHtmlStep])) {
    test(`default for characters ${defaultHtmlStep}: ${author} draws at ${step}`, () => {
      expect(drawnStep({ defaultHtmlStep, forbidExternalMedia: false }, author)).toBe(step);
    });
  }
}

// External media is tighten-only: the install binds whenever it forbids, and a character may only forbid further.
const MEDIA_CASES = [
  { install: false, character: null, forbidden: false },
  { install: false, character: false, forbidden: false },
  { install: false, character: true, forbidden: true },
  { install: true, character: null, forbidden: true },
  { install: true, character: false, forbidden: true },
  { install: true, character: true, forbidden: true },
] as const;

for (const { install, character, forbidden } of MEDIA_CASES) {
  test(`install forbids ${String(install)}, character forbids ${String(character)}: forbidden ${String(forbidden)}, on a seat with no card too`, () => {
    const deployment: DeploymentRenderPolicy = { defaultHtmlStep: "interactive", forbidExternalMedia: install };
    expect(resolveRenderPolicy(deployment, { ...INHERIT, forbidExternalMedia: character }).forbidExternalMedia).toBe(forbidden);
    expect(resolveSeatRenderPolicy(deployment, "no-card").renderPolicy.forbidExternalMedia).toBe(install);
  });
}

// The frame's media grant names the setting that holds external media out, the install first; `data:` images open from
// Rich HTML up, whatever external media does.
const MEDIA_VERDICTS = {
  "install forbids, character forbids": { installForbids: true, characterForbids: true, external: { loads: false, heldBy: "install" } },
  "install forbids, character allows": { installForbids: true, characterForbids: false, external: { loads: false, heldBy: "install" } },
  "install allows, character forbids": { installForbids: false, characterForbids: true, external: { loads: false, heldBy: "character" } },
  "install allows, character allows": { installForbids: false, characterForbids: false, external: { loads: true } },
} as const satisfies Record<string, { readonly installForbids: boolean; readonly characterForbids: boolean; readonly external: CardMediaVerdict["external"] }>;

for (const [name, row] of Object.entries(MEDIA_VERDICTS)) {
  for (const htmlTrust of HTML_TRUST_STEPS) {
    test(`media verdict, ${name}, step ${htmlTrust}`, () => {
      expect(resolveCardMediaVerdict({ installForbids: row.installForbids, policy: { htmlTrust, forbidExternalMedia: row.characterForbids } })).toEqual({
        external: row.external,
        inlineData: htmlTrust !== "untrusted",
      });
    });
  }
}

// A viewer's consent counts only from a blob read faithfully; every degraded read is no, whatever its stand-in says.
const READS = { intact: null, ...VERSIONED_PARSE_FAILURES } as const satisfies Record<string, VersionedParseFailure | null>;

for (const [read, configUnreadable] of Object.entries(READS)) {
  for (const runCardScripts of [true, false]) {
    test(`a ${read} settings read with runCardScripts ${String(runCardScripts)} consents ${String(configUnreadable === null && runCardScripts)}`, () => {
      const config = { ...DEFAULT_USER_SETTINGS, chat: { ...DEFAULT_USER_SETTINGS.chat, runCardScripts } };
      expect(viewerRunsCardScripts({ config, configUnreadable })).toBe(configUnreadable === null && runCardScripts);
    });
  }
}
