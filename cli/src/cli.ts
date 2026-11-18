#!/usr/bin/env node
import { readFile } from "node:fs/promises";

// One full URL (scheme + host + port), matching the control plane's FLAN_* env style
const CONTROL_PLANE_URL = process.env.FLAN_URL ?? "http://127.0.0.1:3000";

const USAGE = `Usage:
  flan deploy <name> <file>   Deploy a function from a single file`;

// What the control plane's deploy route sends back
type DeployResult = { name: string; url: string };
type ErrorResult = { error?: string; logs?: string };

// Bad or missing arguments: show usage and exit 2 (the usage-error convention)
function usageError(message: string): never {
	console.error(`${message}\n\n${USAGE}`);
	process.exit(2);
}

// A valid command that failed while running
function fail(message: string): never {
	console.error(message);
	process.exit(1);
}

async function readFunctionFile(file: string): Promise<string> {
	try {
		return await readFile(file, "utf8");
	} catch (err) {
		const code = err instanceof Error && "code" in err ? err.code : undefined;
		if (code === "ENOENT") fail(`No file found at ${file}`);
		if (code === "EISDIR") fail(`${file} is a folder; pass a single file`);
		throw err; // Unexpected: let Node print the full error
	}
}

async function deploy(args: string[]): Promise<void> {
	const [name, file, ...extra] = args;
	if (!name || !file) usageError("deploy needs a function name and a file.");
	if (extra.length > 0) usageError(`Unexpected arguments: ${extra.join(" ")}`);

	const code = await readFunctionFile(file);

	// The control plane waits for the function to be healthy, so this can take a moment
	console.log(`Deploying ${name}...`);

	let res: Response;
	try {
		res = await fetch(
			`${CONTROL_PLANE_URL}/functions/${encodeURIComponent(name)}`,
			{
				method: "PUT",
				headers: { "Content-Type": "text/plain" },
				body: code,
			},
		);
	} catch {
		fail(
			`Couldn't reach the control plane at ${CONTROL_PLANE_URL}. Is it running?`,
		);
	}

	if (!res.ok) {
		// Error bodies should be JSON, but don't crash if they aren't
		const body = (await res.json().catch(() => ({}))) as ErrorResult;
		const logs = body.logs ? `\n\nFunction logs:\n${body.logs}` : "";
		fail(
			`Deploy failed (${res.status}): ${body.error ?? res.statusText}${logs}`,
		);
	}

	const result = (await res.json()) as DeployResult;
	console.log(`Deployed ${result.name} at ${result.url}`);
}

const [command, ...args] = process.argv.slice(2);

if (!command) usageError("No command given.");

switch (command) {
	case "deploy":
		await deploy(args);
		break;
	default:
		usageError(`Unknown command: ${command}`);
}
