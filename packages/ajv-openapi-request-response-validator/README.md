# AJV Open API v3 specification validation

This library contains an Open API v3.0 validator that validates http requests and responses.

## Caveats

* Early version: Bugs most likely exist. Bug fixes welcome and more test cases very welcome, too. :-)
* Only supports v3.0 of the Open API specifications (v3.1 has not been tested, contributions welcome)
* Only supports content of type `application/json` (and not `multipart/form-data` for example)
* Does not support external schemas (inline schemas are supported)
* Does not (yet?) validate headers
* Does not (really) validate path params, but supports them in the definition and request route
* Does not support references to properties (e.g. `$ref: '#/components/schemas/Test1/properties/bar/allOf/0/properties/baz'`)
* Does not support `readOnly` or `writeOnly`.
* The default config sets AJV's `removeAdditional` to `false`, otherwise `allOf` validation may cause unexpected results
* The default config sets AJV's `coerceTypes` to `false`, otherwise `anyof` validation may cause unexpected results
  * Query params are usually string values on the other hand, so this library coerces those by default prior to validation
* This library does not validate the Open API specification itself. This might be added in future.

To check out what is supported, take a look at the [test fixtures](./test/fixtures/)

## Getting started

Because the Open API specification can come in different flavors and from different sources, loading the specification file is not in scope
of this library. To load a YAML based spec, you can, for example, use `js-yaml` as follows:

```typescript
import * as fs from 'fs'
import * as yaml from 'js-yaml'

const openApiContent = fs.readFileSync('openapi.yaml', 'utf8')
const openApiSpec = yaml.load(openApiContent)
```

Once you've loaded the specification, create an instance of AJV (for example by using the factory) and the validator.

```typescript
import { AjvOpenApiValidator, createAjvInstance } from '@restfulhead/ajv-openapi-request-response-validator'

const ajv = createAjvInstance()
const validator = new AjvOpenApiValidator(spec, ajv)
```

You can then use the different validation functions such as `validateQueryParams`, `validateRequestBody` and `validateResponseBody`.

For examples, refer to the unit tests.

## License and Attribution

The scripts and documentation in this project are released under the [MIT License](LICENSE)

Some of the validation test cases are based on the tests from [openapi-request-validator](`https://github.com/kogosoftwarellc/open-api/tree/main/packages/openapi-request-validator`) by Kogo Software LLC released under MIT.