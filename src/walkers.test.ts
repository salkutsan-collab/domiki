import { describe, expect, it } from 'vitest';
import { advance, canStand, landingSpot, occupied, stepOptions, walkerAt, walkersFor } from './walkers';
import type { Walker } from './walkers';
import type { Block } from './world';
import { defaultBounds } from './world';

const bounds = defaultBounds(); // клетки 0..11

const block = (x: number, z: number, y: number): Block => ({ x, z, y, type: 'brick' });

describe('где можно стоять', () => {
  it('на пустой траве можно, в кубике нельзя', () => {
    const taken = occupied([block(3, 3, 0)]);
    expect(canStand(taken, bounds, 2, 2, 0)).toBe(true);
    expect(canStand(taken, bounds, 3, 3, 0)).toBe(false);
  });

  it('на кубике можно стоять сверху, а в воздухе нельзя', () => {
    const taken = occupied([block(3, 3, 0)]);
    expect(canStand(taken, bounds, 3, 3, 1)).toBe(true);
    expect(canStand(taken, bounds, 2, 2, 1)).toBe(false);
  });

  it('за краем полянки стоять негде', () => {
    expect(canStand(occupied([]), bounds, -1, 5, 0)).toBe(false);
    expect(canStand(occupied([]), bounds, 12, 5, 0)).toBe(false);
  });
});

describe('шаги жителя', () => {
  it('на ровной траве идет в любую из четырех сторон', () => {
    expect(stepOptions(occupied([]), bounds, { x: 5, z: 5, y: 0 }, true)).toHaveLength(4);
  });

  it('в стену выше ступеньки не идет', () => {
    // Кубик в два роста - уже стена: перешагнуть можно только один.
    const wall = occupied([block(6, 5, 0), block(6, 5, 1), block(4, 5, 0), block(4, 5, 1)]);
    const options = stepOptions(wall, bounds, { x: 5, z: 5, y: 0 }, true);
    expect(options.map((spot) => `${spot.x},${spot.z}`)).toEqual(['5,6', '5,4']);
  });

  it('забирается на ступеньку и спускается с нее', () => {
    const step = occupied([block(6, 5, 0)]);
    const up = stepOptions(step, bounds, { x: 5, z: 5, y: 0 }, true);
    expect(up).toContainEqual({ x: 6, z: 5, y: 1 });

    const down = stepOptions(step, bounds, { x: 6, z: 5, y: 1 }, true);
    expect(down).toContainEqual({ x: 5, z: 5, y: 0 });
  });

  it('не пролезает наверх через потолок', () => {
    const roofed = occupied([block(6, 5, 0), block(5, 5, 1)]);
    const options = stepOptions(roofed, bounds, { x: 5, z: 5, y: 0 }, true);
    expect(options).not.toContainEqual({ x: 6, z: 5, y: 1 });
  });

  it('заходит в дом через дверной проем, а не сквозь стену', () => {
    // Стена в три кубика вдоль z = 5, проем в клетке x = 3.
    const wall = [0, 1, 2, 4, 5, 6].flatMap((x) => [block(x, 5, 0), block(x, 5, 1), block(x, 5, 2)]);
    const taken = occupied(wall);
    expect(stepOptions(taken, bounds, { x: 3, z: 4, y: 0 }, true)).toContainEqual({ x: 3, z: 5, y: 0 });
    // Напротив стены пути внутрь нет.
    expect(stepOptions(taken, bounds, { x: 2, z: 4, y: 0 }, true)).not.toContainEqual({ x: 2, z: 5, y: 0 });
  });
});

describe('шаги овечки', () => {
  it('ходит только по земле и на кубик не лезет', () => {
    const step = occupied([block(6, 5, 0)]);
    const options = stepOptions(step, bounds, { x: 5, z: 5, y: 0 }, false);
    expect(options).not.toContainEqual({ x: 6, z: 5, y: 1 });
    expect(options).toHaveLength(3);
  });

  it('на крышу ее не поставить - только на траву', () => {
    const taken = occupied([block(5, 5, 0)]);
    expect(landingSpot(taken, bounds, 5, 5, false)).toBeNull();
    expect(landingSpot(taken, bounds, 5, 5, true)).toEqual({ x: 5, z: 5, y: 1 });
  });
});

describe('жизнь фигурок', () => {
  const walker = (): Walker => ({
    id: 'p1',
    kind: 'person',
    name: 'Маша',
    color: '#e0574f',
    from: { x: 5, z: 5, y: 0 },
    to: { x: 5, z: 5, y: 0 },
    startedAt: 0,
    arriveAt: 1000,
  });

  it('пока идет - никуда не сворачивает', () => {
    const moving = advance(walker(), occupied([]), bounds, 500, 0.9);
    expect(moving.arriveAt).toBe(1000);
  });

  it('дошел - выбирает новую клетку', () => {
    const next = advance(walker(), occupied([]), bounds, 1000, 0.9);
    expect(`${next.to.x},${next.to.z}`).not.toBe('5,5');
    expect(next.arriveAt).toBeGreaterThan(1000);
  });

  it('иногда стоит на месте', () => {
    const resting = advance(walker(), occupied([]), bounds, 1000, 0.05);
    expect(resting.to).toEqual({ x: 5, z: 5, y: 0 });
  });

  it('если под ним построили кубик - перебирается наверх, а не проваливается', () => {
    const buried = advance(walker(), occupied([block(5, 5, 0)]), bounds, 1000, 0.5);
    expect(buried.to).toEqual({ x: 5, z: 5, y: 1 });
  });

  it('идет плавно: на середине пути он между клетками', () => {
    const moving = { ...walker(), to: { x: 6, z: 5, y: 0 } };
    const half = walkerAt(moving, 500);
    expect(half.x).toBeGreaterThan(5);
    expect(half.x).toBeLessThan(6);
    expect(walkerAt(moving, 1000).x).toBe(6);
  });

  it('стоящий на месте не подпрыгивает', () => {
    expect(walkerAt(walker(), 500).hop).toBe(0);
  });
});

describe('фигурки из сохранения', () => {
  it('жители и овечки становятся туда, где их поселили', () => {
    const list = walkersFor(
      {
        people: [{ id: 'p1', name: 'Маша', color: '#e0574f', x: 2, z: 3, y: 1 }],
        sheep: [{ id: 's1', x: 7, z: 8 }],
      },
      0,
    );
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ kind: 'person', name: 'Маша', to: { x: 2, z: 3, y: 1 } });
    expect(list[1]).toMatchObject({ kind: 'sheep', to: { x: 7, z: 8, y: 0 } });
  });
});
