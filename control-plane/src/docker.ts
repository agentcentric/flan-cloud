import Docker from "dockerode";

// Built once by hand: npm run docker:build in runtime/node
const RUNTIME_IMAGE = "flan-runtime-node";
const RUNTIME_PORT = "8080/tcp";

// Talks to the local Docker daemon (Docker Desktop on Windows)
const docker = new Docker();

function containerName(functionName: string): string {
	return `flan-fn-${functionName}`;
}

export async function removeFunctionContainer(name: string): Promise<void> {
	try {
		// force: stop container first if running
		await docker.getContainer(containerName(name)).remove({ force: true });
	} catch (err) {
		// 404 = no old container, so this is a first deploy. Anything else is real.
		if ((err as { statusCode?: number }).statusCode !== 404) throw err;
	}
}

export type FunctionContainer = {
	container: Docker.Container;
	// Host port Docker mapped to the runtime's 8080
	port: number;
};

// Starts the runtime with the function's folder mounted
export async function startFunctionContainer(
	name: string,
	functionDir: string,
): Promise<FunctionContainer> {
	const container = await docker.createContainer({
		name: containerName(name),
		Image: RUNTIME_IMAGE,
		ExposedPorts: { [RUNTIME_PORT]: {} },
		HostConfig: {
			// Same files as the host folder; read-only so the function can't edit itself
			Mounts: [
				{
					Type: "bind",
					Source: functionDir,
					Target: "/app/function",
					ReadOnly: true,
				},
			],
			// Empty HostPort = Docker picks a free port. Bound to localhost only.
			PortBindings: { [RUNTIME_PORT]: [{ HostIp: "127.0.0.1", HostPort: "" }] },
		},
	});

	// createContainer only creates it; start actually runs it
	await container.start();

	// The chosen port is only known after start, so ask Docker for it
	const info = await container.inspect();
	const hostPort = info.NetworkSettings.Ports[RUNTIME_PORT]?.[0]?.HostPort;
	if (!hostPort) throw new Error(`No host port for ${containerName(name)}`);
	return { container, port: Number(hostPort) };
}

// Never resolves: it only rejects, once the container stops.
// Race it against a health check to fail fast when the function crashes.
export async function failOnExit(
	container: Docker.Container,
	signal: AbortSignal,
): Promise<never> {
	const { StatusCode } = await container.wait({ abortSignal: signal });
	throw new Error(`Container exited with code ${StatusCode}`);
}

// Each log frame starts with an 8-byte header:
// byte 0 = stream (1 stdout, 2 stderr), bytes 4-7 = length of the text after it
const LOG_HEADER_SIZE = 8;

// Turns Docker's framed log bytes into plain text (stdout and stderr merged).
// Pure function (bytes in, string out), so it's easy to test later.
function demuxLogs(raw: Buffer): string {
	const frames: Buffer[] = [];
	let offset = 0;

	// Stop if a full header doesn't fit (a cut-off last frame)
	while (offset + LOG_HEADER_SIZE <= raw.length) {
		const length = raw.readUInt32BE(offset + 4);
		const start = offset + LOG_HEADER_SIZE;
		frames.push(raw.subarray(start, start + length));
		offset = start + length; // jump to the next frame's header
	}

	// Decode once at the end: a multi-byte character (like an emoji) can be
	// split across two frames, and decoding each frame alone would garble it
	return Buffer.concat(frames).toString("utf8");
}

// Exported: what the route calls
export async function tailLogs(
	container: Docker.Container,
	lines = 50,
): Promise<string> {
	const raw = await container.logs({ stdout: true, stderr: true, tail: lines });
	return demuxLogs(raw);
}
