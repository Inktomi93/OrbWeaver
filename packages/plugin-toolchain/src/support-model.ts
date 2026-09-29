export const PLUGIN_AUTHOR_SUPPORT_FORMATS = ["json", "markdown"] as const;
export type PluginAuthorSupportFormat = (typeof PLUGIN_AUTHOR_SUPPORT_FORMATS)[number];

export const PLUGIN_AUTHOR_WORLDS = ["main", "ui", "frame"] as const;
export type PluginAuthorWorld = (typeof PLUGIN_AUTHOR_WORLDS)[number];

export const PLUGIN_AUTHOR_EXECUTIONS = ["server-quickjs", "browser-quickjs-worker", "isolated-browser-frame"] as const;
export type PluginAuthorExecution = (typeof PLUGIN_AUTHOR_EXECUTIONS)[number];

export interface PluginAuthorRuntimeSupport {
  readonly world: PluginAuthorWorld;
  readonly execution: PluginAuthorExecution;
  readonly sourceEntry: string;
  readonly sdkEntry: string;
  readonly entrypoint: string;
  readonly dom: boolean;
  readonly hostFunctions: readonly string[];
  readonly localHelpers: readonly string[];
}

export interface PluginAuthorCapabilitySupport {
  readonly capability: string;
  readonly functions: Readonly<Record<PluginAuthorWorld, readonly string[]>>;
}

export interface PluginAuthorHookSupport {
  readonly name: string;
  readonly world: "main";
}

export interface PluginAuthorSurfaceSupport {
  readonly anchor: string;
  readonly tiers: readonly string[];
  readonly registrationWorld: "main";
}

export interface PluginAuthorTierSupport {
  readonly tier: string;
  readonly registrar: string;
  readonly registrationWorld: "main";
  readonly executionWorld: PluginAuthorWorld;
}

export interface PluginAuthorPlacementSupport {
  readonly target: string;
  readonly registrationWorld: "main";
}

export interface PluginAuthorSupport {
  readonly schemaVersion: 1;
  readonly runtimes: Readonly<Record<PluginAuthorWorld, PluginAuthorRuntimeSupport>>;
  readonly capabilities: readonly PluginAuthorCapabilitySupport[];
  readonly hooks: {
    readonly events: {
      readonly chat: readonly PluginAuthorHookSupport[];
      readonly domain: readonly PluginAuthorHookSupport[];
    };
    readonly promptTransforms: readonly PluginAuthorHookSupport[];
  };
  readonly ui: {
    readonly surfaces: readonly PluginAuthorSurfaceSupport[];
    readonly tiers: readonly PluginAuthorTierSupport[];
    readonly commandPlacements: readonly PluginAuthorPlacementSupport[];
  };
}

export interface PluginAuthorSupportSource {
  readonly capabilities: readonly string[];
  readonly hostFunctionCapability: Readonly<Record<string, string>>;
  readonly uiProxyableHostFunctions: readonly string[];
  readonly chatEventHooks: readonly string[];
  readonly domainEventHooks: readonly string[];
  readonly promptTransformPoints: readonly string[];
  readonly surfaceAnchors: readonly string[];
  readonly surfaceTiers: readonly string[];
  readonly anchorTiers: Readonly<Record<string, Readonly<Record<string, boolean>>>>;
  readonly tierRegistrar: Readonly<Record<string, string>>;
  readonly commandPlacements: readonly string[];
}

export const PLUGIN_AUTHOR_SUPPORT_SECTIONS = ["schemaVersion", "runtimes", "capabilities", "hooks", "ui"] as const;
export type PluginAuthorSupportSection = (typeof PLUGIN_AUTHOR_SUPPORT_SECTIONS)[number];

function functionsFor(capability: string, hostFunctionCapability: Readonly<Record<string, string>>, allowedFunctions?: ReadonlySet<string>): readonly string[] {
  return Object.entries(hostFunctionCapability)
    .filter(([hostFunction, owner]) => owner === capability && (allowedFunctions === undefined || allowedFunctions.has(hostFunction)))
    .map(([hostFunction]) => hostFunction);
}

function executionWorldForTier(tier: string): PluginAuthorWorld {
  if (tier === "static") {
    return "main";
  }
  if (tier === "scripted") {
    return "ui";
  }
  if (tier === "frame") {
    return "frame";
  }
  throw new Error(`unsupported plugin surface tier: ${tier}`);
}

/** Derive the standalone author registry from the application's closed contract tuples and maps. */
export function createPluginAuthorSupport(source: PluginAuthorSupportSource): PluginAuthorSupport {
  const proxyable = new Set(source.uiProxyableHostFunctions);
  const allHostFunctions = Object.keys(source.hostFunctionCapability);
  const proxyableHostFunctions = source.uiProxyableHostFunctions;
  return {
    schemaVersion: 1,
    runtimes: {
      main: {
        world: "main",
        execution: "server-quickjs",
        sourceEntry: "main.ts",
        sdkEntry: "@orb/plugin-sdk/main",
        entrypoint: "orb.host(1)",
        dom: false,
        hostFunctions: allHostFunctions,
        localHelpers: ["clock", "random", "ids", "log", "tokens"],
      },
      ui: {
        world: "ui",
        execution: "browser-quickjs-worker",
        sourceEntry: "ui.ts",
        sdkEntry: "@orb/plugin-sdk/ui",
        entrypoint: "orb.ui(1)",
        dom: false,
        hostFunctions: proxyableHostFunctions,
        localHelpers: ["clock", "random", "log", "tokens", "render", "onEvent"],
      },
      frame: {
        world: "frame",
        execution: "isolated-browser-frame",
        sourceEntry: "frame.ts",
        sdkEntry: "@orb/plugin-sdk/frame",
        entrypoint: "parent.postMessage",
        dom: true,
        hostFunctions: proxyableHostFunctions,
        localHelpers: ["orbPluginAssetUrl"],
      },
    },
    capabilities: source.capabilities.map((capability) => ({
      capability,
      functions: {
        main: functionsFor(capability, source.hostFunctionCapability),
        ui: functionsFor(capability, source.hostFunctionCapability, proxyable),
        frame: functionsFor(capability, source.hostFunctionCapability, proxyable),
      },
    })),
    hooks: {
      events: {
        chat: source.chatEventHooks.map((name) => ({ name, world: "main" })),
        domain: source.domainEventHooks.map((name) => ({ name, world: "main" })),
      },
      promptTransforms: source.promptTransformPoints.map((name) => ({ name, world: "main" })),
    },
    ui: {
      surfaces: source.surfaceAnchors.map((anchor) => ({
        anchor,
        tiers: source.surfaceTiers.filter((tier) => source.anchorTiers[anchor]?.[tier] === true),
        registrationWorld: "main",
      })),
      tiers: source.surfaceTiers.map((tier) => {
        const registrar = source.tierRegistrar[tier];
        if (registrar === undefined) {
          throw new Error(`plugin surface tier has no registrar: ${tier}`);
        }
        return {
          tier,
          registrar,
          registrationWorld: "main",
          executionWorld: executionWorldForTier(tier),
        };
      }),
      commandPlacements: source.commandPlacements.map((target) => ({ target, registrationWorld: "main" })),
    },
  };
}

/** Name the top-level registry sections whose deterministic representation differs. */
export function pluginAuthorSupportDrift(expected: PluginAuthorSupport, actual: PluginAuthorSupport): readonly PluginAuthorSupportSection[] {
  return PLUGIN_AUTHOR_SUPPORT_SECTIONS.filter((section) => JSON.stringify(expected[section]) !== JSON.stringify(actual[section]));
}
