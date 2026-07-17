// The chat-behavior autosave form, mounted through the D78 session boundary (`ChatBehaviorForm`) at
// module scope — the boundary OWNS the (constant) entity key (autosave-form-doctrine.md §1/§8, D78 L4).
// `defaultValues` is a type-level fallback only: the surface renders inside a QueryBoundary after
// getUserSettings resolves, so the projected server values always fully override these seeds.

import { DEFAULT_CHAT_SETTINGS } from "@orb/contracts/settings";
import { createAutosaveEntityForm } from "#forms";
import type { ChatBehaviorForm } from "../lib/chat-behavior-model";
import { projectChatForm } from "../lib/chat-behavior-model";

/** The singleton entity id — the chat-behavior prefs are one row per user, so a fixed key. */
export const CHAT_BEHAVIOR_ENTITY_ID = "chat-behavior";

export const ChatBehaviorAutosaveForm = createAutosaveEntityForm<ChatBehaviorForm>({
  defaultValues: projectChatForm(DEFAULT_CHAT_SETTINGS),
});
