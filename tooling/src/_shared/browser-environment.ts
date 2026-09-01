// Browser-environment provenance for every Playwright verdict tool. The launcher owns what was requested
// and applied; the live page owns what actually emerged. Never substitute one for the other — a device
// name echoed from argv is not proof that touch/pointer/mobile emulation reached the page.
import type { Page } from "@playwright/test";
import type { Viewport } from "./argv.ts";

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

export interface BrowserEnvironmentActual {
  /** A device name is earned only by a complete observable fingerprint match. */
  readonly device: string;
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

/** Resolve the exact context contract before launch. A named descriptor supersedes the raw viewport. */
export function resolveBrowserEnvironmentContract(
  input: {
    readonly viewport: Viewport;
    readonly device?: string | null;
    readonly colorScheme?: "light" | "dark" | null;
    readonly reducedMotion?: boolean;
    readonly contrast?: "more" | "no-preference" | null;
    readonly reducedTransparency?: boolean;
  },
  descriptor: BrowserDeviceDescriptor | null,
): BrowserEnvironmentContract {
  const device = input.device ?? null;
  const media = {
    colorScheme: input.colorScheme ?? null,
    reducedMotion: input.reducedMotion ?? false,
    contrast: input.contrast ?? null,
    reducedTransparency: input.reducedTransparency ?? false,
  };
  if (descriptor === null) {
    return {
      requested: { device, viewport: input.viewport, ...media },
      applied: {
        device,
        viewport: input.viewport,
        ...media,
        screen: input.viewport,
        userAgent: null,
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      },
    };
  }
  return {
    requested: { device, viewport: descriptor.viewport, ...media },
    applied: {
      device,
      viewport: descriptor.viewport,
      ...media,
      screen: descriptor.screen ?? descriptor.viewport,
      userAgent: descriptor.userAgent,
      deviceScaleFactor: descriptor.deviceScaleFactor,
      isMobile: descriptor.isMobile,
      hasTouch: descriptor.hasTouch,
    },
  };
}

function identityMismatches(applied: BrowserEnvironmentApplied, viewport: Viewport | null, runtime: RuntimeObservation): string[] {
  const mismatches: string[] = [];
  if (!sameViewport(viewport, applied.viewport)) {
    mismatches.push(`viewport expected ${viewportText(applied.viewport)} but observed ${viewportText(viewport)}`);
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
  const runtime = (await page.evaluate(READ_RUNTIME_ENVIRONMENT)) as RuntimeObservation;
  const mismatches = environmentMismatches(contract, viewport, runtime);
  const matched = mismatches.length === 0;
  const actual: BrowserEnvironmentActual = {
    device: matched ? (contract.applied.device ?? "desktop") : "unmatched",
    viewport,
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
