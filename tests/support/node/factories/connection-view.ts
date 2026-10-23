// Saved hosted-connection snapshots may lack a credential; a read model is not execution authority.

import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import type { TrpcWireOutput } from "../route-trpc.ts";

const ids = createIdSource(createSeededIds().next);

type ConnectionRowWire = TrpcWireOutput<"connection.list">[number];

export function makeConnectionRow(overrides: Partial<ConnectionRowWire> = {}): ConnectionRowWire {
  return {
    id: ids.typeId(ID_PREFIX.userConnection),
    ownerId: ids.userId(),
    label: "Everyday chat",
    providerId: "openrouter",
    providerLabel: "OpenRouter",
    credentialId: null,
    baseUrl: null,
    model: "openai/gpt-5-mini",
    api: "auto",
    declared: null,
    extras: null,
    transport: null,
    modelCheck: "listed",
    allowBackground: true,
    promptCache: null,
    tasks: ["chat"],
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
    ...overrides,
  };
}
