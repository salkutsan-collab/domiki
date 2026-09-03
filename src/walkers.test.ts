import { describe, expect, it } from 'vitest';
import {
  advance,
  canFishBe,
  canStand,
  canSwim,
  fishOptions,
  landingSpot,
  nearestWater,
  stepOptions,
  terrain,
  walkerAt,
  walkersFor,
  waterSpot,
} from './walkers';
import type { Walker } from './walkers';
import type { Block } from './world';
import { defaultBounds } from './world';

const bounds = defaultBounds(); // клетки 0..11

const block = (x: number, z: number, y: number): Block => ({ x, z, y, type: 'brick' });
const water = (x: number, z: number, y: number): Block => ({ x, z, y, type: 'water' });

describe('где можно стоять', () => {
  it('на пустой траве можно, в кубике нельзя', () => {
    const taken = terrain([block(3, 3, 0)]);
    expect(canStand(taken, bounds, 2, 2, 0)).toBe(true);
    expect(canStand(taken, bounds, 3, 3, 0)).toBe(false);
  });

  it('на кубике можно стоять сверху, а в воздухе нельзя', () => {
    const taken = terrain([block(3, 3, 0)]);
    expect(canStand(taken, bounds, 3, 3, 1)).toBe(true);
    expect(canStand(taken, bounds, 2, 2, 1)).toBe(false);
  });

  it('за краем полянки стоять негде', () => {
    expect(canStand(terrain([]), bounds, -1, 5, 0)).toBe(false);
    expect(canStand(terrain([]), bounds, 12, 5, 0)).toBe(false);
  });
});

describe('шаги жителя', () => {
  it('на ровной траве идет в любую из четырех сторон', () => {
    expect(stepOptions(terrain([]), bounds, { x: 5, z: 5, y: 0 }, true)).toHaveLength(4);
  });

  it('в стену выше ступеньки не идет', () => {
    // Кубик в два роста - уже стена: перешагнуть можно только один.
    const wall = terrain([block(6, 5, 0), block(6, 5, 1), block(4, 5, 0), block(4, 5, 1)]);
    const options = stepOptions(wall, bounds, { x: 5, z: 5, y: 0 }, true);
    expect(options.map((spot) => `${spot.x},${spot.z}`)).toEqual(['5,6', '5,4']);
  });

  it('забирается на ступеньку и спускается с нее', () => {
    const step = terrain([block(6, 5, 0)]);
    const up = stepOptions(step, bounds, { x: 5, z: 5, y: 0 }, true);
    expect(up).toContainEqual({ x: 6, z: 5, y: 1 });

    const down = stepOptions(step, bounds, { x: 6, z: 5, y: 1 }, true);
    expect(down).toContainEqual({ x: 5, z: 5, y: 0 });
  });

  it('не пролезает наверх через потолок', () => {
    const roofed = terrain([block(6, 5, 0), block(5, 5, 1)]);
    const options = stepOptions(roofed, bounds, { x: 5, z: 5, y: 0 }, true);
    expect(options).not.toContainEqual({ x: 6, z: 5, y: 1 });
  });

  it('заходит в дом через дверной проем, а не сквозь стену', () => {
    // Стена в три кубика вдоль z = 5, проем в клетке x = 3.
    const wall = [0, 1, 2, 4, 5, 6].flatMap((x) => [block(x, 5, 0), block(x, 5, 1), block(x, 5, 2)]);
    const taken = terrain(wall);
    expect(stepOptions(taken, bounds, { x: 3, z: 4, y: 0 }, true)).toContainEqual({ x: 3, z: 5, y: 0 });
    // Напротив стены пути внутрь нет.
    expect(stepOptions(taken, bounds, { x: 2, z: 4, y: 0 }, true)).not.toContainEqual({ x: 2, z: 5, y: 0 });
  });
});

describe('шаги овечки', () => {
  it('ходит только по земле и на кубик не лезет', () => {
    const step = terrain([block(6, 5, 0)]);
    const options = stepOptions(step, bounds, { x: 5, z: 5, y: 0 }, false);
    expect(options).not.toContainEqual({ x: 6, z: 5, y: 1 });
    expect(options).toHaveLength(3);
  });

  it('на крышу ее не поставить - только на траву', () => {
    const taken = terrain([block(5, 5, 0)]);
    expect(landingSpot(taken, bounds, 5, 5, false)).toBeNull();
    expect(landingSpot(taken, bounds, 5, 5, true)).toEqual({ x: 5, z: 5, y: 1 });
  });
});

const walkerSample = (): Walker => ({
  id: 'p1',
  kind: 'person',
  name: 'Маша',
  color: '#e0574f',
  from: { x: 5, z: 5, y: 0 },
  to: { x: 5, z: 5, y: 0 },
  fromWater: false,
  toWater: false,
  startedAt: 0,
  arriveAt: 1000,
});

describe('жизнь фигурок', () => {
  const walker = (): Walker => ({
    id: 'p1',
    kind: 'person',
    name: 'Маша',
    color: '#e0574f',
    from: { x: 5, z: 5, y: 0 },
    to: { x: 5, z: 5, y: 0 },
    fromWater: false,
    toWater: false,
    startedAt: 0,
    arriveAt: 1000,
  });

  it('пока идет - никуда не сворачивает', () => {
    const moving = advance(walker(), terrain([]), bounds, 500, 0.9);
    expect(moving.arriveAt).toBe(1000);
  });

  it('дошел - выбирает новую клетку', () => {
    const next = advance(walker(), terrain([]), bounds, 1000, 0.9);
    expect(`${next.to.x},${next.to.z}`).not.toBe('5,5');
    expect(next.arriveAt).toBeGreaterThan(1000);
  });

  it('иногда стоит на месте', () => {
    const resting = advance(walker(), terrain([]), bounds, 1000, 0.05);
    expect(resting.to).toEqual({ x: 5, z: 5, y: 0 });
  });

  it('если под ним построили кубик - перебирается наверх, а не проваливается', () => {
    const buried = advance(walker(), terrain([block(5, 5, 0)]), bounds, 1000, 0.5);
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
        fish: [{ id: 'f1', color: '#f08a3c', x: 4, z: 4, y: 0 }],
      },
      terrain([water(4, 4, 0)]),
      0,
    );
    expect(list).toHaveLength(3);
    expect(list[0]).toMatchObject({ kind: 'person', name: 'Маша', to: { x: 2, z: 3, y: 1 } });
    expect(list[1]).toMatchObject({ kind: 'sheep', to: { x: 7, z: 8, y: 0 } });
    expect(list[2]).toMatchObject({ kind: 'fish', to: { x: 4, z: 4, y: 0 } });
  });
});

describe('вода', () => {
  it('в воде не стоят - в ней плавают', () => {
    const pond = terrain([water(5, 5, 0)]);
    expect(canStand(pond, bounds, 5, 5, 0)).toBe(false);
    expect(canSwim(pond, bounds, 5, 5, 0)).toBe(true);
  });

  it('над водой не постоишь, если сверху ничего не построили', () => {
    const pond = terrain([water(5, 5, 0)]);
    expect(canStand(pond, bounds, 5, 5, 1)).toBe(false);
  });

  it('под воду не ныряют: плавают только по поверхности', () => {
    const deep = terrain([water(5, 5, 0), water(5, 5, 1)]);
    expect(canSwim(deep, bounds, 5, 5, 0)).toBe(false);
    expect(canSwim(deep, bounds, 5, 5, 1)).toBe(true);
  });

  it('под мостиком тоже не плавают - над головой должно быть небо', () => {
    const bridged = terrain([water(5, 5, 0), block(5, 5, 1)]);
    expect(canSwim(bridged, bounds, 5, 5, 0)).toBe(false);
  });

  it('житель заходит с берега в воду и выбирается обратно', () => {
    const pond = terrain([water(6, 5, 0)]);
    expect(stepOptions(pond, bounds, { x: 5, z: 5, y: 0 }, true)).toContainEqual({ x: 6, z: 5, y: 0 });
    expect(stepOptions(pond, bounds, { x: 6, z: 5, y: 0 }, true)).toContainEqual({ x: 5, z: 5, y: 0 });
  });

  it('в глубокий пруд житель забирается на верхний слой воды', () => {
    const deep = terrain([water(6, 5, 0), water(6, 5, 1)]);
    expect(stepOptions(deep, bounds, { x: 5, z: 5, y: 0 }, true)).toContainEqual({ x: 6, z: 5, y: 1 });
  });

  it('овечка в воду не заходит', () => {
    const pond = terrain([water(6, 5, 0)]);
    const options = stepOptions(pond, bounds, { x: 5, z: 5, y: 0 }, false);
    expect(options).not.toContainEqual({ x: 6, z: 5, y: 0 });
    expect(options).toHaveLength(3);
  });

  it('овечку нельзя поставить в пруд, а жителя можно - он поплывет', () => {
    const pond = terrain([water(5, 5, 0)]);
    expect(landingSpot(pond, bounds, 5, 5, false)).toBeNull();
    expect(landingSpot(pond, bounds, 5, 5, true)).toEqual({ x: 5, z: 5, y: 0 });
  });

  it('по мостику над водой ходят посуху', () => {
    const bridged = terrain([water(5, 5, 0), block(5, 5, 1)]);
    expect(canStand(bridged, bounds, 5, 5, 2)).toBe(true);
  });

  it('пловец погружен в воду, а пешеход нет', () => {
    const swimmer = { ...walkerSample(), fromWater: true, toWater: true };
    expect(walkerAt(swimmer, 1000).sink).toBeGreaterThan(0.4);
    expect(walkerAt(walkerSample(), 1000).sink).toBe(0);
  });

  it('выходя на берег, житель всплывает постепенно', () => {
    const leaving = { ...walkerSample(), fromWater: true, toWater: false, to: { x: 6, z: 5, y: 0 } };
    const half = walkerAt(leaving, 500).sink;
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(walkerAt(leaving, 0).sink);
    expect(walkerAt(leaving, 1000).sink).toBe(0);
  });

  it('если пруд осушили - житель просто идет дальше посуху', () => {
    const swimmer = { ...walkerSample(), fromWater: true, toWater: true };
    const dry = advance(swimmer, terrain([]), bounds, 1000, 0.5);
    expect(dry.toWater).toBe(false);
    expect(dry.to.y).toBe(0);
  });

  it('если на месте пловца выросла стена - он перебирается наверх', () => {
    const swimmer = { ...walkerSample(), fromWater: true, toWater: true };
    const walled = advance(swimmer, terrain([block(5, 5, 0)]), bounds, 1000, 0.5);
    expect(walled.to).toEqual({ x: 5, z: 5, y: 1 });
    expect(walled.toWater).toBe(false);
  });
});

describe('рыбки', () => {
  const pond = () => terrain([water(5, 5, 0), water(6, 5, 0), water(5, 5, 1), water(6, 5, 1)]);

  it('рыбке нужна вода и годится любая глубина', () => {
    const deep = pond();
    expect(canFishBe(deep, bounds, 5, 5, 0)).toBe(true);
    expect(canFishBe(deep, bounds, 5, 5, 1)).toBe(true);
    expect(canFishBe(deep, bounds, 4, 5, 0)).toBe(false);
  });

  it('из пруда рыбка не выплывает', () => {
    const options = fishOptions(pond(), bounds, { x: 5, z: 5, y: 0 });
    options.forEach((spot) => expect(canFishBe(pond(), bounds, spot.x, spot.z, spot.y)).toBe(true));
    expect(options).not.toContainEqual({ x: 4, z: 5, y: 0 });
  });

  it('ныряет и всплывает внутри пруда', () => {
    expect(fishOptions(pond(), bounds, { x: 5, z: 5, y: 0 })).toContainEqual({ x: 5, z: 5, y: 1 });
    expect(fishOptions(pond(), bounds, { x: 5, z: 5, y: 1 })).toContainEqual({ x: 5, z: 5, y: 0 });
  });

  it('сажаем рыбку в верхнюю воду столбца, а на траву не сажаем', () => {
    expect(waterSpot(pond(), bounds, 5, 5)).toEqual({ x: 5, z: 5, y: 1 });
    expect(waterSpot(pond(), bounds, 1, 1)).toBeNull();
  });

  it('если воду убрали - рыбка перебирается в ближайшую оставшуюся', () => {
    const left = terrain([water(9, 9, 0)]);
    expect(nearestWater(left, { x: 5, z: 5, y: 0 })).toEqual({ x: 9, z: 9, y: 0 });
    expect(nearestWater(terrain([]), { x: 5, z: 5, y: 0 })).toBeNull();
  });

  it('рыбка живет своей жизнью: осушили пруд - переплыла в другой', () => {
    const swimmer = {
      ...walkerSample(),
      id: 'f1',
      kind: 'fish' as const,
      fromWater: true,
      toWater: true,
    };
    const moved = advance(swimmer, terrain([water(8, 8, 0)]), bounds, 1000, 0.5);
    expect(moved.to).toEqual({ x: 8, z: 8, y: 0 });
  });

  it('рыбка не погружается как пловец - она вся в воде', () => {
    const swimmer = { ...walkerSample(), kind: 'fish' as const, fromWater: true, toWater: true };
    expect(walkerAt(swimmer, 1000).sink).toBe(0);
  });
});
