/** `list` with the rows named in `order` first, in that order; the rest keep their places. */
export function sortByOrder<T extends { key: string }>(list: T[], order: string[]): T[] {
  const rank = new Map(order.map((key, index) => [key, index]));
  const placed = list.filter((a) => rank.has(a.key)).sort((a, b) => (rank.get(a.key) ?? 0) - (rank.get(b.key) ?? 0));
  return [...placed, ...list.filter((a) => !rank.has(a.key))];
}

/**
 * A list's order after the player arranged one group. Only the order within a group matters, so
 * the group's keys are taken out of the list and put back, in their new order, at the end.
 */
export function withGroupOrder(order: string[], groupKeys: string[]): string[] {
  const moved = new Set(groupKeys);
  return [...order.filter((key) => !moved.has(key)), ...groupKeys];
}
