import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { env } from 'node:process';
import { Readable } from 'node:stream';
import { pathToFileURL } from 'node:url';

type Handler = (request: Request) => Response | Promise<Response>;

const DEFAULT_FUNCTION_PATH = '/app/function/index.ts';
const DEFAULT_PORT = 8080;
const HEALTH_PATH = '/_flan/health';

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

// Convert Node's request into the web-standard Request the function expects
function nodeReqToWebRequest(req: IncomingMessage): Request {
    // req.url is only the path and query, so add a scheme and host to make it absolute
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    const headers = new Headers();
    for (const [name, values] of Object.entries(req.headersDistinct)) {
        for (const value of values ?? []) {
            headers.append(name, value);
        }
    }

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';

    // Node requires `duplex` for a streamed body, but RequestInit's type doesn't include it
    const init: RequestInit & { duplex: 'half' } = {
        method: req.method,
        headers,
        body: hasBody ? (Readable.toWeb(req) as ReadableStream) : null,
        duplex: 'half',
    };
    return new Request(url, init);
}

const server = createServer((req, res) => {
    // Reserved for the platform: answered by the shim for any method, never passed to the function
    const path = req.url?.split('?')[0];
    if (path === HEALTH_PATH) {
        res.statusCode = 200;
        res.end('ok');
        return;
    }

    // TODO: call handler with nodeReqToWebRequest(req), send the Response back
});

server.listen(port, () => {
    console.log(`Listening on port ${port} (function: ${functionPath})`);
});