/**
 * "Sign in with GitHub" — a convenience wrapper around the same security
 * model as a pasted PAT: the outcome of the whole dance is a token in this
 * browser, used exactly the way a pasted token is.
 *
 * The authorize redirect and the code-for-token exchange follow the OAuth web
 * flow. The exchange needs the client secret, so it goes through the tiny
 * serverless function in /api; a deployment without that function simply
 * doesn't show the button, and the PAT path keeps working.
 */
const STATE_KEY = "outliner:oauth-state";
const EXCHANGE_URL = "/api/github-oauth";

/** The OAuth client id of this deployment, or null when OAuth isn't set up. */
export async function fetchOauthClientId(): Promise<string | null> {
  try {
    const response = await fetch(EXCHANGE_URL, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const body = (await response.json()) as { clientId?: string };
    return typeof body.clientId === "string" && body.clientId !== "" ? body.clientId : null;
  } catch {
    return null;
  }
}

/** Leaves the page for GitHub's consent screen. */
export function beginGithubLogin(clientId: string): void {
  const state = crypto.randomUUID();
  sessionStorage.setItem(STATE_KEY, state);
  const query = new URLSearchParams({
    client_id: clientId,
    // Classic OAuth scopes are coarse: `repo` covers all of the account's
    // repositories. The settings copy points people who want narrower access
    // at fine-grained PATs instead.
    scope: "repo",
    state,
    redirect_uri: location.origin + location.pathname
  });
  location.assign(`https://github.com/login/oauth/authorize?${query}`);
}

/**
 * Completes a login when the URL carries GitHub's callback parameters.
 * Returns the token, or null when this page load is not a callback.
 */
export async function completeGithubLogin(): Promise<string | null> {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  const state = params.get("state");
  if (!code) return null;

  // Strip the one-time parameters whatever happens next, so a reload does not
  // retry a spent code.
  history.replaceState(null, "", location.pathname);

  const expected = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(STATE_KEY);
  // A mismatched state means this callback was not started by this tab —
  // possibly someone else's forged link. Ignore it.
  if (!expected || state !== expected) return null;

  const response = await fetch(EXCHANGE_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code }),
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { token?: string };
  return typeof body.token === "string" && body.token !== "" ? body.token : null;
}

/** The login name behind a token, for prefilling `owner/repo`. */
export async function fetchGithubLogin(token: string): Promise<string | null> {
  try {
    const response = await fetch("https://api.github.com/user", {
      headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { login?: string };
    return typeof body.login === "string" ? body.login : null;
  } catch {
    return null;
  }
}

/** Creates a private repository for the notes. Returns true when it exists afterwards. */
export async function createPrivateRepo(token: string, name: string): Promise<boolean> {
  try {
    const response = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ name, private: true, description: "Outliner notes" }),
      signal: AbortSignal.timeout(15_000)
    });
    // 422 with "name already exists" is success for our purposes.
    return response.status === 201 || response.status === 422;
  } catch {
    return false;
  }
}
