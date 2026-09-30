/** The order entering a room mounts its heavy parts in, one commit each (`DeferredMount`): the composer first
 *  so the transcript never resizes under it, the transcript next, the chat list's rows last. */
export const ROOM_ENTRY_STAGE = { composer: 1, transcript: 2, chatList: 3 } as const;
