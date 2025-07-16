export const WIDTH = 3440;
export const HEIGHT = 1440;

export function isValidRectangle(object) {
  if (
    !Object.hasOwn(object, 'x') ||
    !Object.hasOwn(object, 'y') ||
    !Object.hasOwn(object, 'w') ||
    !Object.hasOwn(object, 'h')
  ) {
    return false;
  }
  if (
    object.x < 0 ||
    object.y < 0 ||
    object.w < 0 ||
    object.w > WIDTH ||
    object.h < 0 ||
    object.h > HEIGHT
  ) {
    return false;
  }
  return true;
}
