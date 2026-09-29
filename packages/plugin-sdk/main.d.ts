/// <reference path="./shared.d.ts" />

export {};

declare global {
  /** The only global door in a plugin's server QuickJS guest. */
  const orb: {
    readonly host: (version: 1) => PluginHostV1;
  };
}
