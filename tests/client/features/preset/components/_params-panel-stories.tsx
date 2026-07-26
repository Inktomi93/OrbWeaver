// CT story module for the ParamsPanel Output-axis additions (retro #7): the resolved-caps line, the clamped
// `maxOutputTokens` field, and the NEW `maxContextTokens` field. A CT only mounts from a NON-test module
// (Spine-Testing §7). The story wires the REAL panel through the SAME `createAutosaveEntityForm` session
// BOUNDARY the production preset editor mounts it under (production-faithful — not a lighter factory), over a
// real save spy, and mirrors the last-saved caps to an `<output>` so the CT can assert the clamp actually
// PERSISTED the clamped value, not the typed overflow.

import type { AppFormInstance } from "@orb/client/forms";
import { createAutosaveEntityForm } from "@orb/client/forms";
import type { PromptConfig } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { ReactElement } from "react";
import { useState } from "react";
import { ParamsPanel } from "../../../../../packages/client/src/features/preset/components/params-panel";
import { makeModelCapability } from "../../../../support/factories/resolved-connection";

const STORY_PRESET = "preset_paramsstoryaa";

// A vLLM-shaped capability: a 32768 window + an 8192 output cap — the two ceilings the panel's fields clamp
// against (retro #7 de-hardcode: the window is the engine's self-reported max_model_len). Built through the
// TYPED factory (schema-parsed, browser-safe: contracts+kit only) — no fabrication cast.
const STORY_CAPABILITY = makeModelCapability({
  sampling: { temperature: { min: 0, max: 2 } },
  output: { maxTokens: { min: 1, max: 8192 } },
  context: { window: 32_768 },
});

const StoryForm = createAutosaveEntityForm<PromptConfig>({ defaultValues: DEFAULT_PROMPT_CONFIG });

/** The Output axis wired to the REAL preset autosave BOUNDARY + the vLLM-shaped capability. The `<output>`
 *  mirrors the last-saved max-output/max-context so the CT can prove the field clamp persisted the ceiling,
 *  not the typed overflow (a form spy on `save`, exactly as the production editor's `update` would receive). */
export function ParamsPanelOutputStory(): ReactElement {
  const save = (): Promise<void> => Promise.resolve();
  return (
    <StoryForm entityId={STORY_PRESET} serverValues={DEFAULT_PROMPT_CONFIG} save={save}>
      {(session): ReactElement => <StoryBody form={session.form as AppFormInstance<PromptConfig>} />}
    </StoryForm>
  );
}

/** ⑨(b) — the Sampling axis, whose "Advanced" disclosure surfaces the escape-hatch fields (logitBias +
 *  advanced.parallelToolCalls/dynamicContext). The `<output>` mirrors those on demand so the CT can prove an
 *  edit PERSISTED into the form (the same read-button pattern). */
export function ParamsPanelSamplingStory(): ReactElement {
  const save = (): Promise<void> => Promise.resolve();
  return (
    <StoryForm entityId={STORY_PRESET} serverValues={DEFAULT_PROMPT_CONFIG} save={save}>
      {(session): ReactElement => <SamplingStoryBody form={session.form as AppFormInstance<PromptConfig>} />}
    </StoryForm>
  );
}

function SamplingStoryBody({ form }: { readonly form: Parameters<typeof ParamsPanel>[0]["form"] }): ReactElement {
  const [snapshot, setSnapshot] = useState("bias=- parallel=- dyn=-");
  return (
    <div>
      <output>{snapshot}</output>
      <button
        type="button"
        onClick={(): void =>
          setSnapshot(
            `bias=${JSON.stringify(form.getFieldValue("params.logitBias") ?? null)} parallel=${String(form.getFieldValue("params.advanced")?.parallelToolCalls)} dyn=${String(form.getFieldValue("params.advanced")?.dynamicContext)}`,
          )
        }
      >
        read values
      </button>
      <ParamsPanel form={form} capability={STORY_CAPABILITY} axis="sampling" />
    </div>
  );
}

/** The `<output>` mirrors the CURRENT form caps on demand (the read-button setState forces a re-render, so the
 *  mirror reflects the clamped value the field committed — proving the clamp persisted, not just displayed). */
function StoryBody({ form }: { readonly form: Parameters<typeof ParamsPanel>[0]["form"] }): ReactElement {
  const [snapshot, setSnapshot] = useState("out=- ctx=-");
  return (
    <div>
      <output>{snapshot}</output>
      <button
        type="button"
        onClick={(): void =>
          setSnapshot(`out=${String(form.getFieldValue("params.maxOutputTokens"))} ctx=${String(form.getFieldValue("params.maxContextTokens"))}`)
        }
      >
        read values
      </button>
      <ParamsPanel form={form} capability={STORY_CAPABILITY} axis="output" />
    </div>
  );
}
