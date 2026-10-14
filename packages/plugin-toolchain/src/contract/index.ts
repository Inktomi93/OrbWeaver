// Standalone author-time contracts (D266); no application package dependency.
import type ts from "typescript";

export const PLUGIN_AUTHOR_RUNTIMES = ["main", "ui", "frame"] as const;
export type PluginAuthorRuntime = (typeof PLUGIN_AUTHOR_RUNTIMES)[number];

export interface PluginAuthorDiagnostic {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly message: string;
}

export interface PluginAuthorArtifact {
  readonly runtime: PluginAuthorRuntime;
  readonly sourcePath: string;
  readonly outputPath: string;
  readonly bytes: Uint8Array;
}

export interface PluginAuthorResult {
  readonly artifacts: readonly PluginAuthorArtifact[];
  readonly diagnostics: readonly PluginAuthorDiagnostic[];
  readonly obsoleteOutputPaths: readonly string[];
}

export interface PluginAuthorProject {
  readonly pluginDirectory: string;
  readonly sdkDirectory: string;
  readonly sourceDirectory?: string;
  readonly outputDirectory?: string;
  readonly compilerObserver?: PluginAuthorCompilerObserver;
}

/** Observe the reads and resolution probes of the compiler that checks the authored scripts. */
export interface PluginAuthorCompilerObserver {
  readonly readFile: (path: string, text: string | undefined) => void;
  readonly fileExists: (path: string, exists: boolean) => void;
  readonly directoryExists: (path: string, exists: boolean) => void;
}

export interface PluginAuthorBundleResult extends PluginAuthorResult {
  readonly bundle: Uint8Array | null;
}

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

/** A problem located at one node of the checked source. */
export interface SurfaceLinkProblem {
  readonly node: ts.Node;
  readonly message: string;
}
