import { app } from '@azure/functions'
import { OpenAPIV3 } from 'openapi-types'
import { DEFAULT_HOOK_OPTIONS, ValidatorHookOptions, configureValidationPreInvocationHandler } from './validation-hook-setup'
import Ajv, { Options } from 'ajv'
import {
  AjvOpenApiValidator,
  DEFAULT_AJV_SETTINGS,
  DEFAULT_VALIDATOR_OPTS,
  ValidatorOpts,
  createAjvInstance,
} from '@restfulhead/ajv-openapi-request-response-validator'

function isAjvInstance(ajv: undefined | Options | Ajv): ajv is Ajv {
  return ajv !== undefined && (ajv as Ajv).addSchema !== undefined
}

export function setupValidation(
  spec: OpenAPIV3.Document,
  opts: { hook?: ValidatorHookOptions; validator?: ValidatorOpts; ajv?: Options | Ajv } = {
    hook: DEFAULT_HOOK_OPTIONS,
    validator: DEFAULT_VALIDATOR_OPTS,
    ajv: DEFAULT_AJV_SETTINGS,
  }
) {
  const ajv = isAjvInstance(opts?.ajv) ? opts.ajv : createAjvInstance(opts?.ajv as Options | undefined)
  const validator = new AjvOpenApiValidator(spec, ajv, opts?.validator)
  const handler = opts?.hook
    ? configureValidationPreInvocationHandler(validator, opts.hook)
    : configureValidationPreInvocationHandler(validator)

  app.hook.preInvocation(handler)
}
