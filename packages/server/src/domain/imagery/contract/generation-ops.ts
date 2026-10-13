import type { ResolveTaskParams } from "@orb/contracts/inference";
import type { UserSettings } from "@orb/contracts/settings";
import type { ProviderExecutor, ResolveOutcome, RoleClientsWithSignal, SideGenSampling } from "@orb/inference";
import type { UserId } from "@orb/kit/ids";
import type { ImageryContext } from "./service.ts";

interface GenerateImageResolveParams extends Pick<ResolveTaskParams, "principal" | "actor"> {
  readonly task: "generateImage";
}

export interface ImageProviderDeps {
  readonly resolve: (params: GenerateImageResolveParams) => Promise<ResolveOutcome>;
  readonly generateImage: ProviderExecutor["generateImage"];
}
export type ImageProviderOps = Pick<ImageryContext, "resolveGenerateImage" | "generateImage">;

export interface ImageryInstructionDeps {
  readonly loadUserSettings: (userId: UserId) => Promise<UserSettings>;
}
export type ImageryInstructionOps = Pick<ImageryContext, "resolvePromptTemplate" | "resolveCaptionInstruction" | "resolveNegativeBase">;

export interface CaptionImageDeps {
  readonly roleClientsFor: (userId: UserId) => Promise<Pick<RoleClientsWithSignal, "summarize">>;
  readonly resolveUtilityPresetParams: (userId: UserId) => Promise<SideGenSampling | undefined>;
}
