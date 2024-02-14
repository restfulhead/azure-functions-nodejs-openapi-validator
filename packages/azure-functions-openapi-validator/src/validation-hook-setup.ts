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
import { AjvOpenApiValidator } from '@restfulhead/ajv-openapi-request-response-validator'
import { createJsonResponse, logMessage } from './helper'

export const HOOK_DATA_QUERY_PARAM_VALIDATION_ERROR_KEY = 'azure-functions-openapi-validator_query-param-validation-error'
export const HOOK_DATA_REQUEST_BODY_VALIDATION_ERROR_KEY = 'azure-functions-openapi-validator_request-body-validation-error'
export const HOOK_DATA_NORMALIZED_QUERY_PARAMS_KEY = 'azure-functions-openapi-validator_normalized-query-params'

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
  return response && (response as HttpResponse).body !== undefined && (response as HttpResponse).body !== null
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
          const reqParamsValResult = validator.validateQueryParams(
            path,
            method,
            request.query,
            opts.queryParameterValidationMode.strict,
            context
          )

          preContext.hookData[HOOK_DATA_NORMALIZED_QUERY_PARAMS_KEY] = reqParamsValResult.normalizedParams

          if (reqParamsValResult?.errors) {
            if (opts.queryParameterValidationMode.logLevel !== 'off') {
              logMessage(
                `Query param validation error: ${JSON.stringify(reqParamsValResult.errors)}`,
                opts.queryParameterValidationMode.logLevel,
                context
              )
            }

            if (opts.queryParameterValidationMode.returnErrorResponse) {
              preContext.hookData[HOOK_DATA_QUERY_PARAM_VALIDATION_ERROR_KEY] = true
              return Promise.resolve(createJsonResponse({ errors: reqParamsValResult.errors }, 400))
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

          const reqBodyValResult = validator.validateRequestBody(path, method, parsedBody, opts.requestBodyValidationMode.strict, context)
          if (reqBodyValResult) {
            if (opts.requestBodyValidationMode.logLevel !== 'off') {
              logMessage(
                `Request body validation error: ${JSON.stringify(reqBodyValResult)}`,
                opts.requestBodyValidationMode.logLevel,
                context
              )
            }

            if (opts.requestBodyValidationMode.returnErrorResponse) {
              preContext.hookData[HOOK_DATA_REQUEST_BODY_VALIDATION_ERROR_KEY] = true
              return Promise.resolve(createJsonResponse({ errors: reqBodyValResult }, 400))
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
      const exclusion = opts.exclude?.find(
        (exclusion) => exclusion.path.toLowerCase() === path.toLowerCase() && exclusion.method.toLowerCase() === method.toLowerCase()
      )

      const origResponse = new HttpResponse(postContext.result as HttpResponseInit)

      if (
        opts.responseBodyValidationMode &&
        (!exclusion || (exclusion.validation !== false && exclusion.validation.responseBody !== false))
      ) {
        context.debug(`Validating response body for '${path}', '${method}', '${origResponse.status}'`)

        let responseBody = undefined
        if (isHttpResponseWithBody(origResponse)) {
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
          origResponse.status ?? 200,
          responseBody,
          opts.responseBodyValidationMode.strict,
          context
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
            postContext.result = createJsonResponse({ errors: respBodyValResult }, 500)
          }
        }
      }
    }
  }
}
