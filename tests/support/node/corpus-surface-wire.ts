// Finite external GitHub/image replies leave egress admission and update verdicts in the production graph.
import type { VersionIdentity } from "@orb/kit/version-identity";
import { FROZEN_AT_MS } from "../iso/clock.ts";

export const SURFACE_BACKGROUND_URL = "https://surface.example/Orbital%20loom.png";
export const SURFACE_BAD_BACKGROUND_URL = "https://surface.example/not-an-image.png";
export const SURFACE_UPDATE_STEPS = ["current", "behind", "malformed", "offline"] as const;
interface SurfaceWire {
  readonly requests: readonly Request[];
  readonly remainingUpdates: () => number;
  readonly configure: (version: VersionIdentity, image: Uint8Array) => void;
  readonly execute: typeof fetch;
}

function updateReply(version: VersionIdentity, step: (typeof SURFACE_UPDATE_STEPS)[number] | undefined): Response {
  switch (step) {
    case "current":
    case "behind":
      return Response.json(
        version.channel === "main"
          ? { sha: step === "current" ? version.commit : "f".repeat(40), commit: { committer: { date: new Date(FROZEN_AT_MS).toISOString() } } }
          : { ["tag_name"]: `v${step === "current" ? version.version : "999999.0.0"}`, ["published_at"]: new Date(FROZEN_AT_MS).toISOString() },
      );
    case "malformed":
      return Response.json({ unexpected: "not a GitHub commit or release" });
    case "offline":
      throw new TypeError("surface scripted network failure");
    case undefined:
      throw new Error("unscripted surface update request");
  }
}

/** Script only physical responses; the root still owns DNS/IP/redirect/body admission and native readers. */
export function createSurfaceOutputWire(provider: typeof fetch): SurfaceWire {
  const requests: Request[] = [];
  let version: VersionIdentity | undefined;
  let image: Uint8Array | undefined;
  let cursor = 0;
  return {
    requests,
    remainingUpdates: () => SURFACE_UPDATE_STEPS.length - cursor,
    configure: (identity, bytes): void => {
      version = identity;
      image = bytes;
    },
    execute: async (input, init): Promise<Response> => {
      const request = new Request(input, init);
      if (request.url === SURFACE_BACKGROUND_URL || request.url === SURFACE_BAD_BACKGROUND_URL) {
        requests.push(request);
        if (image === undefined) {
          throw new Error("surface image reply has not been configured");
        }
        return new Response(request.url === SURFACE_BACKGROUND_URL ? new Uint8Array(image) : "not an image", { headers: { "content-type": "image/png" } });
      }
      if (new URL(request.url).hostname !== "api.github.com") {
        return await provider(request);
      }
      requests.push(request);
      if (version === undefined) {
        throw new Error("surface update reply has not been configured");
      }
      return updateReply(version, SURFACE_UPDATE_STEPS[cursor++]);
    },
  };
}
