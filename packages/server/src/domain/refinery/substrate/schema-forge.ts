// domain/refinery/substrate/schema-forge — the NL→schema forge ENGINE the two forge verbs share (one verb
// per file; the machinery lives here). REWORKED for task #36, the owner's 2026-08-09 veto: "asking the model
// to pretty-please output proper JSON is fragile as fuck… the prompt describes the task, the grammar owns
// the shape."
//
// WHAT CHANGED. The shipped R3 call constrained `{name, schema}` where `schema` was
// `z.record(z.string(), z.unknown())` — an enforced ENVELOPE around an unenforced payload, with the whole
// belt carried by a prompt asking for "ONLY a JSON object" plus a bounded retry. Now every call rides the
// FLAT DESIGN LANGUAGE (`@orb/contracts/refinery` — `forgeDesignEnvelopeSchema` and friends) as its
// `ResponseFormat`, and the server TRANSPILES the answer into the stored JSON Schema. A constrained backend
// cannot emit a construct outside the sanctioned vocabulary; the belt then validates the transpiled document
// as the FINAL authority on every arm and every backend (enforcement is an optimization, the belt is the
// contract).
//
// THE RETRY BRIDGE SHRANK, IT DID NOT DIE. `runStructuredTurn`'s one bounded retry now covers only what a
// grammar cannot own: the document NAME's identifier grammar and a field PATH's segment grammar (both free
// strings — `pattern` never rides a wire), plus a transpile that placed nothing. The §4.5 lift-refusal
// bridge — the loose envelope whose superRefine re-emitted the WHOLE document belt as zod issues — is gone
// with the hole it was patching: a `$ref`, a `oneOf`, a `pattern`, a bad hint role, an over-deep nest and a
// missing well-known core are all unconstructable now.
//
// VEHICLE: the domain's ruled F2 rung — the `summarize` facade, which routes a call carrying a
// `responseFormat` to the `structured` ROLE (`entry/compose/role-clients.ts`; the owner's 2026-07-27 split).
// The forge asks for the ENFORCED vehicle explicitly (`vehicle: "response-format"`), because a schema author
// wants the hard guarantee rather than the deployment's default posture.
//
// THE THREE ARMS are the owner's "we should have options" (2026-08-09). Dispatched through an exhaustive
// Record — a new `RefineryForgeArm` without a runner is a tsc error (§5.5).

import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import type { ProseOverrides } from "@orb/contracts/prose";
import { resolveProseText } from "@orb/contracts/prose";
import type { ForgeDesignEnvelope, ForgeFieldRow, RefineryForgeArm, RefinerySchemaStage } from "@orb/contracts/refinery";
import {
  applyForgeHints,
  forgeDesignEnvelopeSchema,
  forgeFieldEnvelopeSchema,
  forgeHintEnvelopeSchema,
  forgePlanEnvelopeSchema,
  refinerySchemaDocumentSchema,
  transpileForgeDesign,
} from "@orb/contracts/refinery";
import type { RoleClients, StructuredOptions, SummarizeOptions } from "@orb/contracts/role-clients";
import { resolveSideGenSampling, runStructuredTurn, StructuredOutputError } from "@orb/inference";
import type { UserId } from "@orb/kit/ids";
import { dropNullValues, projectJsonSchema } from "@orb/kit/json-schema";
import { z } from "zod";
import { addSpanEvent } from "#foundation/observability";
import type { RefineryContext } from "../context.ts";
import type { ForgeTurnArgs } from "../contract/prompts.ts";
import type { SchemaForgeResult } from "../contract/results.ts";
import { traceStructuredRetry } from "./structured-retry-trace.ts";

/** The `{{core}}` splice per stage — what the WELL-KNOWN CORE is, stated as a fact the author does not
 *  author. The transpiler injects the node itself, so this text exists to stop the model spending a field
 *  row on it, never to ask for it. */
const CORE_TEXTS: Record<RefinerySchemaStage, string> = {
  score: '\n\nThis is a SCORE schema. A required 1-10 "overallScore" gauge is added automatically — do not describe it; design the fields that explain it.',
  analyze:
    '\n\nThis is an ANALYZE schema. A required "verdict" field (ACCEPT / NEEDS_REFINEMENT / REGRESSION) is added automatically — do not describe it; design the fields that justify it.',
};

/** The `{{task}}` splice per CALL — the one owner-editable forge slot serves four different asks (design a
 *  whole schema · plan the fields · finish one field · derive the display hints), and which one is in force
 *  is a call-time fact, never baked into owner-editable text (the `{{shape}}` splice precedent). */
const TASK_DESIGN = "Design the whole schema now: one row per leaf field, with its display hints.";
const TASK_PLAN = "Do NOT design fields yet. List the leaf field PATHS you will need and one line of intent for each.";
const TASK_FIELD = "Design EXACTLY ONE field — the one named below — as a single row. Stay inside the schema the other fields belong to.";
const TASK_HINTS = "The structure is fixed. Choose only the DISPLAY hints (role / group / label / chart / per-member tones) for the paths listed below.";

/** The wire `ResponseFormat.name` per call kind — one home, no scattered literals. */
const FORMAT_NAMES = {
  design: "refinery_schema_design",
  plan: "refinery_schema_plan",
  field: "refinery_schema_field",
  hints: "refinery_schema_hints",
} as const;

// The projections are computed ONCE at module load: they are constants of the contract, and re-projecting a
// schema per call is pure waste on a path that already pays for a model turn.
const RESPONSE_FORMATS = {
  design: { name: FORMAT_NAMES.design, schema: projectJsonSchema(forgeDesignEnvelopeSchema), vehicle: "response-format" as const },
  plan: { name: FORMAT_NAMES.plan, schema: projectJsonSchema(forgePlanEnvelopeSchema), vehicle: "response-format" as const },
  field: { name: FORMAT_NAMES.field, schema: projectJsonSchema(forgeFieldEnvelopeSchema), vehicle: "response-format" as const },
  hints: { name: FORMAT_NAMES.hints, schema: projectJsonSchema(forgeHintEnvelopeSchema), vehicle: "response-format" as const },
} as const;

/** `null ≡ absent` at the forge's parse seam. The hosted wire serves this grammar in the OpenAI-strict shape
 *  (every property required, each optional an `anyOf:[T,null]` — the ONLY shape measured servable across
 *  anthropic/openai/google on 2026-08-09), so an unset knob arrives as an explicit `null`. Restoring absence
 *  here is what lets ONE payload schema validate both wires. */
function tolerant<T>(schema: z.ZodType<T>): z.ZodType<T> {
  return z.preprocess((value) => dropNullValues(value), schema) as unknown as z.ZodType<T>;
}

export async function resolveForgeCall(
  ctx: RefineryContext,
  ownerId: UserId,
): Promise<{ overrides: ProseOverrides; sampleOpts: SummarizeOptions; rc: RoleClients }> {
  const [overrides, presetParams, rc] = await Promise.all([ctx.resolveUserProse(ownerId), ctx.resolveUserPresetParams(ownerId), ctx.roleClientsFor(ownerId)]);
  return { overrides, sampleOpts: resolveSideGenSampling(SIDE_GEN_POSTURES.schema_forge, presetParams), rc };
}

/** One enforced call. `format` picks the grammar; `task` is the `{{task}}` splice; `payload` is the
 *  validator (already `tolerant`). Throws `StructuredOutputError` when both the turn and its one retry fail. */
async function runCall<T>(
  args: ForgeTurnArgs,
  spec: { readonly format: keyof typeof RESPONSE_FORMATS; readonly task: string; readonly user: string; readonly payload: z.ZodType<T> },
): Promise<T> {
  const system = resolveProseText("refinery.schemaForge.system", args.overrides, { core: CORE_TEXTS[args.stage], task: spec.task });
  const opts: StructuredOptions = { ...args.sampleOpts, responseFormat: RESPONSE_FORMATS[spec.format] };
  const run = async (correction?: string): Promise<string> => {
    const userPrompt = correction === undefined ? spec.user : `${spec.user}\n\n${correction}`;
    const res = await args.rc.structured([{ systemPrompt: system, userPrompt }], opts);
    return res.items[0]?.text ?? "";
  };
  return await runStructuredTurn({ payloadSchema: spec.payload, run, onRetry: traceStructuredRetry("refine-schema-forge") });
}

// ── the arms ─────────────────────────────────────────────────────────────────────────────────────────────

/** `single` — one enforced call for the whole design, hints included. */
async function runSingleArm(args: ForgeTurnArgs): Promise<ForgeDesignEnvelope> {
  return await runCall(args, { format: "design", task: TASK_DESIGN, user: args.userPrompt, payload: tolerant(forgeDesignEnvelopeSchema) });
}

/** `guided` — plan the paths, then give each planned field its own turn in ONE batched call, then assemble.
 *  A field whose own turn produced nothing usable is DROPPED and counted; a plan whose every field failed
 *  resolves as the failed arm upstream (an empty `fields` list refuses at the envelope belt). */
async function runGuidedArm(args: ForgeTurnArgs): Promise<ForgeDesignEnvelope> {
  const plan = await runCall(args, { format: "plan", task: TASK_PLAN, user: args.userPrompt, payload: tolerant(forgePlanEnvelopeSchema) });
  const system = resolveProseText("refinery.schemaForge.system", args.overrides, { core: CORE_TEXTS[args.stage], task: TASK_FIELD });
  const roster = plan.fields.map((f) => `- ${f.path}: ${f.intent}`).join("\n");
  const inputs = plan.fields.map((f) => ({
    systemPrompt: system,
    userPrompt: `${args.userPrompt}\n\nThe whole schema will be:\n${roster}\n\nDesign THIS field only: ${f.path} — ${f.intent}`,
  }));
  const res = await args.rc.structured(inputs, { ...args.sampleOpts, responseFormat: RESPONSE_FORMATS.field });
  const payload = tolerant(forgeFieldEnvelopeSchema);
  const fields: ForgeFieldRow[] = [];
  for (const [index, item] of res.items.entries()) {
    const parsed = parseFieldReply(payload, item.text);
    if (parsed === null) {
      continue;
    }
    // The PLAN owns the path — a per-field turn that renamed its own field would silently reshape the
    // schema the plan call and the user both agreed on.
    fields.push({ ...parsed, path: plan.fields[index]?.path ?? parsed.path });
  }
  const dropped = plan.fields.length - fields.length;
  if (dropped > 0) {
    addSpanEvent("refinery.forge.field-dropped", { arm: "guided", planned: plan.fields.length, dropped });
  }
  return { name: plan.name, description: plan.description, fields };
}

/** One per-field batch item's reply → its row, or null when it did not validate. No retry here: the batch is
 *  one call, and a failed row is a DROP the caller counts (the arm's own bounded-cost posture). */
function parseFieldReply(payload: z.ZodType<{ field: ForgeFieldRow }>, text: string): ForgeFieldRow | null {
  const start = text.indexOf("{");
  if (start === -1) {
    return null;
  }
  // @orb-waive caught-failure-ownership(catch): bookkeeping — documented above: a malformed
  // JSON slice is a DROP the caller counts (bounded-cost posture, no retry); `null` is the same drop
  // `safeParse.success === false` already produces two lines up. Ends if a dropped row needs its own reason.
  try {
    const parsed = payload.safeParse(JSON.parse(text.slice(start)));
    return parsed.success ? parsed.data.field : null;
  } catch {
    return null;
  }
}

/** `two-stage` — structure first (no hints), then the display vocabulary against the finished paths. */
async function runTwoStageArm(args: ForgeTurnArgs): Promise<ForgeDesignEnvelope> {
  const structure = await runCall(args, {
    format: "design",
    task: `${TASK_DESIGN} Leave every display hint (role / group / label / chart / tones) unset — a second pass chooses them.`,
    user: args.userPrompt,
    payload: tolerant(forgeDesignEnvelopeSchema),
  });
  const roster = structure.fields.map((f) => `- ${f.path} (${f.type}${f.enum === undefined ? "" : `: ${f.enum.join(" / ")}`}) — ${f.description}`).join("\n");
  const hinted = await runCall(args, {
    format: "hints",
    task: TASK_HINTS,
    user: `${args.userPrompt}\n\nThe finished fields:\n${roster}`,
    payload: tolerant(forgeHintEnvelopeSchema),
  });
  const applied = applyForgeHints(structure, hinted.hints);
  if (applied.unmatched > 0) {
    addSpanEvent("refinery.forge.hint-unmatched", { arm: "two-stage", unmatched: applied.unmatched });
  }
  return applied.design;
}

/** The arm dispatch — a mapped Record, not a switch: a new arm without a runner is a tsc error (§5.5). */
const FORGE_ARMS: Readonly<Record<RefineryForgeArm, (args: ForgeTurnArgs) => Promise<ForgeDesignEnvelope>>> = {
  single: runSingleArm,
  guided: runGuidedArm,
  "two-stage": runTwoStageArm,
};

// ── the turn ─────────────────────────────────────────────────────────────────────────────────────────────

/** The belt's verdict on a transpiled design, as the model-facing correction text. Returns null when the
 *  document passes (the overwhelmingly common case now that the grammar owns the shape). */
function beltRefusalOf(name: string, description: string, schema: Record<string, unknown>, stage: RefinerySchemaStage): string | null {
  const parsed = refinerySchemaDocumentSchema.safeParse({ name, description, stage, schema });
  return parsed.success ? null : parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
}

/**
 * One forge turn under the caller's arm. Success → the `draft` arm; a design the belt still refuses, or a
 * double structured-output failure, → the `failed` arm carrying what the model actually said (errors-as-data,
 * show-the-partial — the raw never rides an error message).
 */
export async function runForgeTurn(args: ForgeTurnArgs): Promise<SchemaForgeResult> {
  let design: ForgeDesignEnvelope;
  try {
    design = await FORGE_ARMS[args.arm](args);
  } catch (err) {
    if (err instanceof StructuredOutputError) {
      return { kind: "failed", message: "The model couldn't produce a usable schema design — its raw reply is below for hand-fixing.", raw: err.raw };
    }
    throw err;
  }
  const transpiled = transpileForgeDesign(design, args.stage);
  if (transpiled.dropped.length > 0) {
    addSpanEvent("refinery.forge.row-dropped", { arm: args.arm, dropped: transpiled.dropped.length });
  }
  // THE HONEST REFUSAL (owner, "the people who want to do weird scorings"): the ask needed a construct the
  // leaf language cannot express. Route to the raw door with what the design DID reach — never a lossy flat
  // approximation of the author's idea.
  if (design.needsRaw === true) {
    addSpanEvent("refinery.forge.needs-raw", { arm: args.arm, fields: design.fields.length });
    return {
      kind: "needs-raw",
      message:
        design.needsRawReason !== undefined && design.needsRawReason.length > 0
          ? `That shape needs the raw schema editor: ${design.needsRawReason}`
          : "That shape needs the raw schema editor — the guided designer only builds plain fields, lists and nested blocks.",
      skeleton: transpiled.schema,
    };
  }
  if (design.fields.length === 0) {
    return {
      kind: "failed",
      message: "The model returned no fields for that description. Try describing the readout you want in more concrete terms.",
      raw: null,
    };
  }
  const refusal = beltRefusalOf(design.name, design.description, transpiled.schema, args.stage);
  if (refusal !== null) {
    // The residue the grammar cannot own (a name outside the identifier grammar, a path that placed
    // nothing). The raw carries the transpiled document so the editor's JSON door can hand-fix it.
    return { kind: "failed", message: `That design didn't pass the schema checks: ${refusal}`, raw: JSON.stringify(transpiled.schema, null, 2) };
  }
  return { kind: "draft", name: design.name, schema: transpiled.schema, dropped: transpiled.dropped.map((d) => `${d.path}: ${d.reason}`) };
}
