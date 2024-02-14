/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable no-invalid-this */
import Ajv, { ErrorObject, ValidateFunction } from 'ajv'
import OpenapiRequestCoercer from 'openapi-request-coercer'
import { Logger, dummyLogger } from 'ts-log'
import { OpenAPIV3 } from 'openapi-types'
import {
  convertDatesToISOString,
  ErrorObj,
  ValidatorOpts,
  HttpStatus,
  EC_VALIDATION,
  ET_VALIDATION,
  DEFAULT_VALIDATOR_OPTS,
  hasComponentSchemas,
  isValidReferenceObject,
  Primitive,
  isURLSearchParams,
  unserializeParameters,
} from './openapi-validator'
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

interface PathMethodParameterCoercer {
  path: string
  method: string
  coercer: OpenapiRequestCoercer
}

function mapValidatorErrors(validatorErrors: ErrorObject[] | null | undefined, status: HttpStatus): ErrorObj[] {
  if (validatorErrors) {
    const mapped: ErrorObj[] = []
    validatorErrors.forEach((ajvErr) => {
      const mappedErr: ErrorObj = {
        status,
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
        status,
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
  private readonly validatorOpts: Required<ValidatorOpts>
  private requestCoercers: PathMethodParameterCoercer[] = []

  /**
   * @param spec - Parsed OpenAPI V3 specification
   * @param ajv - Ajv instance
   */
  constructor(
    spec: OpenAPIV3.Document,
    private ajv: Ajv,
    validatorOpts?: ValidatorOpts
  ) {
    this.validatorOpts = validatorOpts ? { ...DEFAULT_VALIDATOR_OPTS, ...validatorOpts } : DEFAULT_VALIDATOR_OPTS
    if (this.validatorOpts.logger == undefined) {
      this.validatorOpts.logger = dummyLogger
    }

    this.initialize(spec, this.validatorOpts.coerceTypes)
  }

  validateQueryParams(
    path: string,
    method: string,
    origParams: Record<string, Primitive> | URLSearchParams,
    strict = true,
    logger?: Logger
  ): ErrorObj[] | undefined {
    const parameterDefinitions = this.paramsValidators.filter((p) => p.path === path?.toLowerCase() && p.method === method?.toLowerCase())

    const log = logger ? logger : this.validatorOpts.logger
    let errResponse: ErrorObj[] = []

    let params = isURLSearchParams(origParams)
      ? Array.from(origParams.entries()).reduce(
          (acc, [key, value]) => {
            acc[key] = value
            return acc
          },
          {} as Record<string, Primitive>
        )
      : origParams

    const requestCoercer = this.requestCoercers.find((p) => p.path === path?.toLowerCase() && p.method === method?.toLowerCase())
    if (requestCoercer && Object.keys(params).length > 0) {
      log.debug(`Unserializing and coercing query parameters (${method} ${path})`)
      params = unserializeParameters(params)
      requestCoercer.coercer.coerce({
        query: params,
      })
    }

    for (const key in params) {
      const value = params[key]
      const paramDefinitionIndex = parameterDefinitions.findIndex((p) => p.param.name === key?.toLowerCase())
      if (paramDefinitionIndex < 0) {
        if (strict) {
          errResponse.push({
            status: HttpStatus.BAD_REQUEST,
            code: `${EC_VALIDATION}-invalid-query-parameter`,
            title: 'The query parameter is not supported.',
            source: {
              parameter: key,
            },
          })
        } else {
          log.debug(`Query parameter '${key}' not specified and strict mode is disabled -> ignoring it (${method} ${path})`)
        }
      } else {
        const paramDefinition = parameterDefinitions.splice(paramDefinitionIndex, 1)[0]

        const rejectEmptyValues = !(paramDefinition.param.allowEmptyValue === true)
        if (rejectEmptyValues && (value === undefined || value === null || String(value).trim() === '')) {
          errResponse.push({
            status: HttpStatus.BAD_REQUEST,
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
            const validationErrors = mapValidatorErrors(validator.errors, HttpStatus.BAD_REQUEST)
            errResponse = errResponse.concat(validationErrors)
          }
        }
      }
    }

    if (parameterDefinitions.length) {
      parameterDefinitions
        .filter((p) => p.param.required)
        .forEach((p) => {
          errResponse.push({
            status: HttpStatus.BAD_REQUEST,
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

  validateRequestBody(path: string, method: string, data: unknown, strict = true, logger?: Logger): ErrorObj[] | undefined {
    const validator = this.requestBodyValidators.find((v) => v.path === path?.toLowerCase() && v.method === method?.toLowerCase())
    const log = logger ? logger : this.validatorOpts.logger

    if (data !== undefined && data !== null) {
      if (validator?.validator) {
        return this.validateBody(validator.validator, data, HttpStatus.BAD_REQUEST)
      } else {
        if (strict) {
          return [
            {
              status: HttpStatus.BAD_REQUEST,
              code: `${EC_VALIDATION}-unexpected-request-body`,
              title: 'A request body is not supported',
            },
          ]
        } else {
          log.debug(`Request body is present, but not specified. Strict mode is disabled -> ignoring it (${method} ${path})`)
        }
      }
    } else if (validator?.required) {
      return [
        {
          status: HttpStatus.BAD_REQUEST,
          code: `${EC_VALIDATION}-missing-request-body`,
          title: 'A request body is required',
        },
      ]
    }

    return undefined
  }

  validateResponseBody(
    path: string,
    method: string,
    status: string | number,
    data: unknown,
    strict = true,
    logger?: Logger
  ): ErrorObj[] | undefined {
    const log = logger ? logger : this.validatorOpts.logger
    const validator = this.responseBodyValidators.find(
      (v) => v.path === path?.toLowerCase() && v.method === method?.toLowerCase() && v.status === status + ''
    )?.validator
    if (validator) {
      return this.validateBody(validator, data, HttpStatus.INTERNAL_SERVER_ERROR)
    } else if (data !== undefined && data !== null) {
      if (strict) {
        return [
          {
            status: HttpStatus.INTERNAL_SERVER_ERROR,
            code: `${EC_VALIDATION}-unexpected-response-body`,
            title: 'A response body is not supported',
          },
        ]
      } else {
        log.debug(`Response body is present, but not specified. Strict mode is disabled -> ignoring it (${method} ${path})`)
      }
    }

    return undefined
  }

  validateBody(validator: ValidateFunction<unknown>, data: unknown, errStatus: HttpStatus): ErrorObj[] | undefined {
    const filteredData = this.validatorOpts.convertDatesToIsoString ? convertDatesToISOString(data) : data
    const res = validator(filteredData)

    if (!res) {
      return mapValidatorErrors(validator.errors, errStatus)
    }

    return undefined
  }

  private initialize(origSpec: OpenAPIV3.Document, coerceTypes: boolean): void {
    const schemaCompileFailures: string[] = []
    const spec: OpenAPIV3.Document = merge(origSpec, { rules: openApiMergeRules() })

    if (hasComponentSchemas(spec)) {
      Object.keys(spec.components.schemas).forEach((key) => {
        const schema = spec.components.schemas[key]
        if (this.validatorOpts.setAdditionalPropertiesToFalse === true) {
          if (!isValidReferenceObject(schema) && schema.additionalProperties === undefined && schema.discriminator === undefined) {
            schema.additionalProperties = false
          }
        }

        this.validatorOpts.logger.info(`Adding schema '#/components/schemas/${key}'`)
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
            this.validatorOpts.logger.warn('Expected to find detail for ' + path)
            continue
          }
        }

        for (const methodEntry of Object.entries(pathDetail)) {
          const method = methodEntry[0] as OpenAPIV3.HttpMethods
          const operation = methodEntry[1] as OpenAPIV3.OperationObject

          if (operation.requestBody) {
            let schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject | undefined
            let required = false

            if (isValidReferenceObject(operation.requestBody)) {
              let errorStr: string | undefined

              if (operation.requestBody.$ref.length > REQ_BODY_COMPONENT_PREFIX_LENGTH) {
                const requestBodyName = operation.requestBody.$ref.substring(REQ_BODY_COMPONENT_PREFIX_LENGTH)
                if (spec.components?.requestBodies && spec.components?.requestBodies[requestBodyName]) {
                  const response = spec.components?.requestBodies[requestBodyName]
                  if (!isValidReferenceObject(response)) {
                    schema = this.getJsonContent(response.content)?.schema
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
              if (errorStr) {
                this.validatorOpts.logger.warn(errorStr)
                if (this.validatorOpts.strict) {
                  throw new Error(errorStr)
                }
              }
            } else {
              const content = this.getJsonContent(operation.requestBody.content)
              if (content) {
                schema = content.schema
                required = !!operation.requestBody.required
              }
            }

            if (schema) {
              const schemaName = `#/paths${path.replace(/[{}]/g, '')}/${method}/requestBody`
              this.validatorOpts.logger.info(
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

              if (isValidReferenceObject(response)) {
                let errorStr: string | undefined

                if (response.$ref.length > RESPONSE_COMPONENT_PREFIX_LENGTH) {
                  const respName = response.$ref.substring(RESPONSE_COMPONENT_PREFIX_LENGTH)
                  if (spec.components?.responses && spec.components?.responses[respName]) {
                    const response = spec.components?.responses[respName]
                    if (!isValidReferenceObject(response)) {
                      const content = this.getJsonContent(response.content)
                      schema = content ? content.schema : undefined
                    } else {
                      errorStr = `A reference was not expected here: '${response.$ref}'`
                    }
                  } else {
                    errorStr = `Unable to find response reference '${response.$ref}'`
                  }
                } else {
                  errorStr = `Unable to follow response reference '${response.$ref}'`
                }
                if (errorStr) {
                  if (this.validatorOpts.strict) {
                    throw new Error(errorStr)
                  } else {
                    this.validatorOpts.logger.warn(errorStr)
                  }
                }
              } else if (response.content) {
                schema = this.getJsonContent(response.content)?.schema
              }

              if (schema) {
                const schemaName = `#/paths${path.replace(/[{}]/g, '')}/${method}/response/${key}`
                this.validatorOpts.logger.info(
                  `Adding response body validator '${path}', '${method}', '${key}' with schema '${schemaName}'`
                )
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
            const resolvedParams: OpenAPIV3.ParameterObject[] = []
            operation.parameters.forEach((param) => {
              let resolvedParam: OpenAPIV3.ParameterObject | undefined

              if (isValidReferenceObject(param)) {
                let errorStr: string | undefined
                if (param.$ref.length > PARAMS_COMPONENT_PREFIX_LENGH) {
                  const paramName = param.$ref.substring(PARAMS_COMPONENT_PREFIX_LENGH)
                  if (spec.components?.parameters && spec.components?.parameters[paramName]) {
                    const paramValue = spec.components?.parameters[paramName]
                    if (!isValidReferenceObject(paramValue)) {
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
                if (errorStr) {
                  if (this.validatorOpts.strict) {
                    throw new Error(errorStr)
                  } else {
                    this.validatorOpts.logger.warn(errorStr)
                  }
                }
              } else {
                resolvedParam = param
              }

              // TODO could also add support for other parameters such as headers here
              if (resolvedParam?.in === 'query' && resolvedParam.schema) {
                const schemaName = `#/paths${path.replace(/[{}]/g, '')}/${method}/parameters/${resolvedParam.name}`
                this.validatorOpts.logger.info(`Adding parameter validator '${path}', '${method}', '${resolvedParam.name}'`)
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

                if (coerceTypes && isValidReferenceObject(resolvedParam.schema)) {
                  const fullyResolved = this.fullyResolveParameter(spec, resolvedParam)
                  if (fullyResolved) {
                    resolvedParams.push(fullyResolved)
                  }
                } else {
                  resolvedParams.push(resolvedParam)
                }
              }
            })

            if (this.validatorOpts.coerceTypes == true && resolvedParams.length > 0) {
              this.requestCoercers.push({
                path: path.toLowerCase(),
                method: method.toLowerCase() as string,
                coercer: new OpenapiRequestCoercer({
                  logger: this.validatorOpts.logger,
                  enableObjectCoercion: true,
                  parameters: resolvedParams,
                }),
              })
            }
          }
        }
      }
    }

    if (this.validatorOpts.strict && schemaCompileFailures.length > 0) {
      throw new Error('The following schemas failed to compile: ' + schemaCompileFailures.join(', '))
    }
  }

  private getJsonContent(content?: { [media: string]: OpenAPIV3.MediaTypeObject }): OpenAPIV3.MediaTypeObject | undefined {
    if (!content) {
      return undefined
    } else if (content['application/json']) {
      return content['application/json']
    } else if (content['application/json; charset=utf-8']) {
      return content['application/json; charset=utf-8']
    } else {
      const key = Object.keys(content).find((key) => key.toLowerCase().startsWith('application/json;'))
      return key ? content[key] : undefined
    }
  }

  private resolveRef(document: OpenAPIV3.Document, ref: string): OpenAPIV3.SchemaObject {
    const pathParts = ref.split('/')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return pathParts.reduce((current: any, part) => {
      if (part === '#' || part === '') return current
      return current ? current[part] : undefined
    }, document)
  }

  private fullyResolveSchemaRefs(
    document: OpenAPIV3.Document,
    schema: OpenAPIV3.SchemaObject | OpenAPIV3.ReferenceObject,
    visited: Map<string, OpenAPIV3.SchemaObject> = new Map<string, OpenAPIV3.SchemaObject>()
  ): OpenAPIV3.SchemaObject | undefined {
    if (typeof schema !== 'object') {
      return undefined
    }

    if (isValidReferenceObject(schema)) {
      const resolved = visited.get(schema.$ref)
      if (resolved) {
        return resolved
      }
    }

    let resolvedSchema
    if (isValidReferenceObject(schema)) {
      resolvedSchema = this.resolveRef(document, schema.$ref) as OpenAPIV3.SchemaObject
      visited.set(schema.$ref, resolvedSchema)
    } else {
      resolvedSchema = schema
    }

    for (const key in resolvedSchema) {
      if (typeof resolvedSchema[key as keyof OpenAPIV3.SchemaObject] === 'object') {
        resolvedSchema[key as keyof OpenAPIV3.SchemaObject] = this.fullyResolveSchemaRefs(
          document,
          resolvedSchema[key as keyof OpenAPIV3.SchemaObject],
          visited
        )
      }
    }

    return resolvedSchema
  }

  private fullyResolveParameter(document: OpenAPIV3.Document, parameter: OpenAPIV3.ParameterObject): OpenAPIV3.ParameterObject | undefined {
    if (!parameter.schema || typeof parameter.schema !== 'object' || !isValidReferenceObject(parameter.schema)) {
      return parameter
    }

    return { ...parameter, schema: this.fullyResolveSchemaRefs(document, parameter.schema) }
  }
}
