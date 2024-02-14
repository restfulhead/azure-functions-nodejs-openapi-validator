
# Azure Functions Open API v3 specification validation Example

## Development Setup

To run the example function app locally from VSCode, make sure to install the Azure Functions and Azurite extensions. 
Then start Azurite via the `Azurite: Start` VSCode task.

Build the library `npm run build` or use `npm run watch` to hotdeploy changes. (Warning: This didn't always work for me in practice.)

Start the function app by running the VScode launch configuration `Debug Functions app`.

Then send some requests to the API, for example: 
`curl -X POST -H "Content-Type: application/json" -d '{"name":"hi"}' http://localhost:7071/api/users`
