// based on express-openapi-validator released under MIT
// Copyright (c) 2019 Carmine M. DiMascio

import { KeywordDefinition, Options } from 'ajv'

export const DEFAULT_AJV_SETTINGS: Options = {
  allErrors: true,
  useDefaults: true,
  discriminator: true,
  coerceTypes: false,
}

export interface AjvExtras {
  addStandardFormats?: boolean
  customKeywords?: KeywordDefinition[]
}

export const DEFAULT_AJV_EXTRAS: AjvExtras = {
  addStandardFormats: true,
}
