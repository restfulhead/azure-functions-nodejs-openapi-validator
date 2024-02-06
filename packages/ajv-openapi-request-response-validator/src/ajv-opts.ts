import { KeywordDefinition, Options } from 'ajv'

export const DEFAULT_AJV_SETTINGS: Options = {
  allErrors: true,
  useDefaults: true,
  discriminator: true,
  removeAdditional: false, // recommended to be false for allOf to work properly
  coerceTypes: false, // recommended to be false for anyof to work properly
}

export interface AjvExtras {
  addStandardFormats?: boolean
  customKeywords?: KeywordDefinition[]
}

export const DEFAULT_AJV_EXTRAS: AjvExtras = {
  addStandardFormats: true,
}
