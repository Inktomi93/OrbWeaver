// The imagery feature's four spends, each a `createEntityMutation` (client-architecture-lockdown.md §0
// rule 6 — every mutation rides the factory). Two POST/mutate into shared state the bus covers
// (`generateImage` → a room message, `setChatBackground` → the chat's carried background); two are pure
// request/response spends that reconcile NOTHING in the cache (`extractPrompt` resolves a prompt, `editImage`
// mints owned assets no client cache lists here) — their `invalidates: () => []` is the honest "no reader to
// refresh", never a stubbed-out bus claim. All inputs/outputs are tRPC-inferred (`inferInput`/`inferOutput`),
// so the client never re-spells or imports a server type. The imagery verbs are reached cross-feature THROUGH
// THE WIRE (`trpc.imagery.*` / `trpc.chat.*`) — the sanctioned §12 channel, never a `#features` import.

import type { inferInput, inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "#data";
import { createEntityMutation } from "#data";

/** `chat.generateImage` — posts ONE message into the room carrying the generated asset refs (D51); the image
 *  flows through the normal stream and renders via message-row. busDriven: the verb's `messageCommitted` runs
 *  the chatReads invalidation (the `use-generate-image` precedent, re-homed so the imagine modal owns its own
 *  spend without importing chat). */
export const useGeneratePicture = createEntityMutation<inferInput<Trpc["chat"]["generateImage"]>, unknown>({
  options: (trpc) => trpc.chat.generateImage.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't generate the image.",
});

/** `imagery.extractPrompt` — the preview-before-spend surface: resolve the prompt for an extraction mode
 *  WITHOUT generating, so the imagine modal shows (and lets the host edit) it before spending on the image.
 *  Pure request/response — nothing in the cache reflects it. */
export const useExtractPrompt = createEntityMutation<inferInput<Trpc["imagery"]["extractPrompt"]>, inferOutput<Trpc["imagery"]["extractPrompt"]>>({
  options: (trpc) => trpc.imagery.extractPrompt.mutationOptions(),
  invalidates: () => [],
  errorToast: "Couldn't read the scene prompt.",
});

/** `imagery.editImage` — img2img: edit an OWNED asset by instruction, returning the edited image(s) (it does
 *  NOT post to chat — that stays `generateImage`, which owns message authorship). The result renders inside
 *  the edit modal. Throws `ImageEditUnsupportedError` (→ BAD_REQUEST) when the resolved model lacks
 *  `input.imageEdit` — the modal surfaces that capability refusal via `errorToast`. Reconciles no cache. */
export const useEditImage = createEntityMutation<inferInput<Trpc["imagery"]["editImage"]>, inferOutput<Trpc["imagery"]["editImage"]>>({
  options: (trpc) => trpc.imagery.editImage.mutationOptions(),
  invalidates: () => [],
  errorToast: "Couldn't edit the image.",
});

/** `chat.setChatBackground` (D63 / BG-C) — wire a generated image as the room's carried background. Reuses
 *  the ONE background applier (never a forked second path); host-only + asset-ownership gate live inside the
 *  verb. busDriven: the verb emits `chatUpdated` (→ chatReads covers `getChat`, where the background read
 *  rides `ChatDetail.background`). */
export const useSetChatBackground = createEntityMutation<inferInput<Trpc["chat"]["setChatBackground"]>, unknown>({
  options: (trpc) => trpc.chat.setChatBackground.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't set the chat background.",
});
