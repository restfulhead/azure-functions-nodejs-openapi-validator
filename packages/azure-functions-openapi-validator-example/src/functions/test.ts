import * as fs from 'fs'
import * as yaml from 'js-yaml'
import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'
import { setupValidation } from '@restfulhead/azure-functions-nodejs-openapi-validator'

/***
 * Load the OpenAPI spec from a file and setup the validator
 */
const openApiContent = fs.readFileSync(`${__dirname}/../../../src/openapi.yaml`, 'utf8')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const openApiSpec = yaml.load(openApiContent) as any

setupValidation(openApiSpec)

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

  return { jsonBody: { name: requestBody.name, id: '123' }, status: 201 }
}

export function getUser(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  context.log(`Http function processed request for url "${request.url}"`)

  return Promise.resolve({ body: JSON.stringify({ name: 'jane doe', id: '456' }) })
}

// TODO add many more test cases

app.post('post-users', {
  route: 'users',
  authLevel: 'anonymous',
  handler: postUser,
})

app.get('get-users-uid', {
  route: 'users/{uid}',
  authLevel: 'anonymous',
  handler: getUser,
})