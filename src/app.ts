import { app, HttpRequest, HttpResponseInit, InvocationContext, PreInvocationContext } from '@azure/functions'
import { AjvOpenApiValidator } from './ajv-openapi-validator'
import { OpenAPIV3 } from 'openapi-types'
import { DEFAULT_AJV_SETTINGS } from './ajv-opts'
import { DEFAULT_VALIDATOR_OPTS } from './openapi-validator'
import { createJsonResponse, logMessage } from './helper'

export interface ParsedRequestBodyHttpRequest<T> extends HttpRequest {
  parsedBody: T | undefined
}

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

export function setupValidation(
  spec: OpenAPIV3.Document,
  opts = { hook: DEFAULT_HOOK_OPTIONS, validator: DEFAULT_VALIDATOR_OPTS, ajv: DEFAULT_AJV_SETTINGS }
) {
  console.log('Hello World' + spec)

  const validator = new AjvOpenApiValidator(spec, opts?.validator, opts?.ajv)

  const requiredHookOpts = opts.hook ? { ...DEFAULT_HOOK_OPTIONS, ...opts.hook } : DEFAULT_HOOK_OPTIONS

  app.hook.preInvocation((preContext: PreInvocationContext) => {
    const originalHandler = preContext.functionHandler
    const path = '/' + preContext.invocationContext.options.trigger.route

    preContext.functionHandler = async (
      request: ParsedRequestBodyHttpRequest<unknown>,
      context: InvocationContext
    ): Promise<HttpResponseInit> => {
      const method = request.method

      if (requiredHookOpts.queryParameterValidationMode) {
        context.debug(`Validating query parameters '${path}', '${method}'`)
        const reqParamsValResult = validator.validateQueryParams(
          path,
          method,
          request.query,
          requiredHookOpts.queryParameterValidationMode.strict
        )
        if (reqParamsValResult) {
          preContext.hookData.requestQueryParameterValidationError = true

          if (requiredHookOpts.queryParameterValidationMode.logLevel !== 'off') {
            logMessage(
              `Query param validation error: ${JSON.stringify(reqParamsValResult)}`,
              requiredHookOpts.queryParameterValidationMode.logLevel,
              context
            )
          }

          if (requiredHookOpts.queryParameterValidationMode.returnErrorResponse) {
            return Promise.resolve(createJsonResponse(reqParamsValResult, 400))
          }
        }
      }

      if (requiredHookOpts.requestBodyValidationMode) {
        context.info(`Validating request body for '${path}', '${method}'`)
        request.parsedBody = request.body ? await request.json() : undefined

        const reqBodyValResult = validator.validateRequestBody(
          path,
          method,
          request.parsedBody,
          requiredHookOpts.requestBodyValidationMode.strict
        )
        if (reqBodyValResult) {
          preContext.hookData.requestBodyValidationError = true

          if (requiredHookOpts.requestBodyValidationMode.logLevel !== 'off') {
            logMessage(
              `Request body validation error: ${JSON.stringify(reqBodyValResult)}`,
              requiredHookOpts.requestBodyValidationMode.logLevel,
              context
            )
          }

          if (requiredHookOpts.requestBodyValidationMode.returnErrorResponse) {
            return Promise.resolve(createJsonResponse(reqBodyValResult, 400))
          }
        }
      }

      const response = await originalHandler(request, context)

      if (requiredHookOpts.responseBodyValidationMode) {
        context.debug(`Validating response body for '${path}', '${method}', '${response.status}'`)
        const respBodyValResult = validator.validateResponseBody(
          path,
          method,
          response.status,
          requiredHookOpts.responseBodyValidationMode.strict
        )
        if (requiredHookOpts.responseBodyValidationMode.logLevel !== 'off') {
          logMessage(
            `Request body validation error: ${JSON.stringify(respBodyValResult)}`,
            requiredHookOpts.responseBodyValidationMode.logLevel,
            context
          )
        }

        if (requiredHookOpts.responseBodyValidationMode.returnErrorResponse) {
          return Promise.resolve(createJsonResponse(respBodyValResult, 500))
        }
      }

      return response
    }
  })
}
