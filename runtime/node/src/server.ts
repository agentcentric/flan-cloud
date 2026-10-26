import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { env } from 'node:process';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';

type Handler = (request: Request) => Response | Promise<Response>;

const DEFAULT_FUNCTION_PATH = '/app/function/index.ts';
const DEFAULT_PORT = 8080;

// Read config once at startup so bad values fail immediately
const functionPath = resolve(env.FLAN_FUNCTION_PATH ?? DEFAULT_FUNCTION_PATH);
const port = Number(env.PORT ?? DEFAULT_PORT);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`Invalid PORT: ${env.PORT}`);
    process.exit(1);
}

// Load the function before listening, so a healthy server means a loaded function
const functionModule = await import(pathToFileURL(functionPath).href);

if (typeof functionModule.default !== 'function') {
    console.error(`${functionPath} must have a default export that is a function`);
    process.exit(1);
}

const handler: Handler = functionModule.default;

const server = createServer((req, res) => {});

server.listen(port, () => {
    console.log(`Listening on port ${port} (function: ${functionPath})`);
});