/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'fs'
import * as path from 'path'
import { OpenAPIV3 } from 'openapi-types'
import { AjvOpenApiValidator } from '../../src/ajv-openapi-validator'
import copy from 'fast-copy'
import { ErrorObj } from '../../src'

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
    paths: OpenAPIV3.PathsObject<any>
  }
  request: {
    method?: string
    path?: string
    body?: unknown
    params?: {
      [key: string]: string
    }
    headers?: {
      [key: string]: string
    }
    query?: {
      [key: string]: string
    }
  }

  requestOpts?: {
    strictQueryParamValidation?: boolean
  }

  expectedErrors?: ErrorObj[]
}

// read all *.ts files from the fixtures directory
const fixtureDir = `${__dirname}/../fixtures`
const files = fs.readdirSync(fixtureDir)
const testCases: { [key: string]: TestFixture } = {}
for (const file of files) {
  if (file.endsWith('.js.txt')) {
    const testName = path.basename(file, '.js.txt').replace(/-/g, ' ')
    const fixtureContent = fs.readFileSync(path.resolve(fixtureDir, file), { encoding: 'utf-8' })
    const fixture: TestFixture = eval(fixtureContent)
    testCases[testName] = fixture
  }
}

describe('The api validator', () => {
  test.each(Object.entries(testCases))('should %s', (name, fixture) => {
    const spec = copy(BASE_SPEC)
    spec.components!.parameters = fixture.validateArgs.parameters
    spec.components!.schemas = fixture.validateArgs.schemas

    if (fixture.validateArgs.paths) {
      spec.paths = fixture.validateArgs.paths
    } else {
      if (fixture.validateArgs.requestBody || fixture.validateArgs.parameters) {
        const operations: { [method in OpenAPIV3.HttpMethods]?: OpenAPIV3.OperationObject<any> } = {}
        spec.paths[fixture.request.path ?? '/test'] = operations
        operations[(fixture.request.method as OpenAPIV3.HttpMethods) ?? 'post'] = {
          requestBody: fixture.validateArgs.requestBody,
          responses: {},
        }
      }
    }

    const validator = new AjvOpenApiValidator(spec)

    if (fixture.validateArgs.requestBody && fixture.request.body) {
      const result = validator.validateRequestBody(fixture.request.path ?? '/test', fixture.request.method ?? 'post', fixture.request.body)
      if (fixture.expectedErrors) {
        expect(result).toEqual(fixture.expectedErrors)
      } else {
        expect(result).toBeUndefined()
      }
    }

    if (fixture.validateArgs.paths) {
      const params = fixture.request.query ? new URLSearchParams(fixture.request.query) : new URLSearchParams()
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
                  expect(result).toEqual(fixture.expectedErrors)
                } else {
                  expect(result).toBeUndefined()
                }
              }
              if (operation.requestBody && fixture.request.body) {
                const result = validator.validateRequestBody(
                  fixture.request.path ?? '/test',
                  fixture.request.method ?? 'post',
                  fixture.request.body
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
