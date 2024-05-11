import { Primitive, unserializeParameters } from '../../src/openapi-validator'

describe('The api validator', () => {
  it.each([
    [
      { filter: 'test', 'page[offset]': '0', 'page[limit]': '12' },
      { filter: 'test', page: { offset: '0', limit: '12' } },
    ],
    [{ 'page[one][two]': '12', 'page[one][three]': '123' }, { page: { one: { two: '12', three: '123' } } }],
    [
      { 'another[one[two]]': 'test', 'page[[one][two]': '12', 'empty[]': '123' },
      { another: { one: { two: 'test' } }, page: { '': { one: { two: '12' } } }, empty: { '': '123' } },
    ],
  ])('should unserialize parameters', (parameters: Record<string, Primitive>, expected: Record<string, any>) => {
    const actual = unserializeParameters(parameters)
    JSON.stringify(actual)
    expect(actual).toEqual(expected)
  })
})
