/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'fs'
import * as path from 'path'
import { OpenAPIV3 } from 'openapi-types'
import copy from 'fast-copy'
import { createAjvInstance } from '../../src/ajv-factory'
import { AjvOpenApiValidator } from '../../src/ajv-openapi-request-response-validator'
import { ErrorObj } from '../../src/openapi-validator'

const BASE_SPEC: OpenAPIV3.Document = {
  openapi: '3.0.0',
  paths: {},
  info: {
    title: 'Test',
    version: '1.0.0',
  },
  components: {
    parameters: {},
    schemas: {},
    requestBodies: {},
  },
}

interface TestFixture {
  validateArgs: {
    parameters: {
      [key: string]: OpenAPIV3.ReferenceObject | OpenAPIV3.ParameterObject
    }
    requestBody: OpenAPIV3.RequestBodyObject
    schemas: {
      [key: string]: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject
    }
    components: {
      schemas: {
        [key: string]: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject
      }
    }
    paths: OpenAPIV3.PathsObject<any>
  }
  request: {
    method?: string
    route?: string
    body?: unknown
    params?: {
      [key: string]: string
    }
    query?: {
      [key: string]: string
    }
  }

  requestOpts?: {
    strictQueryParamValidation?: boolean
    strictRequestBodyValidation?: boolean
  }

  expectedErrors?: ErrorObj[]
}

// read all *.ts files from the fixtures directory
const onlyInclude: string[] = [] // can be used to only run specific tests. for local testing only!
const fixtureDir = `${__dirname}/../fixtures`
const files = fs.readdirSync(fixtureDir)
const testCases: { [key: string]: TestFixture } = {}
for (const file of files) {
  if (file.endsWith('.js.txt')) {
    const testName = path.basename(file, '.js.txt').replace(/-/g, ' ')
    const fixtureContent = fs.readFileSync(path.resolve(fixtureDir, file), { encoding: 'utf-8' })
    try {
      const fixture: TestFixture = eval(fixtureContent)
      if (!onlyInclude || onlyInclude.length === 0 || onlyInclude.find((name) => file.includes(name))) {
        testCases[testName] = fixture
      }
    } catch (e: any) {
      throw new Error(`Error parsing fixture ${file}: ${e.message}`)
    }
  }
}

describe('The api validator', () => {
  test.each(Object.entries(testCases))('should %s', (name, fixture) => {
    const spec = copy(BASE_SPEC)
    spec.components!.parameters = fixture.validateArgs.parameters
    spec.components!.schemas = fixture.validateArgs.components?.schemas ?? fixture.validateArgs.schemas

    if (fixture.validateArgs.paths) {
      spec.paths = fixture.validateArgs.paths
    } else {
      if (fixture.validateArgs.requestBody || fixture.validateArgs.parameters) {
        const operations: { [method in OpenAPIV3.HttpMethods]?: OpenAPIV3.OperationObject<any> } = {}
        spec.paths[`/${fixture.request.route ?? 'test'}`] = operations
        operations[(fixture.request.method as OpenAPIV3.HttpMethods) ?? 'post'] = {
          requestBody: fixture.validateArgs.requestBody,
          responses: {},
        }
      }
    }

    const ajv = createAjvInstance()
    const validator = new AjvOpenApiValidator(spec, ajv)

    if (fixture.validateArgs.requestBody && fixture.request.body) {
      const result = validator.validateRequestBody(
        `/${fixture.request.route ?? 'test'}`,
        fixture.request.method ?? 'post',
        fixture.request.body,
        fixture.requestOpts?.strictRequestBodyValidation ?? true
      )
      if (fixture.expectedErrors) {
        expect(result).toEqual(fixture.expectedErrors)
      } else {
        expect(result).toBeUndefined()
      }
    }

    if (fixture.validateArgs.paths) {
      const params = fixture.request.query ? fixture.request.query : {}
      for (const [path, method] of Object.entries(fixture.validateArgs.paths)) {
        if (method) {
          for (const [methodName, methodDef] of Object.entries(method)) {
            if (Object.values(OpenAPIV3.HttpMethods).includes(methodName as OpenAPIV3.HttpMethods)) {
              const operation: OpenAPIV3.OperationObject<object> = methodDef
              if (operation.parameters) {
                const result = validator.validateQueryParams(
                  path,
                  methodName,
                  params,
                  fixture.requestOpts?.strictQueryParamValidation ?? true
                )
                if (fixture.expectedErrors) {
                  expect(result.errors).toEqual(fixture.expectedErrors)
                } else {
                  expect(result.errors).toBeUndefined()
                }
              }
              if (operation.requestBody && fixture.request.body) {
                const result = validator.validateRequestBody(
                  path,
                  methodName,
                  fixture.request.body,
                  fixture.requestOpts?.strictRequestBodyValidation ?? true
                )
                if (fixture.expectedErrors) {
                  expect(result).toEqual(fixture.expectedErrors)
                } else {
                  expect(result).toBeUndefined()
                }
              }
            }
          }
        }
      }
    }
  })
})
