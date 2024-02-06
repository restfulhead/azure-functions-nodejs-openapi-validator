import {
  HttpHandler,
  HttpRequest,
  HttpResponse,
  HttpResponseInit,
  InvocationContext,
  PreInvocationContext,
  PreInvocationHandler,
} from '@azure/functions'
import { AjvOpenApiValidator } from '@restfulhead/ajv-openapi-request-response-validator'
import { createJsonResponse, logMessage } from './helper'

export interface ValidationMode {
  /** whether to return an error response in case of a validation error instead of the actual function result */
  returnErrorResponse: boolean
  /** whether to log the validation error */
  logLevel: 'debug' | 'info' | 'warn' | 'error' | 'off'
  strict: boolean
}

export interface ValidatorHookOptions {
  /** whether to validate query parameters and return an error response or log any errors */
  queryParameterValidationMode: ValidationMode | false

  /** whether to validate the request body and return an error response or log any errors */
  requestBodyValidationMode: ValidationMode | false

  /** whether to validate the response body and return an error response or log any errors */
  responseBodyValidationMode: ValidationMode | false

  /** exclude specific path + method endpoints from validation */
  exclude?: { path: string; method: string; validation: false | { queryParmeter: boolean; requestBody: boolean; responseBody: boolean } }[]
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

function isHttpResponseWithBody(response: HttpResponseInit | HttpResponse): response is HttpResponse {
  return response && (response as HttpResponse).body !== undefined
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
        const exclusion = opts.exclude?.find(
          (exclusion) => exclusion.path.toLowerCase() === path.toLowerCase() && exclusion.method.toLowerCase() === method.toLowerCase()
        )

        if (
          opts.queryParameterValidationMode &&
          (!exclusion || (exclusion.validation !== false && exclusion.validation.queryParmeter !== false))
        ) {
          context.debug(`Validating query parameters '${path}', '${method}'`)
          const reqParamsValResult = validator.validateQueryParams(path, method, request.query, opts.queryParameterValidationMode.strict)
          if (reqParamsValResult) {
            preContext.hookData.requestQueryParameterValidationError = true

            if (opts.queryParameterValidationMode.logLevel !== 'off') {
              logMessage(
                `Query param validation error: ${JSON.stringify(reqParamsValResult)}`,
                opts.queryParameterValidationMode.logLevel,
                context
              )
            }

            if (opts.queryParameterValidationMode.returnErrorResponse) {
              return Promise.resolve(createJsonResponse(reqParamsValResult, 400))
            }
          }
        }

        if (
          opts.requestBodyValidationMode &&
          request.headers.get('content-type')?.includes('application/json') &&
          (!exclusion || (exclusion.validation !== false && exclusion.validation.requestBody !== false))
        ) {
          context.debug(`Validating request body for '${path}', '${method}'`)

          let parsedBody = undefined
          if (request.body) {
            // a copy is necessary, because the request body can only be consumed once
            // see https://github.com/Azure/azure-functions-nodejs-library/issues/79#issuecomment-1875214147
            request = origRequest.clone()

            parsedBody = await origRequest.json()
          }

          const reqBodyValResult = validator.validateRequestBody(path, method, parsedBody, opts.requestBodyValidationMode.strict)
          if (reqBodyValResult) {
            preContext.hookData.requestBodyValidationError = true

            if (opts.requestBodyValidationMode.logLevel !== 'off') {
              logMessage(
                `Request body validation error: ${JSON.stringify(reqBodyValResult)}`,
                opts.requestBodyValidationMode.logLevel,
                context
              )
            }

            if (opts.requestBodyValidationMode.returnErrorResponse) {
              return Promise.resolve(createJsonResponse(reqBodyValResult, 400))
            }
          }
        }

        let response = await originalHandler(request, context)

        if (
          opts.responseBodyValidationMode &&
          (!exclusion || (exclusion.validation !== false && exclusion.validation.responseBody !== false))
        ) {
          context.debug(`Validating response body for '${path}', '${method}', '${response.status}'`)

          let responseBody = undefined
          if (isHttpResponseWithBody(response)) {
            const origResponse = response
            // a copy is necessary, because the response body can only be consumed once
            response = origResponse.clone()

            try {
              responseBody = await origResponse.json()
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (err: any) {
              throw new Error(`Error parsing response body of ${method} ${path}: ${err.message}`)
            }
          } else {
            responseBody = response.jsonBody ? response.jsonBody : undefined
            if (responseBody === undefined) {
              if (typeof response.body === 'string') {
                responseBody = JSON.parse(response.body)
              } else if (response.body !== undefined) {
                throw new Error(`Response body format '${typeof response.body}' not supported by validator.`)
              }
            }
          }

          const respBodyValResult = validator.validateResponseBody(
            path,
            method,
            response.status ?? 200,
            responseBody,
            opts.responseBodyValidationMode.strict
          )
          if (respBodyValResult) {
            if (opts.responseBodyValidationMode.logLevel !== 'off') {
              logMessage(
                `Response body validation error: ${JSON.stringify(respBodyValResult)}`,
                opts.responseBodyValidationMode.logLevel,
                context
              )
            }

            if (opts.responseBodyValidationMode.returnErrorResponse) {
              return Promise.resolve(createJsonResponse(respBodyValResult, 500))
            }
          }
        }

        return response
      }
    }
  }
}
