declare const labels: string[];
export const List = () => <ul>{labels.toSorted().map((label) => <li key={label}>{label}</li>)}</ul>;
