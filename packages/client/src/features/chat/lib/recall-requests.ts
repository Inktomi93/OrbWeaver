// A request to open the memory-recall surface from a control that cannot reach the chip: the topbar's overflow menu,
// once the row moved the chip out of reach. The mounted chip listens and opens the same recall content in a dialog.

import { createOpenRequestChannel } from "#lib";

export const recallRequests = createOpenRequestChannel();
