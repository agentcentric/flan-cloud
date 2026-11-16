import { setTimeout as sleep } from "node:timers/promises";

const HEALTH_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 200;

// Polls the function's health endpoint until it answers, or gives up.
// The shim only listens after the function loads, so "ok" means it really works.
// Aborting `signal` stops the polling early.
export async function waitForHealthy(
	port: number,
	signal?: AbortSignal,
): Promise<void> {
	const url = `http://127.0.0.1:${port}/_flan/health`;
	const deadline = Date.now() + HEALTH_TIMEOUT_MS;

	while (Date.now() < deadline) {
		signal?.throwIfAborted();
		try {
			// Give up on this attempt after 1s, or right away if aborted
			const attemptSignal = AbortSignal.any([
				AbortSignal.timeout(1000),
				...(signal ? [signal] : []),
			]);
			const res = await fetch(url, { signal: attemptSignal });
			if (res.ok) return;
		} catch {
			// Not listening yet (connection refused); try again
		}
		await sleep(POLL_INTERVAL_MS, undefined, { signal });
	}

	throw new Error(`Not healthy after ${HEALTH_TIMEOUT_MS}ms`);
}
