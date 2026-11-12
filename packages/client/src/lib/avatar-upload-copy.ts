// The sentences the shared avatar upload control prints on its own inline line. A zero-import leaf, so a spec's node side
// reads them without loading the component graph.

/** The avatar control's one accessible name, the same on every surface that mounts it. */
export const AVATAR_CONTROL_NAME = "Replace picture";

/** The control's description: what it takes, by the picker and by a drop. Read by assistive tech, not shown. */
export const AVATAR_REPLACE_HINT = "Choose a picture file, or drop one here.";

/** The progress mark on the avatar while the upload and the write run. */
export const AVATAR_UPLOADING_NAME = "Uploading the picture";

const AVATAR_UPLOAD_FAILED_LEAD = "Couldn't upload the picture";

/** The upload did not land and the server gave no reason of its own. */
export const AVATAR_UPLOAD_FAILED = `${AVATAR_UPLOAD_FAILED_LEAD}.`;

/** The picture uploaded but the write that would give it to the card or persona was refused. It claims nothing about which picture
 *  the row holds: after an older write committed, that is not always the one the person started with. */
export const AVATAR_WRITE_REFUSED = "Couldn't save the picture.";

/** A picked or dropped file that is not an image. */
export const AVATAR_NOT_A_PICTURE = "That file isn't a picture. Use an image file.";

/** More than one file dropped at once. */
export const AVATAR_ONE_AT_A_TIME = "One picture at a time. Drop a single image file.";

/** A drag that carries no file. */
export const AVATAR_DROP_A_FILE = "Drop a picture file here.";

/** The upload failed; the server's own clause follows when it refused the file for a reason the person can act on. */
export function avatarUploadFailedLine(reason: string | undefined): string {
  return reason === undefined ? AVATAR_UPLOAD_FAILED : `${AVATAR_UPLOAD_FAILED_LEAD}: ${reason}.`;
}
