import { describe, expect, it } from 'vitest';
import {
  MAX_HEIGHT,
  MAX_SPAN,
  boundsForBlocks,
  defaultBounds,
  grownBounds,
  insideBounds,
  makeHouse,
  parseSaved,
  topFloor,
} from './world';

const span = (bounds: { minX: number; maxX: number }) => bounds.maxX - bounds.minX + 1;

describe('рост полянки', () => {
  it('не растет, если кубик встал в середине', () => {
    const bounds = defaultBounds();
    expect(grownBounds(bounds, 5, 5)).toEqual(bounds);
  });

  it('прирастает с той стороны, где строят', () => {
    const grown = grownBounds(defaultBounds(), 0, 5);
    expect(grown.minX).toBe(-4);
    expect(grown.maxX).toBe(11);
    expect(grown.minZ).toBe(0);
    expect(grown.maxZ).toBe(11);
  });

  it('считает краем и вторую клетку от края', () => {
    expect(grownBounds(defaultBounds(), 10, 5).maxX).toBe(15);
    expect(grownBounds(defaultBounds(), 9, 5).maxX).toBe(11);
  });

  it('растет в обе стороны, если кубик в углу', () => {
    const grown = grownBounds(defaultBounds(), 0, 0);
    expect(grown).toEqual({ minX: -4, maxX: 11, minZ: -4, maxZ: 11 });
  });

  it('останавливается на пределе 40 клеток', () => {
    let bounds = defaultBounds();
    for (let step = 0; step < 30; step += 1) bounds = grownBounds(bounds, bounds.minX, bounds.minZ);
    expect(span(bounds)).toBeLessThanOrEqual(MAX_SPAN);
    expect(bounds.maxZ - bounds.minZ + 1).toBeLessThanOrEqual(MAX_SPAN);
  });
});

describe('готовый домик', () => {
  const bounds = defaultBounds();
  const house = makeHouse(bounds);

  it('целиком лежит на траве и ниже предела высоты', () => {
    expect(house.length).toBeGreaterThan(50);
    house.forEach((block) => {
      expect(insideBounds(bounds, block.x, block.z)).toBe(true);
      expect(block.y).toBeLessThan(MAX_HEIGHT);
    });
  });

  it('имеет свес крыши - кубик, под которым пусто', () => {
    const hanging = house.filter(
      (block) => block.y > 0 && !house.some((under) => under.x === block.x && under.z === block.z && under.y === block.y - 1),
    );
    expect(hanging.length).toBeGreaterThan(0);
  });

  it('свес всегда можно собрать руками: рядом на той же высоте есть кубик', () => {
    const neighbours = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const hanging = house.filter(
      (block) => block.y > 0 && !house.some((under) => under.x === block.x && under.z === block.z && under.y === block.y - 1),
    );
    hanging.forEach((block) => {
      const hasSideSupport = neighbours.some(([dx, dz]) =>
        house.some((other) => other.x === block.x + dx && other.z === block.z + dz && other.y === block.y),
      );
      expect(hasSideSupport).toBe(true);
    });
  });

  it('оставляет дверь - в стене есть пропуск на первых двух этажах', () => {
    const wallRow = house.filter((block) => block.z === 8 && block.y === 0);
    expect(wallRow.length).toBeLessThan(6);
  });
});

describe('чтение сохранения', () => {
  it('читает новый формат вместе с границами', () => {
    const saved = JSON.stringify({
      blocks: [{ x: 1, z: 2, y: 0, type: 'wood' }],
      bounds: { minX: 0, maxX: 19, minZ: 0, maxZ: 19 },
    });
    const world = parseSaved(saved, null);
    expect(world?.blocks).toHaveLength(1);
    expect(world?.bounds.maxX).toBe(19);
  });

  it('переносит старое сохранение на полянку 12 на 12', () => {
    const legacy = JSON.stringify([
      { x: 1, z: 1, y: 0, type: 'yellow' },
      { x: 4, z: 5, y: 1, type: 'brick' },
    ]);
    const world = parseSaved(null, legacy);
    expect(world?.blocks).toHaveLength(2);
    // Кубик в клетке (1,1) стоит у края, поэтому трава сразу подросла.
    expect(world?.bounds.minX).toBe(-4);
  });

  it('предпочитает новый формат старому', () => {
    const saved = JSON.stringify({ blocks: [], bounds: defaultBounds() });
    const legacy = JSON.stringify([{ x: 0, z: 0, y: 0, type: 'wood' }]);
    expect(parseSaved(saved, legacy)?.blocks).toHaveLength(0);
  });

  it('не читает мусор и незнакомые материалы', () => {
    expect(parseSaved('не json', null)).toBeNull();
    expect(parseSaved(JSON.stringify({ blocks: 'нет', bounds: defaultBounds() }), null)).toBeNull();
    const badType = JSON.stringify({ blocks: [{ x: 0, z: 0, y: 0, type: 'алмаз' }], bounds: defaultBounds() });
    expect(parseSaved(badType, null)).toBeNull();
  });
});

describe('прочее', () => {
  it('считает верхний этаж постройки', () => {
    expect(topFloor([])).toBe(1);
    expect(topFloor([{ x: 0, z: 0, y: 4, type: 'wood' }])).toBe(5);
  });

  it('расширяет траву под готовую постройку', () => {
    const bounds = boundsForBlocks(defaultBounds(), [{ x: 11, z: 11, y: 0, type: 'wood' }]);
    expect(bounds.maxX).toBe(15);
    expect(bounds.maxZ).toBe(15);
  });
});
