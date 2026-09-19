// R6/R7 settings and theme judgments, split from the literal dispatcher before its next edit crossed the
// tooling cap. These remain explicit row checks, not a generic assertion layer or copied subject policy.

import { parseCssColorToSrgb } from "@orb/kit/safe-color";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { AppearanceInvariantCheck } from "../contract/appearance-invariants.ts";
import type { AppearanceCheckContext } from "./appearance-invariant-check-context.ts";
import type { AppearanceDomSnapshot, AppearanceElementFacts } from "./appearance-invariant-dom.ts";

const NONVIRTUALIZED_CLS_CEILING = 0.1;
const THEME_CHANNEL_TOLERANCE = 2;
const SPACING_PROPERTIES = ["--spacing-field", "--spacing-row", "--spacing-block", "--spacing-section"] as const;

refuseDirectInvocation(import.meta.url, "pnpm snap --matrix");

function check(id: string, passed: boolean, expected: string, actual: string): AppearanceInvariantCheck {
  return { id, expected, actual, passed };
}

function facts(snapshot: AppearanceDomSnapshot, id: string): AppearanceElementFacts | null {
  return snapshot.subjects.find((candidate) => candidate.id === id)?.facts ?? null;
}

function style(snapshot: AppearanceDomSnapshot, id: string, property: string): string {
  return facts(snapshot, id)?.style[property] ?? "";
}

function attr(snapshot: AppearanceDomSnapshot, id: string, name: string): string | null {
  return facts(snapshot, id)?.attributes[name] ?? null;
}

function inside(inner: AppearanceElementFacts | null, outer: AppearanceElementFacts | null): boolean {
  return (
    inner !== null &&
    outer !== null &&
    inner.rect.left >= outer.rect.left - 1 &&
    inner.rect.top >= outer.rect.top - 1 &&
    inner.rect.right <= outer.rect.right + 1 &&
    inner.rect.bottom <= outer.rect.bottom + 1
  );
}

function clsCheck(snapshot: AppearanceDomSnapshot): AppearanceInvariantCheck {
  return check(
    "cls-budget",
    snapshot.cls !== null && snapshot.cls <= NONVIRTUALIZED_CLS_CEILING,
    `nonvirtualized CLS <= ${NONVIRTUALIZED_CLS_CEILING}`,
    snapshot.cls === null ? "unavailable" : String(snapshot.cls),
  );
}

function spacingVector(snapshot: AppearanceDomSnapshot | undefined, id: string): string {
  return snapshot === undefined ? "" : SPACING_PROPERTIES.map((property) => style(snapshot, id, property)).join("|");
}

export function buildDensityPreviewChecks(ctx: AppearanceCheckContext): readonly AppearanceInvariantCheck[] {
  const { current, before } = ctx;
  const popup = facts(current, "dialog-popup");
  const popupBefore = before === undefined ? null : facts(before, "dialog-popup");
  const viewport = facts(current, "dialog-viewport");
  const outer = attr(current, "outer-scope", "data-density");
  const outerBefore = before === undefined ? null : attr(before, "outer-scope", "data-density");
  const draft = attr(current, "density-preview", "data-density");
  const draftBefore = before === undefined ? null : attr(before, "density-preview", "data-density");
  const beforeVector = spacingVector(before, "density-preview");
  const afterVector = spacingVector(current, "density-preview");
  const outerBeforeVector = spacingVector(before, "outer-scope");
  const outerAfterVector = spacingVector(current, "outer-scope");
  const popupBeforeVector = spacingVector(before, "dialog-popup");
  const popupAfterVector = spacingVector(current, "dialog-popup");
  const isolation = ctx.mutationIsolation;
  return [
    // THE SUBJECT SELECTOR SWAPS NODES ACROSS THE PICK (#2448). `density-preview` resolves to the UNCHECKED
    // cell's art (appearance-invariant-manifest.ts DENSITY_PREVIEW), and each cell's art carries ITS OWN
    // option as `data-density` — the art IS the definition, never a live preview of the draft
    // (appearance-density-cards.tsx). So the unchecked cell is the shell's OPPOSITE only until the drive
    // picks it: afterwards the unchecked cell is the one the shell already wears. Reading this on `current`
    // alone therefore asserted a relationship the drive had just inverted, and failed at BOTH endpoints the
    // moment #2437 made the click land at all — the cell had died upstream before that, so the inversion
    // had never been reachable. Both snapshots are judged instead, which says strictly more than the
    // original one ever did: two distinct densities coexist at rest, AND the pick moved the selection.
    check(
      "opposite-density",
      outer !== null && draftBefore !== null && outer !== draftBefore && draft !== null && draft === outer,
      "unchecked preview owns the opposite density at rest and the shell's own after the pick swaps cells",
      `outer=${String(outer)} before=${String(draftBefore)} after=${String(draft)}`,
    ),
    check(
      "token-isolation",
      before !== undefined &&
        beforeVector !== "" &&
        beforeVector !== afterVector &&
        outerBefore !== null &&
        outerBefore === outer &&
        outerBeforeVector !== "" &&
        outerBeforeVector === outerAfterVector &&
        popupBeforeVector !== "" &&
        popupBeforeVector === popupAfterVector,
      "preview token vector changes while outer carrier and dialog popup remain byte-stable",
      `preview:${beforeVector}->${afterVector}; outer:${String(outerBefore)}:${outerBeforeVector}->${String(outer)}:${outerAfterVector}; popup:${popupBeforeVector}->${popupAfterVector}`,
    ),
    check("modal-stacking", popup?.hitOwnsCenter === true, "popup paints above backdrop", String(popup?.hitOwnsCenter ?? "unavailable")),
    check("popup-contained", inside(popup, viewport), "popup inside dialog viewport", String(inside(popup, viewport))),
    check(
      "rect-stable",
      popupBefore !== null &&
        popup !== null &&
        Math.abs(popupBefore.rect.width - popup.rect.width) <= 1 &&
        Math.abs(popupBefore.rect.height - popup.rect.height) <= 1,
      "registered dialog popup keeps its footprint across close/toggle/reopen",
      `${popupBefore?.rect.width}x${popupBefore?.rect.height}->${popup?.rect.width}x${popup?.rect.height}`,
    ),
    check(
      "persistence-isolation",
      isolation?.attempted === 1 &&
        isolation.exact === 1 &&
        isolation.fulfilled === 1 &&
        isolation.continued === 0 &&
        isolation.section === "appearance" &&
        // The PICKED density is the one the unchecked cell offered AT REST — `driveOppositeDensity` clicks
        // the label opposite the shell carrier, which is that cell. It is not `draft`: after the pick the
        // selector resolves to the other cell, whose art is the shell's own density (#2448).
        isolation.density === draftBefore,
      "one exact appearance density draft is fulfilled by the stage-local guard and zero requests reach the server origin",
      isolation === undefined
        ? "unavailable"
        : // `body=` is the reader's own door (#2448): a null section used to be indistinguishable from a
          // body the guard had mis-shaped, and it was diagnosed as the former for exactly that reason.
          `attempted=${String(isolation.attempted)} exact=${String(isolation.exact)} fulfilled=${String(isolation.fulfilled)} origin=${String(isolation.continued)} section=${String(isolation.section)} density=${String(isolation.density)} body=${String(isolation.bodyShape)}`,
    ),
    clsCheck(current),
  ];
}

export function buildPrepaintChecks(ctx: AppearanceCheckContext): readonly AppearanceInvariantCheck[] {
  const current = ctx.current;
  const actualTheme = ctx.settings.themeResolution;
  const os = ctx.environment.actual.colorScheme;
  const theme = ctx.settings.themeCatalog?.find((entry) => entry.id === actualTheme?.id);
  const expectedBackground = theme === undefined || theme.background === null ? null : parseCssColorToSrgb(theme.background);
  const actualBackground = parseCssColorToSrgb(style(current, "active-scope", "--color-background"));
  const themeDelta =
    expectedBackground === null || actualBackground === null
      ? null
      : Math.max(
          Math.abs(expectedBackground.r - actualBackground.r),
          Math.abs(expectedBackground.g - actualBackground.g),
          Math.abs(expectedBackground.b - actualBackground.b),
        );
  const prepaintActual = ctx.prepaint === undefined ? "unavailable" : ctx.prepaint.actual;
  const prepaintSampled = ctx.prepaint === undefined ? 0 : ctx.prepaint.sampled;
  const pixel = ctx.pixel["theme-pixel-identity"];
  return [
    check(
      "os-app-opposite",
      (os === "light" || os === "dark") && theme !== undefined && os !== theme.polarity,
      "requested/applied OS polarity opposite resolved app theme",
      `${os}/${theme?.polarity ?? "unavailable"}/${actualTheme?.source ?? "unavailable"}`,
    ),
    check("prepaint-continuity", ctx.prepaint?.sampled === 1 && ctx.prepaint.continuous, "one prepaint sample continuous into hydration", prepaintActual),
    check(
      "theme-pixel-identity",
      (pixel?.sampled ?? 0) > 0 && pixel?.passed === true && themeDelta !== null && themeDelta <= THEME_CHANNEL_TOLERANCE,
      `hydrated pixel contrast sampled and scope token within ${THEME_CHANNEL_TOLERANCE} sRGB channels of resolved theme`,
      `token-delta=${String(themeDelta)}; ${pixel?.actual ?? "unavailable"}`,
    ),
    check(
      "phase-accounting",
      ctx.prepaint?.sampled === 1 && current.accounting.sampled > 0,
      "prepaint=1 and hydrated subjects sampled",
      `${String(prepaintSampled)}/${current.accounting.sampled}`,
    ),
    clsCheck(current),
  ];
}
