// Согласование числа со словом: 1 кубик, 2 кубика, 5 кубиков.

export function plural(count: number, one: string, few: string, many: string) {
  const value = Math.abs(Math.trunc(count));
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  const last = value % 10;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

export function cubes(count: number) {
  return `${count} ${plural(count, 'кубик', 'кубика', 'кубиков')}`;
}
