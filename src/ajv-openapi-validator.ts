/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-invalid-this */
import AjvDraft4 from 'ajv-draft-04'
import Ajv, { ErrorObject, ValidateFunction, Options } from 'ajv'
import { OpenAPIV3 } from 'openapi-types'
import {
  convertDatesToISOString,
  ErrorObj,
  ValidatorOpts,
  STATUS_BAD_REQUEST,
  EC_VALIDATION,
  ET_VALIDATION,
  DEFAULT_VALIDATOR_OPTS,
  hasComponentSchemas,
  isReferenceObject,
} from './openapi-validator'
import { DEFAULT_AJV_SETTINGS } from './ajv-opts'
import { merge, openApiMergeRules } from 'allof-merge'

const REQ_BODY_COMPONENT_PREFIX_LENGTH = 27 // #/components/requestBodies/PetBody
const PARAMS_COMPONENT_PREFIX_LENGH = 24 // #/components/parameters/offsetParam
const RESPONSE_COMPONENT_PREFIX_LENGTH = 23 // #/components/responses/Unauthorized

interface RouteValidator {
  path: string
  method: string
  validator: ValidateFunction
}

interface RequestValidator extends RouteValidator {
  required: boolean
}

interface ResponseValidator extends RouteValidator {
  status: string
}

interface ParameterValidator extends RouteValidator {
  param: {
    name: string
    required?: boolean
    allowEmptyValue?: boolean
  }
}

function mapValidatorErrors(validatorErrors: ErrorObject[] | null | undefined): ErrorObj[] {
  if (validatorErrors) {
    const mapped: ErrorObj[] = []
    validatorErrors.forEach((ajvErr) => {
      const mappedErr: ErrorObj = {
        status: STATUS_BAD_REQUEST,
        code: `${EC_VALIDATION}-${ajvErr.keyword}`,
        title: ajvErr.message ?? ET_VALIDATION,
      }

      if (ajvErr.schemaPath) {
        mappedErr.source = {
          pointer: ajvErr.schemaPath,
        }
      }
      mapped.push(mappedErr)
    })
    return mapped
  } else {
    return [
      {
        status: STATUS_BAD_REQUEST,
        code: EC_VALIDATION,
        title: ET_VALIDATION,
      },
    ]
  }
}

export class AjvOpenApiValidator {
  private readonly requestBodyValidators: RequestValidator[] = []
  private readonly responseBodyValidators: ResponseValidator[] = []
  private readonly paramsValidators: ParameterValidator[] = []
  private readonly ajv: Ajv
  private readonly validatorOpts: Required<ValidatorOpts>

  /**
   * @param spec - Parsed OpenAPI V3 specification
   * @param ajvOpts - Optional Ajv options
   * @param validatorOpts - Optional additional validator options
   */
  constructor(spec: OpenAPIV3.Document, validatorOpts?: ValidatorOpts, ajvOpts: Options = DEFAULT_AJV_SETTINGS) {
    // always disable removeAdditional, because it has unexpected results with allOf
    this.ajv = new AjvDraft4({ ...DEFAULT_AJV_SETTINGS, ...ajvOpts, removeAdditional: false })
    this.validatorOpts = validatorOpts ? { ...DEFAULT_VALIDATOR_OPTS, ...validatorOpts } : DEFAULT_VALIDATOR_OPTS
    if (this.validatorOpts.log == undefined) {
      this.validatorOpts.log = () => {}
    }

    this.initialize(spec)
  }

  validateResponseBody(path: string, method: string, status: string | number, data: unknown, strict = true): ErrorObj[] | undefined {
    const validator = this.responseBodyValidators.find(
      (v) => v.path === path?.toLowerCase() && v.method === method?.toLowerCase() && v.status === status + ''
    )?.validator
    if (validator) {
      return this.validateBody(validator, data)
    } else if (data !== undefined && data !== null && strict) {
      return [
        {
          status: STATUS_BAD_REQUEST,
          code: `${EC_VALIDATION}-unexpected-response-body`,
          title: 'A response body is not supported',
        },
      ]
    } else {
      return undefined
    }
  }

  validateRequestBody(path: string, method: string, data: unknown, strict = true): ErrorObj[] | undefined {
    const validator = this.requestBodyValidators.find((v) => v.path === path?.toLowerCase() && v.method === method?.toLowerCase())

    if (data !== undefined && data !== null) {
      if (validator?.validator) {
        return this.validateBody(validator.validator, data)
      } else if (strict) {
        return [
          {
            status: STATUS_BAD_REQUEST,
            code: `${EC_VALIDATION}-unexpected-request-body`,
            title: 'A request body is not supported',
          },
        ]
      }
    } else if (validator?.required) {
      return [
        {
          status: STATUS_BAD_REQUEST,
          code: `${EC_VALIDATION}-missing-request-body`,
          title: 'A request body is required',
        },
      ]
    }

    return undefined
  }

  validateBody(validator: ValidateFunction<unknown>, data: unknown): ErrorObj[] | undefined {
    const filteredData = this.validatorOpts.convertDatesToIsoString ? convertDatesToISOString(data) : data
    const res = validator(filteredData)

    if (!res) {
      return mapValidatorErrors(validator.errors)
    }

    return undefined
  }

  validateQueryParams(path: string, method: string, params: URLSearchParams, strict = true): ErrorObj[] | undefined {
    const parameterDefinitions = this.paramsValidators.filter((p) => p.path === path?.toLowerCase() && p.method === method?.toLowerCase())

    let errResponse: ErrorObj[] = []
    params.forEach((value, key) => {
      const paramDefinitionIndex = parameterDefinitions.findIndex((p) => p.param.name === key?.toLowerCase())
      if (paramDefinitionIndex < 0) {
        if (strict) {
          errResponse.push({
            status: STATUS_BAD_REQUEST,
            code: `${EC_VALIDATION}-invalid-query-parameter`,
            title: 'The query parameter is not supported.',
            source: {
              parameter: key,
            },
          })
        }
      } else {
        const paramDefinition = parameterDefinitions.splice(paramDefinitionIndex, 1)[0]

        const rejectEmptyValues = !(paramDefinition.param.allowEmptyValue === true)
        if (rejectEmptyValues && (value === undefined || value === null || String(value).trim() === '')) {
          errResponse.push({
            status: STATUS_BAD_REQUEST,
            code: `${EC_VALIDATION}-query-parameter`,
            title: 'The query parameter must not be empty.',
            source: {
              parameter: key,
            },
          })
        } else {
          const validator = paramDefinition.validator
          if (!validator) {
            throw new Error('The validator needs to be iniatialized first')
          }

          const res = validator(value)

          if (!res) {
            const validationErrors = mapValidatorErrors(validator.errors)
            errResponse = errResponse.concat(validationErrors)
          }
        }
      }
    })

    if (parameterDefinitions.length) {
      parameterDefinitions
        .filter((p) => p.param.required)
        .forEach((p) => {
          errResponse.push({
            status: STATUS_BAD_REQUEST,
            code: `${EC_VALIDATION}-required-query-parameter`,
            title: 'The query parameter is required.',
            source: {
              parameter: p.param.name,
            },
          })
        })
    }

    return errResponse.length ? errResponse : undefined
  }

  private initialize(origSpec: OpenAPIV3.Document): void {
    const schemaCompileFailures: string[] = []
    const spec: OpenAPIV3.Document = merge(origSpec, { rules: openApiMergeRules() })

    if (hasComponentSchemas(spec)) {
      Object.keys(spec.components.schemas).forEach((key) => {
        const schema = spec.components.schemas[key]
        if (this.validatorOpts.setAdditionalPropertiesToFalse === true) {
          if (!isReferenceObject(schema) && schema.additionalProperties === undefined && schema.discriminator === undefined) {
            schema.additionalProperties = false
          }
        }

        this.validatorOpts.log(`Adding schema '#/components/schemas/${key}'`)
        this.ajv.addSchema(schema, `#/components/schemas/${key}`)
      })
    }

    if (spec.paths) {
      for (const pathEntries of Object.entries(spec.paths)) {
        const path = pathEntries[0]
        const pathDetail = pathEntries[1]

        if (!pathDetail) {
          if (this.validatorOpts.strict) {
            throw new Error('Expected to find detail for ' + path)
          } else {
            continue
          }
        }

        for (const methodEntry of Object.entries(pathDetail)) {
          const method = methodEntry[0] as OpenAPIV3.HttpMethods
          const operation = methodEntry[1] as OpenAPIV3.OperationObject

          if (operation.requestBody) {
            let schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined
            let required = false

            if (isReferenceObject(operation.requestBody)) {
              let errorStr: string | undefined

              if (operation.requestBody.$ref.length > REQ_BODY_COMPONENT_PREFIX_LENGTH) {
                const requestBodyName = operation.requestBody.$ref.substring(REQ_BODY_COMPONENT_PREFIX_LENGTH)
                if (spec.components?.requestBodies && spec.components?.requestBodies[requestBodyName]) {
                  const response = spec.components?.requestBodies[requestBodyName]
                  if (!isReferenceObject(response)) {
                    schema = response.content['application/json']?.schema
                    required = !!response.required
                  } else {
                    errorStr = `A reference was not expected here: '${response.$ref}'`
                  }
                } else {
                  errorStr = `Unable to find request body reference '${operation.requestBody.$ref}'`
                }
              } else {
                errorStr = `Unable to follow request body reference '${operation.requestBody.$ref}'`
              }
              if (errorStr && this.validatorOpts.strict) {
                throw new Error(errorStr)
              }
            } else if (operation.requestBody.content['application/json']) {
              schema = operation.requestBody.content['application/json'].schema
              required = !!operation.requestBody.required
            }

            if (schema) {
              const schemaName = `#/paths${path.replace(/[{}]/g, '')}/${method}/requestBody`
              this.validatorOpts.log(
                `Adding request body validator '${path}', '${method}' with schema '${schemaName}' (required: ${required})`
              )
              this.ajv.addSchema(schema, schemaName)
              const validator = this.ajv.compile({ $ref: schemaName })
              this.requestBodyValidators.push({
                path: path.toLowerCase(),
                method: method.toLowerCase() as string,
                validator,
                required: required,
              })
            }
          }

          if (operation.responses) {
            Object.keys(operation.responses).forEach((key) => {
              const response = operation.responses[key]

              let schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined

              if (isReferenceObject(response)) {
                let errorStr: string | undefined

                if (response.$ref.length > RESPONSE_COMPONENT_PREFIX_LENGTH) {
                  const respName = response.$ref.substring(RESPONSE_COMPONENT_PREFIX_LENGTH)
                  if (spec.components?.responses && spec.components?.responses[respName]) {
                    const response = spec.components?.responses[respName]
                    if (!isReferenceObject(response)) {
                      schema = response.content ? response.content['application/json']?.schema : undefined
                    } else {
                      errorStr = `A reference was not expected here: '${response.$ref}'`
                    }
                  } else {
                    errorStr = `Unable to find response reference '${response.$ref}'`
                  }
                } else {
                  errorStr = `Unable to follow response reference '${response.$ref}'`
                }
                if (errorStr && this.validatorOpts.strict) {
                  throw new Error(errorStr)
                }
              } else if (response.content) {
                schema = response.content['application/json']?.schema
              }

              if (schema) {
                const schemaName = `#/paths${path.replace(/[{}]/g, '')}/${method}/response/${key}`
                this.validatorOpts.log(`Adding response body validator '${path}', '${method}', '${key}' with schema '${schemaName}'`)
                this.ajv.addSchema(schema, schemaName)
                const validator = this.ajv.compile({ $ref: schemaName })
                this.responseBodyValidators.push({
                  path: path.toLowerCase(),
                  method: method.toLowerCase() as string,
                  status: key,
                  validator,
                })
              }
            })
          }

          if (operation.parameters) {
            operation.parameters.forEach((param) => {
              let resolvedParam: OpenAPIV3.ParameterObject | undefined

              if (isReferenceObject(param)) {
                let errorStr: string | undefined

                if (param.$ref.length > PARAMS_COMPONENT_PREFIX_LENGH) {
                  const paramName = param.$ref.substring(PARAMS_COMPONENT_PREFIX_LENGH)
                  if (spec.components?.parameters && spec.components?.parameters[paramName]) {
                    const paramValue = spec.components?.parameters[paramName]
                    if (!isReferenceObject(paramValue)) {
                      resolvedParam = paramValue
                    } else {
                      errorStr = `A reference was not expected here: '${param.$ref}'`
                    }
                  } else {
                    errorStr = `Unable to find parameter reference '${param.$ref}'`
                  }
                } else {
                  errorStr = `Unable to follow parameter reference '${param.$ref}'`
                }
                if (errorStr && this.validatorOpts.strict) {
                  throw new Error(errorStr)
                }
              } else {
                resolvedParam = param
              }

              // TODO could also add support for other parameters such as headers here
              if (resolvedParam?.in === 'query' && resolvedParam.schema) {
                const schemaName = `#/paths${path.replace(/[{}]/g, '')}/${method}/parameters/${resolvedParam.name}`
                this.validatorOpts.log(`Adding parameter validator '${path}', '${method}', '${resolvedParam.name}'`)
                this.ajv.addSchema(resolvedParam.schema, schemaName)
                const validator = this.ajv.compile({ $ref: schemaName })
                this.paramsValidators.push({
                  path: path.toLowerCase(),
                  method: method.toLowerCase() as string,
                  param: {
                    name: resolvedParam.name?.toLowerCase(),
                    required: resolvedParam.required,
                    allowEmptyValue: resolvedParam.allowEmptyValue,
                  },
                  validator,
                })
              }
            })
          }
        }
      }
    }

    if (this.validatorOpts.strict && schemaCompileFailures.length > 0) {
      throw new Error('The following schemas failed to compile: ' + schemaCompileFailures.join(', '))
    }
  }
}
