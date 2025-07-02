jest.mock('azure-devops-extension-sdk', () => ({}));
jest.mock('azure-devops-extension-api', () => ({}));
jest.mock('azure-devops-extension-api/WorkItemTracking', () => ({}));
jest.mock('isomorphic-fetch', () => jest.fn());
jest.mock('fetch-retry', () => () => jest.fn());
jest.mock('@xenova/transformers', () => ({
  pipeline: jest.fn(async () => async () => [[]]),
}));

import { DuplicateObserver } from '../block-duplicate-observer';

describe('DuplicateObserver helpers', () => {
  const observer = new DuplicateObserver(
    null as any,
    null as any,
    null as any,
    null as any
  ) as any;

  test('normalizeString strips HTML, punctuation and lowercases', () => {
    const input = ' Hello <b>World</b>! ';
    const result = observer.normalizeString(input);
    expect(result).toBe('hello world');
  });

  test('cosineSimilarity returns 1 for identical vectors', () => {
    const res = observer.cosineSimilarity([1, 0, 1], [1, 0, 1]);
    expect(res).toBeCloseTo(1);
  });

  test('cosineSimilarity returns 0 for orthogonal vectors', () => {
    const res = observer.cosineSimilarity([1, 0], [0, 1]);
    expect(res).toBeCloseTo(0);
  });

  test('getfirstResolvedPromise resolves true when any promise resolves true', async () => {
    const promises = [
      Promise.resolve(false),
      new Promise<boolean>((r) => setTimeout(() => r(true), 10)),
      Promise.resolve(false),
    ];
    const res = await observer.getfirstResolvedPromise(promises);
    expect(res).toBe(true);
  });

  test('getfirstResolvedPromise resolves false when all promises resolve false', async () => {
    const promises = [Promise.resolve(false), Promise.resolve(false)];
    const res = await observer.getfirstResolvedPromise(promises);
    expect(res).toBe(false);
  });
});
