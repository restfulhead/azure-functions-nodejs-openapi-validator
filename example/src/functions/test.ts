import * as fs from 'fs'
import * as yaml from 'js-yaml'
import { app, HttpResponseInit, InvocationContext } from '@azure/functions'
import { setupValidation, ParsedRequestBodyHttpRequest } from '@restfulhead/azure-functions-nodejs-openapi-validator'

/***
 * Load the OpenAPI spec from a file and setup the validator
 */
const openApiContent = fs.readFileSync(`${__dirname}/../../../../test/fixtures/openapi.yaml`, 'utf8')
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

// eslint-disable-next-line require-await
export async function putUser(
  request: ParsedRequestBodyHttpRequest<{ name: string }>,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log(`Http function processed request for url "${request.url}"`)

  const name = request.parsedBody.name

  return { body: `Hello, ${name}!` }
}

app.put('post-users-uid', {
  route: 'users/{uid}',
  authLevel: 'anonymous',
  handler: putUser,
})
