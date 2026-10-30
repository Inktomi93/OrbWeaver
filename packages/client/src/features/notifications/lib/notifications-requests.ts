// A request to open the notifications popover from a control that cannot reach the bell: the topbar's overflow menu,
// once the row moved the bell out of reach. The mounted bell listens and opens the same popover its button does.

import { createOpenRequestChannel } from "#lib";

export const inboxRequests = createOpenRequestChannel();
