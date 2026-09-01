import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CAMERA,
  MAX_PITCH,
  MAX_ZOOM,
  MIN_PITCH,
  MIN_ZOOM,
  clampCamera,
  depthKey,
  project,
  turnCamera,
  visibleSides,
} from './camera';
import { defaultBounds } from './world';

const view = { width: 1100, height: 650 };
const bounds = defaultBounds(); // центр полянки - клетка 5.5

describe('проекция', () => {
  it('в начальном виде повторяет прежнюю изометрию', () => {
    const center = project(DEFAULT_CAMERA, bounds, 5.5, 5.5, 0, view);
    const oneRight = project(DEFAULT_CAMERA, bounds, 6.5, 5.5, 0, view);
    expect(oneRight.x - center.x).toBeCloseTo(26, 0);
    expect(oneRight.y - center.y).toBeCloseTo(13.5, 0);
  });

  it('вторая ось идет в другую сторону', () => {
    const center = project(DEFAULT_CAMERA, bounds, 5.5, 5.5, 0, view);
    const oneAway = project(DEFAULT_CAMERA, bounds, 5.5, 6.5, 0, view);
    expect(oneAway.x - center.x).toBeCloseTo(-26, 0);
    expect(oneAway.y - center.y).toBeCloseTo(13.5, 0);
  });

  it('высота поднимает кубик вверх по экрану', () => {
    const ground = project(DEFAULT_CAMERA, bounds, 5.5, 5.5, 0, view);
    const first = project(DEFAULT_CAMERA, bounds, 5.5, 5.5, 1, view);
    expect(ground.y - first.y).toBeCloseTo(34, 5);
  });

  it('приближение растягивает картинку, сдвиг переносит ее целиком', () => {
    const near = { ...DEFAULT_CAMERA, zoom: 2 };
    const center = project(near, bounds, 5.5, 5.5, 0, view);
    const oneRight = project(near, bounds, 6.5, 5.5, 0, view);
    expect(oneRight.x - center.x).toBeCloseTo(52, 0);

    const shifted = project({ ...DEFAULT_CAMERA, panX: 100, panY: -40 }, bounds, 5.5, 5.5, 0, view);
    const plain = project(DEFAULT_CAMERA, bounds, 5.5, 5.5, 0, view);
    expect(shifted.x - plain.x).toBeCloseTo(100, 5);
    expect(shifted.y - plain.y).toBeCloseTo(-40, 5);
  });

  it('наклон сплющивает глубину: сверху полянка почти квадратная', () => {
    const flat = { ...DEFAULT_CAMERA, pitch: MIN_PITCH };
    const above = { ...DEFAULT_CAMERA, pitch: MAX_PITCH };
    const depthFlat = project(flat, bounds, 5.5, 6.5, 0, view).y - project(flat, bounds, 5.5, 5.5, 0, view).y;
    const depthAbove = project(above, bounds, 5.5, 6.5, 0, view).y - project(above, bounds, 5.5, 5.5, 0, view).y;
    expect(Math.abs(depthAbove)).toBeGreaterThan(Math.abs(depthFlat));
  });
});

describe('порядок рисования', () => {
  it('ближняя клетка получает большее значение глубины', () => {
    expect(depthKey(DEFAULT_CAMERA, 6, 6)).toBeGreaterThan(depthKey(DEFAULT_CAMERA, 5, 5));
  });

  it('после поворота на пол-оборота порядок меняется на обратный', () => {
    const turned = turnCamera(DEFAULT_CAMERA, 2);
    expect(depthKey(turned, 6, 6)).toBeLessThan(depthKey(turned, 5, 5));
  });
});

describe('видимые грани', () => {
  it('в начальном виде их две: правая и левая', () => {
    const sides = visibleSides(DEFAULT_CAMERA);
    expect(sides).toHaveLength(2);
    expect(sides).toEqual(expect.arrayContaining([{ nx: 1, nz: 0 }, { nx: 0, nz: 1 }]));
  });

  it('после четверти поворота видны другие две', () => {
    const sides = visibleSides(turnCamera(DEFAULT_CAMERA, 1));
    expect(sides).toHaveLength(2);
    expect(sides).toEqual(expect.arrayContaining([{ nx: 1, nz: 0 }, { nx: 0, nz: -1 }]));
  });

  it('на любом угле поворота видно не больше двух боковых граней', () => {
    for (let step = 0; step < 48; step += 1) {
      const camera = { ...DEFAULT_CAMERA, yaw: (step * Math.PI) / 24 };
      expect(visibleSides(camera).length).toBeLessThanOrEqual(2);
    }
  });
});

describe('пределы камеры', () => {
  it('не дает завалить наклон и приближение за границы', () => {
    const low = clampCamera({ ...DEFAULT_CAMERA, pitch: -3, zoom: 0.01 });
    expect(low.pitch).toBe(MIN_PITCH);
    expect(low.zoom).toBe(MIN_ZOOM);

    const high = clampCamera({ ...DEFAULT_CAMERA, pitch: 9, zoom: 99 });
    expect(high.pitch).toBe(MAX_PITCH);
    expect(high.zoom).toBe(MAX_ZOOM);
  });

  it('поворот вокруг оси не ограничивает - крутить можно бесконечно', () => {
    expect(clampCamera({ ...DEFAULT_CAMERA, yaw: 100 }).yaw).toBe(100);
  });
});
