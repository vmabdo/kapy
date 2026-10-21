"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface UseDebouncedSearchParamOptions {
  /** URL search param that stores the query. */
  paramName?: string;
  /** Debounce delay in milliseconds. */
  delay?: number;
}

/**
 * Keeps a text input controlled by local state while syncing it to a URL
 * search param after the user stops typing.
 *
 * Important details:
 * - The router / pathname / searchParams objects are read through a ref, so
 *   they never re-run the debounce effect.
 * - `lastRequestedRef` prevents our own navigation from being treated as an
 *   external change (which would otherwise overwrite characters typed while
 *   the previous RSC request was still in flight).
 * - External URL changes (back/forward, "clear filters", etc.) still sync back
 *   into the input.
 */
export function useDebouncedSearchParam({
  paramName = "query",
  delay = 350,
}: UseDebouncedSearchParamOptions = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlValue = searchParams.get(paramName) ?? "";

  const [searchInput, setSearchInput] = useState(urlValue);
  const [isPending, startTransition] = useTransition();

  // Keep the latest navigation objects available to the timeout without
  // making them reactive dependencies of the debounce effect.
  const navigationRef = useRef({ router, pathname, searchParams });
  useEffect(() => {
    navigationRef.current = { router, pathname, searchParams };
  });

  // The value we most recently sent to the router. Used to distinguish our
  // own navigation from an external URL change.
  const lastRequestedRef = useRef(urlValue);

  useEffect(() => {
    if (urlValue === lastRequestedRef.current) return;
    lastRequestedRef.current = urlValue;
    setSearchInput(urlValue);
  }, [urlValue]);

  useEffect(() => {
    const nextValue = searchInput.trim();
    const currentValue =
      navigationRef.current.searchParams.get(paramName) ?? "";

    if (nextValue === currentValue) return;

    const timeoutId = setTimeout(() => {
      const {
        router: currentRouter,
        pathname: currentPathname,
        searchParams: currentSearchParams,
      } = navigationRef.current;

      // Re-check at fire time: the URL may have changed while waiting.
      if ((currentSearchParams.get(paramName) ?? "") === nextValue) return;

      const params = new URLSearchParams(currentSearchParams.toString());
      if (nextValue) {
        params.set(paramName, nextValue);
      } else {
        params.delete(paramName);
      }

      const queryString = params.toString();
      lastRequestedRef.current = nextValue;

      startTransition(() => {
        currentRouter.replace(
          queryString ? `${currentPathname}?${queryString}` : currentPathname,
          { scroll: false }
        );
      });
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [searchInput, delay, paramName, startTransition]);

  return { searchInput, setSearchInput, isPending };
}
