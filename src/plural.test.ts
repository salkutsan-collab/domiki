import { describe, expect, it } from 'vitest';
import { cubes, plural } from './plural';

describe('согласование числа', () => {
  it('ставит верное окончание', () => {
    expect(cubes(1)).toBe('1 кубик');
    expect(cubes(2)).toBe('2 кубика');
    expect(cubes(4)).toBe('4 кубика');
    expect(cubes(5)).toBe('5 кубиков');
    expect(cubes(0)).toBe('0 кубиков');
  });

  it('не спотыкается на одиннадцати и его родне', () => {
    expect(cubes(11)).toBe('11 кубиков');
    expect(cubes(12)).toBe('12 кубиков');
    expect(cubes(14)).toBe('14 кубиков');
    expect(cubes(21)).toBe('21 кубик');
    expect(cubes(102)).toBe('102 кубика');
    expect(cubes(111)).toBe('111 кубиков');
    expect(cubes(174)).toBe('174 кубика');
  });

  it('работает с любым словом', () => {
    expect(plural(3, 'домик', 'домика', 'домиков')).toBe('домика');
  });
});
