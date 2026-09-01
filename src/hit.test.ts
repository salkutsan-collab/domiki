import { describe, expect, it } from 'vitest';
import { containsPoint, pickFace, placementTarget } from './hit';
import type { Face } from './hit';

const diamond = [
  { x: 100, y: 90 },
  { x: 126, y: 103 },
  { x: 100, y: 116 },
  { x: 74, y: 103 },
];

const face = (extra: Partial<Face>): Face => ({
  points: diamond,
  x: 4,
  z: 6,
  y: 2,
  kind: 'top',
  nx: 0,
  nz: 0,
  ...extra,
});

describe('попадание по грани', () => {
  it('видит точку внутри клетки и не видит точку рядом', () => {
    expect(containsPoint({ x: 100, y: 103 }, diamond)).toBe(true);
    expect(containsPoint({ x: 100, y: 60 }, diamond)).toBe(false);
    expect(containsPoint({ x: 60, y: 103 }, diamond)).toBe(false);
  });

  it('из наложенных граней выбирает нарисованную последней', () => {
    const under = face({ y: 0 });
    const over = face({ y: 5 });
    expect(pickFace([under, over], { x: 100, y: 103 })?.y).toBe(5);
  });

  it('возвращает пустоту, если палец попал в небо', () => {
    expect(pickFace([face({})], { x: 5, y: 5 })).toBeNull();
  });
});

describe('куда встанет кубик', () => {
  it('по траве - на землю', () => {
    expect(placementTarget(face({ kind: 'ground', y: -1 }))).toEqual({ x: 4, z: 6, y: 0 });
  });

  it('по верхней грани - этажом выше', () => {
    expect(placementTarget(face({ kind: 'top', y: 2 }))).toEqual({ x: 4, z: 6, y: 3 });
  });

  it('по боковой грани - соседняя клетка на той же высоте', () => {
    expect(placementTarget(face({ kind: 'side', y: 2, nx: 1, nz: 0 }))).toEqual({ x: 5, z: 6, y: 2 });
    expect(placementTarget(face({ kind: 'side', y: 2, nx: 0, nz: -1 }))).toEqual({ x: 4, z: 5, y: 2 });
  });

  it('боковая грань позволяет вынести кубик в воздух - так и делается свес крыши', () => {
    const target = placementTarget(face({ kind: 'side', y: 3, nx: -1, nz: 0 }));
    expect(target.y).toBe(3);
    expect(target.x).toBe(3);
  });
});
