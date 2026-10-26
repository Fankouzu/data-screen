export type Color = [number, number, number];

// Shared by the graph and its document labels; gold stays reserved for raw sources.
export const cyan: Color = [.24, .86, .91];
export const blue: Color = [.36, .58, 1];
export const violet: Color = [.68, .48, .98];
export const coral: Color = [1, .43, .46];
export const mint: Color = [.29, .86, .65];
export const gold: Color = [1, .79, .30];
export const ivory: Color = [.84, .91, .98];
export const background: Color = [7 / 255, 11 / 255, 20 / 255];
export const clusterColors: Color[] = [
  cyan, blue, violet, coral, mint, violet,
  cyan, blue, violet, mint, coral, blue,
];
export function clusterColorCss(index: number): string {
  const color = clusterColors[index] ?? gold;
  return `rgb(${color.map(value => Math.round(value * 255)).join(' ')})`;
}
