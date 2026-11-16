import Docker from "dockerode";

// Built once by hand: docker build -t flan-runtime-node runtime/node
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

// Starts the runtime with the function's folder mounted, and returns the
// host port Docker picked for it
export async function startFunctionContainer(
	name: string,
	functionDir: string,
): Promise<number> {
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
	return Number(hostPort);
}
