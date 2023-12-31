import { loadSpec } from '../helpers/test-utils'
import { OpenApiValidator} from '../../src/openapi-validator'
import { AjvOpenApiValidator} from '../../src/ajv-openapi-validator'

describe('The  api validator', () => {
  let validator: OpenApiValidator

  beforeAll(async () => {
    const spec = await loadSpec()
    validator = new AjvOpenApiValidator(spec)
  })

  it('should succeed ApiError model validation', () => {
    expect(validator.validateResponseBody('/users/{uid}', 'put', '500', { errors: [{ status: 400, code: 'Validation', title: '...' }] }, true)).toEqual(undefined)
  })

  it('should fail ApiError model due to missing code', () => {
    expect(validator.validateResponseBody('/users/{uid}', 'put', '500', { errors: [ { status: 400, title: '...' } ] }, true)).toEqual([      
      {
        code: 'Validation-required',
        status: 400,
        title: "must have required property 'code'",
        source: { pointer: '#/required' },
      },
    ])
  })

  it('should fail ApiError validation due to wrong status', () => {
    expect(validator.validateResponseBody('/users/{uid}', 'put', '500', { errors: [{ status: 700, code: 'Validation', title: '...' } ] }, true)).toEqual([      
      {
        code: 'Validation-maximum',
        status: 400,
        title: 'must be <= 599',
        source: { pointer: '#/properties/status/maximum' },
      },
    ])
  })

  it('should fail due to additional props', () => {
    expect(validator.validateResponseBody('/users/{uid}', 'put', '500', { errors: [ { status: 400, code: 'Validation', title: '...', unknownPro: '123' } ] }, true)).toEqual([{"code": "Validation-additionalProperties", "source": {"pointer": "#/additionalProperties"}, "status": 400, "title": "must NOT have additional properties"}])
  })

  it('should allow additional props', () => {
    expect(validator.validateRequestBody('/additional-props', 'post', { somethingElse: 1, otherAddedProp: '123' })).toEqual(undefined)
  })
  
  it('should succeed oneOf A', () => {
    const dataWithExtra = { name: 'test', description: 'hello', objType: 'a' }
    expect(validator.validateResponseBody('/one-of-example', 'get', '200', dataWithExtra)).toEqual(undefined)
  })

  it('should succeed oneOf B', () => {
    const dataWithExtra = { somethingElse: 123, objType: 'b' }
    expect(validator.validateResponseBody('/one-of-example', 'get', '200', dataWithExtra)).toEqual(undefined)
  })

  it('should fail oneOf AB', () => {
    const dataWithExtra = { name: 'test', description: 'hello', objType: 'a', somethingElse: 1 }
    expect(validator.validateResponseBody('/one-of-example', 'get', '200', dataWithExtra)).toEqual(
      [{"code": "Validation-additionalProperties", "source": {"pointer": "#/components/schemas/TestRequestA/additionalProperties"}, "status": 400, "title": "must NOT have additional properties"}]
    )
  })

  it('should fail oneOf missing discriminator', () => {
    const dataWithExtra = { name: 'test' }
    expect(validator.validateResponseBody('/one-of-example', 'get', '200', dataWithExtra)).toEqual(
      [{"code": "Validation-discriminator", "source": {"pointer": "#/discriminator"}, "status": 400, "title": "tag \"objType\" must be string"}]
    )
  })


  it('should succeed allOf', () => {
    const dataWithExtra = { name: 'test', description: 'hello', somethingElse: 1, status: 'pending' }
    expect(validator.validateRequestBody('/all-of-example', 'post', dataWithExtra, true)).toEqual(undefined)
  })

  it('should fail allOf', () => {
    const dataWithExtra = { name: 'test', status: 'pending' }
    expect(validator.validateRequestBody('/all-of-example', 'post', dataWithExtra, true)).toEqual(
      [{"code": "Validation-required", "source": {"pointer": "#/components/schemas/AllOfExample/required"}, "status": 400, "title": "must have required property 'somethingElse'"}]
    )
  })

  it('should succeed date time str', () => {
    const dataWithExtra = { arrayAttr: [ { version: 1, timeAccepted: '2020-01-01T00:00:00.000Z' } ] }
    expect(validator.validateResponseBody('/users/{uid}', 'put', '200', dataWithExtra, true)).toEqual(undefined)
  })

  it('should succeed date time date', () => {
    const dataWithExtra = { arrayAttr: [ { version: 1, timeAccepted: new Date() } ] }
    expect(validator.validateResponseBody('/users/{uid}', 'put', '200', dataWithExtra, true)).toEqual(undefined)
  })

  it('should succeed parameter validation', () => {
    expect(validator.validateQueryParams('/users/{uid}', 'put', new URLSearchParams({ requirednumberparam: '3', booleanparam: 'true' }), true)).toEqual(undefined)
  })

  it('should fail parameter validation - missing required parameter', () => {
    expect(validator.validateQueryParams('/users/{uid}', 'put', new URLSearchParams({}), true)).toEqual([
      {
        code: 'Validation-required-query-parameter',
        source: { parameter: 'requirednumberparam' },
        status: 400,
        title: 'The query parameter is required.',
      },
    ])
  })

  it('should fail parameter validation - empty parameter', () => {
    expect(validator.validateQueryParams('/users/{uid}', 'put', new URLSearchParams({ requirednumberparam: '' }), true)).toEqual([
      {
        code: 'Validation-query-parameter',
        source: { parameter: 'requirednumberparam' },
        status: 400,
        title: 'The query parameter must not be empty.',
      },
    ])
  })

  it('should fail parameter validation - extra parameter', () => {
    expect(validator.validateQueryParams('/users/{uid}', 'put', new URLSearchParams({ requirednumberparam: '1', unspecified: 'hello' }), true)).toEqual([
      {
        code: 'Validation-invalid-query-parameter',
        source: { parameter: 'unspecified' },
        status: 400,
        title: 'The query parameter is not supported.',
      },
    ])
  })

  it('should succeed parameter validation - extra parameter non strict', () => {
    expect(validator.validateQueryParams('/users/{uid}', 'put', new URLSearchParams({ requirednumberparam: '1', unspecified: 'hello' }), false)).toEqual(undefined)
  })

  it('should succeed parameter validation - non string types', () => {
    expect(
      validator.validateQueryParams(
        '/users/{uid}',
        'put',
        new URLSearchParams({ mode: 'something', requirednumberparam: '1.2', booleanparam: 'true', integerparam: '3' }),
        false
      )
    ).toEqual(undefined)
  })

  it('should fail parameter validation - non string types', () => {
    expect(
      validator.validateQueryParams(
        '/users/{uid}',
        'put',
        new URLSearchParams({ mode: 'something', requirednumberparam: 'notanumber', booleanparam: 'maybe', integerparam: '1.2' }),
        false
      )
    ).toEqual([
      {
        code: 'Validation-type',
        source: { pointer: '#/paths/users/uid/put/parameters/requirednumberparam/type' },
        status: 400,
        title: 'must be number',
      },
      {
        code: 'Validation-type',
        source: { pointer: '#/paths/users/uid/put/parameters/booleanparam/type' },
        status: 400,
        title: 'must be boolean',
      },
      {
        code: 'Validation-type',
        source: { pointer: '#/paths/users/uid/put/parameters/integerparam/type' },
        status: 400,
        title: 'must be integer',
      },
    ])
  })

  it('should fail parameter validation - min max', () => {
    expect(validator.validateQueryParams('/users/{uid}', 'put', new URLSearchParams({ requirednumberparam: '2', integerparam: '500' }), false)).toEqual([
      {
        code: 'Validation-maximum',
        source: { pointer: '#/paths/users/uid/put/parameters/integerparam/maximum' },
        status: 400,
        title: 'must be <= 5',
      },
    ])
  })
})
