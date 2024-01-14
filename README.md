# Azure Functions Open API specification validation

This library contains an Open API validator and an Azure Functions v4 hook that validates http function requests.

It identifies the Azure function route and tries to find a matching route in the Open API specification. It then validates query parameters, 
the request body and response body against the schema.

(Note: This library does not validate the Open API specification itself. I suggest you use another tool for this for now.)

## Getting started

Because the Open API specification can come in different flavors and from different sources, loading the specification file is not in scope
of this library. To load a YAML based spec, you can for example use `js-yaml` as follows:

```typescript
const openApiContent = fs.readFileSync('openapi.yaml', 'utf8')
const openApiSpec = yaml.load(openApiContent)
```

Once you've loaded the specification, use the `setupValidation` function to register the hook.

```typescript
setupValidation(openApiSpec)
```

You can also take a look at [the example function app](example/src/functions/test.ts).

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

## Development Setup

To run the example function app locally from VSCode, make sure to install the Azure Functions and Azurite extensions. 
Then start Azurite via the `Azurite: Start` VSCode task.

Build the library `npm run build` or use `npm run watch` to hotdeploy changes.

Start the function app by running the VScode launch configuration "Attach to Node Functions".

## License

The scripts and documentation in this project are released under the [MIT License](LICENSE)
