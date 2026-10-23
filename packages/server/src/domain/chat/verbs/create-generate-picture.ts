import type { GeneratePicture } from "@orb/contracts/imagery";
import type { GeneratePictureOp } from "../contract/context.ts";

/** Chat's `generatePicture` op over imagery's orchestrator: forwards the request and maps imagery's
 * `GeneratedPicture` onto chat's chat-local structural result (chat cannot import imagery's types). */

export function createGeneratePictureOp(generatePicture: GeneratePicture): GeneratePictureOp {
  return async (p): ReturnType<GeneratePictureOp> => {
    const picture = await generatePicture({
      caller: p.caller,
      runAsUserId: p.runAsUserId,
      chatId: p.chatId,
      mode: p.mode,
      ...(p.prompt !== undefined ? { prompt: p.prompt } : {}),
      ...(p.n !== undefined ? { n: p.n } : {}),
      ...(p.size !== undefined ? { size: p.size } : {}),
      ...(p.gallery !== undefined ? { gallery: p.gallery } : {}),
      ...(p.timeZone !== undefined ? { timeZone: p.timeZone } : {}),
    });
    return {
      images: picture.images.map((img) => ({ assetId: img.assetId })),
      warnings: picture.warnings.map((w) => ({ code: w.code, detail: w.detail })),
    };
  };
}
