// The sentences the shared avatar upload control prints on its own inline line. A zero-import leaf, so a spec's node side
// reads them without loading the component graph.

/** The progress mark on the avatar while the upload and the write run. */
export const AVATAR_UPLOADING_NAME = "Uploading the picture";

/** The upload did not land and the server gave no reason of its own. */
export const AVATAR_UPLOAD_FAILED = "Couldn't upload the picture.";

/** The picture uploaded but the write that would give it to the card or persona was refused, so the old one stays. */
export const AVATAR_WRITE_REFUSED = "Couldn't save the picture. The old one stays.";

/** The upload failed; the server's own sentence follows when it refused the file for a reason the person can act on. */
export function avatarUploadFailedLine(reason: string | undefined): string {
  return reason === undefined ? AVATAR_UPLOAD_FAILED : `${AVATAR_UPLOAD_FAILED} ${reason}`;
}
