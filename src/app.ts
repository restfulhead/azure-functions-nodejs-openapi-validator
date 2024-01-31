import { app, HttpRequest, HttpResponseInit, InvocationContext, PreInvocationContext } from '@azure/functions'
import { AjvOpenApiValidator } from './ajv-openapi-validator'
import { OpenAPIV3 } from 'openapi-types'
import { DEFAULT_AJV_SETTINGS } from './ajv-opts'
import { DEFAULT_VALIDATOR_OPTS, ValidatorOpts } from './openapi-validator'
import { createJsonResponse, logMessage } from './helper'
import { Options } from 'ajv'

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

export function setupValidation(
  spec: OpenAPIV3.Document,
  opts: { hook?: ValidatorHookOptions; validator?: ValidatorOpts; ajv?: Options } = {
    hook: DEFAULT_HOOK_OPTIONS,
    validator: DEFAULT_VALIDATOR_OPTS,
    ajv: DEFAULT_AJV_SETTINGS,
  }
) {
  const validator = new AjvOpenApiValidator(spec, opts?.validator, opts?.ajv)

  const requiredHookOpts = opts.hook ? { ...DEFAULT_HOOK_OPTIONS, ...opts.hook } : DEFAULT_HOOK_OPTIONS

  app.hook.preInvocation((preContext: PreInvocationContext) => {
    if (preContext.invocationContext.options.trigger.type === 'httpTrigger') {
      const originalHandler = preContext.functionHandler
      const path = '/' + preContext.invocationContext.options.trigger.route

      preContext.functionHandler = async (origRequest: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        let request = origRequest
        const method = request.method
        const exclusion = requiredHookOpts.exclude?.find(
          (exclusion) => exclusion.path.toLowerCase() === path.toLowerCase() && exclusion.method.toLowerCase() === method.toLowerCase()
        )

        if (
          requiredHookOpts.queryParameterValidationMode &&
          (!exclusion || (exclusion.validation !== false && exclusion.validation.queryParmeter !== false))
        ) {
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

        if (
          requiredHookOpts.requestBodyValidationMode &&
          (!exclusion || (exclusion.validation !== false && exclusion.validation.requestBody !== false))
        ) {
          context.debug(`Validating request body for '${path}', '${method}'`)

          let parsedBody = undefined
          if (request.body) {
            // a copy is necessary, because the request body can only be consumed once
            // see https://github.com/Azure/azure-functions-nodejs-library/issues/79#issuecomment-1875214147
            request = origRequest.clone()

            const textBody = await origRequest.text()
            parsedBody = JSON.parse(textBody)
          }

          const reqBodyValResult = validator.validateRequestBody(
            path,
            method,
            parsedBody,
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

        const response: HttpResponseInit = await originalHandler(request, context)

        if (
          requiredHookOpts.responseBodyValidationMode &&
          (!exclusion || (exclusion.validation !== false && exclusion.validation.responseBody !== false))
        ) {
          context.debug(`Validating response body for '${path}', '${method}', '${response.status}'`)

          // TODO support other response body formats
          let responseBody = response.jsonBody ? response.jsonBody : undefined
          if (responseBody === undefined) {
            if (typeof response.body === 'string') {
              responseBody = JSON.parse(response.body)
            } else if (response.body !== undefined) {
              throw new Error(`Response body format '${typeof response.body}' not supported by validator yet.`)
            }
          }

          const respBodyValResult = validator.validateResponseBody(
            path,
            method,
            response.status ?? 200,
            responseBody,
            requiredHookOpts.responseBodyValidationMode.strict
          )
          if (respBodyValResult) {
            if (requiredHookOpts.responseBodyValidationMode.logLevel !== 'off') {
              logMessage(
                `Response body validation error: ${JSON.stringify(respBodyValResult)}`,
                requiredHookOpts.responseBodyValidationMode.logLevel,
                context
              )
            }

            if (requiredHookOpts.responseBodyValidationMode.returnErrorResponse) {
              return Promise.resolve(createJsonResponse(respBodyValResult, 500))
            }
          }
        }

        return response
      }
    }
  })
}
