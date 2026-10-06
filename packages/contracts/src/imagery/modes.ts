// Shared by live generation and portable execution history without an index-barrel cycle.
import { z } from "zod";

export const PROMPT_TEMPLATE_MODES = ["free", "character", "face", "scenario", "background", "character_multimodal", "face_multimodal"] as const;
export const promptTemplateModeSchema = z.enum(PROMPT_TEMPLATE_MODES);
export type PromptTemplateMode = z.infer<typeof promptTemplateModeSchema>;
