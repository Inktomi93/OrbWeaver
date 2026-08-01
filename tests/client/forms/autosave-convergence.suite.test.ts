// Cross-cutting PROPERTY suite (`.suite.test.ts` — exempt from the 1:1 test-layout mirror; it spans every
// autosave form model): the CONVERGENCE property behind the localStorage-brick fix (retro-workboard #11).
//
// The brick's oscillation vector is a NON-IDEMPOTENT project/save/echo hop: if projecting a server row to
// form values, mapping back to a save patch, applying it (the SERVER SHAPE — a zod parse with its `.catch`
// / `.default` / versioned-config lift), and re-projecting does NOT yield the same form values, then a
// clean autosave form can save → the echo comes back CHANGED → last-writer-wins re-submits → forever. The
// baseline-gated draft kills the KNOWN trigger (a stale draft); this suite proves each mapper is a fixed
// point so no residual mapper non-idempotence can seed a fresh loop. Round-trip asserted per form model:
//   projectForm( serverShape( toPatch( projectForm(serverRow) ) ) )  ≡structural≡  projectForm(serverRow)
//
// A failing case is a FINDING (a mapper bug or an intrinsic non-invertibility), reported — never pinned
// around. The system-settings arm RETIRED with SET-SEAMS stage 4: it was the one KNOWN intrinsic
// non-round-trip (an autosave form editing a DIFF against two mount baselines), and the decomposed admin
// sections have no such mapper at all — each reads `getAppSettingsWithOverrides` (floor AND stored override)
// and writes a sparse patch of its own keys, so there is no project→save→echo cycle left to oscillate.

import type { RegexScript } from "@orb/contracts/regex";
import type { AppearanceSettings, ChatSettings } from "@orb/contracts/settings";
import {
  backgroundLibraryEntrySchema,
  DEFAULT_APPEARANCE_SETTINGS,
  DEFAULT_CHAT_SETTINGS,
  DEFAULT_USER_SETTINGS,
  userSettingsSchema,
} from "@orb/contracts/settings";
import type { ThemeOverride } from "@orb/contracts/theme";
import { themeOverrideSchema } from "@orb/contracts/theme";
import { describe } from "vitest";
import type { CharacterThemeFormValues } from "../../../packages/client/src/features/character/lib/character-theme-form-model";
import { characterThemeFormFromOverride, overrideFromCharacterThemeForm } from "../../../packages/client/src/features/character/lib/character-theme-form-model";
import { projectMessageHandlingForm, toMessageHandlingPatch } from "../../../packages/client/src/features/chat/lib/chat-behavior-message-handling-model";
import { expect, test } from "../../support/fixtures";

// The SERVER SHAPE for a `userSettings` section: the section patch is deep-merged into the settings blob
// and re-parsed (the `updateUserSettingsSection` write path), then the section is plucked back. This runs
// the section's zod `.catch`/`.default`/nested-prefault exactly as the server would on the echo.
/** A DEEP-partial section patch (mirrors the real deep-merge write: a pane that edits only some fields — e.g.
 *  chat's `toMessageHandlingPatch` omits the leaves it doesn't surface, including the nested
 *  `autoSwipe.maxRetries` — leaves them untouched). */
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function serverShapeSection<K extends keyof typeof DEFAULT_USER_SETTINGS>(
  section: K,
  patch: DeepPartial<(typeof DEFAULT_USER_SETTINGS)[K]>,
): (typeof DEFAULT_USER_SETTINGS)[K] {
  // Shallow-merge the top-level patch into the default section; the schema `.catch`/`.default`/nested-prefault
  // then run on the echo. A nested partial (e.g. `autoSwipe` without maxRetries) is re-parsed to its default.
  const merged = { ...(DEFAULT_USER_SETTINGS[section] as object), ...(patch as object) };
  return userSettingsSchema.parse({ ...DEFAULT_USER_SETTINGS, [section]: merged })[section];
}

// ── chat-behavior › message handling (SET-SEAMS stage 2 — the section owns its own project/save) ────
// project = projectMessageHandlingForm, save = toMessageHandlingPatch, serverShape = chatSchema.parse. The
// SIBLING streaming section needs no arm here: its form value IS a `Pick<ChatSettings, …>` (pickKeys both
// ways), so project/save is the identity and the round-trip is the schema's own idempotence, already
// covered by the appearance arm's identity case.
describe("convergence: chat-behavior message handling", () => {
  const rows: readonly ChatSettings[] = [
    DEFAULT_CHAT_SETTINGS,
    {
      enterSends: false,
      continueOnSend: false,
      generateOnEmptySend: false,
      autoContinue: true,
      // Both NON-default (the section owns them now): a projection that dropped either would echo back the
      // schema default and fail the fixed point.
      autoContinueRounds: 3,
      autoSwipe: { enabled: true, minLength: 120, blacklist: ["As an AI", "I cannot"], maxRetries: 1 },
      customStoppingStrings: ["###", "END"],
      tempChatTtlHours: 72,
      smoothStream: true,
      smoothStreamCps: 150,
      streamScrollMode: "pin-prompt",
    },
  ];
  test.each(rows.map((r, i) => [i, r] as const))("row %i is a project/save/echo fixed point", (_i, row) => {
    const form = projectMessageHandlingForm(row);
    const echoed = projectMessageHandlingForm(serverShapeSection("chat", toMessageHandlingPatch(form)));
    expect(echoed).toEqual(form);
  });
});

// ── appearance ─────────────────────────────────────────────────────────────────────────────────────
// project = identity (the form value IS AppearanceSettings); save = whole-section identity; serverShape =
// appearanceSchema.parse. The round-trip proves the schema's `.catch`/`.default` are idempotent on a
// valid row (a non-idempotent default would be the oscillation vector even with an identity projection).
describe("convergence: appearance", () => {
  const rows: readonly AppearanceSettings[] = [
    DEFAULT_APPEARANCE_SETTINGS,
    {
      ...DEFAULT_APPEARANCE_SETTINGS,
      chatWidthPct: 80,
      fontScale: 1.2,
      avatarShape: "square",
      density: "compact",
      blurSurfaces: ["panels", "composer"],
      backgroundDim: 0.7,
      backgroundLibrary: [
        backgroundLibraryEntrySchema.parse({ entryId: "bg-row-0", assetId: "asset_01h455vb4pex5vsknk084sn02q", assetHash: "h", mime: "image/png", name: "bg" }),
      ],
    },
  ];
  test.each(rows.map((r, i) => [i, r] as const))("row %i round-trips through the appearance section", (_i, row) => {
    const echoed = serverShapeSection("appearance", { ...row });
    expect(echoed).toEqual(row);
  });
});

// ── regex ──────────────────────────────────────────────────────────────────────────────────────────
// project = { regexScripts: server.scripts }, save = { scripts: form.regexScripts }, serverShape =
// regexSettingsSchema.parse. A pure rename plus a defaulting array — must be a fixed point.
describe("convergence: regex", () => {
  const script: RegexScript = {
    id: "rgx-0001",
    name: "trim asterisks",
    findRegex: "\\*+",
    replaceString: "",
    placement: ["USER_INPUT"],
    enabled: true,
    markdownOnly: false,
    promptOnly: false,
    runOnEdit: false,
    trimStrings: [],
    substituteRegex: 0,
    minDepth: null,
    maxDepth: null,
  };
  const projectRegex = (scripts: readonly RegexScript[]): { readonly regexScripts: readonly RegexScript[] } => ({ regexScripts: scripts });
  const toRegexPatch = (form: { readonly regexScripts: readonly RegexScript[] }): { scripts: RegexScript[] } => ({ scripts: [...form.regexScripts] });

  const noScripts: RegexScript[] = [];
  test.each([
    ["empty", noScripts],
    ["one script", [script]],
  ])("%s is a project/save/echo fixed point", (_label, scripts) => {
    const form = projectRegex(scripts);
    const echoed = projectRegex(serverShapeSection("regex", toRegexPatch(form)).scripts);
    expect(echoed).toEqual(form);
  });
});

// ── character theme ────────────────────────────────────────────────────────────────────────────────
// project = characterThemeFormFromOverride, save = overrideFromCharacterThemeForm (→ ThemeOverride|null),
// serverShape = themeOverrideSchema.parse (null passes through as the null/empty override). The sentinel
// round-trip (empty string / THEME_INHERIT ↔ omitted field) is the exact place a non-idempotence would hide.
describe("convergence: character theme", () => {
  const overrides: readonly (ThemeOverride | null)[] = [
    null,
    { accent: "#ff8800", font: "Georgia", chatStyle: "flat", density: "compact" },
    { background: "#101014", userBubble: { bg: "#222", fg: "#eee" }, radius: "card" },
  ];
  const echo = (form: CharacterThemeFormValues): CharacterThemeFormValues => {
    const built = overrideFromCharacterThemeForm(form);
    const parsed = built === null ? null : themeOverrideSchema.parse(built);
    return characterThemeFormFromOverride(parsed);
  };
  test.each(overrides.map((o, i) => [i, o] as const))("override %i is a project/save/echo fixed point", (_i, override) => {
    const form = characterThemeFormFromOverride(override);
    expect(echo(form)).toEqual(form);
  });
});
