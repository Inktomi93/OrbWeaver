// The composer's in-chat AI image generate: fires `chat.generateImage` (mode "free" — the typed composer
// text becomes the prompt) against a committed chat. The verb posts ONE user message carrying the asset:
// refs (D51), so the result flows through the normal message stream and renders via message-row — this
// hook only drives the composer's pending/error affordance, never a cache write (busDriven: the verb's
// messageCommitted already runs the chatReads invalidation, like send).

import type { PromptTemplateMode } from "@orb/contracts/imagery";
import type { ChatId } from "@orb/kit/ids";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";

// Base free-mode only — extraction and edit modes are driven through the /imagine slash command and its modal (imagery feature), not through this composer hook.
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
  /** `onSuccess` fires only once the post-message mutation SETTLES green — the composer clears the typed
   *  prompt there, never synchronously, so a failed generate leaves the prompt intact for retry (F-P1). */
  readonly generate: (prompt: string, opts?: { readonly onSuccess?: () => void }) => void;
  readonly isPending: boolean;
  readonly error: unknown | null;
  readonly clearError: () => void;
}

export function useGenerateImage(chatId: ChatId | null): UseGenerateImageResult {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const mutation = useGenerateImageMutation({ trpc, invalidation });

  const generate = (prompt: string, opts?: { readonly onSuccess?: () => void }): void => {
    const trimmed = prompt.trim();
    // Free mode needs a real prompt; a draft chat (chatId null) has no room to post into yet.
    if (chatId === null || trimmed.length === 0) {
      return;
    }
    // mutateAsync (not mutate) so `onSuccess` runs ONLY on a green settle; the errorToast still fires via
    // meta → MutationCache.onError, and the catch keeps the rejection from escaping as unhandled (F-P1).
    void mutation
      .mutateAsync({ chatId, mode: FREE_MODE, prompt: trimmed })
      .then(() => opts?.onSuccess?.())
      .catch(() => undefined);
  };

  return {
    generate,
    isPending: mutation.isPending,
    error: mutation.error,
    clearError: mutation.clearError,
  };
}
