'use client';

import { useEffect, useState } from 'react';
import { getEnabledOAuthProviders } from '../app/actions/auth';

/**
 * OAuth providers enabled on the auth server; empty until the lookup resolves.
 * @returns {string[]}
 */
export function useOAuthProviders() {
  const [providers, setProviders] = useState([]);

  useEffect(() => {
    let cancelled = false;
    getEnabledOAuthProviders()
      .then((enabled) => {
        if (!cancelled) setProviders(enabled);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return providers;
}
