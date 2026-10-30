import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { env } from "node:process";
import { serve } from "@hono/node-server";
import { Hono } from "hono";

const DEFAULT_PORT = 3000;

// Read config once at startup so bad values fail immediately
const dataDir = resolve(env.FLAN_DATA_DIR ?? ".flan");
const port = Number(env.PORT ?? DEFAULT_PORT);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
	console.error(`Invalid PORT: ${env.PORT}`);
	process.exit(1);
}

// Lowercase letters, numbers and dashes, starting with a letter or number.
// Blocks path traversal like "../../etc", and is also a valid Docker container name
const FUNCTION_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

const app = new Hono();

app.all("/_flan/health", (c) => c.text("ok"));

app.put("/functions/:name", async (c) => {
	const name = c.req.param("name");
	if (!FUNCTION_NAME.test(name)) {
		return c.text(
			"Invalid function name: use lowercase letters, numbers and dashes",
			400,
		);
	}

	const functionCode = await c.req.text();
	const functionDir = join(dataDir, "functions", name);

	try {
		await mkdir(functionDir, { recursive: true });
		await writeFile(join(functionDir, "index.ts"), functionCode);
	} catch (err) {
		console.error(`Failed to save function ${name}:`, err);
		return c.text("Failed to save function", 500);
	}

	return c.text("deployed");
});

const server = serve({ fetch: app.fetch, port }, () => {
	console.log(`Listening on port ${port} (data: ${dataDir})`);
});

// Stop taking new connections and exit once in-flight requests finish
function shutdown(signal: NodeJS.Signals): void {
	console.log(`Received ${signal}, shutting down`);
	server.close((err) => {
		if (err) {
			console.error(err);
			process.exit(1);
		}
		process.exit(0);
	});
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
