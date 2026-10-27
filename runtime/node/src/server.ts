import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { env } from "node:process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { pathToFileURL } from "node:url";

type Handler = (request: Request) => Response | Promise<Response>;

const DEFAULT_FUNCTION_PATH = "/app/function/index.ts";
const DEFAULT_PORT = 8080;
const HEALTH_PATH = "/_flan/health";

// Read config once at startup so bad values fail immediately
const functionPath = resolve(env.FLAN_FUNCTION_PATH ?? DEFAULT_FUNCTION_PATH);
const port = Number(env.PORT ?? DEFAULT_PORT);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
	console.error(`Invalid PORT: ${env.PORT}`);
	process.exit(1);
}

// Load the function before listening, so a healthy server means a loaded function
const functionModule = await import(pathToFileURL(functionPath).href);

if (typeof functionModule.default !== "function") {
	console.error(
		`${functionPath} must have a default export that is a function`,
	);
	process.exit(1);
}

const handler: Handler = functionModule.default;

// Convert Node's request into the web-standard Request the function expects
function nodeReqToWebRequest(req: IncomingMessage): Request {
	// req.url is only the path and query, so add a scheme and host to make it absolute
	const url = new URL(
		req.url ?? "/",
		`http://${req.headers.host ?? "localhost"}`,
	);

	const headers = new Headers();
	for (const [name, values] of Object.entries(req.headersDistinct)) {
		for (const value of values ?? []) {
			headers.append(name, value);
		}
	}

	const hasBody = req.method !== "GET" && req.method !== "HEAD";

	// Node requires `duplex` for a streamed body, but RequestInit's type doesn't include it
	const init: RequestInit & { duplex: "half" } = {
		method: req.method,
		headers,
		body: hasBody ? (Readable.toWeb(req) as ReadableStream) : null,
		duplex: "half",
	};
	return new Request(url, init);
}

// Copy the function's web Response onto Node's response stream
async function sendWebResponse(
	response: Response,
	res: ServerResponse,
): Promise<void> {
	res.statusCode = response.status;

	// Iterating Headers yields each Set-Cookie separately, and setHeader would keep only the last
	for (const [name, value] of response.headers) {
		if (name !== "set-cookie") {
			res.setHeader(name, value);
		}
	}
	const cookies = response.headers.getSetCookie();
	if (cookies.length > 0) {
		res.setHeader("set-cookie", cookies);
	}

	if (response.body === null) {
		res.end();
		return;
	}

	// pipeline streams the body into res and ends res when the body is done.
	// The global and node:stream/web ReadableStream types differ slightly but are the same at runtime
	await pipeline(Readable.fromWeb(response.body as NodeReadableStream), res);
}

const server = createServer(async (req, res) => {
	// Reserved for the platform: answered by the shim for any method, never passed to the function
	const path = req.url?.split("?")[0];
	if (path === HEALTH_PATH) {
		res.statusCode = 200;
		res.end("ok");
		return;
	}

	const response = await handler(nodeReqToWebRequest(req));
	await sendWebResponse(response, res);
});

server.listen(port, () => {
	console.log(`Listening on port ${port} (function: ${functionPath})`);
});
