import type { AttachmentQuality, ImageDetail, VideoMaxResolution } from "@orb/contracts/inference";
import { attachmentQualitySchema, IMAGE_DETAILS, VIDEO_MAX_RESOLUTIONS } from "@orb/contracts/inference";
import type { SelectOption } from "@orb/ui/select/items";
import type { ConfigSubcategory } from "#state";

const IMAGE_LABELS: Record<ImageDetail, string> = { auto: "Auto", low: "Low", high: "High" };
const VIDEO_LABELS: Record<VideoMaxResolution, string> = { original: "Original", "1080": "1080p", "720": "720p", "480": "480p" };
export const IMAGE_DETAIL_ITEMS: readonly SelectOption<string>[] = IMAGE_DETAILS.map((value) => ({ value, label: IMAGE_LABELS[value] }));
export const VIDEO_RESOLUTION_ITEMS: readonly SelectOption<string>[] = VIDEO_MAX_RESOLUTIONS.map((value) => ({ value, label: VIDEO_LABELS[value] }));
export const ATTACHMENT_QUALITY_LABELS: Record<keyof AttachmentQuality, string> = {
  imageDetail: "Image detail",
  videoMaxResolution: "Video maximum resolution",
};

function formatQuality(value: unknown): string {
  const quality = attachmentQualitySchema.parse(value);
  return `${ATTACHMENT_QUALITY_LABELS.imageDetail}: ${IMAGE_LABELS[quality.imageDetail]} · ${ATTACHMENT_QUALITY_LABELS.videoMaxResolution}: ${VIDEO_LABELS[quality.videoMaxResolution]}`;
}

export const ATTACHMENT_QUALITY_KEYS = ["attachmentQuality"] as const;
export const ATTACHMENT_QUALITY_SUBCATEGORY: ConfigSubcategory = {
  id: "attachments",
  label: "Attachments",
  keywords: ["image", "video", "GIF", "detail", "resolution", "quality"],
  teach: {
    summary: "Choose the fidelity of attachments sent to models in rooms you host.",
    affects: ["model input in rooms you host; never stored originals"],
  },
  settings: [
    {
      id: "attachment-quality",
      key: "attachmentQuality",
      formatValue: formatQuality,
      label: "Attachment quality",
      keywords: ["vision", "cost", "context", "image", "video", "GIF"],
      teach: {
        summary:
          "Lower image detail or video resolution can reduce vision-token cost and context use, but loses fine detail. Auto lets the model choose image detail; unsupported connections receive no detail hint. Videos fit within the selected resolution without enlargement. Animated GIFs use video quality; static GIFs remain images. Stored originals are unchanged.",
        affects: ["outbound attachment fidelity in rooms you host", "vision-token cost and context use, depending on the model"],
      },
    },
  ],
};
