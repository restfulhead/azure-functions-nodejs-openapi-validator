import { ReadableStream } from 'stream/web'
import { MockProxy, mock, mockReset } from 'jest-mock-extended'
import { AjvOpenApiValidator } from '@restfulhead/ajv-openapi-request-response-validator'
import { HttpRequest, HttpResponseInit, PostInvocationContext, PreInvocationContext } from '@azure/functions'
import {
  ValidatorHookOptions,
  configureValidationPostInvocationHandler,
  configureValidationPreInvocationHandler,
  DEFAULT_HOOK_OPTIONS,
} from '../../src/validation-hook-setup'

describe('The app validator', () => {
  let mockValidator: MockProxy<AjvOpenApiValidator> & AjvOpenApiValidator

  const logFn = (...args: any[]) => console.log(...args)

  const MOCK_ERROR = {
    status: 400,
    code: 'ValidationError',
    title: 'Validation failed',
  }

  const JSON_HEADERS = {
    'Content-Type': 'application/json',
  }

  const MOCK_PRE_CONTEXT: PreInvocationContext = {
    invocationContext: {
      options: {
        trigger: {
          name: 'someTriggerName',
          type: 'httpTrigger',
        },
        extraInputs: [],
        extraOutputs: [],
      },
      invocationId: 'testInvocationId',
      functionName: 'testFunctionName',
      extraInputs: {} as any,
      extraOutputs: {} as any,
      log: logFn,
      trace: logFn,
      debug: logFn,
      info: logFn,
      warn: logFn,
      error: logFn,
    },
    inputs: [],
    functionHandler: () => ({
      status: 200,
    }),
    hookData: {},
  }

  const getMockPreContext = (route: string, body?: string): PreInvocationContext =>
    ({
      ...MOCK_PRE_CONTEXT,
      invocationContext: {
        ...MOCK_PRE_CONTEXT.invocationContext,
        options: {
          ...MOCK_PRE_CONTEXT.invocationContext.options,
          trigger: {
            ...MOCK_PRE_CONTEXT.invocationContext.options.trigger,
            route,
          },
        },
      },
      functionHandler: () => ({
        status: 200,
        body,
      }),
    }) as any

  const MOCK_POST_CONTEXT: PostInvocationContext = {
    invocationContext: {
      options: {
        trigger: {
          name: 'someTriggerName',
          type: 'httpTrigger',
        },
        extraInputs: [],
        extraOutputs: [],
      },
      invocationId: 'testInvocationId',
      functionName: 'testFunctionName',
      extraInputs: {} as any,
      extraOutputs: {} as any,
      log: logFn,
      trace: logFn,
      debug: logFn,
      info: logFn,
      warn: logFn,
      error: logFn,
    },
    inputs: [],
    hookData: {},
    result: jest.fn(),
    error: jest.fn(),
  }

  const getMockPostContext = (route: string, request: HttpRequest, response: HttpResponseInit): PostInvocationContext =>
    ({
      ...MOCK_POST_CONTEXT,
      invocationContext: {
        ...MOCK_POST_CONTEXT.invocationContext,
        options: {
          ...MOCK_POST_CONTEXT.invocationContext.options,
          trigger: {
            ...MOCK_POST_CONTEXT.invocationContext.options.trigger,
            route,
          },
        },
      },
      inputs: [request],
      result: response,
    }) as any

  const DEFAULT_HTTP_GET_REQUEST: HttpRequest = {
    method: 'GET',
    url: 'http://localhost/api/v1/health',
    headers: new Headers(),
    query: new URLSearchParams(),
    params: {},
    user: null,
    body: null,
    bodyUsed: false,
    arrayBuffer: jest.fn(),
    blob: jest.fn(),
    formData: jest.fn(),
    json: jest.fn(),
    text: jest.fn(),
    clone: jest.fn(),
  }

  const DEFAULT_HTTP_POST_REQUEST = (responseJson?: object): HttpRequest => {
    const body = responseJson
      ? (new ReadableStream<any>({
          start(controller) {
            controller.enqueue(JSON.stringify(responseJson))
            controller.close()
          },
        }) as any)
      : null

    return {
      method: 'POST',
      url: 'http://localhost/api/v1/messages',
      headers: new Headers(JSON_HEADERS),
      query: new URLSearchParams(),
      params: {},
      user: null,
      body,
      bodyUsed: false,
      arrayBuffer: jest.fn(),
      blob: jest.fn(),
      formData: jest.fn(),
      json: () => Promise.resolve(responseJson),
      text: jest.fn(),
      clone: jest.fn(),
    }
  }

  const withResponseValidation: ValidatorHookOptions = {
    responseBodyValidationMode: { returnErrorResponse: true, strict: true, logLevel: 'info' },
    queryParameterValidationMode: false,
    requestBodyValidationMode: false,
  }

  beforeEach(() => {
    mockValidator = mock<AjvOpenApiValidator>()
  })

  afterEach(() => {
    mockReset(mockValidator)
  })

  it('should pass get request', async () => {
    mockValidator.validateQueryParams.mockReturnValueOnce({ errors: undefined, normalizedParams: {} })
    const handler = configureValidationPreInvocationHandler(mockValidator)
    const ctx = getMockPreContext('api/v1/health', JSON.stringify({ status: 'ok' }))
    await handler(ctx)

    const request: HttpRequest = { ...DEFAULT_HTTP_GET_REQUEST }
    const functionResult = await ctx.functionHandler(request, MOCK_PRE_CONTEXT.invocationContext)

    expect(functionResult).toEqual({ status: 200, body: '{"status":"ok"}' })
    expect(mockValidator.validateQueryParams).toHaveBeenCalledWith(
      '/api/v1/health',
      'GET',
      new URLSearchParams(),
      true,
      ['code'],
      expect.anything()
    )
    expect(mockValidator.validateRequestBody).toHaveBeenCalledWith('/api/v1/health', 'GET', undefined, true, expect.anything())
  })

  it('should fail with query parameter validation error', async () => {
    mockValidator.validateQueryParams.mockReturnValueOnce({ errors: [MOCK_ERROR], normalizedParams: {} })
    const handler = configureValidationPreInvocationHandler(mockValidator)
    const ctx = getMockPreContext('api/v1/health?something', JSON.stringify({ status: 'ok' }))
    await handler(ctx)

    const request: HttpRequest = { ...DEFAULT_HTTP_GET_REQUEST, query: new URLSearchParams('something') }
    const functionResult = await ctx.functionHandler(request, MOCK_PRE_CONTEXT.invocationContext)

    expect(functionResult).toEqual({ status: 400, body: JSON.stringify({ errors: [MOCK_ERROR] }), headers: JSON_HEADERS })
    expect(mockValidator.validateQueryParams).toHaveBeenCalledWith(
      '/api/v1/health?something',
      'GET',
      new URLSearchParams('something'),
      true,
      ['code'],
      expect.anything()
    )
    expect(mockValidator.validateRequestBody).toHaveBeenCalledTimes(0)
  })

  it('should fail with request body validation error', async () => {
    mockValidator.validateQueryParams.mockReturnValueOnce({ errors: undefined, normalizedParams: {} })
    mockValidator.validateRequestBody.mockReturnValueOnce([MOCK_ERROR])
    const handler = configureValidationPreInvocationHandler(mockValidator)
    const ctx = getMockPreContext('api/v1/health?something', JSON.stringify({ status: 'ok' }))
    await handler(ctx)

    const request: HttpRequest = { ...DEFAULT_HTTP_GET_REQUEST, query: new URLSearchParams('something') }
    const functionResult = await ctx.functionHandler(request, MOCK_PRE_CONTEXT.invocationContext)

    expect(functionResult).toEqual({ status: 400, body: JSON.stringify({ errors: [MOCK_ERROR] }), headers: JSON_HEADERS })
    expect(mockValidator.validateRequestBody).toHaveBeenCalledWith('/api/v1/health?something', 'GET', undefined, true, expect.anything())
  })

  it('should exlcude request body validation error', async () => {
    mockValidator.validateQueryParams.mockReturnValueOnce({ errors: undefined, normalizedParams: {} })
    mockValidator.validateRequestBody.mockReturnValueOnce([MOCK_ERROR])
    const handler = configureValidationPreInvocationHandler(mockValidator, {
      ...DEFAULT_HOOK_OPTIONS,
      exclude: [
        {
          path: '/api/v1/health',
          method: 'GET',
          validation: false,
        },
      ],
    })
    const ctx = getMockPreContext('api/v1/health', JSON.stringify({ status: 'ok' }))
    await handler(ctx)

    const request: HttpRequest = { ...DEFAULT_HTTP_GET_REQUEST, query: new URLSearchParams('something') }
    const functionResult = await ctx.functionHandler(request, MOCK_PRE_CONTEXT.invocationContext)

    expect(functionResult).toEqual({ status: 200, body: '{"status":"ok"}' })
    expect(mockValidator.validateRequestBody).not.toHaveBeenCalled()
  })

  it('should exlcude query validation', async () => {
    mockValidator.validateQueryParams.mockReturnValueOnce({ errors: [MOCK_ERROR], normalizedParams: {} })
    const handler = configureValidationPreInvocationHandler(mockValidator, {
      ...DEFAULT_HOOK_OPTIONS,
      exclude: [
        {
          path: 'api/v1/health',
          method: 'GET',
          validation: false,
        },
      ],
    })
    const ctx = getMockPreContext('api/v1/health', JSON.stringify({ status: 'ok' }))
    await handler(ctx)

    const request: HttpRequest = { ...DEFAULT_HTTP_GET_REQUEST, query: new URLSearchParams('something') }
    const functionResult = await ctx.functionHandler(request, MOCK_PRE_CONTEXT.invocationContext)

    expect(functionResult).toEqual({ status: 200, body: '{"status":"ok"}' })
    expect(mockValidator.validateRequestBody).not.toHaveBeenCalled()
  })

  it('should pass post request without body', async () => {
    mockValidator.validateQueryParams.mockReturnValueOnce({ errors: undefined, normalizedParams: {} })
    const handler = configureValidationPreInvocationHandler(mockValidator)
    const ctx = getMockPreContext('api/v1/messages', JSON.stringify({ status: 'ok' }))
    await handler(ctx)

    const request: HttpRequest = DEFAULT_HTTP_POST_REQUEST()
    const functionResult = await ctx.functionHandler(request, MOCK_PRE_CONTEXT.invocationContext)

    expect(functionResult).toEqual({ status: 200, body: '{"status":"ok"}' })
    expect(mockValidator.validateQueryParams).toHaveBeenCalledWith(
      '/api/v1/messages',
      'POST',
      new URLSearchParams(),
      true,
      ['code'],
      expect.anything()
    )
    expect(mockValidator.validateRequestBody).toHaveBeenCalledWith('/api/v1/messages', 'POST', undefined, true, expect.anything())
  })

  it('should pass post request', async () => {
    mockValidator.validateQueryParams.mockReturnValueOnce({ errors: undefined, normalizedParams: {} })
    const handler = configureValidationPreInvocationHandler(mockValidator)
    const ctx = getMockPreContext('api/v1/messages', JSON.stringify({ status: 'ok' }))
    await handler(ctx)

    const request: HttpRequest = DEFAULT_HTTP_POST_REQUEST({ hello: 'world' })
    const functionResult = await ctx.functionHandler(request, MOCK_PRE_CONTEXT.invocationContext)

    expect(functionResult).toEqual({ status: 200, body: '{"status":"ok"}' })
    expect(mockValidator.validateQueryParams).toHaveBeenCalledWith(
      '/api/v1/messages',
      'POST',
      new URLSearchParams(),
      true,
      ['code'],
      expect.anything()
    )
    expect(mockValidator.validateRequestBody).toHaveBeenCalledWith('/api/v1/messages', 'POST', { hello: 'world' }, true, expect.anything())
  })

  it('should fail missing request content type', async () => {
    mockValidator.validateQueryParams.mockReturnValueOnce({ errors: undefined, normalizedParams: {} })
    const handler = configureValidationPreInvocationHandler(mockValidator)
    const ctx = getMockPreContext('api/v1/messages', JSON.stringify({ status: 'ok' }))
    await handler(ctx)

    const request: HttpRequest = DEFAULT_HTTP_POST_REQUEST({ hello: 'world' })
    request.headers.delete('Content-Type')
    const functionResult = await ctx.functionHandler(request, MOCK_PRE_CONTEXT.invocationContext)

    expect(functionResult).toEqual({
      status: 400,
      body: '{"errors":[{"status":400,"code":"Validation-missing-content-type-header","title":"The request header \'Content-Type\' is missing"}]}',
      headers: { 'Content-Type': 'application/json' },
    })

    expect(mockValidator.validateRequestBody).not.toHaveBeenCalled()
  })

  it('should fail wrong request content type', async () => {
    mockValidator.validateQueryParams.mockReturnValueOnce({ errors: undefined, normalizedParams: {} })
    const handler = configureValidationPreInvocationHandler(mockValidator)
    const ctx = getMockPreContext('api/v1/messages', JSON.stringify({ status: 'ok' }))
    await handler(ctx)

    const request: HttpRequest = DEFAULT_HTTP_POST_REQUEST({ hello: 'world' })
    request.headers.set('Content-Type', 'text/plain')
    const functionResult = await ctx.functionHandler(request, MOCK_PRE_CONTEXT.invocationContext)

    expect(functionResult).toEqual({
      status: 400,
      body: '{"errors":[{"status":400,"code":"Validation-invalid-content-type-header","title":"The content type \'text/plain\' is not supported."}]}',
      headers: { 'Content-Type': 'application/json' },
    })

    expect(mockValidator.validateRequestBody).not.toHaveBeenCalled()
  })

  it('should fail with post request body validation error', async () => {
    mockValidator.validateQueryParams.mockReturnValueOnce({ errors: undefined, normalizedParams: {} })
    mockValidator.validateRequestBody.mockReturnValueOnce([MOCK_ERROR])
    const handler = configureValidationPreInvocationHandler(mockValidator)
    const ctx = getMockPreContext('api/v1/messages', JSON.stringify({ status: 'ok' }))
    await handler(ctx)

    const request: HttpRequest = DEFAULT_HTTP_POST_REQUEST({ hello: 'world' })
    const functionResult = await ctx.functionHandler(request, MOCK_PRE_CONTEXT.invocationContext)

    expect(functionResult).toEqual({ status: 400, body: JSON.stringify({ errors: [MOCK_ERROR] }), headers: JSON_HEADERS })
    expect(mockValidator.validateQueryParams).toHaveBeenCalledWith(
      '/api/v1/messages',
      'POST',
      new URLSearchParams(),
      true,
      ['code'],
      expect.anything()
    )
    expect(mockValidator.validateRequestBody).toHaveBeenCalledWith('/api/v1/messages', 'POST', { hello: 'world' }, true, expect.anything())
  })

  it('should pass no response body', async () => {
    const handler = configureValidationPostInvocationHandler(mockValidator, withResponseValidation)
    const ctx = getMockPostContext('api/v1/health', { ...DEFAULT_HTTP_GET_REQUEST }, { status: 200 })
    await handler(ctx)

    expect(ctx.result).toEqual({ status: 200 })
    expect(mockValidator.validateResponseBody).toHaveBeenCalledWith('/api/v1/health', 'GET', 200, undefined, true, expect.anything())
  })

  it('should pass with response body', async () => {
    const handler = configureValidationPostInvocationHandler(mockValidator, withResponseValidation)
    const ctx = getMockPostContext('api/v1/health', { ...DEFAULT_HTTP_GET_REQUEST }, { status: 200, jsonBody: { hello: 'ok' } })
    await handler(ctx)

    expect(ctx.result).toEqual({ status: 200, jsonBody: { hello: 'ok' } })
    expect(mockValidator.validateResponseBody).toHaveBeenCalledWith('/api/v1/health', 'GET', 200, { hello: 'ok' }, true, expect.anything())
  })

  it('should fail with response body', async () => {
    mockValidator.validateResponseBody.mockReturnValueOnce([MOCK_ERROR])
    const handler = configureValidationPostInvocationHandler(mockValidator, withResponseValidation)
    const ctx = getMockPostContext('api/v1/health', { ...DEFAULT_HTTP_GET_REQUEST }, { status: 200, jsonBody: { hello: 'ok' } })
    await handler(ctx)

    expect(ctx.result).toEqual({
      status: 500,
      body: '{"errors":[{"status":500,"code":"Validation","title":"Response body validation failed"}]}',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    expect(mockValidator.validateResponseBody).toHaveBeenCalledWith('/api/v1/health', 'GET', 200, { hello: 'ok' }, true, expect.anything())
  })

  it('should pass with warning for non json response body', async () => {
    const handler = configureValidationPostInvocationHandler(mockValidator, {
      responseBodyValidationMode: { returnErrorResponse: false, strict: true, logLevel: 'info' },
      queryParameterValidationMode: false,
      requestBodyValidationMode: false,
    })
    const ctx = getMockPostContext('api/v1/health', { ...DEFAULT_HTTP_GET_REQUEST }, { status: 200, body: 'hello\nworld' })
    await handler(ctx)

    expect(ctx.result).toEqual({ status: 200, body: 'hello\nworld' })
    expect(mockValidator.validateResponseBody).not.toHaveBeenCalled()
  })

  it('should fail for non json response body', async () => {
    const handler = configureValidationPostInvocationHandler(mockValidator, withResponseValidation)
    const ctx = getMockPostContext('api/v1/health', { ...DEFAULT_HTTP_GET_REQUEST }, { status: 200, body: 'hello\nworld' })
    await handler(ctx)

    expect(ctx.result).toEqual({
      status: 500,
      body: '{"errors":[{"status":500,"code":"Validation-invalid-content-type-header","title":"Response body validation failed"}]}',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    expect(mockValidator.validateResponseBody).not.toHaveBeenCalled()
  })

  it('should handle path request exclusions 1', async () => {
    mockValidator.validateQueryParams.mockReturnValueOnce({ errors: [MOCK_ERROR], normalizedParams: {} })
    mockValidator.validateRequestBody.mockReturnValueOnce([MOCK_ERROR])
    const handler = configureValidationPreInvocationHandler(mockValidator, {
      ...DEFAULT_HOOK_OPTIONS,
      exclude: [
        {
          path: '/api/v1/health',
          method: 'GET',
          validation: {
            queryParameter: false,
            requestBody: false,
            responseBody: true,
          },
        },
      ],
    })
    const ctx = getMockPreContext('api/v1/health', JSON.stringify({ status: 'ok' }))
    await handler(ctx)

    const request: HttpRequest = { ...DEFAULT_HTTP_GET_REQUEST, query: new URLSearchParams('something') }
    const functionResult = await ctx.functionHandler(request, MOCK_PRE_CONTEXT.invocationContext)

    expect(functionResult).toEqual({ status: 200, body: '{"status":"ok"}' })
    expect(mockValidator.validateRequestBody).not.toHaveBeenCalled()
    expect(mockValidator.validateQueryParams).not.toHaveBeenCalled()
  })

  it('should handle path request exclusions2', async () => {
    mockValidator.validateQueryParams.mockReturnValueOnce({ errors: [MOCK_ERROR], normalizedParams: {} })
    mockValidator.validateRequestBody.mockReturnValueOnce([MOCK_ERROR])
    const handler = configureValidationPreInvocationHandler(mockValidator, {
      ...DEFAULT_HOOK_OPTIONS,
      exclude: [
        {
          path: '/api/v1/health',
          method: 'GET',
          validation: {
            queryParameter: false,
            requestBody: {
              returnErrorResponse: true,
              strict: false,
              logLevel: 'info',
            },
            responseBody: true,
          },
        },
      ],
    })
    const ctx = getMockPreContext('api/v1/health', JSON.stringify({ status: 'ok' }))
    await handler(ctx)

    const request: HttpRequest = { ...DEFAULT_HTTP_GET_REQUEST, query: new URLSearchParams('something') }
    const functionResult = await ctx.functionHandler(request, MOCK_PRE_CONTEXT.invocationContext)

    expect(functionResult).toEqual({
      body: '{"errors":[{"status":400,"code":"ValidationError","title":"Validation failed"}]}',
      headers: {
        'Content-Type': 'application/json',
      },
      status: 400,
    })
    expect(mockValidator.validateRequestBody).toHaveBeenCalledWith('/api/v1/health', 'GET', undefined, false, expect.anything())
    expect(mockValidator.validateQueryParams).not.toHaveBeenCalled()
  })

  it('should handle path response exclusions', async () => {
    mockValidator.validateResponseBody.mockReturnValueOnce([MOCK_ERROR])
    const handler = configureValidationPostInvocationHandler(mockValidator, {
      ...DEFAULT_HOOK_OPTIONS,
      exclude: [
        {
          path: '/api/v1/health',
          method: 'GET',
          validation: {
            queryParameter: false,
            requestBody: false,
            responseBody: true,
          },
        },
      ],
    })
    const ctx = getMockPostContext('api/v1/health', { ...DEFAULT_HTTP_GET_REQUEST }, { status: 200, jsonBody: { hello: 'ok' } })
    await handler(ctx)
    expect(ctx.result).toEqual({
      body: '{"errors":[{"status":500,"code":"Validation","title":"Response body validation failed"}]}',
      headers: {
        'Content-Type': 'application/json',
      },
      status: 500,
    })
    expect(mockValidator.validateResponseBody).toHaveBeenCalledWith('/api/v1/health', 'GET', 200, { hello: 'ok' }, true, expect.anything())
  })
})
