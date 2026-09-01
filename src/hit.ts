// Попадание пальцем по грани и место, куда встанет новый кубик.

import type { Point } from './camera';

export type FaceKind = 'ground' | 'top' | 'side';

export type Face = {
  points: Point[];
  x: number;
  z: number;
  y: number;
  kind: FaceKind;
  nx: number;
  nz: number;
};

export type Cell = { x: number; z: number; y: number };

export function containsPoint(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const intersects = a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

// Грани лежат в порядке рисования, поэтому ищем с конца - там то, что нарисовано поверх.
export function pickFace(faces: Face[], point: Point): Face | null {
  for (let i = faces.length - 1; i >= 0; i -= 1) {
    if (containsPoint(point, faces[i].points)) return faces[i];
  }
  return null;
}

// Верхняя грань - кубик сверху. Боковая - кубик прилипает сбоку на той же высоте.
export function placementTarget(face: Face): Cell {
  if (face.kind === 'ground') return { x: face.x, z: face.z, y: 0 };
  if (face.kind === 'top') return { x: face.x, z: face.z, y: face.y + 1 };
  return { x: face.x + face.nx, z: face.z + face.nz, y: face.y };
}
