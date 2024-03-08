# Azure Functions Open API v3 specification validation

This library contains an Open API v3.0 validator and an Azure Functions v4 hook that validates http function requests.

It identifies the Azure function route and tries to find a matching route in the Open API specification. It then validates query parameters, 
the request body and response body against a schema.

## Caveats

* Please refer to the [ajv-openapi-request-response-validator README](../ajv-openapi-request-response-validator/README.md) to see what's 
  supported and what's not. You might also want to take a look at the [test fixtures](../ajv-openapi-request-response-validator/test/fixtures/).

## Getting started

Because the Open API specification can come in different flavors and from different sources, loading the specification file is not in scope
of this library. To load a YAML based spec, you can for example use `js-yaml` as follows:

```typescript
import * as fs from 'fs'
import * as yaml from 'js-yaml'

const openApiContent = fs.readFileSync('openapi.yaml', 'utf8')
const openApiSpec = yaml.load(openApiContent)
```

Once you've loaded the specification, use the `setupValidation` function to register the hook.

```typescript
import { setupValidation } from '@restfulhead/azure-functions-nodejs-openapi-validator'

setupValidation(openApiSpec)
```

You can also take a look at [the example function app](../azure-functions-openapi-validator-example/src/functions/test.ts).

## Configuration

The `setupValidation` function takes in a number of configuration parameters that allow you to modify the behavior of this libary as well as
[AJV](https://www.npmjs.com/package/ajv), that is used to perform the schema validation.

By default, the hook returns a 400 error response with details about the validation error for request parameter and request body validation.
Validation errors in the response body are only logged.

Here's an example that disables query parameter validaton completely, logs out request body validation errors (but does not return an error 
response) and returns a 500 error response for response body validation errors:

```typescript
setupValidation(openApiSpec, {
  hook: {
    queryParameterValidationMode: false,
    requestBodyValidationMode: {
      returnErrorResponse: false,
      logLevel: 'error',
      strict: true,
    },
    responseBodyValidationMode: {
      returnErrorResponse: true,
      logLevel: 'warn',
      strict: true,
    },
  }
})
```

## Hook data

This library uses the following keys for setting hook data, which can be used by other hooks or passed to your function handler.

* `@restfulhead/azure-functions-openapi-validator/query-param-validation-error`: An array of query parameter validation errors or undefined
* `@restfulhead/azure-functions-openapi-validator/request-body-validation-error`: An array of request body validation errors or undefined
* `@restfulhead/azure-functions-openapi-validator/normalized-query-params`: The coerced (if enabled) and normalized query params

For example, if you enabled query parameter coercion (default), then coerced query parameters can be accesse by later hooks and functions like so:

```ts
app.hook.preInvocation((preContext: PreInvocationContext) => {
  const origHandler = preContext.functionHandler
  preContext.functionHandler = (origRequest: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> | HttpResponseInit => {
    const result = origHandler(origRequest, context)
    const normalizedQueryParams = preContext.hookData[HOOK_DATA_NORMALIZED_QUERY_PARAMS_KEY]
    console.log('Normalized query params', JSON.stringify(normalizedQueryParams))
    return result
  }
})
```

## License and Attribution

The scripts and documentation in this project are released under the [MIT License](LICENSE)

Some of the validation test cases are based on the tests from [openapi-request-validator](`https://github.com/kogosoftwarellc/open-api/tree/main/packages/openapi-request-validator`) by Kogo Software LLC released under MIT.