// Stored-blob reads here keep zod strip mode (Spine-Config "Degrading is read-only"); tRPC inputs and outputs parse its `strictTwin` (`@orb/kit/zod-schema`).
import { z } from "zod";

export const IMAGE_DETAILS = ["auto", "low", "high"] as const;
export type ImageDetail = (typeof IMAGE_DETAILS)[number];
export const VIDEO_MAX_RESOLUTIONS = ["original", "1080", "720", "480"] as const;
export type VideoMaxResolution = (typeof VIDEO_MAX_RESOLUTIONS)[number];

export const attachmentQualitySchema = z
  .object({
    imageDetail: z.enum(IMAGE_DETAILS).catch("auto").default("auto"),
    videoMaxResolution: z.enum(VIDEO_MAX_RESOLUTIONS).catch("720").default("720"),
  })
  .strip()
  .prefault({});
export type AttachmentQuality = z.infer<typeof attachmentQualitySchema>;
export const DEFAULT_ATTACHMENT_QUALITY: AttachmentQuality = attachmentQualitySchema.parse({});
