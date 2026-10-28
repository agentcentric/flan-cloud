export default async function (request: Request): Promise<Response> {
	const name = new URL(request.url).searchParams.get("name") ?? "world";
	return new Response(`hello ${name}\n`, {
		headers: { "Content-Type": "text/plain" },
	});
}
