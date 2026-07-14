// The composer's in-chat AI image generate: fires `chat.generateImage` (mode "free" — the typed composer
// text becomes the prompt) against a committed chat. The verb posts ONE user message carrying the asset:
// refs (D51), so the result flows through the normal message stream and renders via message-row — this
// hook only drives the composer's pending/error affordance, never a cache write (busDriven: the verb's
// messageCommitted already runs the chatReads invalidation, like send).

import type { PromptTemplateMode } from "@orb/contracts/imagery";
import type { ChatId } from "@orb/kit/ids";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";

// Base free-mode only — the composer never drives the Phase-7 extraction/edit modes (PD-93, parked).
const FREE_MODE: PromptTemplateMode = "free";

interface GenerateImageVars {
  readonly chatId: ChatId;
  readonly mode: PromptTemplateMode;
  readonly prompt: string;
}

// TData is `unknown` — the posted image message arrives over the bus (messageCommitted), never read back.
const useGenerateImageMutation = createEntityMutation<GenerateImageVars, unknown>({
  options: (trpc) => trpc.chat.generateImage.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't generate the image.",
});

export interface UseGenerateImageResult {
  readonly generate: (prompt: string) => void;
  readonly isPending: boolean;
  readonly error: unknown | null;
  readonly clearError: () => void;
}

export function useGenerateImage(chatId: ChatId | null): UseGenerateImageResult {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const mutation = useGenerateImageMutation({ trpc, invalidation });

  const generate = (prompt: string): void => {
    const trimmed = prompt.trim();
    // Free mode needs a real prompt; a draft chat (chatId null) has no room to post into yet.
    if (chatId === null || trimmed.length === 0) {
      return;
    }
    mutation.mutate({ chatId, mode: FREE_MODE, prompt: trimmed });
  };

  return {
    generate,
    isPending: mutation.isPending,
    error: mutation.error,
    clearError: mutation.clearError,
  };
}
