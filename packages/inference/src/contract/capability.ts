import type {
  Capability,
  CapabilityOverride,
  ChatApi,
  DeclaredCapability,
  EmbeddingCapability,
  NativeChatApi,
  ProviderId,
  RerankCapability,
  ResolvedWarning,
  Wire,
} from "@orb/contracts/inference";

/** The window a server runs where the request cannot set one, and whether that figure is only its floor. */
export interface ServedWindow {
  readonly window: number;
  readonly estimated: boolean;
}

/** What the server does with each tool-choice form and the parallel switch, as its catalog reader states it. */
export interface ServerToolChoice {
  readonly required: boolean;
  readonly named: boolean;
  readonly none: boolean;
  readonly parallel: boolean;
}

/** What the resolver assembled for one (connection × model), lowest tier last. */
export interface Evidence {
  readonly declared?: DeclaredCapability | null | undefined;
  readonly measured?: readonly CapabilityOverride[] | undefined;
  readonly advertised?: NonNullable<CapabilityOverride["generation"]> | Partial<EmbeddingCapability> | Partial<RerankCapability> | undefined;
  readonly curated?: readonly CapabilityOverride[] | undefined;
}

export interface SynthesizedCapability {
  readonly capability: Capability;
  readonly warnings: readonly ResolvedWarning[];
}

export interface CompiledRow {
  readonly row: CapabilityOverride;
  readonly model: RegExp | null;
  readonly ids: ReadonlySet<string> | null;
}

/** What a resolver asks the row tiers with: the model id plus the route it resolved on. */
export interface RowQuery {
  readonly model: string;
  readonly providerId?: ProviderId | undefined;
  readonly wire?: Wire | undefined;
  readonly api?: ChatApi | null | undefined;
  /** The chat route the folded `features.nativeChat` selects; a row that names one matches that route only. */
  readonly nativeChat?: NativeChatApi | undefined;
}
