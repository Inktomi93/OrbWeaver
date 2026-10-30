// A request to open the bug report form from a control that cannot reach the button: the topbar's overflow menu,
// once the row moved the button out of reach. The mounted button listens and opens the same form it does.

import { createOpenRequestChannel } from "#lib";

export const bugReportRequests = createOpenRequestChannel();
