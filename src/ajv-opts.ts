// based on express-openapi-validator released under MIT
// Copyright (c) 2019 Carmine M. DiMascio

import { Options } from 'ajv'

const maxInt32 = 2 ** 31 - 1
const minInt32 = (-2) ** 31

const maxInt64 = 2 ** 63 - 1
const minInt64 = (-2) ** 63

const maxFloat = (2 - 2 ** -23) * 2 ** 127
const minPosFloat = 2 ** -126
const minFloat = -1 * maxFloat
const maxNegFloat = -1 * minPosFloat

const alwaysTrue = () => true
const base64regExp = /^[A-Za-z0-9+/]*(=|==)?$/

export const AJV_FORMATS = {
  int32: {
    validate: (i: number) => Number.isInteger(i) && i <= maxInt32 && i >= minInt32,
    type: 'number',
  },
  int64: {
    validate: (i: number) => Number.isInteger(i) && i <= maxInt64 && i >= minInt64,
    type: 'number',
  },
  float: {
    validate: (i: number) =>
      typeof i === 'number' && (i === 0 || (i <= maxFloat && i >= minPosFloat) || (i >= minFloat && i <= maxNegFloat)),
    type: 'number',
  },
  double: {
    validate: (i: number) => typeof i === 'number',
    type: 'number',
  },
  byte: (b: string) => b.length % 4 === 0 && base64regExp.test(b),
  binary: alwaysTrue,
  password: alwaysTrue,
  'uri-reference': true,
  'date-time': (dateTimeString: unknown) => {
    if (typeof dateTimeString === 'object' && dateTimeString instanceof Date) {
      dateTimeString = dateTimeString.toISOString()
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return !isNaN(Date.parse(dateTimeString as any)) // any test that returns true/false
  },
} as const

export const DEFAULT_AJV_SETTINGS: Options = {
  allErrors: true,
  useDefaults: true,
  discriminator: true,
  formats: AJV_FORMATS,
  coerceTypes: true,
  // strict: false,
  // strictNumbers: true,
  // strictTuples: true,
  // allowUnionTypes: false,
}
