import type { PanelName } from "@orb/client/state";
import type { ThemeChatStyle } from "@orb/contracts/theme";
import type { PlatformTextSize, SurfaceActionGroup, SurfaceActionWindow, SurfacePaneRequest } from "@orb/testkit/browser/spec";
import { surfaceAction, surfaceCheckpoint, surfaceTopology } from "@orb/testkit/browser/spec";
import type { SurfaceAuditRequest } from "@orb/testkit/ct";
import type { SeededIds, SurfacePass } from "@orb/testkit/iso";
import type { SurfaceRunConfig } from "@orb/testkit/node/helpers";
import { MEDIA_QUERIES } from "@orb/ui/tokens";
import type { Page, TestInfo } from "@playwright/test";
import { expect } from "@playwright/test";
import type { TrpcClient } from "./trpc-client.ts";

export interface SurfaceFlowInput {
  readonly page: Page;
  readonly info: TestInfo;
  readonly client: TrpcClient;
  readonly pass: SurfacePass;
  readonly layoutStability: boolean;
  readonly requestedPanes: SurfacePaneRequest;
  readonly run: SurfaceRunConfig;
  readonly chatStyle: ThemeChatStyle;
  readonly fontScale: number;
  /** The browser text-size profile the page took before navigation, or null at the browser default. */
  readonly textProfile: PlatformTextSize | null;
  /** The run's id source; every name a journey mints draws from it. */
  readonly ids: SeededIds;
}

export interface SurfaceFlow extends SurfaceFlowInput {
  readonly checkpoint: (request: SurfaceAuditRequest, groups?: readonly SurfaceActionGroup[]) => Promise<void>;
  readonly action: (name: string, operation: { readonly action: () => Promise<void>; readonly ready: () => Promise<void> }) => Promise<SurfaceActionWindow>;
  readonly requestPanes: () => Promise<void>;
  readonly topology: () => Promise<void>;
  /** Whether the production shell resolved its desktop regime; enlarged text can resolve a desktop viewport to the mobile shell. */
  readonly desktopShell: () => Promise<boolean>;
}

async function requestPanel(page: Page, side: PanelName, wantedOpen: boolean): Promise<void> {
  const panel = page.locator(`.shell-panel[data-panel-side="${side}"]`);
  const available = await panel.getAttribute("data-panel-available");
  if (available === "false") {
    return;
  }
  await expect(panel, "The production registry must publish pane applicability").toHaveAttribute("data-panel-available", "true");
  const mode = await panel.getAttribute("data-panel-mode");
  if (mode === null) {
    throw new Error("The production shell did not publish its resolved pane mode");
  }
  const open = mode !== "collapsed";
  if (open === wantedOpen) {
    return;
  }
  const action = wantedOpen ? "Show" : "Hide";
  const object = side === "list" ? "list panel" : "details";
  await page.getByRole("button", { name: `${action} ${object}`, exact: true }).click();
  await expect(panel).not.toHaveAttribute("data-panel-mode", mode);
}

async function requestDesktopPanes(page: Page, requested: Extract<SurfacePaneRequest, { readonly kind: "desktop" }>): Promise<void> {
  for (const side of ["list", "context"] as const satisfies readonly PanelName[]) {
    await requestPanel(page, side, requested.panes[side]);
  }
}

/** Shared native flow operations preserve explicit readiness and the selected measurement/evidence pass. */
export function createSurfaceFlow(input: SurfaceFlowInput): SurfaceFlow {
  const topology = async (): Promise<void> => {
    await surfaceTopology(input.info, { page: input.page, requested: input.requestedPanes });
  };
  const desktopShell = async (): Promise<boolean> => await input.page.evaluate((query) => matchMedia(query).matches, MEDIA_QUERIES["shell-desktop"]);
  const textGeometry = input.textProfile === null ? null : { expectedRootFontPx: input.textProfile.standardFontPx * input.fontScale };
  return {
    ...input,
    desktopShell,
    checkpoint: async (request, groups = []): Promise<void> => {
      await surfaceCheckpoint(input.info, request, groups, { pass: input.pass, layoutStability: input.layoutStability, textGeometry });
      expect(await input.page.evaluate(() => "__orb" in globalThis), "The ready production client must not install the development agent bridge").toBe(false);
      await topology();
    },
    action: async (name, operation): Promise<SurfaceActionWindow> => await surfaceAction(input.info, { name, page: input.page, ...operation }),
    requestPanes: async (): Promise<void> => {
      // Desktop docking is not forced onto the mobile shell; the topology attachment records the resolved regime.
      if (input.requestedPanes.kind === "desktop" && (await desktopShell())) {
        await requestDesktopPanes(input.page, input.requestedPanes);
      }
      await topology();
    },
    topology,
  };
}
