// The `imagine` modal body — the /imagine surface. A mode strip (free +
// the four extraction modes) over the seed `/imagine` parsed; for an extraction mode "Read the chat first"
// runs `extractPrompt` and DROPS the resolved keywords into the editable prompt box, so the host sees (and can
// edit) what the image will be built from BEFORE spending on it. A prompt, once present, is sent VERBATIM as
// free mode; an extraction mode left un-read lets the server resolve it. Generate posts into the room via
// `chat.generateImage`; the image arrives on the stream.
//
// THIS SURFACE SPENDS MONEY IN TWO PLACES AND SAYS SO (#623 P1 — the cost boundary was inverted: the LLM call
// rendered as a 13px ghost inside a label row and the blind DOUBLE-spend path was the smallest text here).
// Three rules the next editor must keep:
//   1. Reading the chat is an ACTION with a price, never a caption — its own row, its own button, and the
//      price it actually cost RENDERED once it is known (`extractPrompt` returns `costUsd`; it used to be
//      destructured away).
//   2. An extraction mode with an empty prompt is a DOUBLE spend (the read, then the image). The notice that
//      says so is body prose, not a gloss.
//   3. THE GENERATE COST IS NOT AVAILABLE HERE, and that is a wire fact, not an omission: `chat.generateImage`
//      returns a `MessageView` (transport/trpc/routers/chat.ts → domain/chat/verbs/generate-image.ts) and the
//      imagery `costUsd` is dropped by chat's verb before the wire. The image's own price surfaces in the
//      LIGHTBOX's provenance strip (`imagery.readProvenance.costUsd`) — that is its home. Do not re-file it.
//
// A spend of 5-60s cannot be a dead surface either (#623 P1): both pending arms carry the house spinner, an
// elapsed count, a time expectation, and the fact that CLOSING IS SAFE — the generate flow is busDriven, so
// the image posts into the room whether or not this modal is still open, and nothing used to say so.

import type { PromptTemplateMode } from "@orb/contracts/imagery";
import { EXTRACTION_MODES } from "@orb/contracts/imagery";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { WebSpinner } from "@orb/ui/spinner";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { useEffect, useId, useState } from "react";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import type { ImagineSeed } from "#state";
import { closeModal, useImagineSeed } from "#state";
import { useExtractPrompt, useGeneratePicture } from "../hooks/use-imagery-mutations.ts";
import { formatCost } from "../lib/format-cost.ts";

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
/** The pending counters tick in whole seconds — a wall-clock read is banned in render scope. */
const ELAPSED_TICK_MS = 1000;

/** The read call's own result, kept WHOLE — `costUsd` (nullable on the wire: a backend with no usage
 *  accounting reports nothing) and `source` were both destructured away before #623. Derived from the verb,
 *  never re-spelled: the arms of `source` live in the imagery contract and the client must not fork them. */
type ExtractedPromptResult = inferOutput<Trpc["imagery"]["extractPrompt"]>;

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
  const [receipt, setReceipt] = useState<ExtractedPromptResult | undefined>(undefined);
  const modeLabelId = useId();
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const extract = useExtractPrompt({ trpc, invalidation });
  const generate = useGeneratePicture({ trpc, invalidation });

  const trimmed = prompt.trim();
  const isExtraction = mode !== "free";
  const busy = extract.isPending || generate.isPending;
  // Free mode needs an explicit prompt; an extraction mode can generate from the conversation with none.
  const canGenerate = !busy && (trimmed.length > 0 || isExtraction);
  // The DOUBLE-spend arm: an extraction mode with nothing typed makes the server run the read call too.
  const blindDoubleSpend = isExtraction && trimmed.length === 0;

  const preview = (): void => {
    if (mode === "free") {
      return;
    }
    void extract
      .mutateAsync({ chatId: seed.chatId, mode })
      .then((result) => {
        setPrompt(result.prompt);
        setReceipt(result);
      })
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
      <Text className="max-w-(--reading-measure-prose)" voice="reading">
        Generate an image into this chat. Every image is a real charge — and the modes that read the conversation spend a second, smaller call to build the
        prompt first.
      </Text>
      <Stack gap="field">
        <Text as="span" id={modeLabelId} voice="label">
          Mode
        </Text>
        {/* Pressable modes (the add-document precedent), not a tablist — each just re-targets the same prompt.
            A `group` with the label as its name, so the tree reads one named cluster instead of five loose
            buttons. DISABLED mid-spend: the in-flight request already carries the old mode, so letting the
            strip move under it would show a selection the pending image does not have. */}
        <Row aria-labelledby={modeLabelId} className="flex-wrap" gap="field" role="group">
          {IMAGINE_MODES.map((id) => (
            <Button
              aria-pressed={mode === id}
              disabled={busy}
              intent={mode === id ? "primary" : "ghost"}
              key={id}
              onClick={(): void => setMode(id)}
              size="sm"
              type="button"
            >
              {MODE_LABELS[id]}
            </Button>
          ))}
        </Row>
      </Stack>
      <Stack gap="field">
        <Text as="span" voice="label">
          Prompt
        </Text>
        <Textarea
          aria-label="Image prompt"
          maxRows={PROMPT_MAX_ROWS}
          onValueChange={(value): void => setPrompt(value)}
          placeholder={isExtraction ? "Read the chat to fill this, or type your own." : "Describe the image to generate…"}
          rows={PROMPT_ROWS}
          value={prompt}
        />
        {isExtraction ? (
          <Stack gap="tight">
            {blindDoubleSpend ? (
              <Text className="max-w-(--reading-measure-prose)" data-slot="imagine-double-spend" voice="reading">
                Generate now and this mode charges TWICE: one call to read the chat into a prompt, then the image itself.
              </Text>
            ) : null}
            <Row align="center" className="flex-wrap" gap="field">
              <Button disabled={busy} intent="secondary" onClick={preview} size="sm" type="button">
                Read the chat first
              </Button>
              {extract.isPending ? (
                <PendingLine label="Reading the chat" verb="Reading the chat…" />
              ) : (
                <Text as="span" className="max-w-(--reading-measure-prose)" data-slot="imagine-read-cost" voice="reading">
                  {readCostLine(receipt)}
                </Text>
              )}
            </Row>
          </Stack>
        ) : null}
      </Stack>
      {generate.isPending ? (
        <Stack data-slot="imagine-generating" gap="tight">
          <PendingLine label="Generating the image" verb="Generating the image…" />
          <Text className="max-w-(--reading-measure-prose)" voice="reading">
            Usually 5-60 seconds. You can close this — the image posts into the chat when it's ready.
          </Text>
        </Stack>
      ) : null}
      <Row justify="end">
        <Button disabled={!canGenerate} intent="primary" onClick={runGenerate} type="button">
          {generate.isPending ? "Generating…" : "Generate"}
        </Button>
      </Row>
    </Stack>
  );
}

/** The read call's one line: what it will cost you before, what it DID cost after. `costUsd: null` means the
 *  backend reported no usage — say that rather than print `$0.0000`, which would read as "free". */
function readCostLine(receipt: ExtractedPromptResult | undefined): string {
  if (receipt === undefined) {
    return "Spends a small text call now — then you can edit the prompt before paying for the image.";
  }
  const source = receipt.source === "captioned" ? "Read the character's image" : "Read the chat";
  if (receipt.costUsd === null) {
    return `${source}. The image is a separate charge.`;
  }
  return `${source}: ${formatCost(receipt.costUsd)} spent. The image is a separate charge.`;
}

/**
 * A live "…N s" line for one in-flight spend. MOUNT-SCOPED BY DESIGN: the caller renders it only while the
 * call is pending, so the counter starts at zero because the component is new — there is no reset arm, and
 * therefore no `setState` inside an effect adjusting state when a prop changed (which the react-hooks lint
 * refuses, correctly: it is a cascading render). A tick counter, never a wall-clock read in render scope
 * (the `reasoning-block` precedent).
 */
function PendingLine({ label, verb }: { readonly label: string; readonly verb: string }): ReactElement {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((current) => current + 1), ELAPSED_TICK_MS);
    return (): void => clearInterval(id);
  }, []);
  return (
    <Row align="center" gap="field">
      <WebSpinner label={label} size="sm" />
      <Text as="span" voice="reading">
        {verb} {seconds}s
      </Text>
    </Row>
  );
}

function isImagineMode(mode: PromptTemplateMode): mode is ImagineMode {
  return (IMAGINE_MODES as readonly PromptTemplateMode[]).includes(mode);
}
