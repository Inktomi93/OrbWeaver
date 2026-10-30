// A request to open the refinery start picker from a control that cannot reach its trigger: the list band's overflow
// menu, once the row moved the glyph out of reach. The band's mounted door listens and opens the same picker.

import { createOpenRequestChannel } from "#lib";

export const startSessionRequests = createOpenRequestChannel();
