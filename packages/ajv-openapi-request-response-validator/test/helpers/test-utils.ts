import * as fs from 'fs'
import * as nodePath from 'path'
import * as yaml from 'js-yaml'

import { OpenAPIV3 } from 'openapi-types'

export async function loadSpec(name: string, path = `${__dirname}/../fixtures/`): Promise<OpenAPIV3.Document> {
  const openApiContent = await fs.promises.readFile(nodePath.join(path, name), 'utf8')
  return yaml.load(openApiContent) as OpenAPIV3.Document
}
