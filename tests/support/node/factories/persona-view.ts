// Wire-output builder for a persona read (`persona.list`, `persona.get`, `persona.create`). The defaults parse
// through the contract schema; an override is spread after the parse.

import { personaDetailSchema } from "@orb/contracts/persona";
import { ID_PREFIX } from "@orb/kit/ids";
import { FROZEN_AT_MS } from "../../iso/clock.ts";
import { createSeededIds } from "../../iso/ids.ts";
import type { TrpcWireOutput } from "../route-trpc.ts";

const ids = createSeededIds();

type PersonaViewWire = TrpcWireOutput<"persona.get">;

/** An unstarred persona with an empty description and no avatar. */
export function makePersonaView(overrides: Partial<PersonaViewWire> = {}): PersonaViewWire {
  return {
    ...personaDetailSchema.parse({
      id: ids.next(ID_PREFIX.persona),
      name: "Persona",
      description: "",
      starred: false,
      avatarAssetId: null,
      avatarHash: null,
      title: null,
      metadata: null,
      createdAt: FROZEN_AT_MS,
      updatedAt: FROZEN_AT_MS,
    }),
    ...overrides,
  };
}
