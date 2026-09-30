import { useEffect } from "react";
import { completeGithubLogin, fetchGithubLogin } from "../sync/api/githubAuth";
import type { OauthPrefill } from "../sync/syncForm";

/**
 * Returning from GitHub's consent screen: finish the exchange and hand over
 * the token, so the user lands in the sync panel with it already in place.
 *
 * Runs once, on mount: `onReturn` is the first render's.
 */
export function useOauthReturn(onReturn: (oauth: OauthPrefill) => void) {
  useEffect(() => {
    void completeGithubLogin().then(async (token) => {
      if (!token) return;
      const login = await fetchGithubLogin(token);
      onReturn({ token, login });
    });
  }, []);
}
