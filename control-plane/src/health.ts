import { setTimeout as sleep } from "node:timers/promises";

const HEALTH_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 200;

// Polls the function's health endpoint until it answers, or gives up.
// The shim only listens after the function loads, so "ok" means it really works.
export async function waitForHealthy(port: number): Promise<void> {
	const url = `http://127.0.0.1:${port}/_flan/health`;
	const deadline = Date.now() + HEALTH_TIMEOUT_MS;

	while (Date.now() < deadline) {
		try {
			const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
			if (res.ok) return;
		} catch {
			// Not listening yet (connection refused); try again
		}
		await sleep(POLL_INTERVAL_MS);
	}

	throw new Error(`Not healthy after ${HEALTH_TIMEOUT_MS}ms`);
}
