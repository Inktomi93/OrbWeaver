// Literal semantic judgments for #953's seven historical rows. This is intentionally a closed switch,
// not a generic assertion DSL: a new invariant belongs in the client policy and in one explicit arm.

import type { RuntimeAppearanceHistoricalRow } from "../../_shared/appearance-matrix.ts";
import type { BrowserEnvironmentEvidence } from "../../_shared/browser-environment.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { AppearanceInvariantCheck } from "../contract/appearance-invariants.ts";
import type { AppearanceCheckContext } from "./appearance-invariant-check-context.ts";
import { buildDensityPreviewChecks, buildPrepaintChecks } from "./appearance-invariant-checks-settings.ts";
import type { AppearanceDomSnapshot, AppearanceDomSubject, AppearanceElementFacts } from "./appearance-invariant-dom.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --matrix");

const NONVIRTUALIZED_CLS_CEILING = 0.1;
const COARSE_TARGET_FLOOR_PX = 44;
const FINE_TARGET_FLOOR_PX = 24;

function check(id: string, passed: boolean, expected: string, actual: string): AppearanceInvariantCheck {
  return { id, expected, actual, passed };
}

function subject(snapshot: AppearanceDomSnapshot, id: string): AppearanceDomSubject | undefined {
  return snapshot.subjects.find((candidate) => candidate.id === id);
}

function sampled(snapshot: AppearanceDomSnapshot, id: string): number {
  return subject(snapshot, id)?.accounting.sampled ?? 0;
}

function facts(snapshot: AppearanceDomSnapshot, id: string): AppearanceElementFacts | null {
  return subject(snapshot, id)?.facts ?? null;
}

function withheldFacts(snapshot: AppearanceDomSnapshot, id: string): AppearanceElementFacts | null {
  return subject(snapshot, id)?.withheldFacts ?? null;
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

function withinViewport(fact: AppearanceElementFacts | null, environment: BrowserEnvironmentEvidence): boolean {
  const viewport = environment.actual.innerViewport;
  return fact !== null && fact.rect.left >= -1 && fact.rect.top >= -1 && fact.rect.right <= viewport.width + 1 && fact.rect.bottom <= viewport.height + 1;
}

function clsCheck(id: "cls-budget" | "cls-zero", snapshot: AppearanceDomSnapshot): AppearanceInvariantCheck {
  const ceiling = id === "cls-zero" ? 0 : NONVIRTUALIZED_CLS_CEILING;
  const actual = snapshot.cls;
  return check(id, actual !== null && actual <= ceiling, `nonvirtualized CLS <= ${ceiling}`, actual === null ? "unavailable" : String(actual));
}

function pixelCheck(ctx: AppearanceCheckContext): AppearanceInvariantCheck {
  const receipt = ctx.pixel["composited-contrast"];
  return check(
    "composited-contrast",
    receipt !== undefined && receipt.sampled > 0 && receipt.passed,
    "non-edge framebuffer sample >= 4.5:1",
    receipt?.actual ?? "unavailable",
  );
}

function r1(ctx: AppearanceCheckContext): readonly AppearanceInvariantCheck[] {
  const current = ctx.current;
  const gridSpacing = ["--spacing-field", "--spacing-row", "--spacing-block", "--spacing-section"].map((property) => style(current, "grid", property));
  const popupSpacing = ["--spacing-field", "--spacing-row", "--spacing-block", "--spacing-section"].map((property) => style(current, "popup", property));
  const popup = facts(current, "popup");
  const dialogViewport = facts(current, "dialog-viewport");
  return [
    check(
      "density-owner",
      attr(current, "common-scope", "data-density") === "compact" && attr(current, "grid", "data-density") === null,
      "compact on common scope only",
      `${String(attr(current, "common-scope", "data-density"))}/${String(attr(current, "grid", "data-density"))}`,
    ),
    check(
      "spacing-match",
      gridSpacing.every((value) => value !== "") && gridSpacing.join("|") === popupSpacing.join("|"),
      "grid and popup nonempty spacing vectors equal",
      `${gridSpacing.join(",")} / ${popupSpacing.join(",")}`,
    ),
    check(
      "theme-carried",
      style(current, "portal", "--color-background") !== "" && style(current, "carried-scope", "--color-background") !== "",
      "portal and carried scope resolve theme background",
      `${style(current, "portal", "--color-background")} / ${style(current, "carried-scope", "--color-background")}`,
    ),
    check(
      "popup-contained",
      inside(popup, dialogViewport) && withinViewport(dialogViewport, ctx.environment),
      "popup inside the in-viewport dialog viewport",
      `${String(inside(popup, dialogViewport))}/${String(withinViewport(dialogViewport, ctx.environment))}`,
    ),
    check("popup-hit-owner", popup?.hitOwnsCenter === true, "popup owns center hit", String(popup?.hitOwnsCenter ?? "unavailable")),
    check("modal-stacking", popup?.hitOwnsCenter === true, "popup paints above backdrop", String(popup?.hitOwnsCenter ?? "unavailable")),
    clsCheck("cls-budget", current),
  ];
}

function r2(ctx: AppearanceCheckContext): readonly AppearanceInvariantCheck[] {
  const current = ctx.current;
  const name = facts(current, "name-row");
  const bubble = facts(current, "bubble");
  const content = facts(current, "content-column");
  const attribution = facts(current, "attribution");
  const timestamp = facts(current, "timestamp");
  const inheritedInk = style(current, "bubble", "color");
  const structurePopulation = ["bubble", "name-row", "attribution", "timestamp"].map((id) => sampled(current, id));
  return [
    check(
      "header-structure",
      structurePopulation[0] !== 0 &&
        structurePopulation.every((count) => count === structurePopulation[0]) &&
        name?.parentSlots.includes("message-bubble") === true &&
        attribution?.parentSlots.includes("message-name-row") === true &&
        timestamp?.parentSlots.includes("message-name-row") === true,
      "each sampled bubble has one name row with one attribution and timestamp",
      `${structurePopulation.join("/")}; ${name?.parentSlots.join(">") ?? "unavailable"}`,
    ),
    check(
      "header-transparent",
      style(current, "name-row", "backgroundColor") === "rgba(0, 0, 0, 0)" &&
        style(current, "name-row", "backdropFilter") === "none" &&
        style(current, "name-row", "borderRadius") === "0px",
      "transparent name row with no backdrop or chip radius",
      `${style(current, "name-row", "backgroundColor")}/${style(current, "name-row", "backdropFilter")}/${style(current, "name-row", "borderRadius")}`,
    ),
    check(
      "inherited-ink",
      inheritedInk !== "" && style(current, "attribution", "color") === inheritedInk && style(current, "timestamp", "color") === inheritedInk,
      "attribution and timestamp inherit bubble ink",
      `${inheritedInk}/${style(current, "attribution", "color")}/${style(current, "timestamp", "color")}`,
    ),
    pixelCheck(ctx),
    check(
      "content-contained",
      inside(name, bubble) && inside(attribution, bubble) && inside(timestamp, bubble) && inside(bubble, content),
      "header and ink inside bubble; bubble inside content column",
      `${String(inside(name, bubble))}/${String(inside(bubble, content))}`,
    ),
    check("bubble-hit-owner", bubble?.hitOwnsCenter === true, "bubble owns center hit", String(bubble?.hitOwnsCenter ?? "unavailable")),
    clsCheck("cls-budget", current),
  ];
}

function r3(ctx: AppearanceCheckContext): readonly AppearanceInvariantCheck[] {
  const current = ctx.current;
  const art = facts(current, "background-layer");
  const panel = facts(current, "list-panel");
  const grid = facts(current, "art-shell");
  return [
    check(
      "art-settings",
      style(current, "background-layer", "backgroundImage") !== "none" && style(current, "scrim", "opacity") !== "",
      "art image and scrim settings applied",
      `${style(current, "background-layer", "backgroundImage")}/${style(current, "scrim", "opacity")}`,
    ),
    check(
      "glass-wins-elevation",
      // THE CARRIER, NOT THE PANE (#1154 moved the paint, #2431 re-pointed the check). The pane itself now
      // declares `background: none` and no filter, so asking it these two questions answered
      // `rgba(0, 0, 0, 0)/none` on every cell — a true statement about the wrong box.
      style(current, "list-panel-glass", "backdropFilter") !== "none" && style(current, "list-panel-glass", "backgroundColor") !== "",
      "translucent glass panel beats elevation fill",
      `${style(current, "list-panel-glass", "backgroundColor")}/${style(current, "list-panel-glass", "backdropFilter")}`,
    ),
    pixelCheck(ctx),
    check(
      "viewport-cover",
      art !== null &&
        art.rect.left <= 0 &&
        art.rect.top <= 0 &&
        art.rect.right >= ctx.environment.actual.innerViewport.width &&
        art.rect.bottom >= ctx.environment.actual.innerViewport.height,
      "art layer covers the full viewport",
      art === null ? "unavailable" : JSON.stringify(art.rect),
    ),
    check("panel-contained", inside(panel, grid), "list panel inside shell grid", String(inside(panel, grid))),
    check(
      "art-stack",
      art?.hitOwnsCenter !== false && panel?.hitOwnsCenter === true,
      "art below interactive shell panel",
      `${String(art?.hitOwnsCenter)}/${String(panel?.hitOwnsCenter)}`,
    ),
    clsCheck("cls-budget", current),
  ];
}

function isExactMobileEnvironment(environment: BrowserEnvironmentEvidence): boolean {
  return (
    environment.mismatches.length === 0 &&
    environment.actual.isMobile === true &&
    environment.actual.pointer === "coarse" &&
    environment.actual.hover === "none" &&
    environment.actual.maxTouchPoints > 0
  );
}

function isExactDocumentMessageCarrier(messageCarrier: AppearanceCheckContext["messageCarrier"]): boolean {
  if (messageCarrier === undefined) {
    return false;
  }
  const { registry, chatStyles } = messageCarrier;
  return (
    registry.mounted > 0 &&
    registry.mounted === registry.registered &&
    registry.registered === registry.matched &&
    registry.missingIds.length === 0 &&
    registry.staleIds.length === 0 &&
    chatStyles.length === registry.matched &&
    chatStyles.every((value) => value === "document")
  );
}

function r4(ctx: AppearanceCheckContext): readonly AppearanceInvariantCheck[] {
  const current = ctx.current;
  const interactive = subject(current, "visible-interactives");
  const main = facts(current, "main");
  const topbar = facts(current, "topbar");
  const content = facts(current, "content");
  const grid = facts(current, "grid");
  const environment = ctx.environment;
  const envPass = isExactMobileEnvironment(environment);
  const messageCarrier = ctx.messageCarrier;
  const messageCarrierPass = isExactDocumentMessageCarrier(messageCarrier);
  return [
    check("environment-identity", envPass, "full mobile/coarse/none/touch descriptor", JSON.stringify(environment.actual)),
    check(
      "root-scale-density-layout",
      style(current, "html", "--font-scale") === "1.25" && attr(current, "common-scope", "data-density") === "compact" && messageCarrierPass,
      "fontScale=1.25 compact document",
      `${style(current, "html", "--font-scale")}/${String(attr(current, "common-scope", "data-density"))}/${JSON.stringify(messageCarrier)}`,
    ),
    check(
      "viewport-containment",
      withinViewport(grid, environment) && withinViewport(main, environment),
      "grid and main inside viewport",
      `${String(withinViewport(grid, environment))}/${String(withinViewport(main, environment))}`,
    ),
    check(
      "horizontal-overflow",
      (interactive?.metrics.maxHorizontalOverflow ?? 1) === 0 && (main?.scrollWidth ?? 1) <= (main?.clientWidth ?? 0),
      "zero horizontal overflow",
      `${String(interactive?.metrics.maxHorizontalOverflow)}/${String(main === null ? "unavailable" : main.scrollWidth - main.clientWidth)}`,
    ),
    check(
      "touch-floor",
      (interactive?.metrics.minWidth ?? 0) >= COARSE_TARGET_FLOOR_PX && (interactive?.metrics.minHeight ?? 0) >= COARSE_TARGET_FLOOR_PX,
      "all visible controls >=44x44",
      `${String(interactive?.metrics.minWidth)}x${String(interactive?.metrics.minHeight)}`,
    ),
    check(
      "hit-owner",
      interactive?.metrics.allHitOwnCenter === true,
      "every visible control owns center hit",
      String(interactive?.metrics.allHitOwnCenter ?? "unavailable"),
    ),
    check(
      "topbar-content-separation",
      content !== null && topbar !== null && content.rect.top >= topbar.rect.bottom - 1,
      "content begins at or below the topbar bottom edge",
      content === null || topbar === null ? "unavailable" : `${content.rect.top}/${topbar.rect.bottom}`,
    ),
    check(
      "layout-animation",
      ctx.animations.dirty === 0,
      "zero active non-compositor animations",
      `${ctx.animations.dirty}/${ctx.animations.total} dirty; ${ctx.animations.properties.join(",") || "none"}`,
    ),
    clsCheck("cls-budget", current),
  ];
}

function beforeActionFacts(ctx: AppearanceCheckContext, coarse: boolean): AppearanceElementFacts | null {
  if (ctx.before === undefined) {
    return null;
  }
  return coarse ? facts(ctx.before, "actions-row") : withheldFacts(ctx.before, "actions-row");
}

function r5RestCheck(coarse: boolean, beforeActions: AppearanceElementFacts | null, actions: AppearanceElementFacts | null): AppearanceInvariantCheck {
  const beforeOpacity = coarse ? "1" : "0";
  const beforePointerEvents = coarse ? "auto" : "none";
  return check(
    "rest-reveal-polarity",
    beforeActions !== null &&
      actions !== null &&
      beforeActions.style["opacity"] === beforeOpacity &&
      beforeActions.style["pointerEvents"] === beforePointerEvents &&
      actions.style["opacity"] === "1" &&
      actions.style["pointerEvents"] === "auto",
    coarse ? "coarse rest/reveal 1/auto" : "fine rest 0/none -> reveal 1/auto",
    `${beforeActions?.style["opacity"]}/${beforeActions?.style["pointerEvents"]}->${actions?.style["opacity"]}/${actions?.style["pointerEvents"]}`,
  );
}

function r5(ctx: AppearanceCheckContext): readonly AppearanceInvariantCheck[] {
  const current = ctx.current;
  const actions = facts(current, "actions-row");
  const bubble = facts(current, "bubble");
  const buttons = subject(current, "action-buttons");
  const coarse = ctx.environment.actual.pointer === "coarse";
  const beforeActions = beforeActionFacts(ctx, coarse);
  const floor = coarse ? COARSE_TARGET_FLOOR_PX : FINE_TARGET_FLOOR_PX;
  return [
    r5RestCheck(coarse, beforeActions, actions),
    check(
      "footprint-stable",
      beforeActions !== null &&
        actions !== null &&
        beforeActions.rect.width === actions.rect.width &&
        beforeActions.rect.height === actions.rect.height &&
        inside(actions, bubble),
      "rest/reveal footprint identical and contained by its bubble",
      JSON.stringify({
        before: beforeActions?.rect ?? null,
        revealed: actions?.rect ?? null,
        bubble: bubble?.rect ?? null,
        contained: inside(actions, bubble),
      }),
    ),
    check(
      "coarse-door",
      !coarse || (buttons?.accounting.sampled ?? 0) > 0,
      "coarse arm exposes a reachable named door",
      String(buttons?.accounting.sampled ?? 0),
    ),
    check(
      "touch-floor",
      (buttons?.metrics.minWidth ?? 0) >= floor && (buttons?.metrics.minHeight ?? 0) >= floor,
      `visible targets >=${floor}x${floor}`,
      `${String(buttons?.metrics.minWidth)}x${String(buttons?.metrics.minHeight)}`,
    ),
    check(
      "hit-owner",
      buttons?.metrics.allHitOwnCenter === true,
      "every visible action owns center hit",
      String(buttons?.metrics.allHitOwnCenter ?? "unavailable"),
    ),
    clsCheck("cls-zero", current),
  ];
}

export function buildAppearanceInvariantChecks(row: RuntimeAppearanceHistoricalRow, ctx: AppearanceCheckContext): readonly AppearanceInvariantCheck[] {
  switch (row.id) {
    case "compact-portal-carried":
      return r1(ctx);
    case "dark-name-time-short-bubble":
      return r2(ctx);
    case "light-art-scrim-glass-elevation":
      return r3(ctx);
    case "mobile-compact-large-document":
      return r4(ctx);
    case "hover-pointer":
      return r5(ctx);
    case "density-preview":
      return buildDensityPreviewChecks(ctx);
    case "opposite-os-app-prepaint":
      return buildPrepaintChecks(ctx);
    default:
      throw new Error(`INSTRUMENT ERROR: unowned appearance historical row ${row.id}`);
  }
}
