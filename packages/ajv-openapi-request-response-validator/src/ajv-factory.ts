import AjvDraft4 from 'ajv-draft-04'
import { Options } from 'ajv'
import addFormats from 'ajv-formats'
import { AjvExtras, DEFAULT_AJV_EXTRAS, DEFAULT_AJV_SETTINGS } from './ajv-opts'

/**
 * @param spec - Parsed OpenAPI V3 specification
 * @param ajvOpts - Optional Ajv options
 * @param validatorOpts - Optional additional validator options
 * @param ajvExtras - Optional additional Ajv features
 */
export function createAjvInstance(ajvOpts: Options = DEFAULT_AJV_SETTINGS, ajvExtras: AjvExtras = DEFAULT_AJV_EXTRAS) {
  const ajv = new AjvDraft4({ ...DEFAULT_AJV_SETTINGS, ...ajvOpts })
  if (ajvExtras?.addStandardFormats === true) {
    addFormats(ajv)
  }
  if (ajvExtras?.customKeywords) {
    ajvExtras.customKeywords.forEach((kwd) => {
      ajv.addKeyword(kwd)
    })
  }

  return ajv
}
