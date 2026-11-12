/**
 * Build-time justified rows ("linear partition").
 *
 * Splits photos, in the given order, into consecutive rows. Every row is later
 * rendered as a flex container whose items grow by aspect ratio, so a row is
 * always exactly justified. This picks the break points that keep each row's
 * summed aspect ratio close to a target, which guarantees no orphans:
 * minimise Σ (rowAspectSum − TARGET)², with no row below MIN_SUM unless the
 * whole section is that small.
 */
export const TARGET = 3.0;
export const MIN_SUM = 1.9;

export interface Row<T> {
  items: T[];
  /** Σ aspect ratios of the row. */
  sum: number;
}

export function partitionRows<T>(items: T[], aspect: (t: T) => number): Row<T>[] {
  const n = items.length;
  if (n === 0) return [];
  const a = items.map(aspect);
  const prefix = [0];
  for (const v of a) prefix.push(prefix[prefix.length - 1] + v);
  const sum = (j: number, i: number) => prefix[i] - prefix[j]; // items j..i-1

  const small = prefix[n] < MIN_SUM;
  const cost: number[] = Array(n + 1).fill(Infinity);
  const from: number[] = Array(n + 1).fill(0);
  cost[0] = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = 0; j < i; j++) {
      if (cost[j] === Infinity) continue;
      const s = sum(j, i);
      if (!small && s < MIN_SUM) continue;
      const c = cost[j] + (s - TARGET) ** 2;
      if (c < cost[i]) {
        cost[i] = c;
        from[i] = j;
      }
    }
  }
  const rows: Row<T>[] = [];
  for (let i = n; i > 0; i = from[i]) {
    rows.unshift({ items: items.slice(from[i], i), sum: sum(from[i], i) });
  }
  return rows;
}
