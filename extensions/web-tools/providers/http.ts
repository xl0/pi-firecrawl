export async function requestJson(label: string, url: string, init: RequestInit, timeout: number, signal?: AbortSignal): Promise<unknown> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), timeout)
	const abort = () => controller.abort()
	if (signal?.aborted) controller.abort()
	else signal?.addEventListener("abort", abort, { once: true })

	try {
		const res = await fetch(url, { ...init, signal: controller.signal })

		if (!res.ok) {
			const text = await res.text()
			throw new Error(`${label} request failed (${res.status}): ${text}`)
		}

		return res.json()
	} finally {
		clearTimeout(timer)
		signal?.removeEventListener("abort", abort)
	}
}
