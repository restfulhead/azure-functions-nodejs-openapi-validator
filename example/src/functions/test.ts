import * as fs from 'fs'
import * as yaml from 'js-yaml'
import { app, HttpRequest, HttpResponseInit, InvocationContext, PostInvocationContext, PreInvocationContext } from "@azure/functions";
import { AjvOpenApiValidator } from '@restfulhead/azure-functions-nodejs-openapi-validator'

const openApiContent = fs.readFileSync(`${__dirname}/../../../../test/fixtures/openapi.yaml`, 'utf8')
const validator = new AjvOpenApiValidator(yaml.load(openApiContent) as any)

app.hook.preInvocation((preContext: PreInvocationContext) => {
    const originalHandler = preContext.functionHandler 
    const path = preContext.invocationContext.options.trigger.route

    preContext.functionHandler = (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
        const method = request.method
        const requestBody = request.body

        context.log(`Validating query parameters '${path}', '${method}'`);
        const reqParamsValResult = validator.validateQueryParams(path, method, request.query)
        if (reqParamsValResult) {
            return Promise.resolve({body: reqParamsValResult, status: 400 })
        }
        
        context.log(`Validating request body for '${path}', '${method}'`);
        const reqBodyValResult = validator.validateRequestBody(path, method,  requestBody, true)
        if (reqBodyValResult) {
            return Promise.resolve({body: reqBodyValResult, status: 400 })
        }

        return originalHandler(request, context)
    }
})


app.hook.postInvocation((postContext: PostInvocationContext) => {
    const path = postContext.invocationContext.options.trigger.route
    const method = 'post' // TODO hook data or else? postContext.invocationContext.

    if (postContext.result) {
        // TODO validate response body
        const respBodyValResult = validator.validateResponseBody(path, method,  postContext.result, true)
        if (respBodyValResult) {
            postContext.result = { body: respBodyValResult, status: 400 }
        }
    }
})


export async function postHelloWorld(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
    context.log(`Http function processed request for url "${request.url}"`);

    const name = await request.text();

    return { body: `Hello, ${name}!` };
};



app.hook.postInvocation(async () => {
    // Add slight delay to ensure logs show up before the invocation finishes
    // See these issues for more info:
    // https://github.com/Azure/azure-functions-host/issues/9238
    // https://github.com/Azure/azure-functions-host/issues/8222
    await new Promise((resolve) => setTimeout(resolve, 50));
});

app.post('post-hello-world', {
    route: 'hello/{world}',
    authLevel: 'anonymous',
    handler: postHelloWorld
});
