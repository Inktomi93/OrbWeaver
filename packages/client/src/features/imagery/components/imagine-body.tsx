// The `imagine` modal body (interaction-direction-spec.md §7 B5) — the /imagine preview-before-spend
// surface. A mode strip (free + the four extraction modes) over the seed `/imagine` parsed; for an
// extraction mode a "Preview prompt" runs `extractPrompt` and DROPS the resolved keywords into the editable
// prompt box, so the host sees (and can edit) what the image will be built from BEFORE spending on it. A
// prompt, once present, is sent VERBATIM as free mode; an extraction mode left un-previewed lets the server
// resolve it. Generate posts into the room via `chat.generateImage`; the image arrives on the stream.

import type { PromptTemplateMode } from "@orb/contracts/imagery";
import { EXTRACTION_MODES } from "@orb/contracts/imagery";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import type { ImagineSeed } from "#state";
import { closeModal, useImagineSeed } from "#state";
import { useExtractPrompt, useGeneratePicture } from "../hooks/use-imagery-mutations.ts";

// free-first: the prompt-verbatim mode, then the four extraction modes (derived from the contract tuple —
// never a re-spelled member list). The multimodal caption modes are a Phase-7 avatar concern, not /imagine.
const IMAGINE_MODES = ["free", ...EXTRACTION_MODES] as const;
type ImagineMode = (typeof IMAGINE_MODES)[number];
const MODE_LABELS: Record<ImagineMode, string> = {
  free: "Free prompt",
  character: "Character",
  face: "Face",
  scenario: "Scene",
  background: "Background",
};

const PROMPT_ROWS = 3;
const PROMPT_MAX_ROWS = 8;

/** The modal reads its seed; during the close animation the seed is already cleared, so an absent seed
 *  renders a neutral rest state rather than a crash (the modal is a shell singleton — it can paint mid-close). */
export function ImagineBody(): ReactElement {
  const seed = useImagineSeed();
  if (seed === undefined) {
    return (
      <Stack gap="block" padding="block">
        <Text voice="gloss">Nothing to imagine.</Text>
      </Stack>
    );
  }
  // Re-mount the form per seed so a fresh /imagine invocation never inherits the prior draft's edits.
  return <ImagineForm key={`${seed.chatId}:${seed.mode}:${seed.prompt}`} seed={seed} />;
}

function ImagineForm({ seed }: { readonly seed: ImagineSeed }): ReactElement {
  const [mode, setMode] = useState<ImagineMode>(isImagineMode(seed.mode) ? seed.mode : "free");
  const [prompt, setPrompt] = useState(seed.prompt);
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const extract = useExtractPrompt({ trpc, invalidation });
  const generate = useGeneratePicture({ trpc, invalidation });

  const trimmed = prompt.trim();
  const isExtraction = mode !== "free";
  const busy = extract.isPending || generate.isPending;
  // Free mode needs an explicit prompt; an extraction mode can generate from the conversation with none.
  const canGenerate = !busy && (trimmed.length > 0 || isExtraction);

  const preview = (): void => {
    if (mode === "free") {
      return;
    }
    void extract
      .mutateAsync({ chatId: seed.chatId, mode })
      .then((result) => setPrompt(result.prompt))
      .catch(() => undefined);
  };

  const runGenerate = (): void => {
    if (!canGenerate) {
      return;
    }
    // A present prompt IS the image — sent verbatim as free mode (an extraction mode previewed-then-edited
    // lands here too). An extraction mode with no prompt defers resolution to the server.
    const request = trimmed.length > 0 ? { chatId: seed.chatId, mode: "free" as const, prompt: trimmed } : { chatId: seed.chatId, mode };
    void generate
      .mutateAsync(request)
      .then(() => closeModal())
      .catch(() => undefined);
  };

  return (
    <Stack gap="block" padding="block">
      <Text className="max-w-(--reading-measure)" voice="reading">
        Generate an image into this chat. Pick a mode, or type a prompt — the portrait and scene modes can read the conversation for you; preview before you
        spend.
      </Text>
      <Stack gap="field">
        <Text as="span" voice="label">
          Mode
        </Text>
        {/* Pressable modes (the add-document precedent), not a tablist — each just re-targets the same prompt. */}
        <Row className="flex-wrap" gap="field">
          {IMAGINE_MODES.map((id) => (
            <Button aria-pressed={mode === id} intent={mode === id ? "primary" : "ghost"} key={id} onClick={(): void => setMode(id)} size="sm" type="button">
              {MODE_LABELS[id]}
            </Button>
          ))}
        </Row>
      </Stack>
      <Stack gap="field">
        <Row align="center" justify="between">
          <Text as="span" voice="label">
            Prompt
          </Text>
          {isExtraction ? (
            <Button disabled={busy} intent="ghost" onClick={preview} size="sm" type="button">
              {extract.isPending ? "Reading the scene…" : "Preview prompt"}
            </Button>
          ) : null}
        </Row>
        <Textarea
          aria-label="Image prompt"
          maxRows={PROMPT_MAX_ROWS}
          onValueChange={(value): void => setPrompt(value)}
          placeholder={isExtraction ? "Preview to fill from the chat, or type your own." : "Describe the image to generate…"}
          rows={PROMPT_ROWS}
          value={prompt}
        />
        {isExtraction && trimmed.length === 0 ? (
          <Text voice="gloss">Generate now to let the model build the prompt from the conversation, or preview first to edit it.</Text>
        ) : null}
      </Stack>
      <Row justify="end">
        <Button disabled={!canGenerate} intent="primary" onClick={runGenerate} type="button">
          {generate.isPending ? "Generating…" : "Generate"}
        </Button>
      </Row>
    </Stack>
  );
}

function isImagineMode(mode: PromptTemplateMode): mode is ImagineMode {
  return (IMAGINE_MODES as readonly PromptTemplateMode[]).includes(mode);
}
