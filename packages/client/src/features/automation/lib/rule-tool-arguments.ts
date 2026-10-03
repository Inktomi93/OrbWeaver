import type { AutomationRuleToolView } from "@orb/contracts/automation";
import { liftJsonSchema } from "@orb/kit/json-schema";
import { scanMacroRuns } from "@orb/kit/macro";

/** Advisory only: runtime renders the real event and validates against the live registered tool. */
export function ruleToolArgumentGuidance(source: string, tool: AutomationRuleToolView | undefined, rendered = false): string {
  if (tool === undefined) {
    return "Tool metadata is unavailable. The stored name and argument template are unchanged.";
  }
  if (!rendered && scanMacroRuns(source).some((run) => run.kind === "macro")) {
    return "This template contains macros. Test the saved rule to inspect rendered arguments; future events can produce different values.";
  }
  // @orb-waive caught-failure-ownership(error): RuleToolFields and saved Test render the returned validation failure inline; no tool executes here. Ends if callers stop rendering this guidance.
  try {
    const result = liftJsonSchema(tool.parameters).safeParse(JSON.parse(source));
    return result.success
      ? `${rendered ? "Rendered" : "Literal"} arguments match the current tool schema.`
      : result.error.issues.map((issue) => `${issue.path.join(".") || "Arguments"}: ${issue.message}`).join("; ");
  } catch (error) {
    return error instanceof SyntaxError
      ? "Arguments are not a valid JSON document yet."
      : "The current tool schema could not be checked here. Execution still validates the registered tool's arguments.";
  }
}

/** Human-readable property guidance comes from the caller-visible schema, never another tool vocabulary. */
export function ruleToolParameterGuidance(tool: AutomationRuleToolView): readonly string[] {
  const properties = tool.parameters["properties"];
  const required = tool.parameters["required"];
  if (properties === null || typeof properties !== "object" || Array.isArray(properties)) {
    return [];
  }
  return Object.entries(properties).map(([name, schema]) => {
    const mandatory = Array.isArray(required) && required.includes(name);
    if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
      return `${name} — ${mandatory ? "required" : "optional"}`;
    }
    const type = schema["type"];
    const description = schema["description"];
    const allowed = schema["enum"];
    const typeLabel = parameterTypeLabel(type);
    return `${name} — ${mandatory ? "required" : "optional"}, ${typeLabel}${typeof description === "string" ? `. ${description}` : ""}${Array.isArray(allowed) ? `. Allowed: ${allowed.map((value) => JSON.stringify(value)).join(", ")}` : ""}`;
  });
}

function parameterTypeLabel(type: AutomationRuleToolView["parameters"][string] | undefined): string {
  if (typeof type === "string") {
    return type;
  }
  return Array.isArray(type) ? type.join(" or ") : "value";
}
