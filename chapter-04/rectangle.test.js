import { expect, test } from 'vitest'
import { WIDTH, HEIGHT, isValidRectangle } from './rectangle.js';

test('올바른 속성을 가지지 않는 객체는 사각형이 아닙니다.', () => {
  const given = {};
  const result = isValidRectangle(given);
  const expected = false;
  expect(result).toBe(expected);
});

test('올바른 속성을 가지는 객체는 사각형입니다.', () => {
  const given = {
    x: 0,
    y: 0,
    w: 1,
    h: 1,
  };
  const result = isValidRectangle(given);
  const expected = true;
  expect(result).toBe(expected);
});

test('음수를 가지는 객체는 올바른 사각형이 아닙니다.', () => {
  const given = {
    x: -1,
    y: -1,
    w: -1,
    h: -1,
  };
  const result = isValidRectangle(given);
  const expected = false;
  expect(result).toBe(expected);
});

test('사각형은 화면 외부에 존재할 수 없습니다.', () => {
  const given = {
    x: 1,
    y: 1,
    w: 3441,
    h: 1441,
  };
  const result = isValidRectangle(given);
  const expected = false;
  expect(result).toBe(expected);
});
