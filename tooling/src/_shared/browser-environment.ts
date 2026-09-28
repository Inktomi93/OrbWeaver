// Browser-environment provenance for every Playwright verdict tool. The launcher owns what was requested
// and applied; the live page owns what actually emerged. Never substitute one for the other — a device
// name echoed from argv is not proof that touch/pointer/mobile emulation reached the page.
import type { Page } from "@playwright/test";
import type { Viewport } from "./argv.ts";
import { pageBooleanFields, pageNumberFields, pageObject, pageString } from "./page-validate.ts";

export const DEFAULT_VIEWPORT: Viewport = { width: 1280, height: 800 };
export const WIDE_VIEWPORT: Viewport = { width: 1920, height: 1080 };

/** One canonical full Playwright descriptor. Snap, design-audit, and motion-audit import this identity. */
export const MOBILE_DEVICE = "iPhone 14 Pro Max";

export interface BrowserDeviceDescriptor {
  readonly viewport: Viewport;
  readonly screen?: Viewport;
  readonly userAgent: string;
  readonly deviceScaleFactor: number;
  readonly isMobile: boolean;
  readonly hasTouch: boolean;
}

export interface BrowserEnvironmentRequest {
  readonly device: string | null;
  readonly viewport: Viewport;
  readonly colorScheme: "light" | "dark" | null;
  readonly reducedMotion: boolean;
  readonly contrast: "more" | "no-preference" | null;
  readonly reducedTransparency: boolean;
}

export interface BrowserEnvironmentApplied extends BrowserEnvironmentRequest {
  readonly screen: Viewport;
  /** null means the browser's own desktop default; a named descriptor always supplies the exact value. */
  readonly userAgent: string | null;
  readonly deviceScaleFactor: number;
  readonly isMobile: boolean;
  readonly hasTouch: boolean;
}

export interface BrowserEnvironmentContract {
  readonly requested: BrowserEnvironmentRequest;
  readonly applied: BrowserEnvironmentApplied;
}

const POINTER_CAPABILITIES = ["coarse", "fine", "mixed", "none"] as const;
export type PointerCapability = (typeof POINTER_CAPABILITIES)[number];
const HOVER_CAPABILITIES = ["hover", "none", "mixed", "unknown"] as const;
export type HoverCapability = (typeof HOVER_CAPABILITIES)[number];

export type BrowserEnvironmentActualDevice = { readonly kind: "named"; readonly name: string } | { readonly kind: "desktop" } | { readonly kind: "unmatched" };

export function actualDeviceLabel(device: BrowserEnvironmentActualDevice): string {
  return device.kind === "named" ? device.name : device.kind;
}

function actualDevice(matched: boolean, appliedDevice: string | null): BrowserEnvironmentActualDevice {
  if (!matched) {
    return { kind: "unmatched" };
  }
  return appliedDevice === null ? { kind: "desktop" } : { kind: "named", name: appliedDevice };
}

export interface BrowserEnvironmentActual {
  /** A device name is earned only by a complete observable fingerprint match. */
  readonly device: BrowserEnvironmentActualDevice;
  readonly viewport: Viewport | null;
  readonly innerViewport: Viewport;
  readonly screen: Viewport;
  readonly userAgent: string;
  readonly deviceScaleFactor: number;
  readonly maxTouchPoints: number;
  readonly hasTouch: boolean;
  readonly pointer: PointerCapability;
  readonly hover: HoverCapability;
  readonly colorScheme: "light" | "dark" | "mixed" | "no-preference";
  readonly reducedMotion: boolean;
  readonly contrast: "more" | "less" | "mixed" | "no-preference";
  readonly reducedTransparency: boolean;
  /** Runtime inference: true/false only for a complete mobile/desktop fingerprint; null when unmatched. */
  readonly isMobile: boolean | null;
}

export interface BrowserEnvironmentEvidence {
  readonly requested: BrowserEnvironmentRequest;
  readonly applied: BrowserEnvironmentApplied;
  readonly actual: BrowserEnvironmentActual;
  readonly mismatches: readonly string[];
}

interface RuntimeObservation {
  readonly innerViewport: Viewport;
  readonly screen: Viewport;
  readonly userAgent: string;
  readonly deviceScaleFactor: number;
  readonly maxTouchPoints: number;
  readonly pointerCoarse: boolean;
  readonly pointerFine: boolean;
  readonly hoverHover: boolean;
  readonly hoverNone: boolean;
  readonly colorSchemeLight: boolean;
  readonly colorSchemeDark: boolean;
  readonly reducedMotion: boolean;
  readonly contrastMore: boolean;
  readonly contrastLess: boolean;
  readonly reducedTransparency: boolean;
}

const READ_RUNTIME_ENVIRONMENT = `(() => ({
  innerViewport: { width: window.innerWidth, height: window.innerHeight },
  screen: { width: window.screen.width, height: window.screen.height },
  userAgent: window.navigator.userAgent,
  deviceScaleFactor: window.devicePixelRatio,
  maxTouchPoints: window.navigator.maxTouchPoints,
  pointerCoarse: window.matchMedia("(pointer: coarse)").matches,
  pointerFine: window.matchMedia("(pointer: fine)").matches,
  hoverHover: window.matchMedia("(hover: hover)").matches,
  hoverNone: window.matchMedia("(hover: none)").matches,
  colorSchemeLight: window.matchMedia("(prefers-color-scheme: light)").matches,
  colorSchemeDark: window.matchMedia("(prefers-color-scheme: dark)").matches,
  reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  contrastMore: window.matchMedia("(prefers-contrast: more)").matches,
  contrastLess: window.matchMedia("(prefers-contrast: less)").matches,
  reducedTransparency: window.matchMedia("(prefers-reduced-transparency: reduce)").matches,
}))()`;

function sameViewport(left: Viewport | null, right: Viewport): boolean {
  return left !== null && left.width === right.width && left.height === right.height;
}

function viewportText(viewport: Viewport | null): string {
  return viewport === null ? "unavailable" : `${viewport.width}x${viewport.height}`;
}

function pointerCapability(coarse: boolean, fine: boolean): PointerCapability {
  if (coarse && fine) {
    return "mixed";
  }
  if (coarse) {
    return "coarse";
  }
  return fine ? "fine" : "none";
}

function hoverCapability(hover: boolean, none: boolean): HoverCapability {
  if (hover && none) {
    return "mixed";
  }
  if (hover) {
    return "hover";
  }
  return none ? "none" : "unknown";
}

function binaryMedia<T extends string>(first: boolean, firstName: T, second: boolean, secondName: T): T | "mixed" | "no-preference" {
  if (first && second) {
    return "mixed";
  }
  if (first) {
    return firstName;
  }
  return second ? secondName : "no-preference";
}

/** THE ONE ANSWER TO "what size is this context" (#1668), read by the two context-options spreads and by
 *  the contract below so a receipt can never describe a size the browser did not get.
 *
 *  A device descriptor carries its own viewport, and it wins — EXCEPT when the caller explicitly spelled a
 *  size, which is a size override and not a device change: `--mobile --viewport 320x740` is "the iPhone,
 *  windowed to 320x740", keeping touch, DPR and the mobile UA. Without `viewportExplicit` there is no way
 *  to tell that ask apart from the desktop DEFAULT every Args carries, which is why the flag records it. */
export function effectiveContextViewport(
  input: { readonly viewport: Viewport; readonly viewportExplicit?: boolean },
  descriptor: BrowserDeviceDescriptor | null,
): Viewport {
  if (descriptor === null || input.viewportExplicit === true) {
    return input.viewport;
  }
  return descriptor.viewport;
}

/** The complete size Playwright receives and the environment contract verifies. An explicit viewport
 *  windows both viewport and screen while preserving the descriptor's touch, DPR, UA and mobile identity. */
export function effectiveContextSize(
  input: { readonly viewport: Viewport; readonly viewportExplicit?: boolean },
  descriptor: BrowserDeviceDescriptor | null,
): Pick<BrowserEnvironmentApplied, "viewport" | "screen"> {
  const viewport = effectiveContextViewport(input, descriptor);
  const screen = descriptor === null || input.viewportExplicit === true ? viewport : (descriptor.screen ?? descriptor.viewport);
  return { viewport, screen };
}

/** Resolve the exact context contract before launch. A named descriptor supplies the touch/DPR/UA/mobile
 *  identity; the viewport and screen come from {@link effectiveContextSize}. */
export function resolveBrowserEnvironmentContract(
  input: {
    readonly viewport: Viewport;
    /** See {@link effectiveContextSize} — an explicit size override survives a device (#1668). */
    readonly viewportExplicit?: boolean;
    readonly device?: string | null;
    /** A caller-raised context DPR (snap's `--scale <n>`, #915). The APPLIED contract must carry it, or
     *  identityMismatches reports "DPR expected 1 but observed 2" for a density the caller asked for —
     *  blinding that check instead would be the banned direction. A `device` descriptor supersedes it
     *  (snap refuses the combination at parse time rather than picking a winner here). */
    readonly deviceScaleFactor?: number;
    readonly colorScheme?: "light" | "dark" | null;
    readonly reducedMotion?: boolean;
    readonly contrast?: "more" | "no-preference" | null;
    readonly reducedTransparency?: boolean;
  },
  descriptor: BrowserDeviceDescriptor | null,
): BrowserEnvironmentContract {
  const device = input.device ?? null;
  const size = effectiveContextSize(input, descriptor);
  const media = {
    colorScheme: input.colorScheme ?? null,
    reducedMotion: input.reducedMotion ?? false,
    contrast: input.contrast ?? null,
    reducedTransparency: input.reducedTransparency ?? false,
  };
  if (descriptor === null) {
    return {
      requested: { device, viewport: size.viewport, ...media },
      applied: {
        device,
        ...size,
        ...media,
        userAgent: null,
        deviceScaleFactor: input.deviceScaleFactor ?? 1,
        isMobile: false,
        hasTouch: false,
      },
    };
  }
  // The size the context ACTUALLY got: the descriptor's, unless the caller overrode it (#1668). Reading
  // `descriptor.viewport` unconditionally here is what would make `identityMismatches` red a run for
  // obeying its own argv — and, worse, make `scale=` on the RESULT line state a size nobody rendered.
  return {
    requested: { device, viewport: size.viewport, ...media },
    applied: {
      device,
      ...size,
      ...media,
      userAgent: descriptor.userAgent,
      deviceScaleFactor: descriptor.deviceScaleFactor,
      isMobile: descriptor.isMobile,
      hasTouch: descriptor.hasTouch,
    },
  };
}

/** `page.viewportSize()` is PLAYWRIGHT'S OWN local record of what IT set — null for a page a connection
 *  did not create, which is every tab a session-attach reuses (design §3.4): the daemon's connection
 *  created it, an attached sibling's did not, and Playwright never backfills that record from the live
 *  browser. The rendered CSS viewport (`window.innerWidth/innerHeight`, already read for `innerViewport`)
 *  is the same ground truth either way, so it is the fallback rather than a second "unavailable" leg
 *  every attach would trip on its first environment check (#1285). A launched page's local record is
 *  never null, so this changes nothing on that path — `observedViewport === viewport` always. */
function observedViewport(viewport: Viewport | null, innerViewport: Viewport): Viewport {
  return viewport ?? innerViewport;
}

function identityMismatches(applied: BrowserEnvironmentApplied, viewport: Viewport | null, runtime: RuntimeObservation): string[] {
  const mismatches: string[] = [];
  const observed = observedViewport(viewport, runtime.innerViewport);
  if (!sameViewport(observed, applied.viewport)) {
    mismatches.push(`viewport expected ${viewportText(applied.viewport)} but observed ${viewportText(observed)}`);
  }
  if (!sameViewport(runtime.screen, applied.screen)) {
    mismatches.push(`screen expected ${viewportText(applied.screen)} but observed ${viewportText(runtime.screen)}`);
  }
  if (runtime.deviceScaleFactor !== applied.deviceScaleFactor) {
    mismatches.push(`DPR expected ${applied.deviceScaleFactor} but observed ${runtime.deviceScaleFactor}`);
  }
  if (applied.userAgent !== null && runtime.userAgent !== applied.userAgent) {
    mismatches.push("user agent does not match the applied device descriptor");
  }
  if (applied.userAgent === null && /\b(?:Android|iPhone|iPad|Mobile)\b/iu.test(runtime.userAgent)) {
    mismatches.push("desktop context exposed a mobile user agent");
  }
  return mismatches;
}

function interactionMismatches(applied: BrowserEnvironmentApplied, runtime: RuntimeObservation): string[] {
  const pointer = pointerCapability(runtime.pointerCoarse, runtime.pointerFine);
  const hover = hoverCapability(runtime.hoverHover, runtime.hoverNone);
  const hasTouch = runtime.maxTouchPoints > 0;
  const mismatches: string[] = [];
  if (hasTouch !== applied.hasTouch) {
    mismatches.push(`touch expected ${applied.hasTouch ? "present" : "absent"} but maxTouchPoints=${runtime.maxTouchPoints}`);
  }
  const expectedPointer: PointerCapability = applied.hasTouch ? "coarse" : "fine";
  if (pointer !== expectedPointer) {
    mismatches.push(`pointer expected ${expectedPointer} but observed ${pointer}`);
  }
  const expectedHover: HoverCapability = applied.hasTouch ? "none" : "hover";
  if (hover !== expectedHover) {
    mismatches.push(`hover expected ${expectedHover} but observed ${hover}`);
  }
  return mismatches;
}

function mediaMismatches(applied: BrowserEnvironmentApplied, runtime: RuntimeObservation): string[] {
  const colorScheme = binaryMedia(runtime.colorSchemeLight, "light", runtime.colorSchemeDark, "dark");
  const contrast = binaryMedia(runtime.contrastMore, "more", runtime.contrastLess, "less");
  const mismatches: string[] = [];
  if (applied.colorScheme !== null && colorScheme !== applied.colorScheme) {
    mismatches.push(`color scheme expected ${applied.colorScheme} but observed ${colorScheme}`);
  }
  if (runtime.reducedMotion !== applied.reducedMotion) {
    mismatches.push(`reduced motion expected ${String(applied.reducedMotion)} but observed ${String(runtime.reducedMotion)}`);
  }
  if (applied.contrast !== null && contrast !== applied.contrast) {
    mismatches.push(`contrast expected ${applied.contrast} but observed ${contrast}`);
  }
  if (runtime.reducedTransparency !== applied.reducedTransparency) {
    mismatches.push(`reduced transparency expected ${String(applied.reducedTransparency)} but observed ${String(runtime.reducedTransparency)}`);
  }
  return mismatches;
}

/** THE LIVE ENVIRONMENT READ, settled at the page boundary (#1004, `_shared/page-validate.ts`). This
 *  read is the one that decides whether the probe measured the environment it ASKED for, so a malformed
 *  answer is the worst possible silent failure here: `mediaMismatches` compares `=== true`, so an absent
 *  boolean reads as "the page says no" and either invents a mismatch or — for the arms whose contract
 *  side is also false — agrees with the contract for the wrong reason and certifies an environment
 *  nobody verified. The viewport pair is checked as an object because `innerViewport`/`screen` are
 *  copied straight into the evidence record every consumer prints. */
function runtimeObservation(value: unknown): RuntimeObservation {
  const label = "the runtime environment read";
  const record = pageObject(value, label);
  pageObject(record["innerViewport"], `${label} field "innerViewport"`);
  pageObject(record["screen"], `${label} field "screen"`);
  pageString(record["userAgent"], `${label} field "userAgent"`);
  pageNumberFields(record, ["deviceScaleFactor", "maxTouchPoints"], label);
  pageBooleanFields(
    record,
    [
      "pointerCoarse",
      "pointerFine",
      "hoverHover",
      "hoverNone",
      "colorSchemeLight",
      "colorSchemeDark",
      "reducedMotion",
      "contrastMore",
      "contrastLess",
      "reducedTransparency",
    ],
    label,
  );
  return record as unknown as RuntimeObservation;
}

function environmentMismatches(contract: BrowserEnvironmentContract, viewport: Viewport | null, runtime: RuntimeObservation): string[] {
  return [
    ...identityMismatches(contract.applied, viewport, runtime),
    ...interactionMismatches(contract.applied, runtime),
    ...mediaMismatches(contract.applied, runtime),
  ];
}

/** Read the live page and compare it with the launcher-owned contract. Missing or contradictory evidence
 *  stays in `mismatches`; callers turn any entry into INSTRUMENT ERROR. */
export async function readBrowserEnvironment(page: Page, contract: BrowserEnvironmentContract): Promise<BrowserEnvironmentEvidence> {
  const viewport = page.viewportSize();
  const runtime = runtimeObservation(await page.evaluate(READ_RUNTIME_ENVIRONMENT));
  const mismatches = environmentMismatches(contract, viewport, runtime);
  const matched = mismatches.length === 0;
  const actual: BrowserEnvironmentActual = {
    device: actualDevice(matched, contract.applied.device),
    viewport: observedViewport(viewport, runtime.innerViewport),
    innerViewport: runtime.innerViewport,
    screen: runtime.screen,
    userAgent: runtime.userAgent,
    deviceScaleFactor: runtime.deviceScaleFactor,
    maxTouchPoints: runtime.maxTouchPoints,
    hasTouch: runtime.maxTouchPoints > 0,
    pointer: pointerCapability(runtime.pointerCoarse, runtime.pointerFine),
    hover: hoverCapability(runtime.hoverHover, runtime.hoverNone),
    colorScheme: binaryMedia(runtime.colorSchemeLight, "light", runtime.colorSchemeDark, "dark"),
    reducedMotion: runtime.reducedMotion,
    contrast: binaryMedia(runtime.contrastMore, "more", runtime.contrastLess, "less"),
    reducedTransparency: runtime.reducedTransparency,
    isMobile: matched ? contract.applied.isMobile : null,
  };
  return { requested: contract.requested, applied: contract.applied, actual, mismatches };
}
