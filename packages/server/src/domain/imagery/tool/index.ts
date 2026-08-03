// tool — the D48 `generate_image` tool projection (imagery-design/04 §1). Registered ONCE at entry/compose
// (the owning-domain closure idiom — tool-use never imports imagery); the handler closes over the injected
// `imagery.generatePicture` op and reads the acting principal + chat from the exec context per invocation.
// The automation `generate_image` action arm (A6) is a SEPARATE consumer of the SAME `generateImageActionArgsSchema`
// + op; this file only wires the tool. The capability ceiling is `null` (member floor — any present member may
// generate).
//
// The tool's MODEL-facing wire args are the action-arm vocabulary MINUS three fields (the rest projects to
// JSON Schema for the wire — @orb/kit/json-schema):
//   • `quiet` — a tool result always returns to the recurse loop, so there is nothing to suppress (it is the
//     automation ARM's post-vs-return knob, doc 04 §1/§2);
//   • `subjectCharacterId` — an internal typeid the MODEL cannot know or produce, and whose strict-parse
//     `typeIdSchema` carries a `.transform()` that `z.toJSONSchema` cannot represent (D79 projection). Subject
//     targeting is the human/config-authored automation arm's surface, not the model's;
//   • `useAvatarReference` — inert without a `subjectCharacterId` (B3 needs a subject), so it rides the arm too.

import { generateImageActionArgsSchema } from "@orb/contracts/imagery";
import type { ToolDefinition, ToolExecutionContext, ToolHandlerResult } from "#domain/tool-use";
import type { GeneratePictureParams } from "../contract/params.ts";
import type { ImageryService } from "../contract/service.ts";

/** The model-facing tool args — the projectable subset of the action-arm vocabulary (see the file header). */
const generateImageToolArgsSchema = generateImageActionArgsSchema.omit({ quiet: true, subjectCharacterId: true, useAvatarReference: true });

interface ImageryToolDeps {
  readonly generatePicture: ImageryService["generatePicture"];
}

/** The sanctioned erasure (buddy's precedent): a typed def is unassignable to `ToolDefinition<unknown>`
 *  (handler contravariance), so mint with its own `A` and widen here for the array; `register<A>` re-narrows. */
function imageryTool<A>(def: ToolDefinition<A>): ToolDefinition {
  return def as ToolDefinition;
}

export function imageryToolDefinitions(deps: ImageryToolDeps): readonly ToolDefinition[] {
  return [
    imageryTool({
      name: "generate_image",
      description:
        "Generate an image in the current chat from a text prompt. Use when the user asks you to draw, paint, " +
        'show, or picture something. `mode:"free"` uses `prompt` verbatim; the portrait/scene modes derive the ' +
        "prompt from the conversation. Posts one message with the image(s) attached.",
      argsSchema: generateImageToolArgsSchema,
      capability: null,
      source: "builtin",
      handler: async (args, exec: ToolExecutionContext): Promise<ToolHandlerResult> => {
        if (exec.chatId === null) {
          return { ok: false, error: "generate_image requires a chat context" };
        }
        const params: GeneratePictureParams = {
          caller: exec.principal,
          chatId: exec.chatId,
          mode: args.mode,
          ...(args.prompt !== undefined ? { prompt: args.prompt } : {}),
          ...(args.negative !== undefined ? { negative: args.negative } : {}),
          n: args.n,
          ...(args.size !== undefined ? { size: args.size } : {}),
          reuse: args.reuse,
        };
        const picture = await deps.generatePicture(params);
        return {
          ok: true,
          value: {
            assetIds: picture.images.map((img) => img.assetId),
            reused: picture.reused,
            warnings: picture.warnings,
          },
        };
      },
    }),
  ];
}
