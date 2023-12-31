import { OpenAPIV3 } from 'openapi-types'

export const STATUS_BAD_REQUEST = 400
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
  
  export type ValidatorHttpMethod = 'get' | 'put' | 'post' | 'delete' | 'options' | 'head' | 'patch' | 'trace'
  
  export interface OpenApiValidator {
    validateRequestBody(
      path: string,
      method: ValidatorHttpMethod,
      data: unknown): ErrorObj[] | undefined

    validateResponseBody(
      path: string,
      method: ValidatorHttpMethod,
      status: string,
      data: unknown): ErrorObj[] | undefined
      
    validateQueryParams(
      path: string,
      method: ValidatorHttpMethod,
      params: URLSearchParams,
      strict: boolean
    ): ErrorObj[] | undefined
  }
  
  type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] }

export interface DocWithCompSchemas extends OpenAPIV3.Document {
  components: WithRequired<OpenAPIV3.ComponentsObject, 'schemas'>
}
export function hasComponentSchemas(doc: OpenAPIV3.Document): doc is DocWithCompSchemas {
  return doc.components?.schemas !== undefined;
}

export interface DocWithReqBodies extends OpenAPIV3.Document {
  components: WithRequired<OpenAPIV3.ComponentsObject, 'requestBodies'>
}
export function hasComponentRequestBodies(doc: OpenAPIV3.Document): doc is DocWithReqBodies {
  return doc.components?.requestBodies !== undefined;
}

// export interface DocWithResponses extends OpenAPIV3.Document {
//   components: WithRequired<OpenAPIV3.ComponentsObject, 'responses'>
// }
// export function hasComponentResponses(doc: OpenAPIV3.Document): doc is DocWithResponses {
//   return doc.components?.responses !== undefined;
// }

// export interface DocWithParameters extends OpenAPIV3.Document {
//   components: WithRequired<OpenAPIV3.ComponentsObject, 'parameters'>
// }
// export function hasComponentParameters(doc: OpenAPIV3.Document): doc is DocWithParameters {
//   return doc.components?.parameters !== undefined;
// }

export function isReferenceObject(
  parameter: OpenAPIV3.ParameterObject | OpenAPIV3.SchemaObject | OpenAPIV3.RequestBodyObject | OpenAPIV3.ReferenceObject
): parameter is OpenAPIV3.ReferenceObject {
  return (parameter as OpenAPIV3.ReferenceObject).$ref !== undefined
}


export interface ValidatorOpts {
  /** whether to add additionalProperties = false by default unless otherwise specified (true by default) */
  setAdditionalPropertiesToFalse?: boolean
  /** whether to convert all dates of validation objects to ISO strings before validating (true by default) */
  convertDatesToIsoString?: boolean
  /** whether to fail initialization if one of the schema compilations fails */
  strict?: boolean
  /** function used to log messages */
  log?: (message: string) => void
}

export const DEFAULT_VALIDATOR_OPTS: Required<ValidatorOpts> = {
  setAdditionalPropertiesToFalse: true,
  convertDatesToIsoString: true,
  strict: true,
  log: (message: string) => { console.log(message) }
}


  /**
 * Modifies all object's attributes of type Date to ISO date strings. If the data itself is a date, then the ISO string is returned.
 *
 * @param data - Object to convert which will be modified
 * @returns The modified data object
 */
export function convertDatesToISOString(data: any): any {
    if (!data) {
      return data
    }
  
    if (typeof data === 'object') {
      if (data instanceof Date) {
        return data.toISOString()
      }
      for (const key of Object.keys(data)) {
        data[key] = convertDatesToISOString(data[key])
      }
    }
    return data
  }