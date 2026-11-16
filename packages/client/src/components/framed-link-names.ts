/** The confirm a link clicked inside a routed card or reply frame opens. */
export const FRAMED_LINK_CONFIRM_TITLE = "Open external link?";
export const FRAMED_LINK_CONFIRM_DESCRIPTION = "You're about to visit an external website.";
export const FRAMED_LINK_CONFIRM_LABEL = "Open link";
/** The same confirm for a `mailto:` link, which opens the reader's mail app instead of a page. */
export const FRAMED_MAIL_CONFIRM_TITLE = "Open your mail app?";
export const FRAMED_MAIL_CONFIRM_DESCRIPTION = "This opens your mail app with a new message to these addresses.";
export const FRAMED_MAIL_CONFIRM_LABEL = "Open mail app";
/** The scroll region that holds the whole address under the host line. */
export const FRAMED_LINK_ADDRESS_NAME = "Full address";
/** The recipient fields a mail link may set, each named on its own line of the confirm. */
export const FRAMED_MAIL_RECIPIENT_FIELDS = { to: "To", cc: "Cc", bcc: "Bcc" } as const;

/** Marks each line of the confirm's body: the host or mail recipients the link goes to, and the whole address. */
export const FRAMED_LINK_PART_ATTRIBUTE = "data-framed-link";
export const FRAMED_LINK_PARTS = { host: "host", mailbox: "mailbox", address: "address" } as const;
