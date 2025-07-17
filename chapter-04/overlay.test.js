import { expect, test } from 'vitest'
import { overlay } from './overlay.js';

test('가로로 나란한 겹치는 사각형', () => {
  const rect1 = {
    x: 0,
    y: 0,
    w: 100,
    h: 100,
  };
  const rect2 = {
    x: 99,
    y: 0,
    w: 100,
    h: 100,
  };
  const result = overlay(rect1, rect2);
  const expected = {
    x: 99,
    y: 0,
    w: 1,
    h: 100,
  };
  expect(result).toStrictEqual(expected);
});

test('가로로 나란한 겹치는 사각형 2', () => {
  const rect1 = {
    x: 99,
    y: 0,
    w: 100,
    h: 100,
  };
  const rect2 = {
    x: 0,
    y: 0,
    w: 100,
    h: 100,
  };
  const result = overlay(rect1, rect2);
  const expected = {
    x: 99,
    y: 0,
    w: 1,
    h: 100,
  };
  expect(result).toStrictEqual(expected);
});

test('가로로 나란한 겹치지 않는 사각형', () => {
  const rect1 = {
    x: 0,
    y: 0,
    w: 100,
    h: 100,
  };
  const rect2 = {
    x: 101,
    y: 0,
    w: 100,
    h: 100,
  };
  const result = overlay(rect1, rect2);
  const expected = null
  expect(result).toStrictEqual(expected);
});

test('세로로 나란한 겹치는 사각형', () => {
  const rect1 = {
    x: 0,
    y: 0,
    w: 100,
    h: 100,
  };
  const rect2 = {
    x: 0,
    y: 99,
    w: 100,
    h: 100,
  };
  const result = overlay(rect1, rect2);
  const expected = {
    x: 0,
    y: 99,
    w: 100,
    h: 1,
  };
  expect(result).toStrictEqual(expected);
});

test('세로로 나란한 겹치는 사각형 2', () => {
  const rect1 = {
    x: 0,
    y: 99,
    w: 100,
    h: 100,
  };
  const rect2 = {
    x: 0,
    y: 0,
    w: 100,
    h: 100,
  };
  const result = overlay(rect1, rect2);
  const expected = {
    x: 0,
    y: 99,
    w: 100,
    h: 1,
  };
  expect(result).toStrictEqual(expected);
});

test('세로로 나란한 겹치지 않는 사각형', () => {
  const rect1 = {
    x: 0,
    y: 0,
    w: 100,
    h: 100,
  };
  const rect2 = {
    x: 0,
    y: 101,
    w: 100,
    h: 100,
  };
  const result = overlay(rect1, rect2);
  const expected = null
  expect(result).toStrictEqual(expected);
});

test('변이 겹치는 사각형', () => {
  const rect1 = {
    x: 0,
    y: 0,
    w: 100,
    h: 100,
  };
  const rect2 = {
    x: 100,
    y: 0,
    w: 100,
    h: 100,
  };
  const result = overlay(rect1, rect2);
  const expected = null;
  expect(result).toStrictEqual(expected);
});

test('꼭짓점이 겹치는 사각형', () => {
  const rect1 = {
    x: 0,
    y: 0,
    w: 100,
    h: 100,
  };
  const rect2 = {
    x: 100,
    y: 100,
    w: 100,
    h: 100,
  };
  const result = overlay(rect1, rect2);
  const expected = null;
  expect(result).toStrictEqual(expected);
});

test('완전히 겹치는 사각형', () => {
  const rect1 = {
    x: 0,
    y: 0,
    w: 100,
    h: 100,
  };
  const rect2 = {
    x: 0,
    y: 0,
    w: 100,
    h: 100,
  };
  const result = overlay(rect1, rect2);
  const expected = {
    x: 0,
    y: 0,
    w: 100,
    h: 100,
  };
  expect(result).toStrictEqual(expected);
});
