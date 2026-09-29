/// <reference path="./shared.d.ts" />

export {};

declare global {
  /** The only global door in a plugin's scripted-UI QuickJS guest. */
  const orb: {
    readonly ui: (version: 1) => PluginUiV1;
  };
}
