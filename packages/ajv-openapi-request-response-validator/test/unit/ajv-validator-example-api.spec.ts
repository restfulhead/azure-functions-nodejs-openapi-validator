import { loadSpec } from '../helpers/test-utils'
import { AjvOpenApiValidator } from '../../src/ajv-openapi-request-response-validator'
import { createAjvInstance } from '../../src/ajv-factory'

describe('The api validator for the user api spec', () => {
  let validator: AjvOpenApiValidator
  let validatorWithoutCoercion: AjvOpenApiValidator
  let validatorWithStrictCoercion: AjvOpenApiValidator

  beforeAll(async () => {
    const spec = await loadSpec('example-api.yaml')
    validator = new AjvOpenApiValidator(spec, createAjvInstance())
    validatorWithoutCoercion = new AjvOpenApiValidator(spec, createAjvInstance(), { coerceTypes: false })
    validatorWithStrictCoercion = new AjvOpenApiValidator(spec, createAjvInstance(), { coerceTypes: 'strict' })
  })

  it('should succeed ApiError model validation', () => {
    expect(
      validator.validateResponseBody('/users/{uid}', 'put', '500', { errors: [{ status: 500, code: 'Validation', title: '...' }] })
    ).toEqual(undefined)
  })

  it('should fail ApiError model due to missing code', () => {
    expect(validator.validateResponseBody('/users/{uid}', 'put', '500', { errors: [{ status: 500, title: '...' }] })).toEqual([
      {
        code: 'Validation-required',
        status: 500,
        title: "must have required property 'code'",
        source: { pointer: '#/required', parameter: 'code' },
      },
    ])
  })

  it('should fail ApiError validation due to wrong status', () => {
    expect(
      validator.validateResponseBody('/users/{uid}', 'put', '500', { errors: [{ status: 700, code: 'Validation', title: '...' }] })
    ).toEqual([
      {
        code: 'Validation-maximum',
        status: 500,
        title: 'must be <= 599',
        source: { pointer: '#/properties/status/maximum' },
      },
    ])
  })

  it('should fail due to additional props', () => {
    expect(
      validator.validateResponseBody('/users/{uid}', 'put', '500', {
        errors: [{ status: 500, code: 'Validation', title: '...', unknownPro: '123' }],
      })
    ).toEqual([
      {
        code: 'Validation-additionalProperties',
        source: { pointer: '#/additionalProperties', parameter: 'unknownPro' },
        status: 500,
        title: 'must NOT have additional properties',
      },
    ])
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

  it('should succeed oneOf list with mixed results', () => {
    const dataWithExtraA = { name: 'test', description: 'hello', objType: 'a' }
    const dataWithExtraB = { somethingElse: 123, objType: 'b' }
    expect(
      validator.validateResponseBody('/one-of-example-list', 'get', '200', {
        items: [dataWithExtraA, dataWithExtraB, dataWithExtraA],
      })
    ).toEqual(undefined)
  })

  it('should fail oneOf list with mixed results', () => {
    const dataWithExtraA = { name: 'test', description: 'hello', objType: 'a' }
    expect(
      validator.validateResponseBody('/one-of-example-list', 'get', '200', {
        items: [dataWithExtraA, { something: 'test', objType: 'a' }],
      })
    ).toEqual([
      {
        code: 'Validation-required',
        source: { pointer: '#/components/schemas/TestRequestA/required', parameter: 'name' },
        status: 500,
        title: "must have required property 'name'",
      },
      {
        code: 'Validation-additionalProperties',
        source: { pointer: '#/components/schemas/TestRequestA/additionalProperties', parameter: 'something' },
        status: 500,
        title: 'must NOT have additional properties',
      },
    ])
  })

  it('should fail oneOf AB', () => {
    const dataWithExtra = { name: 'test', description: 'hello', objType: 'a', somethingElse: 1 }
    expect(validator.validateResponseBody('/one-of-example', 'get', '200', dataWithExtra)).toEqual([
      {
        code: 'Validation-additionalProperties',
        source: { pointer: '#/components/schemas/TestRequestA/additionalProperties', parameter: 'somethingElse' },
        status: 500,
        title: 'must NOT have additional properties',
      },
    ])
  })

  it('should fail oneOf missing discriminator', () => {
    const dataWithExtra = { name: 'test' }
    expect(validator.validateResponseBody('/one-of-example', 'get', '200', dataWithExtra)).toEqual([
      { code: 'Validation-discriminator', source: { pointer: '#/discriminator' }, status: 500, title: 'tag "objType" must be string' },
    ])
  })

  it('should succeed allOf', () => {
    const dataWithExtra = { name: 'test', description: 'hello', somethingElse: 1, status: 'pending' }
    expect(validator.validateRequestBody('/all-of-example', 'post', dataWithExtra)).toEqual(undefined)
  })

  it('should fail allOf', () => {
    const dataWithExtra = { name: 'test', status: 'pending' }
    expect(validator.validateRequestBody('/all-of-example', 'post', dataWithExtra)).toEqual([
      {
        code: 'Validation-required',
        source: { pointer: '#/components/schemas/AllOfExample/required', parameter: 'somethingElse' },
        status: 400,
        title: "must have required property 'somethingElse'",
      },
    ])
  })

  it('should succeed date time str', () => {
    const dataWithExtra = { arrayAttr: [{ version: 1, timeAccepted: '2020-01-01T00:00:00.000Z' }] }
    expect(validator.validateResponseBody('/users/{uid}', 'put', '200', dataWithExtra)).toEqual(undefined)
  })

  it('should succeed date time date', () => {
    const dataWithExtra = { arrayAttr: [{ version: 1, timeAccepted: new Date() }] }
    expect(validator.validateResponseBody('/users/{uid}', 'put', '200', dataWithExtra)).toEqual(undefined)
  })

  it('should succeed parameter validation', () => {
    expect(validator.validateQueryParams('/users/{uid}', 'put', { requirednumberparam: 3, booleanparam: true }, true)).toEqual({
      errors: undefined,
      normalizedParams: { booleanparam: true, requirednumberparam: 3 },
    })
  })

  it('should fail parameter validation - missing required parameter', () => {
    expect(validator.validateQueryParams('/users/{uid}', 'put', {}, true)).toEqual({
      normalizedParams: {},
      errors: [
        {
          code: 'Validation-required-query-parameter',
          source: { parameter: 'requirednumberparam' },
          status: 400,
          title: 'The query parameter is required.',
        },
      ],
    })
  })

  it('should fail parameter validation - empty number parameter without coercion', () => {
    expect(validatorWithoutCoercion.validateQueryParams('/users/{uid}', 'put', { requirednumberparam: '' }, true)).toEqual({
      normalizedParams: {
        requirednumberparam: '',
      },
      errors: [
        {
          code: 'Validation-query-parameter',
          source: { parameter: 'requirednumberparam' },
          status: 400,
          title: 'The query parameter must not be empty.',
        },
      ],
    })
  })

  it('should succeed parameter validation - empty parameter with coercion', () => {
    expect(validator.validateQueryParams('/users/{uid}', 'put', { requirednumberparam: '' }, true)).toEqual({
      normalizedParams: { requirednumberparam: 0 },
      errors: undefined,
    })
  })

  it('should fail parameter validation - extra parameter', () => {
    expect(validator.validateQueryParams('/users/{uid}', 'put', { requirednumberparam: 1, unspecified: 'hello' }, true)).toEqual({
      errors: [
        {
          code: 'Validation-invalid-query-parameter',
          source: { parameter: 'unspecified' },
          status: 400,
          title: 'The query parameter is not supported.',
        },
      ],
      normalizedParams: { requirednumberparam: 1, unspecified: 'hello' },
    })
  })

  it('should succeed parameter validation - extra parameter non strict', () => {
    expect(validator.validateQueryParams('/users/{uid}', 'put', { requirednumberparam: 1, unspecified: 'hello' }, false)).toEqual({
      errors: undefined,
      normalizedParams: { requirednumberparam: 1, unspecified: 'hello' },
    })
  })

  it('should succeed parameter validation - non string types', () => {
    expect(
      validator.validateQueryParams(
        '/users/{uid}',
        'put',
        { mode: 'something', requirednumberparam: 1.2, booleanparam: true, integerparam: 3 },
        false
      )
    ).toEqual({ errors: undefined, normalizedParams: { booleanparam: true, integerparam: 3, mode: 'something', requirednumberparam: 1.2 } })
  })

  it('should succeed parameter validation - non strict coercion', () => {
    expect(
      validator.validateQueryParams(
        '/users/{uid}',
        'put',
        { mode: 'something', requirednumberparam: null, booleanparam: 'maybe', integerparam: 1.2 },
        false
      )
    ).toEqual({
      errors: undefined,
      normalizedParams: { booleanparam: true, integerparam: 1, mode: 'something', requirednumberparam: 0 },
    })
  })

  it('should fail parameter validation - non string types strict coercion', () => {
    expect(
      validatorWithStrictCoercion.validateQueryParams(
        '/users/{uid}',
        'put',
        { mode: 'something', requirednumberparam: 'notanumber', booleanparam: null, integerparam: 1.2 },
        false
      )
    ).toEqual({
      errors: [
        {
          status: 400,
          code: 'Validation-type',
          title: 'must be number',
          source: { pointer: '#/paths/users/uid/put/parameters/requirednumberparam/type' },
        },
        {
          status: 400,
          code: 'Validation-query-parameter',
          title: 'The query parameter must not be empty.',
          source: { parameter: 'booleanparam' },
        },
        {
          status: 400,
          code: 'Validation-type',
          title: 'must be integer',
          source: { pointer: '#/paths/users/uid/put/parameters/integerparam/type' },
        },
      ],
      normalizedParams: { booleanparam: null, integerparam: 1.2, mode: 'something', requirednumberparam: 'notanumber' },
    })
  })

  it('should fail parameter validation - non string types no coercion', () => {
    expect(
      validatorWithoutCoercion.validateQueryParams(
        '/users/{uid}',
        'put',
        { mode: 'something', requirednumberparam: 'notanumber', booleanparam: 'maybe', integerparam: 1.2 },
        false
      )
    ).toEqual({
      errors: [
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
      ],
      normalizedParams: { booleanparam: 'maybe', integerparam: 1.2, mode: 'something', requirednumberparam: 'notanumber' },
    })
  })

  it('should fail parameter validation - min max', () => {
    expect(validator.validateQueryParams('/users/{uid}', 'put', { requirednumberparam: 2, integerparam: 500 }, false)).toEqual({
      errors: [
        {
          code: 'Validation-maximum',
          source: { pointer: '#/paths/users/uid/put/parameters/integerparam/maximum' },
          status: 400,
          title: 'must be <= 5',
        },
      ],
      normalizedParams: { integerparam: 500, requirednumberparam: 2 },
    })
  })

  it('should succeed parameter validation - pagination', () => {
    expect(
      validator.validateQueryParams('/pagination-example', 'get', { filter: 'test', 'page[offset]': '0', 'page[limit]': '12' })
    ).toEqual({
      normalizedParams: {
        filter: 'test',
        page: {
          limit: 12,
          offset: 0,
        },
      },
      errors: undefined,
    })
  })

  it('should fail parameter validation - deep object', () => {
    expect(
      validator.validateQueryParams('/pagination-example', 'get', { filter: 'test', 'page[offset]': 'yellow', 'page[limit]': 'nono' })
    ).toEqual({
      errors: [
        {
          code: 'Validation-type',
          source: { pointer: '#/components/schemas/PageParam/properties/limit/type' },
          status: 400,
          title: 'must be integer',
        },
        {
          code: 'Validation-type',
          source: { pointer: '#/components/schemas/PageParam/properties/offset/type' },
          status: 400,
          title: 'must be integer',
        },
      ],
      normalizedParams: {
        filter: 'test',
        page: {
          limit: 'nono',
          offset: 'yellow',
        },
      },
    })
  })

  it('demonstrate multipart request issue. we should properly implement this at some point', () => {
    expect(
      validator.validateRequestBody(
        '/multipart',
        'post',
        `------WebKitFormBoundaryMFTG70c7i7lAFI6f
    Content-Disposition: form-data; name="file"; filename="blob"
    Content-Type: image/png
    
    
    ------WebKitFormBoundaryMFTG70c7i7lAFI6f--
    `
      )
    ).toEqual([{ code: 'Validation-unexpected-request-body', status: 400, title: 'A request body is not supported' }])
  })

  it('should fail to validate user state without type', () => {
    expect(validator.validateRequestBody('/users/{uid}/state/{sid}', 'put', { enabled: true })).toEqual([
      { code: 'Validation-discriminator', source: { pointer: '#/discriminator' }, status: 400, title: 'tag "type" must be string' },
    ])
  })

  it('should validate user state 1', () => {
    expect(
      validator.validateRequestBody('/users/{uid}/state/{sid}', 'put', { type: 'coffeeCx', enabled: true, nullableTest: null })
    ).toBeUndefined()
  })

  it('should validate user state 2', () => {
    expect(
      validator.validateRequestBody('/users/{uid}/state/{sid}', 'put', {
        type: 'userUploads',
        entries: [
          {
            id: '123',
            name: 'test',
            communityId: '123',
            status: 'ongoing',
            path: 'mycommunity/sub/dir',
          },
        ],
      })
    ).toBeUndefined()
  })

  it('should fail to validate user state invalid path', () => {
    expect(
      validator.validateRequestBody('/users/{uid}/state/{sid}', 'put', {
        type: 'userUploads',
        entries: [
          {
            id: '123',
            name: 'test',
            communityId: '123',
            status: 'ongoing',
            path: '../../',
          },
        ],
      })
    ).toEqual([
      {
        code: 'Validation-pattern',
        source: { pointer: '#/components/schemas/SafePath/pattern' },
        status: 400,
        title: 'must match pattern "(?=(^(?!.*\\.\\.\\/).+))(?=(^(?!.*\\/\\/).+))"',
      },
    ])
  })

  it('should validate min max for arrays', () => {
    expect(validator.validateRequestBody('/users/{uid}/state/{sid}', 'put', { type: 'widgets', widgets: ['1', '2'] })).toBeUndefined()
    expect(validator.validateRequestBody('/users/{uid}/state/{sid}', 'put', { type: 'widgets', widgets: ['1', '2', '3'] })).toBeUndefined()
    expect(
      validator.validateRequestBody('/users/{uid}/state/{sid}', 'put', { type: 'widgets', widgets: ['1', '2', '3', '4'] })
    ).toBeUndefined()
  })

  it('should fail to validate min max with empty array', () => {
    expect(validator.validateRequestBody('/users/{uid}/state/{sid}', 'put', { type: 'widgets', widgets: [] })).toEqual([
      {
        code: 'Validation-minItems',
        source: { pointer: '#/components/schemas/UserStateWidgets/properties/widgets/oneOf/0/minItems' },
        status: 400,
        title: 'must NOT have fewer than 4 items',
      },
      {
        code: 'Validation-minItems',
        source: { pointer: '#/components/schemas/UserStateWidgets/properties/widgets/oneOf/1/minItems' },
        status: 400,
        title: 'must NOT have fewer than 3 items',
      },
      {
        code: 'Validation-minItems',
        source: { pointer: '#/components/schemas/UserStateWidgets/properties/widgets/oneOf/2/minItems' },
        status: 400,
        title: 'must NOT have fewer than 2 items',
      },
      {
        code: 'Validation-oneOf',
        source: { pointer: '#/components/schemas/UserStateWidgets/properties/widgets/oneOf' },
        status: 400,
        title: 'must match exactly one schema in oneOf',
      },
    ])
  })
  it('should fail to validate min max for arrays', () => {
    expect(validator.validateRequestBody('/users/{uid}/state/{sid}', 'put', { type: 'widgets', widgets: ['1'] })).toEqual([
      {
        code: 'Validation-minItems',
        source: { pointer: '#/components/schemas/UserStateWidgets/properties/widgets/oneOf/0/minItems' },
        status: 400,
        title: 'must NOT have fewer than 4 items',
      },
      {
        code: 'Validation-minItems',
        source: { pointer: '#/components/schemas/UserStateWidgets/properties/widgets/oneOf/1/minItems' },
        status: 400,
        title: 'must NOT have fewer than 3 items',
      },
      {
        code: 'Validation-minItems',
        source: { pointer: '#/components/schemas/UserStateWidgets/properties/widgets/oneOf/2/minItems' },
        status: 400,
        title: 'must NOT have fewer than 2 items',
      },
      {
        code: 'Validation-oneOf',
        source: { pointer: '#/components/schemas/UserStateWidgets/properties/widgets/oneOf' },
        status: 400,
        title: 'must match exactly one schema in oneOf',
      },
    ])
  })

  it('should patch user state', () => {
    expect(
      validator.validateRequestBody('/users/{uid}/state/{sid}', 'patch', [
        {
          op: 'add',
          path: '/entries',
          value: {
            id: 'HoPnVO3QD1uHdzJXpqD2U',
            title: 'you ok?',
            date: '2024-04-04T18:50:54.419Z',
            messages: [
              { role: 'user', content: 'you ok?' },
              {
                content:
                  "As an artificial intelligence, I don't have feelings, but I'm functioning as expected. Thank you for asking! How can I assist you today?",
                role: 'assistant',
              },
            ],
          },
        },
      ])
    ).toBeUndefined()
  })

  it('should validate webhook response', () => {
    expect(
      validator.validateRequestBody('/webhooks/mytest/{provision}', 'post', {
        siteInfo: {
          url: 'https://bertelsmann.sharepoint.com/sites/bportal_bcp_dev_privatecommunitytopublic',
          groupId: '9767a68f-842f-4197-a588-5e639358281b',
          teamId: '9767a68f-842f-4197-a588-5e639358281b',
        },
        taskId: '88a4984e-cf31-4b46-b849-035eb76feaf5',
        stateBag: { contentEntryId: 'wNC62LREKjzmLnUnxPjHHW' },
      })
    ).toBeUndefined()
  })
})
