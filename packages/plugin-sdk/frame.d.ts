export {};

declare global {
  /** A call from an isolated plugin frame to its admitted host relay. */
  interface OrbPluginFrameCall {
    readonly orbPluginFrameCall: {
      readonly callId: string;
      readonly fn: string;
      readonly args: unknown;
    };
  }

  /** A success or refusal returned to an isolated plugin frame. */
  interface OrbPluginFrameResult {
    readonly orbPluginFrameResult:
      | { readonly callId: string; readonly ok: true; readonly value: unknown }
      | { readonly callId: string; readonly ok: false; readonly error: string };
  }

  /** Build the authenticated URL for one flat raster image shipped under `ui/assets/`. Orbweaver injects this
   *  immutable helper before plugin-authored frame scripts run. The active frame handle supplies plugin and
   *  owner identity; authors provide only the admitted bundle path. */
  const orbPluginAssetUrl: (bundlePath: string) => string;
}
