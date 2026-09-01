// Касания и мышь. Короткое касание ставит кубик, протяжка в режиме
// «Смотреть» крутит полянку, два пальца приближают и сдвигают.

import { useMemo, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Camera } from './camera';

export type GestureOptions = {
  rotateWithOneFinger: boolean;
  onTap: (clientX: number, clientY: number) => void;
  onHover: (clientX: number, clientY: number) => void;
  onHoverEnd: () => void;
  onCamera: (change: (camera: Camera) => Camera) => void;
};

type Touch = { x: number; y: number };

const TAP_SLOP = 11; // насколько палец может сползти, чтобы это все еще считалось касанием
const TAP_TIME = 800;
const YAW_SPEED = 0.009;
const PITCH_SPEED = 0.007;
const WHEEL_SPEED = 0.0016;

export function useGestures(options: GestureOptions) {
  const latest = useRef(options);
  latest.current = options;

  const state = useRef({
    touches: new Map<number, Touch>(),
    startedAt: 0,
    startX: 0,
    startY: 0,
    moved: false,
    pinched: false,
    pinchDistance: 0,
    pinchX: 0,
    pinchY: 0,
  });

  return useMemo(() => {
    const current = state.current;

    const twoTouches = () => {
      const [first, second] = [...current.touches.values()];
      const distance = Math.hypot(first.x - second.x, first.y - second.y);
      return { distance, midX: (first.x + second.x) / 2, midY: (first.y + second.y) / 2 };
    };

    const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      current.touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (current.touches.size === 1) {
        current.startedAt = event.timeStamp;
        current.startX = event.clientX;
        current.startY = event.clientY;
        current.moved = false;
        current.pinched = false;
        return;
      }
      if (current.touches.size === 2) {
        const { distance, midX, midY } = twoTouches();
        current.pinched = true;
        current.pinchDistance = distance;
        current.pinchX = midX;
        current.pinchY = midY;
      }
    };

    const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
      const known = current.touches.get(event.pointerId);
      if (!known) {
        latest.current.onHover(event.clientX, event.clientY);
        return;
      }

      const previous = { ...known };
      known.x = event.clientX;
      known.y = event.clientY;

      if (current.touches.size >= 2) {
        const { distance, midX, midY } = twoTouches();
        const ratio = current.pinchDistance > 0 ? distance / current.pinchDistance : 1;
        const shiftX = midX - current.pinchX;
        const shiftY = midY - current.pinchY;
        current.pinchDistance = distance;
        current.pinchX = midX;
        current.pinchY = midY;
        current.moved = true;
        latest.current.onCamera((camera) => ({
          ...camera,
          zoom: camera.zoom * ratio,
          panX: camera.panX + shiftX,
          panY: camera.panY + shiftY,
        }));
        return;
      }

      if (Math.hypot(event.clientX - current.startX, event.clientY - current.startY) > TAP_SLOP) {
        current.moved = true;
      }

      if (latest.current.rotateWithOneFinger) {
        const dx = event.clientX - previous.x;
        const dy = event.clientY - previous.y;
        latest.current.onCamera((camera) => ({
          ...camera,
          yaw: camera.yaw + dx * YAW_SPEED,
          pitch: camera.pitch - dy * PITCH_SPEED,
        }));
        return;
      }

      latest.current.onHover(event.clientX, event.clientY);
    };

    const finish = (event: ReactPointerEvent<HTMLCanvasElement>, tapAllowed: boolean) => {
      const known = current.touches.delete(event.pointerId);
      if (!known) return;
      const singleTouchLeft = current.touches.size === 0;
      const quick = event.timeStamp - current.startedAt < TAP_TIME;
      const tapped =
        tapAllowed &&
        singleTouchLeft &&
        !current.moved &&
        !current.pinched &&
        quick &&
        !latest.current.rotateWithOneFinger;
      if (tapped) latest.current.onTap(event.clientX, event.clientY);
      if (singleTouchLeft) current.pinched = false;
    };

    const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => finish(event, true);
    const onPointerCancel = (event: ReactPointerEvent<HTMLCanvasElement>) => finish(event, false);

    const onPointerLeave = (event: ReactPointerEvent<HTMLCanvasElement>) => {
      if (!current.touches.has(event.pointerId)) latest.current.onHoverEnd();
    };

    // Колесо мыши слушаем не через React: там оно пассивное и прокрутку страницы не отменить.
    const wheel = (deltaY: number) => {
      const ratio = Math.exp(-deltaY * WHEEL_SPEED);
      latest.current.onCamera((camera) => ({ ...camera, zoom: camera.zoom * ratio }));
    };

    return {
      handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onPointerLeave },
      wheel,
    };
  }, []);
}
