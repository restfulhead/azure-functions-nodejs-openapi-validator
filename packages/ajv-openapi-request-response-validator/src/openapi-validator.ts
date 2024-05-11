import { CoercionStrategy } from 'openapi-request-coercer'
import { OpenAPIV3 } from 'openapi-types'
import { Logger } from 'ts-log'

export enum HttpStatus {
  BAD_REQUEST = 400,
  INTERNAL_SERVER_ERROR = 500,
}

export const EC_VALIDATION = 'Validation'
export const ET_VALIDATION = 'Validation failed'

/**
 * An object containing references to the source of the error
 */
export interface ErrorSource {
  /** JSON Pointer [RFC6901] to the associated entity in the request document (e.g. `/data` for a primary data object, or `/data/attributes/title` for a specific attribute]. */
  pointer?: string
  /** indicates which URI query parameter caused the error */
  parameter?: string
}

/**
 * Error object with details about an error usually returned by the REST API
 */
export interface ErrorObj {
  /**
   * The HTTP status code applicable to this problem
   */
  status: number
  /**
   * An application-specific error code, expressed as a string value.
   */
  code: string
  /**
   * A short, human-readable summary of the problem. It **SHOULD NOT** change from occurrence to occurrence of the problem, except for purposes of localization.
   */
  title: string
  /**
   * A human-readable explanation specific to this occurrence of the problem.
   */
  detail?: string
  source?: ErrorSource

  /**
   * A unique identifier for this particular occurrence of the problem.
   */
  id?: string

  links?: { [key: string]: string }
}

type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] }
export type Primitive = string | number | bigint | boolean | undefined | null | Primitive[]

export interface DocWithCompSchemas extends OpenAPIV3.Document {
  components: WithRequired<OpenAPIV3.ComponentsObject, 'schemas'>
}
export function hasComponentSchemas(doc: OpenAPIV3.Document): doc is DocWithCompSchemas {
  return doc.components?.schemas !== undefined && doc.components?.schemas !== null
}

export interface DocWithReqBodies extends OpenAPIV3.Document {
  components: WithRequired<OpenAPIV3.ComponentsObject, 'requestBodies'>
}
export function hasComponentRequestBodies(doc: OpenAPIV3.Document): doc is DocWithReqBodies {
  return doc.components?.requestBodies !== undefined && doc.components?.requestBodies !== null
}

export function isValidReferenceObject(
  parameter: OpenAPIV3.ParameterObject | OpenAPIV3.SchemaObject | OpenAPIV3.RequestBodyObject | OpenAPIV3.ReferenceObject
): parameter is OpenAPIV3.ReferenceObject {
  return (
    (parameter as OpenAPIV3.ReferenceObject).$ref !== undefined &&
    (parameter as OpenAPIV3.ReferenceObject).$ref !== null &&
    (parameter as OpenAPIV3.ReferenceObject).$ref.includes('/')
  )
}

export function isURLSearchParams(params: Record<string, Primitive> | URLSearchParams): params is URLSearchParams {
  return params !== undefined && params.getAll !== undefined
}

export interface ValidatorOpts {
  /** whether to add additionalProperties = false by default unless otherwise specified (true by default) */
  setAdditionalPropertiesToFalse?: boolean
  /** whether to convert all dates of validation objects to ISO strings before validating (true by default) */
  convertDatesToIsoString?: boolean
  /** whether to coerce header, path, query and formData request properties prior to AJV validation (true by default) */
  coerceTypes?: boolean | 'strict'
  /** whether to fail initialization if one of the schema compilations fails (true by default) */
  strict?: boolean
  /** function used to log messages (console by default) */
  logger?: Logger
}

export const DEFAULT_VALIDATOR_OPTS: Required<ValidatorOpts> = {
  setAdditionalPropertiesToFalse: true,
  convertDatesToIsoString: true,
  coerceTypes: true,
  strict: true,
  logger: console,
}

export type DateToISOString<T> = T extends Date ? string : T extends object ? { [K in keyof T]: DateToISOString<T[K]> } : T

/**
 * Modifies all object's attributes of type Date to ISO date strings. If the data itself is a date, then the ISO string is returned.
 *
 * @param data - Object to convert which will be modified
 * @returns The modified data object
 */
export function convertDatesToISOString<T>(data: T): DateToISOString<T> {
  if (!data) {
    return data as DateToISOString<T>
  }

  if (typeof data === 'object') {
    if (data instanceof Date) {
      return data.toISOString() as DateToISOString<T>
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = Array.isArray(data) ? [] : {}
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        result[key] = convertDatesToISOString(data[key])
      }
    }
    return result
  }
  return data as DateToISOString<T>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function unserializeParameters(parameters: Record<string, Primitive>): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: Record<string, any> = {}
  for (const key in parameters) {
    if (Object.prototype.hasOwnProperty.call(parameters, key)) {
      const value = parameters[key]
      let target = result
      const splitKey = key.split('[')
      const lastKeyIndex = splitKey.length - 1

      splitKey.forEach((part, index) => {
        const cleanPart = part.replace(/]/g, '') // part.replace(']', '')

        if (index === lastKeyIndex) {
          target[cleanPart] = value
        } else {
          if (!target[cleanPart]) {
            target[cleanPart] = {}
          }
          target = target[cleanPart]
        }
      })
    }
  }

  return result
}

export const STRICT_COERCION_STRATEGY: CoercionStrategy = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  boolean: (input: any) => {
    if (typeof input === 'boolean') {
      return input
    }
    if (input === null || input === undefined) {
      return input
    }

    if (input.toLowerCase() === 'false') {
      return false
    } else if (input.toLowerCase() === 'true') {
      return true
    } else {
      return null
    }
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  integer: (input: any) => {
    const asNumber = Number(input)
    if (isNaN(asNumber)) {
      return input
    }
    return asNumber === Math.floor(asNumber) ? asNumber : input
  },

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  number: (input: any) => {
    const result = Number(input)
    return result === null || isNaN(result) ? input : result
  },
}
