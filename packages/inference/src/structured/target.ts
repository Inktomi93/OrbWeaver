// What one connection can carry for a structured request: its grammar vocabulary, the ceilings its vendor
// enforces and the vehicles its wire and capability offer. Read only from the folded capability and features.

import type { EndpointFeatures, StructuredSchemaTarget, StructuredVehicle, Wire } from "@orb/contracts/inference";
import {
  acceptsNamedToolChoice,
  acceptsNoneToolChoice,
  acceptsRequiredToolChoice,
  effectiveStructuredLimits,
  WIRE_STRUCTURED_MODE_DEFAULT,
} from "@orb/contracts/inference";
import type { Resolved } from "../contract/resolved.ts";

/** The planner's view of one endpoint. `mode` is `features.structuredMode`, else the wire default; `limits` are
 *  `output.structuredLimitsFrom` merged with `output.structuredLimits`, where the carrier is grammar-compiled. */
export interface StructuredTarget extends StructuredSchemaTarget {
  /** The carriers this endpoint can take, in preference order. */
  readonly vehicles: readonly StructuredVehicle[];
  /** Whether strict tool input rides: `features.strictJson`. */
  readonly strictTools: EndpointFeatures["strictJson"];
  /** The model can be forced to call some tool (`required`). */
  readonly requiredChoice: boolean;
  /** The model can be forced to call one named tool. */
  readonly namedChoice: boolean;
  /** A `none` choice reaches the model. */
  readonly noneChoice: boolean;
  readonly toolsSupported: boolean;
  readonly requiresReasoningOff: boolean;
}

/** Wires whose request has a native schema carrier (`response_format`, `output_config.format`,
 *  `responseJsonSchema`, the agent-sdk `outputFormat`). A mapped Record so a new wire fails `tsc` here. */
const NATIVE_CARRIER: Readonly<Record<Wire, boolean>> = {
  "openai-compat": true,
  "anthropic-messages": true,
  "google-generative-ai": true,
  "agent-sdk": true,
  "local-light": false,
};

/** Wires whose native carrier the vendor compiles into a grammar, so its ceilings bind. The agent-sdk CLI (0.3.280)
 *  sends `outputFormat` as its own StructuredOutput tool, non-strict unless a remote flag (default off) is on, and
 *  validates the reply against the full schema itself, retrying on a mismatch. */
const COMPILED_CARRIER: Readonly<Record<Wire, boolean>> = {
  "openai-compat": true,
  "anthropic-messages": true,
  "google-generative-ai": true,
  "agent-sdk": false,
  "local-light": false,
};

/** Wires whose request carries a `tools[]` array the caller controls. The agent-sdk mounts tools as an MCP
 *  server it drives itself, which cannot be forced or limited to one call. */
const SENDS_TOOLS: Readonly<Record<Wire, boolean>> = {
  "openai-compat": true,
  "anthropic-messages": true,
  "google-generative-ai": true,
  "agent-sdk": false,
  "local-light": false,
};

/** The structured target of a resolved connection. A non-generation model has no vehicle. */
export function structuredTargetOf(connection: Resolved): StructuredTarget {
  const mode = connection.features.structuredMode ?? WIRE_STRUCTURED_MODE_DEFAULT[connection.wire];
  const strictTools = connection.features.strictJson;
  if (connection.capability.kind !== "generation") {
    return {
      mode,
      limits: undefined,
      vehicles: [],
      strictTools,
      requiredChoice: false,
      namedChoice: false,
      noneChoice: false,
      toolsSupported: false,
      requiresReasoningOff: false,
    };
  }
  const generation = connection.capability.generation;
  const takesTools = generation.tools !== undefined && SENDS_TOOLS[connection.wire];
  const namedChoice = acceptsNamedToolChoice(generation);
  const vehicles: StructuredVehicle[] = [];
  if (generation.output.structured === true && NATIVE_CARRIER[connection.wire]) {
    vehicles.push("response-format");
  }
  if (takesTools && namedChoice) {
    vehicles.push("forced-tool");
  }
  if (takesTools) {
    vehicles.push("offered-tool");
  }
  return {
    mode,
    limits: COMPILED_CARRIER[connection.wire]
      ? effectiveStructuredLimits(generation.output.structuredLimitsFrom, generation.output.structuredLimits)
      : undefined,
    vehicles,
    strictTools,
    requiredChoice: acceptsRequiredToolChoice(generation),
    namedChoice,
    noneChoice: acceptsNoneToolChoice(generation),
    toolsSupported: takesTools,
    requiresReasoningOff: generation.tools?.requiresReasoningOff === true,
  };
}
