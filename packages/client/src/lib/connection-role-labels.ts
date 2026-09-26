// The name each connection ROLE (a routable task) wears wherever the client names it: the Model roles pane, a
// connection row's badges, the preset panel's connection switcher. `task` is a schema word and never reaches copy.

import type { RoutableTask } from "@orb/contracts/inference";

export const CONNECTION_ROLE_LABELS: Record<RoutableTask, string> = {
  chat: "Chat",
  summarize: "Utility model",
  generateImage: "Image generation",
  embed: "Text embedding",
  imageEmbed: "Image embedding",
  rerank: "Rerank",
};
