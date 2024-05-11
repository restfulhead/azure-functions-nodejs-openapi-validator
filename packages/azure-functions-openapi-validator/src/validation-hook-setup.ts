/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  HttpHandler,
  HttpRequest,
  HttpResponse,
  HttpResponseInit,
  InvocationContext,
  PostInvocationContext,
  PostInvocationHandler,
  PreInvocationContext,
  PreInvocationHandler,
} from '@azure/functions'
import { AjvOpenApiValidator, EC_VALIDATION, HttpStatus } from '@restfulhead/ajv-openapi-request-response-validator'
import { LogLevel, STATUS_CODE_OK, createJsonResponse, logMessage } from './helper'

export const HOOK_DATA_QUERY_PARAM_VALIDATION_ERROR_KEY = '@restfulhead/azure-functions-openapi-validator/query-param-validation-error'
export const HOOK_DATA_REQUEST_BODY_VALIDATION_ERROR_KEY = '@restfulhead/azure-functions-openapi-validator/request-body-validation-error'
export const HOOK_DATA_NORMALIZED_QUERY_PARAMS_KEY = '@restfulhead/azure-functions-openapi-validator/normalized-query-params'

export interface ValidationMode {
  /** whether to return an error response in case of a validation error instead of the actual function result */
  returnErrorResponse: boolean
  /** whether to log the validation error */
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'off'
  /** if false, extranious query parameters, request and response body are ignored */
  strict: boolean
}

export interface ExclusionValidationOpts {
  queryParameter: boolean | ValidationMode
  requestBody: boolean | ValidationMode
  responseBody: boolean | ValidationMode
}

export interface ExcludeByPathAndMethod {
  path: string
  method: string
  validation: false | ExclusionValidationOpts
}

export interface ValidatorHookOptions {
  /** whether to validate query parameters and return an error response or log any errors */
  queryParameterValidationMode:
    | (ValidationMode & {
        /** ignores extranious query parameters defined here even if `strict` is `true`.  */
        strictExclusions?: string[]
      })
    | false

  /** whether to validate the request body and return an error response or log any errors */
  requestBodyValidationMode: ValidationMode | false

  /** whether to validate the response body and return an error response or log any errors */
  responseBodyValidationMode: ValidationMode | false

  /** exclude specific path + method endpoints from validation */
  exclude?: ExcludeByPathAndMethod[]

  /** exclude  */
  filterOutQueryParams?: string[]
}

/**
 * The default hook options prevent further execution if query parameter or request body validation fails and returns an error message
 * instead. Response body validation errors are instead logged as a warning, but still return the orginal function result.
 */
export const DEFAULT_HOOK_OPTIONS: ValidatorHookOptions = {
  queryParameterValidationMode: {
    returnErrorResponse: true,
    logLevel: 'info',
    strict: true,
    strictExclusions: ['code'], // ignore Azure Functions auth code if present, but not specified in the OpenAPI spec
  },

  requestBodyValidationMode: {
    returnErrorResponse: true,
    logLevel: 'info',
    strict: true,
  },

  responseBodyValidationMode: {
    returnErrorResponse: false,
    logLevel: 'warn',
    strict: true,
  },
}

const GENERIC_RESPONSE_VALIDATION_ERR_MSG = 'Response body validation failed'

function hasRequestBody(request: HttpRequest): boolean {
  return request && request.body !== undefined && request.body !== null
}

function hasResponseBody(response: HttpResponse): boolean {
  return response && response.body !== undefined && response.body !== null
}

function getExclusion(
  context: InvocationContext,
  path: string,
  method: string,
  exclude?: ExcludeByPathAndMethod[]
): ExcludeByPathAndMethod | undefined {
  const result = exclude?.find((ex) => {
    const exPath = ex.path.startsWith('/') ? ex.path : `/${ex.path}`
    return exPath.toLowerCase() === path.toLowerCase() && ex.method.toLowerCase() === method.toLowerCase()
  })
  if (result) {
    context.debug('Found exclusion configuration', { method, path, validation: result.validation })
  }
  return result
}

function getStrictValidationMode(exclusion: undefined | boolean | ValidationMode, defaultValidation: ValidationMode): boolean {
  if (exclusion === false) {
    return false
  } else if (exclusion === true) {
    return true
  }
  if (typeof exclusion === 'object') {
    return exclusion.strict
  }
  return defaultValidation.strict
}

function getLogLevelValidationMode(exclusion: undefined | boolean | ValidationMode, defaultValidation: ValidationMode): LogLevel {
  if (exclusion === false) {
    return 'off'
  }
  if (exclusion === true) {
    return 'warn'
  }

  if (typeof exclusion === 'object') {
    return exclusion.logLevel
  }
  return defaultValidation.logLevel
}

function getReturnErrorResponseValidationMode(exclusion: undefined | boolean | ValidationMode, defaultValidation: ValidationMode): boolean {
  if (exclusion === false) {
    return false
  } else if (exclusion === true) {
    return true
  }
  if (typeof exclusion === 'object') {
    return exclusion.returnErrorResponse
  }
  return defaultValidation.returnErrorResponse
}

export function configureValidationPreInvocationHandler(
  validator: AjvOpenApiValidator,
  opts: ValidatorHookOptions = DEFAULT_HOOK_OPTIONS
): PreInvocationHandler {
  return (preContext: PreInvocationContext) => {
    if (preContext.invocationContext.options.trigger.type === 'httpTrigger') {
      const originalHandler = preContext.functionHandler as HttpHandler
      const path = '/' + preContext.invocationContext.options.trigger.route

      preContext.functionHandler = async (origRequest: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        let request = origRequest
        const method = request.method
        const exclusion = getExclusion(context, path, method, opts.exclude)

        if (opts.queryParameterValidationMode && (!exclusion || (exclusion.validation !== false && exclusion.validation.queryParameter))) {
          context.debug(`Validating query parameters '${path}', '${method}'`)
          const reqParamsValResult = validator.validateQueryParams(
            path,
            method,
            request.query,
            getStrictValidationMode((exclusion?.validation as ExclusionValidationOpts)?.queryParameter, opts.queryParameterValidationMode),
            opts.queryParameterValidationMode.strictExclusions,
            context
          )

          preContext.hookData[HOOK_DATA_NORMALIZED_QUERY_PARAMS_KEY] = reqParamsValResult.normalizedParams

          if (reqParamsValResult?.errors) {
            const logLevel = getLogLevelValidationMode(
              (exclusion?.validation as ExclusionValidationOpts)?.queryParameter,
              opts.queryParameterValidationMode
            )
            if (logLevel !== 'off') {
              logMessage(`Query param validation error: ${JSON.stringify(reqParamsValResult.errors)}`, logLevel, context)
            }

            if (
              getReturnErrorResponseValidationMode(
                (exclusion?.validation as ExclusionValidationOpts)?.queryParameter,
                opts.queryParameterValidationMode
              )
            ) {
              preContext.hookData[HOOK_DATA_QUERY_PARAM_VALIDATION_ERROR_KEY] = true
              return Promise.resolve(createJsonResponse({ errors: reqParamsValResult.errors }, HttpStatus.BAD_REQUEST))
            }
          }
        }

        if (opts.requestBodyValidationMode && (!exclusion || (exclusion.validation !== false && exclusion.validation.requestBody))) {
          context.debug(`Validating request body for '${path}', '${method}'`)

          const logLevel = getLogLevelValidationMode(
            (exclusion?.validation as ExclusionValidationOpts)?.requestBody,
            opts.requestBodyValidationMode
          )

          const contentType = request.headers.get('Content-Type')
          if (hasRequestBody(request) && (!contentType || !contentType.includes('application/json'))) {
            const msg = contentType
              ? `Request body of type '${contentType}' is not supported and won't be validated. You should exclude this route from validation to avoid this warning. (Request: ${method} ${path})`
              : `Request header 'Content-Type' is missing. Request body won't be validated. Send 'application/json' in request header or exclude this route from validation to avoid this error. (Request: ${method} ${path})`

            if (logLevel !== 'off') {
              logMessage(msg, logLevel, context)
            }

            if (opts.requestBodyValidationMode.returnErrorResponse) {
              preContext.hookData[HOOK_DATA_REQUEST_BODY_VALIDATION_ERROR_KEY] = true
              return Promise.resolve(
                createJsonResponse(
                  {
                    errors: [
                      {
                        status: HttpStatus.BAD_REQUEST,
                        code: contentType ? `${EC_VALIDATION}-invalid-content-type-header` : `${EC_VALIDATION}-missing-content-type-header`,
                        title: contentType
                          ? `The content type '${contentType}' is not supported.`
                          : "The request header 'Content-Type' is missing",
                      },
                    ],
                  },
                  HttpStatus.BAD_REQUEST
                )
              )
            }
          } else {
            let parsedBody
            if (hasRequestBody(request)) {
              // a copy is necessary, because the request body can only be consumed once
              // see https://github.com/Azure/azure-functions-nodejs-library/issues/79#issuecomment-1875214147
              request = origRequest.clone()

              parsedBody = await origRequest.json()
            }

            const reqBodyValResult = validator.validateRequestBody(
              path,
              method,
              parsedBody,
              getStrictValidationMode((exclusion?.validation as ExclusionValidationOpts)?.requestBody, opts.requestBodyValidationMode),
              context
            )
            if (reqBodyValResult) {
              if (logLevel !== 'off') {
                logMessage(`Request body validation error: ${JSON.stringify(reqBodyValResult)}`, logLevel, context)
              }

              if (
                getReturnErrorResponseValidationMode(
                  (exclusion?.validation as ExclusionValidationOpts)?.requestBody,
                  opts.requestBodyValidationMode
                )
              ) {
                preContext.hookData[HOOK_DATA_REQUEST_BODY_VALIDATION_ERROR_KEY] = true
                return Promise.resolve(createJsonResponse({ errors: reqBodyValResult }, HttpStatus.BAD_REQUEST))
              }
            }
          }
        }
        return await originalHandler(request, context)
      }
    }
  }
}

export function configureValidationPostInvocationHandler(
  validator: AjvOpenApiValidator,
  opts: ValidatorHookOptions = DEFAULT_HOOK_OPTIONS
): PostInvocationHandler {
  return async (postContext: PostInvocationContext) => {
    const context = postContext.invocationContext

    if (context.options.trigger.type === 'httpTrigger') {
      if (
        postContext.hookData[HOOK_DATA_QUERY_PARAM_VALIDATION_ERROR_KEY] ||
        postContext.hookData[HOOK_DATA_REQUEST_BODY_VALIDATION_ERROR_KEY]
      ) {
        context.debug('Skipping response body validation due to request validation errors')
        return
      }

      if (!postContext.inputs || postContext.inputs.length < 1) {
        context.error('No request input found in post invocation context')
        return
      }

      const path = '/' + context.options.trigger.route
      const request = postContext.inputs[0] as HttpRequest
      const method = request.method
      const exclusion = getExclusion(context, path, method, opts.exclude)
      const origResponse = new HttpResponse(postContext.result as HttpResponseInit)

      if (opts.responseBodyValidationMode && (!exclusion || (exclusion.validation !== false && exclusion.validation.responseBody))) {
        context.debug(`Validating response body for '${path}', '${method}', '${origResponse.status}'`)

        const logLevel = getLogLevelValidationMode(
          (exclusion?.validation as ExclusionValidationOpts)?.responseBody,
          opts.responseBodyValidationMode
        )

        const contentType = origResponse.headers.get('Content-Type')
        if (hasResponseBody(origResponse) && (!contentType || !contentType.includes('application/json'))) {
          const msg = contentType
            ? `Response body of type '${contentType}' is not supported and won't be validated. You should exclude this route from validation to avoid this warning. (Request: ${method} ${path})`
            : `Response header 'Content-Type' is missing. Response body won't be validated. Send 'application/json' in the response header or exclude this route from validation to avoid this error. (Request: ${method} ${path})`

          if (logLevel !== 'off') {
            logMessage(msg, logLevel, context)
          }

          if (opts.responseBodyValidationMode.returnErrorResponse) {
            postContext.result = createJsonResponse(
              {
                errors: [
                  {
                    status: HttpStatus.INTERNAL_SERVER_ERROR,
                    code: contentType ? `${EC_VALIDATION}-invalid-content-type-header` : `${EC_VALIDATION}-missing-content-type-header`,
                    title: GENERIC_RESPONSE_VALIDATION_ERR_MSG,
                  },
                ],
              },
              HttpStatus.INTERNAL_SERVER_ERROR
            )
          }
        } else {
          let responseBody
          if (hasResponseBody(origResponse)) {
            // a copy is necessary, because the response body can only be consumed once
            const clonedResponse = origResponse.clone()

            try {
              responseBody = await clonedResponse.json()
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (err: any) {
              throw new Error(`Error parsing response body of ${method} ${path}: ${err.message}`)
            }
          }

          const respBodyValResult = validator.validateResponseBody(
            path,
            method,
            origResponse.status ?? STATUS_CODE_OK,
            responseBody,
            getStrictValidationMode((exclusion?.validation as ExclusionValidationOpts)?.responseBody, opts.responseBodyValidationMode),
            context
          )

          if (respBodyValResult) {
            if (logLevel !== 'off') {
              logMessage(`Response body validation error: ${JSON.stringify(respBodyValResult)}`, logLevel, context)
            }

            if (
              getReturnErrorResponseValidationMode(
                (exclusion?.validation as ExclusionValidationOpts)?.responseBody,
                opts.responseBodyValidationMode
              )
            ) {
              postContext.result = createJsonResponse(
                {
                  errors: [
                    {
                      status: HttpStatus.INTERNAL_SERVER_ERROR,
                      code: EC_VALIDATION,
                      title: GENERIC_RESPONSE_VALIDATION_ERR_MSG,
                    },
                  ],
                },
                HttpStatus.INTERNAL_SERVER_ERROR
              )
            }
          }
        }
      }
    }
  }
}
