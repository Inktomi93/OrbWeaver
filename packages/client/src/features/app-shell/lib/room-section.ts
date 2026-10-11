/** The section whose CONTENT is the chat room: the only surface a carried background may dress, and on a
 *  phone the room screen, which has no tab bar. */
export const ROOM_SECTION = "chats";

/** The shell's read of the phone ROOM SCREEN: a phone showing an open chat room rather than a list screen.
 *  The tab bar stands down there and back is the header chevron (owner ruling,
 *  docs/law/UI-Architecture-and-Layout.md MOBILE); `shell.css` keys the grid's rows on the attribute. */
export function roomScreenShell(args: {
  readonly mobileViewport: boolean;
  readonly activeSection: string;
  readonly listIsPrimaryContent: boolean;
  readonly activeChatId: string | null;
}): { readonly gridAttrs: { readonly "data-room-screen"?: true }; readonly showMobileRail: boolean } {
  const roomScreen = args.mobileViewport && args.activeSection === ROOM_SECTION && !args.listIsPrimaryContent && args.activeChatId !== null;
  return { gridAttrs: roomScreen ? { "data-room-screen": true } : {}, showMobileRail: args.mobileViewport && !roomScreen };
}
