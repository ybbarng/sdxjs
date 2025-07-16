import { isValidRectangle } from './rectangle.js';

export function overlay(rect1, rect2) {
  const x = Math.max(rect1.x, rect2.x)
  const y = Math.max(rect1.y, rect2.y);
  const w = Math.min(rect1.x + rect1.w, rect2.x + rect2.w) - x;
  const h = Math.min(rect1.y + rect1.h, rect2.y + rect2.h) - y;
  const result = {
    x,
    y,
    w,
    h
  }

  if (!isValidRectangle(result) || w * h === 0) {
    return null;
  }
  return result;
}
