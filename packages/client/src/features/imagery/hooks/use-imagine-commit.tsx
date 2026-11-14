// The `imagine` modal's COMMIT — the /imagine surface. A mode strip (free +
// the four extraction modes) over the seed `/imagine` parsed; for an extraction mode "Read the chat first"
// runs `extractPrompt` and DROPS the resolved keywords into the editable prompt box, so the host sees (and can
// edit) what the image will be built from BEFORE spending on it. A prompt, once present, is sent VERBATIM as
// free mode; an extraction mode left un-read lets the server resolve it. Generate, the submit ModalHost draws
// after Cancel, posts into the room via `chat.generateImage`; the image arrives on the stream.
//
// THIS SURFACE SPENDS MONEY IN TWO PLACES AND SAYS SO. Three rules the next editor must keep:
//   1. Reading the chat is an ACTION with a price, never a caption — its own row, its own button, and the
//      price it actually cost RENDERED once it is known (`extractPrompt` returns `costUsd`).
//   2. An extraction mode with an empty prompt is a DOUBLE spend (the read, then the image). The notice that
//      says so is body prose, not a gloss.
//   3. THE GENERATE COST IS NOT AVAILABLE HERE, and that is a wire fact, not an omission: `chat.generateImage`
//      returns a `MessageView` (transport/trpc/routers/chat.ts → domain/chat/verbs/generate-image.ts) and the
//      imagery `costUsd` is dropped by chat's verb before the wire. The image's own price surfaces in the
//      LIGHTBOX's provenance strip (`imagery.readProvenance.costUsd`) — that is its home. Do not re-file it.
//
// A spend of 5-60s cannot be a dead surface either: both pending arms carry the house spinner, an elapsed count, a
// time expectation, and the fact that CLOSING IS SAFE — the generate flow is busDriven, so the image posts into the
// room whether or not this modal is still open.
//
// THE DRAFT BELONGS TO ONE SEED. A fresh /imagine invocation never inherits the prior draft's edits, so a new seed
// replaces the whole draft during render. During the close the seed is already cleared, so an absent seed renders a
// neutral rest state with Generate off rather than a crash (the modal is a shell singleton — it can paint mid-close).

import { viewerGalleryCharacter } from "@orb/contracts/chat";
import type { GeneratePicturePrompt, PromptTemplateMode, SizePresetName } from "@orb/contracts/imagery";
import { EXTRACTION_MODES, MIN_IMAGE_COUNT } from "@orb/contracts/imagery";
import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Checkbox } from "@orb/ui/checkbox";
import { Field } from "@orb/ui/field";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { inferOutput } from "@trpc/tanstack-react-query";
import { useId, useRef, useState } from "react";
import type { Trpc } from "#data";
import { roomRosterOptions, useGatedQuery, useInvalidation, useTRPC } from "#data";
import { IMAGE_MODE_LABELS, useFocusOnSwap, viewerTimeZone } from "#lib";
import type { ImagineSeed, ModalCommit } from "#state";
import { closeModal, holdRoomForSend, useImagineSeed } from "#state";
import { DoubleSpendNotice, GeneratingNotice, PendingLine, RoomPicturesNote } from "../components/imagine-body.tsx";
import { ImagineOptions } from "../components/imagine-options.tsx";
import { formatCost } from "../lib/format-cost.ts";
import { IMAGINE_EMPTY_TEXT, IMAGINE_GENERATE_NAME, IMAGINE_MODE_NAME, IMAGINE_PROMPT_NAME, imagineGenerateCountLabel } from "../lib/imagine-names.ts";
import { useExtractPrompt, useGeneratePicture } from "./use-imagery-mutations.ts";

// free-first: the prompt-verbatim mode, then the four extraction modes (derived from the contract tuple —
// never a re-spelled member list). The multimodal caption modes are a Phase-7 avatar concern, not /imagine.
const IMAGINE_MODES = ["free", ...EXTRACTION_MODES] as const;
type ImagineMode = (typeof IMAGINE_MODES)[number];

const PROMPT_ROWS = 3;
const PROMPT_MAX_ROWS = 8;

/** The read call's own result, kept WHOLE — `costUsd` (nullable on the wire: a backend with no usage
 *  accounting reports nothing) and `source`. Derived from the verb, never re-spelled: the arms of `source` live in
 *  the imagery contract and the client must not fork them. */
type ExtractedPromptResult = inferOutput<Trpc["imagery"]["extractPrompt"]>;

/** Everything the person has set for one seed. */
interface ImagineDraft {
  readonly mode: ImagineMode;
  readonly prompt: string;
  readonly receipt: ExtractedPromptResult | undefined;
  readonly toGallery: boolean;
  readonly count: number;
  readonly size: SizePresetName | undefined;
  readonly negative: string;
}

function freshDraft(seed: ImagineSeed | undefined): ImagineDraft {
  return {
    mode: seed !== undefined && isImagineMode(seed.mode) ? seed.mode : "free",
    prompt: seed?.prompt ?? "",
    receipt: undefined,
    toGallery: true,
    count: MIN_IMAGE_COUNT,
    size: undefined,
    negative: "",
  };
}

function seedKey(seed: ImagineSeed | undefined): string | null {
  return seed === undefined ? null : `${seed.chatId}:${seed.mode}:${seed.prompt}`;
}

/** The draft for the current seed, replaced whole when the seed changes, and its one editor. */
function useSeedDraft(seed: ImagineSeed | undefined): readonly [ImagineDraft, (patch: Partial<ImagineDraft>) => void] {
  const [draft, setDraft] = useState(() => freshDraft(seed));
  const [draftSeed, setDraftSeed] = useState(() => seedKey(seed));
  if (draftSeed !== seedKey(seed)) {
    setDraftSeed(seedKey(seed));
    setDraft(freshDraft(seed));
  }
  return [draft, (patch): void => setDraft((current) => ({ ...current, ...patch }))];
}

/** Free mode needs an explicit prompt; an extraction mode can generate from the conversation with none. */
function generationPromptFor(mode: ImagineMode, trimmed: string): GeneratePicturePrompt | null {
  if (trimmed.length > 0) {
    return { mode: "free", prompt: trimmed };
  }
  return mode === "free" ? null : { mode };
}

export function useImagineCommit(): ModalCommit {
  const seed = useImagineSeed();
  const [draft, edit] = useSeedDraft(seed);
  const { mode, prompt, receipt, toGallery, count, size, negative } = draft;
  // The prompt is the dialog's one task, and Generate stays off until it has words.
  const promptRef = useRef<HTMLTextAreaElement>(null);
  useFocusOnSwap(promptRef);
  const modeLabelId = useId();
  const trpc = useTRPC();
  const room = useImagineRoom(trpc, seed?.chatId);
  const galleryCharacterName = room.galleryCharacterName;
  const invalidation = useInvalidation();
  const extract = useExtractPrompt({ trpc, invalidation });
  const generate = useGeneratePicture({ trpc, invalidation });

  const trimmed = prompt.trim();
  const isExtraction = mode !== "free";
  const busy = extract.isPending || generate.isPending;
  const generationPrompt = generationPromptFor(mode, trimmed);
  // The DOUBLE-spend arm: an extraction mode with nothing typed makes the server run the read call too.
  const blindDoubleSpend = isExtraction && trimmed.length === 0;
  const preview = (): void => {
    if (seed === undefined || mode === "free") {
      return;
    }
    void extract
      .mutateAsync({ chatId: seed.chatId, mode, timeZone: viewerTimeZone() })
      .then((result) => edit({ prompt: result.prompt, receipt: result }))
      .catch(() => undefined);
  };

  const runGenerate = (): void => {
    if (seed === undefined || generationPrompt === null) {
      return;
    }
    // A present prompt IS the image — sent verbatim as free mode (an extraction mode previewed-then-edited
    // lands here too). An extraction mode with no prompt defers resolution to the server.
    const base = { chatId: seed.chatId, gallery: toGallery, timeZone: viewerTimeZone(), n: count };
    const excluded = negative.trim();
    const request = { ...base, ...generationPrompt, ...(size === undefined ? {} : { size }), ...(excluded.length === 0 ? {} : { negative: excluded }) };
    // The server claims a new room only after the picture is made, so the room stays out of the nav-away reap for
    // the whole call. `mutateAsync` settles even after this modal unmounts, which releases the hold.
    const run = async (): Promise<void> => {
      using _hold = holdRoomForSend(seed.chatId);
      await generate.mutateAsync(request);
      closeModal();
    };
    run().catch(() => undefined);
  };

  return {
    submit: {
      label: generateLabel(generate.isPending, count),
      disabled: seed === undefined || extract.isPending || generationPrompt === null,
      loading: generate.isPending,
      onSubmit: runGenerate,
    },
    content:
      seed === undefined ? (
        <Text voice="gloss">{IMAGINE_EMPTY_TEXT}</Text>
      ) : (
        <>
          <Text cap="prose" voice="reading">
            Generate an image into this chat. Every image is a real charge, and the modes that read the conversation spend a second, smaller call to build the
            prompt first.
          </Text>
          <RoomPicturesNote shared={room.shared} />
          <Stack gap="field">
            <Text as="span" id={modeLabelId} voice="label">
              {IMAGINE_MODE_NAME}
            </Text>
            {/* Pressable modes (the add-document precedent), not a tablist — each just re-targets the same prompt.
              A `group` with the label as its name, so the tree reads one named cluster instead of five loose
              buttons. DISABLED mid-spend: the in-flight request already carries the old mode, so letting the
              strip move under it would show a selection the pending image does not have. Each mode wraps anywhere:
              at enlarged text a one-word mode is wider than a phone dialog's column. */}
            <ToggleGroup
              aria-labelledby={modeLabelId}
              disabled={busy}
              onValueChange={(next): void => {
                const picked = IMAGINE_MODES.find((id) => id === next[0]);
                if (picked !== undefined) {
                  edit({ mode: picked });
                }
              }}
              value={[mode]}
            >
              {IMAGINE_MODES.map((id) => (
                <Toggle variant="outline" key={id} size="sm" value={id} wrap={true}>
                  {IMAGE_MODE_LABELS[id]}
                </Toggle>
              ))}
            </ToggleGroup>
          </Stack>
          <Stack gap="field">
            <Text as="span" voice="label">
              Prompt
            </Text>
            <Textarea
              aria-label={IMAGINE_PROMPT_NAME}
              maxRows={PROMPT_MAX_ROWS}
              ref={promptRef}
              onValueChange={(value): void => edit({ prompt: value })}
              placeholder={isExtraction ? "Read the chat to fill this, or type your own." : "Describe the image to generate…"}
              rows={PROMPT_ROWS}
              value={prompt}
            />
            {isExtraction ? (
              <Stack gap="tight">
                <DoubleSpendNotice blind={blindDoubleSpend} count={count} />
                <Row align="center" wrap={true} gap="field">
                  <Button disabled={busy} variant="outline" onClick={preview} size="sm" type="button">
                    Read the chat first
                  </Button>
                  {extract.isPending ? (
                    <PendingLine label="Reading the chat" verb="Reading the chat…" />
                  ) : (
                    <Text as="span" cap="prose" data-slot="imagine-read-cost" voice="reading">
                      {readCostLine(receipt)}
                    </Text>
                  )}
                </Row>
              </Stack>
            ) : null}
          </Stack>
          <ImagineOptions
            busy={busy}
            count={count}
            hostPays={room.hostPays}
            negative={negative}
            onCount={(next): void => edit({ count: next })}
            onNegative={(next): void => edit({ negative: next })}
            onSize={(next): void => edit({ size: next })}
            size={size}
          />
          {galleryCharacterName === undefined ? null : (
            <Field label={`Add to ${galleryCharacterName}'s gallery`} orientation="inline">
              <Checkbox checked={toGallery} disabled={busy} onCheckedChange={(next): void => edit({ toGallery: next })} />
            </Field>
          )}
          <GeneratingNotice pending={generate.isPending} />
        </>
      ),
  };
}

function generateLabel(pending: boolean, count: number): string {
  if (pending) {
    return "Generating…";
  }
  return count > MIN_IMAGE_COUNT ? imagineGenerateCountLabel(count) : IMAGINE_GENERATE_NAME;
}

const SHARED_ROOM_FLOOR = 2;

/** What the room read says about this picture: the character whose gallery it joins (named only for its owner,
 *  so a guest is offered no add the server would refuse), whether the room is shared, and whether the host pays
 *  (D298: a member's picture runs on the host's bill). The room read is cache-first. */
function useImagineRoom(
  trpc: Trpc,
  chatId: ChatId | undefined,
): { readonly galleryCharacterName: string | undefined; readonly shared: boolean; readonly hostPays: boolean | undefined } {
  const { data: chat } = useGatedQuery(chatId, (id) => roomRosterOptions(trpc, { chatId: id }));
  if (chat === undefined) {
    return { galleryCharacterName: undefined, shared: false, hostPays: undefined };
  }
  const members = chat.participants.filter((person) => person.kind === "human" && person.leftSeq === null).length;
  return { galleryCharacterName: viewerGalleryCharacter(chat)?.displayName, shared: members >= SHARED_ROOM_FLOOR, hostPays: !chat.viewerIsHost };
}

/** The read call's one line: what it will cost you before, what it DID cost after. `costUsd: null` means the
 *  backend reported no usage — say that rather than print `$0.0000`, which would read as "free". */
function readCostLine(receipt: ExtractedPromptResult | undefined): string {
  if (receipt === undefined) {
    return "Spends a small text call now, then you can edit the prompt before paying for the image.";
  }
  const source = receipt.source === "captioned" ? "Read the character's image" : "Read the chat";
  if (receipt.costUsd === null) {
    return `${source}. The image is a separate charge.`;
  }
  return `${source}: ${formatCost(receipt.costUsd)} spent. The image is a separate charge.`;
}

function isImagineMode(mode: PromptTemplateMode): mode is ImagineMode {
  return (IMAGINE_MODES as readonly PromptTemplateMode[]).includes(mode);
}
