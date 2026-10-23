import type {
  EndpointFeatures,
  ResolvedWarning,
  StructuredSchemaTarget,
  StructuredVehicle,
  WireSchemaMode,
  WireSchemaViolation,
} from "@orb/contracts/inference";
import type { ResponseFormat, ToolChoice, WireTool } from "./chat.ts";

/** What a caller needs. A plan with `formats` produces one structured payload; `tools` alone is a tool turn. */
export interface StructuredAsk {
  /** Candidate schemas in preference order. The plan names the index it picked. */
  readonly formats?: readonly ResponseFormat[] | undefined;
  readonly tools?: readonly WireTool[] | undefined;
  readonly toolChoice?: ToolChoice | undefined;
  /** `false` when this turn's own settings refuse forced tool use (Anthropic's manual extended thinking): a forced
   *  choice goes out as `auto`, loudly, and the forced-tool vehicle is not tried. */
  readonly forcedChoice?: false | undefined;
  /** `false` when this turn's own shape refuses the native carrier (an Anthropic assistant prefill cannot ride
   *  `output_config.format`): the payload rides a tool or is refused. */
  readonly nativeFormat?: false | undefined;
  /** The funnel resolved an explicit off; omission leaves the model's reasoning default active. */
  readonly reasoningOff?: boolean | undefined;
}

/** The structured payload as planned: the scrubbed schema, how it rides, and the paths the reply drops a null at. */
export interface PlannedResponseFormat {
  readonly name: string;
  readonly description?: string | undefined;
  readonly schema: Record<string, unknown>;
  /** `response_format.json_schema.strict`: true where the mode compiles a strict grammar. */
  readonly strict: boolean;
  readonly vehicle: StructuredVehicle;
  /** True when the reshape made optionals nullable, so a null at `reshapedPaths` means absent. */
  readonly nullMeansAbsent: boolean;
  readonly reshapedPaths: readonly string[];
}

/** A tool as it goes out: parameters scrubbed for its mode, strictness resolved against the endpoint. */
export interface PlannedTool extends WireTool {
  readonly strict: boolean | undefined;
}

interface StructuredPlanBase {
  readonly ok: true;
  /** The endpoint's grammar vocabulary the plan was built for. */
  readonly mode: WireSchemaMode;
  readonly tools?: readonly PlannedTool[] | undefined;
  readonly toolChoice?: ToolChoice | undefined;
  /** A tool vehicle rides one call: parallel calls are off. */
  readonly parallelToolCalls?: false | undefined;
  readonly downgrades: readonly ResolvedWarning[];
}

export type StructuredPlan = StructuredPlanBase &
  ({ readonly shape?: never; readonly responseFormat?: never } | { readonly shape: number; readonly responseFormat: PlannedResponseFormat });

export interface StructuredRefusal {
  readonly ok: false;
  readonly violations: readonly WireSchemaViolation[];
}

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
