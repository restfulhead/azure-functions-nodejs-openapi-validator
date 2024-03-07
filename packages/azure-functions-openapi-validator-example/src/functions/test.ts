import * as fs from 'fs'
import * as yaml from 'js-yaml'
import { app, HttpRequest, HttpResponseInit, InvocationContext, PreInvocationContext } from '@azure/functions'
import {
  createJsonResponse,
  setupValidation,
  DEFAULT_HOOK_OPTIONS,
  HOOK_DATA_NORMALIZED_QUERY_PARAMS_KEY,
} from '@restfulhead/azure-functions-openapi-validator'

/***
 * Load the OpenAPI spec from a file and setup the validator
 */
const openApiContent = fs.readFileSync(`${__dirname}/../../../src/openapi.yaml`, 'utf8')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const openApiSpec = yaml.load(openApiContent) as any

setupValidation(openApiSpec, {
  ...DEFAULT_HOOK_OPTIONS,
  responseBodyValidationMode: {
    returnErrorResponse: true,
    logLevel: 'warn',
    strict: true,
  },
})

app.hook.preInvocation((preContext: PreInvocationContext) => {
  const origHandler = preContext.functionHandler
  preContext.functionHandler = (origRequest: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> | HttpResponseInit => {
    const result = origHandler(origRequest, context)
    const normalizedQueryParams = preContext.hookData[HOOK_DATA_NORMALIZED_QUERY_PARAMS_KEY]
    console.log('Normalized query params', JSON.stringify(normalizedQueryParams))
    return result
  }
})

/**
 *  This has nothing to do with the validator, just a workaround for https://github.com/Azure/azure-functions-host/issues/9238 and
 *  https://github.com/Azure/azure-functions-host/issues/8222
 */
app.hook.postInvocation(async () => {
  // Add slight delay to ensure logs show up before the invocation finishes
  await new Promise((resolve) => setTimeout(resolve, 50))
})

export async function postUser(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log(`Http function processed request for url "${request.url}"`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestBody: any = await request.json()

  return { jsonBody: { name: requestBody.name, id: 123 }, status: 201 }
}

export function getUser(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log(`Http function processed request for url "${request.url}"`)

  return Promise.resolve({ body: JSON.stringify({ name: 'jane doe', id: '456' }) })
}

export function getUsers(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log(`Http function processed request for url "${request.url}"`)

  return Promise.resolve(createJsonResponse([{ name: 'jane doe', id: '456' }]))
}

// TODO add many more test cases

app.post('post-users', {
  route: 'users',
  authLevel: 'anonymous',
  handler: postUser,
})

app.get('get-users', {
  route: 'users',
  authLevel: 'anonymous',
  handler: getUsers,
})

app.get('get-users-uid', {
  route: 'users/{uid}',
  authLevel: 'anonymous',
  handler: getUser,
})
