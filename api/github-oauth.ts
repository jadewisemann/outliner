/**
 * The one server-side piece of GitHub login: exchanging an OAuth code for a
 * token requires the client secret, and the secret must never reach the
 * browser. Everything else about sync stays client-side.
 *
 * Deploy notes: on Vercel this file is picked up automatically. Set
 * GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in the project environment, and
 * point the GitHub OAuth App's callback URL at the deployed origin.
 */
type Request = { method?: string; body?: { code?: unknown } };
type Response = {
  status(code: number): Response;
  json(body: unknown): void;
};

export default async function handler(request: Request, response: Response): Promise<void> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    response.status(404).json({ error: "OAuth is not configured on this deployment" });
    return;
  }

  // The client id is public by nature; the app fetches it to build the
  // authorize URL, so self-hosters never bake it into the bundle.
  if (request.method === "GET") {
    response.status(200).json({ clientId });
    return;
  }
  if (request.method !== "POST") {
    response.status(405).json({ error: "method not allowed" });
    return;
  }

  const code = request.body?.code;
  if (typeof code !== "string" || code === "") {
    response.status(400).json({ error: "code required" });
    return;
  }

  const exchange = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
  });
  const data = (await exchange.json().catch(() => null)) as { access_token?: string; error?: string } | null;

  if (!data?.access_token) {
    response.status(400).json({ error: data?.error ?? "token exchange failed" });
    return;
  }
  response.status(200).json({ token: data.access_token });
}
