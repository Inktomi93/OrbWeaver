// The composer decision's platform-independent keyboard facts; the pure fold must also compile without DOM types.
export interface EnterKeyInput {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly isComposing: boolean;
}
