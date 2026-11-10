interface EmptyStatePropsBase {
  title: string;
}

export type EmptyStateProps = EmptyStatePropsBase & (
  | {
      decoration?: string;
      icon?: never;
    }
  | {
      decoration?: never;
      icon?: string;
    }
);
