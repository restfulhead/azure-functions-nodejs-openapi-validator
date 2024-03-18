import { app } from '@azure/functions'
import { OpenAPIV3 } from 'openapi-types'
// eslint-disable-next-line @typescript-eslint/naming-convention
import Ajv, { Options } from 'ajv'
import {
  AjvOpenApiValidator,
  DEFAULT_AJV_SETTINGS,
  DEFAULT_VALIDATOR_OPTS,
  ValidatorOpts,
  createAjvInstance,
} from '@restfulhead/ajv-openapi-request-response-validator'
import {
  DEFAULT_HOOK_OPTIONS,
  ValidatorHookOptions,
  configureValidationPostInvocationHandler,
  configureValidationPreInvocationHandler,
} from './validation-hook-setup'

function isAjvInstance(ajv: undefined | Options | Ajv): ajv is Ajv {
  return ajv !== undefined && (ajv as Ajv).addSchema !== undefined
}

export function setupValidation(
  spec: OpenAPIV3.Document,
  optsHook: ValidatorHookOptions = DEFAULT_HOOK_OPTIONS,
  optsValidator: ValidatorOpts = DEFAULT_VALIDATOR_OPTS,
  optsAjc: Options | Ajv = DEFAULT_AJV_SETTINGS
): void {
  const ajv = isAjvInstance(optsAjc) ? optsAjc : createAjvInstance(optsAjc as Options | undefined)
  const validator = new AjvOpenApiValidator(spec, ajv, optsValidator)

  app.hook.preInvocation(configureValidationPreInvocationHandler(validator, optsHook))
  app.hook.postInvocation(configureValidationPostInvocationHandler(validator, optsHook))
}
