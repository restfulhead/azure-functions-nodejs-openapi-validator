/* eslint-disable @typescript-eslint/no-explicit-any */
import { MockProxy, mock, mockReset } from 'jest-mock-extended'
import { configureValidationPreInvocationHandler } from '../../src/validation-hook-setup'
import { AjvOpenApiValidator } from '@restfulhead/ajv-openapi-request-response-validator'
import { HttpRequest, PreInvocationContext } from '@azure/functions'

describe('The app validator', () => {
  let mockValidator: MockProxy<AjvOpenApiValidator> & AjvOpenApiValidator

  const logFn = (...args: any[]) => console.log(...args)

  const MOCK_CONTEXT: PreInvocationContext = {
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

  const getMockContext = (route: string, jsonBody?: string): PreInvocationContext =>
    ({
      ...MOCK_CONTEXT,
      invocationContext: {
        ...MOCK_CONTEXT.invocationContext,
        options: {
          ...MOCK_CONTEXT.invocationContext.options,
          trigger: {
            ...MOCK_CONTEXT.invocationContext.options.trigger,
            route,
          },
        },
      },
      functionHandler: () => ({
        status: 200,
        jsonBody,
      }),
    }) as any

  const DEFAULT_HTTP_REQUEST: HttpRequest = {
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

  beforeEach(() => {
    mockValidator = mock<AjvOpenApiValidator>()
  })

  afterEach(() => {
    mockReset(mockValidator)
  })

  it('should succeed ApiError model validation', async () => {
    const handler = configureValidationPreInvocationHandler(mockValidator)
    const ctx = getMockContext('/api/v1/health', JSON.stringify({ status: 'ok' }))
    await handler(ctx)

    const request: HttpRequest = { ...DEFAULT_HTTP_REQUEST }
    const functionHook = await ctx.functionHandler(request, MOCK_CONTEXT.invocationContext)

    expect(functionHook).toBeDefined()
  })
})
