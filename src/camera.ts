// Камера: свободный поворот, наклон, приближение и сдвиг.
// Рисуем без перспективы: клетка поворачивается вокруг центра полянки,
// глубина сплющивается по наклону, высота поднимает кубик вверх по экрану.

import type { Block, Bounds } from './world';
import { boundsCenter } from './world';

export type Camera = { yaw: number; pitch: number; zoom: number; panX: number; panY: number };
export type Point = { x: number; y: number };
export type View = { width: number; height: number };
export type SideNormal = { nx: number; nz: number };

// Начальные значения дают ту же картинку, что была у игры до свободной камеры.
export const DEFAULT_CAMERA: Camera = { yaw: Math.PI / 4, pitch: 0.546, zoom: 1, panX: 0, panY: 0 };

export const MIN_PITCH = 0.1;
export const MAX_PITCH = 1.4;
export const MIN_ZOOM = 0.35;
export const MAX_ZOOM = 3;
const PAN_LIMIT = 2200;

const UNIT = 36.77; // ширина клетки по экрану при zoom = 1
const RISE = 34; // высота кубика при zoom = 1
const GROUND_LINE = 0.58; // центр полянки чуть ниже середины экрана - постройке нужно место вверх

function clamp(value: number, low: number, high: number) {
  return Math.min(high, Math.max(low, value));
}

export function clampCamera(camera: Camera): Camera {
  return {
    yaw: camera.yaw,
    pitch: clamp(camera.pitch, MIN_PITCH, MAX_PITCH),
    zoom: clamp(camera.zoom, MIN_ZOOM, MAX_ZOOM),
    panX: clamp(camera.panX, -PAN_LIMIT, PAN_LIMIT),
    panY: clamp(camera.panY, -PAN_LIMIT, PAN_LIMIT),
  };
}

export function turnCamera(camera: Camera, quarters: number): Camera {
  return { ...camera, yaw: camera.yaw + (quarters * Math.PI) / 2 };
}

// Точка полянки на экране. Координаты клетки дробные: углы клетки - это x +- 0.5.
export function project(camera: Camera, bounds: Bounds, x: number, z: number, y: number, view: View): Point {
  const { cx, cz } = boundsCenter(bounds);
  const dx = x - cx;
  const dz = z - cz;
  const cos = Math.cos(camera.yaw);
  const sin = Math.sin(camera.yaw);
  const rx = dx * cos - dz * sin;
  const rz = dx * sin + dz * cos;
  const scale = UNIT * camera.zoom;
  return {
    x: view.width / 2 + camera.panX + rx * scale,
    y: view.height * GROUND_LINE + camera.panY + rz * scale * Math.sin(camera.pitch) - y * RISE * camera.zoom,
  };
}

// Чем больше значение, тем ближе клетка к смотрящему. Дальние рисуем первыми.
export function depthKey(camera: Camera, x: number, z: number) {
  return x * Math.sin(camera.yaw) + z * Math.cos(camera.yaw);
}

// Две боковые грани кубика, повернутые к смотрящему. Остальные все равно не видны.
export function visibleSides(camera: Camera): SideNormal[] {
  const candidates: SideNormal[] = [
    { nx: 1, nz: 0 },
    { nx: -1, nz: 0 },
    { nx: 0, nz: 1 },
    { nx: 0, nz: -1 },
  ];
  return candidates.filter(({ nx, nz }) => depthKey(camera, nx, nz) > 0.001);
}

// Углы верхней грани кубика (или клетки травы при y = 0).
export function topCorners(camera: Camera, bounds: Bounds, x: number, z: number, y: number, view: View): Point[] {
  return [
    project(camera, bounds, x - 0.5, z - 0.5, y, view),
    project(camera, bounds, x + 0.5, z - 0.5, y, view),
    project(camera, bounds, x + 0.5, z + 0.5, y, view),
    project(camera, bounds, x - 0.5, z + 0.5, y, view),
  ];
}

// Углы боковой грани: верхнее ребро и то же ребро внизу.
export function sideCorners(
  camera: Camera,
  bounds: Bounds,
  x: number,
  z: number,
  y: number,
  side: SideNormal,
  view: View,
): Point[] {
  const alongX = side.nx !== 0;
  const fixed = alongX ? x + side.nx * 0.5 : z + side.nz * 0.5;
  const from = alongX ? z - 0.5 : x - 0.5;
  const to = alongX ? z + 0.5 : x + 0.5;
  const corner = (edge: number, height: number) =>
    alongX
      ? project(camera, bounds, fixed, edge, height, view)
      : project(camera, bounds, edge, fixed, height, view);
  return [corner(from, y + 1), corner(to, y + 1), corner(to, y), corner(from, y)];
}

// Вид, при котором вся постройка попадает в кадр. Нужен для миниатюр в архиве.
export function fitCamera(base: Camera, bounds: Bounds, blocks: Block[], view: View, padding = 0.84): Camera {
  const cells = blocks.length
    ? blocks.map((block) => ({ x: block.x, z: block.z, y: block.y }))
    : [
        { x: bounds.minX, z: bounds.minZ, y: 0 },
        { x: bounds.maxX, z: bounds.maxZ, y: 0 },
      ];

  const spread = (camera: Camera) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    cells.forEach(({ x, z, y }) => {
      for (const dx of [-0.5, 0.5]) {
        for (const dz of [-0.5, 0.5]) {
          for (const dy of [0, 1]) {
            const point = project(camera, bounds, x + dx, z + dz, y + dy, view);
            minX = Math.min(minX, point.x);
            maxX = Math.max(maxX, point.x);
            minY = Math.min(minY, point.y);
            maxY = Math.max(maxY, point.y);
          }
        }
      }
    });
    return { minX, maxX, minY, maxY };
  };

  const plain = { ...base, zoom: 1, panX: 0, panY: 0 };
  const raw = spread(plain);
  const width = Math.max(raw.maxX - raw.minX, 1);
  const height = Math.max(raw.maxY - raw.minY, 1);
  const zoom = Math.min(
    MAX_ZOOM,
    Math.max(MIN_ZOOM, Math.min((view.width * padding) / width, (view.height * padding) / height)),
  );

  const scaled = spread({ ...plain, zoom });
  return {
    ...base,
    zoom,
    panX: view.width / 2 - (scaled.minX + scaled.maxX) / 2,
    panY: view.height / 2 - (scaled.minY + scaled.maxY) / 2,
  };
}
