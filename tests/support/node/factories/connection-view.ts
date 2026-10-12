// Wire-output builder for a saved connection row (`connection.list`, `connection.get`): a hosted OpenRouter chat
// connection with a stored key. An override is spread after the defaults.

import { ID_PREFIX } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import type { TrpcWireOutput } from "../route-trpc.ts";

const ids = createSeededIds();

type ConnectionRowWire = TrpcWireOutput<"connection.list">[number];

export function makeConnectionRow(overrides: Partial<ConnectionRowWire> = {}): ConnectionRowWire {
  return {
    id: ids.next(ID_PREFIX.userConnection),
    ownerId: ids.next("user"),
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
