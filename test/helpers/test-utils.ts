import * as fs from 'fs'
import * as yaml from 'js-yaml'

import { OpenAPIV3 } from 'openapi-types'

export async function loadSpec(name = 'user-api-example.yaml'): Promise<OpenAPIV3.Document> {
  const openApiContent = await fs.promises.readFile(`${__dirname}/../fixtures/${name}`, 'utf8')
  return yaml.load(openApiContent) as OpenAPIV3.Document
}
