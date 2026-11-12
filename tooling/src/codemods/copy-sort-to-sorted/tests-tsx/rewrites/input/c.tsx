declare const labels: string[];
export const List = () => <ul>{[...labels].sort().map((label) => <li key={label}>{label}</li>)}</ul>;
