// Маленькая картинка постройки для архива: тот же рисовальщик, только вид
// подогнан так, чтобы домик целиком попал в кадр.

import type { View } from './camera';
import { DEFAULT_CAMERA, fitCamera } from './camera';
import { drawScene } from './render';
import type { World } from './world';
import { MAX_HEIGHT } from './world';

export const THUMB: View = { width: 320, height: 200 };

export function makeThumbnail(world: World): string {
  const canvas = document.createElement('canvas');
  canvas.width = THUMB.width;
  canvas.height = THUMB.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  drawScene(ctx, THUMB, {
    blocks: world.blocks,
    bounds: world.bounds,
    camera: fitCamera(DEFAULT_CAMERA, world.bounds, world.blocks, THUMB),
    floors: MAX_HEIGHT,
    xray: false,
    ghost: null,
    ghostType: 'wood',
    erase: null,
  });

  try {
    return canvas.toDataURL('image/jpeg', 0.72);
  } catch {
    return '';
  }
}
