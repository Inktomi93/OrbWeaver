import type { Browser, BrowserContext, Page } from "@playwright/test";
import type { AppearancePatch, SettingsShimEvidence } from "./appearance.ts";
import type { Viewport } from "./argv.ts";
import type { CapturedConsole, CapturedRequest } from "./browser-capture.ts";
import type { BrowserEnvironmentContract } from "./browser-environment.ts";
import type { ThemeRequest } from "./theme.ts";

export interface LocalStorageSeed {
  readonly key: string;
  readonly value: string;
}

/** The complete contract for a browser launch or an extra isolated context on an owned browser. */
export interface ProbeLaunchOptions {
  readonly headless: boolean;
  readonly viewport: Viewport;
  readonly colorScheme: "light" | "dark" | null;
  readonly reducedMotion: boolean;
  readonly contrast?: "more" | "no-preference" | null;
  readonly reducedTransparency?: boolean;
  readonly localStorage: readonly LocalStorageSeed[];
  readonly recordVideoDir?: string;
  readonly device?: string | null;
  readonly deviceScaleFactor?: number;
  readonly pages?: number;
  readonly contexts?: number;
  readonly contextCookies?: readonly (string | null)[];
  readonly cookieDomain?: string;
  readonly appearance?: AppearancePatch | null;
  readonly theme?: ThemeRequest | null;
  readonly trace?: boolean;
  readonly harPathPrefix?: string;
  readonly persistentProfileDir?: string;
  readonly browserArgs?: readonly string[];
}

/** One isolated context's pages, capture rings, settings proof and requested environment identity. */
export interface ProbeContext {
  readonly context: BrowserContext;
  readonly pages: readonly Page[];
  readonly consoleLines: string[];
  readonly consoleMessages: CapturedConsole[];
  readonly pageErrors: string[];
  readonly requests: Map<string, CapturedRequest>;
  readonly harPath: string | null;
  readonly settingsEvidence: SettingsShimEvidence;
  readonly environmentContract: BrowserEnvironmentContract;
  /** False for a context another CDP connection owns; absent means this session owns it. */
  readonly owned?: boolean;
}

/** The browser owner plus its default context/page view and every context it is responsible for closing. */
export interface ProbeSession {
  readonly browser: Browser;
  readonly context: BrowserContext;
  readonly page: Page;
  readonly pages: readonly Page[];
  readonly consoleLines: string[];
  readonly consoleMessages: CapturedConsole[];
  readonly pageErrors: string[];
  readonly requests: Map<string, CapturedRequest>;
  readonly environmentContract: BrowserEnvironmentContract;
  readonly contexts: readonly ProbeContext[];
  readonly cleanup?: readonly (() => Promise<void>)[];
}

/** Environment identity supplied by a session registry row when a sibling attaches over CDP. */
export type ProbeAttachOptions = Pick<
  ProbeLaunchOptions,
  "viewport" | "device" | "colorScheme" | "reducedMotion" | "contrast" | "reducedTransparency" | "deviceScaleFactor" | "recordVideoDir"
>;
