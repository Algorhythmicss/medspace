"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type { ClinicSnapshot } from "@/lib/live-clinic";
type Command = { commandId: string; kind: string; [key: string]: unknown };
export function useClinicState(
  role: string,
  planToken?: string,
  endpoint = `/api/live?view=${role.split(":")[0]}`,
) {
  const [data, setData] = useState<ClinicSnapshot | null>(null),
    [error, setError] = useState(""),
    [stale, setStale] = useState(false),
    [pending, setPending] = useState<Command | null>(null),
    [busy, setBusy] = useState(false);
  const newest = useRef(-1),
    newestTime = useRef(0),
    mounted = useRef(true),
    pendingRef = useRef<Command | null>(null),
    storageKey = `medspace-live-command:${role}`;
  const scope = `${role}:${endpoint}:${planToken ?? ""}`,
    currentScope = useRef(scope);
  useLayoutEffect(() => {
    currentScope.current = scope;
  }, [scope]);
  const storeCommand = useCallback(
    (value?: Command) => {
      try {
        if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
        else sessionStorage.removeItem(storageKey);
      } catch {
        /* The in-memory retry stays available when browser storage is blocked. */
      }
    },
    [storageKey],
  );
  const headers = useCallback(
    (): Record<string, string> =>
      planToken ? { Authorization: `Bearer ${planToken}` } : {},
    [planToken],
  );
  const accept = useCallback((snapshot: ClinicSnapshot) => {
    const receivedTime = Date.parse(snapshot.serverTime);
    if (
      !mounted.current ||
      snapshot.revision < newest.current ||
      (snapshot.revision === newest.current &&
        receivedTime < newestTime.current)
    )
      return;
    newest.current = snapshot.revision;
    newestTime.current = receivedTime;
    setData(snapshot);
    setError("");
    setStale(false);
  }, []);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const requestedScope = currentScope.current;
      const response = await fetch(endpoint, {
        headers: headers(),
        cache: "no-store",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
          : AbortSignal.timeout(10000),
      });
      if (signal?.aborted || requestedScope !== currentScope.current) return;
      if (!response.ok) {
        if (
          response.status === 401 ||
          response.status === 403 ||
          response.status === 404
        ) {
          setData(null);
          pendingRef.current = null;
          setPending(null);
          try {
            sessionStorage.removeItem(storageKey);
          } catch {
            /* Private browsing may disable storage. */
          }
        }
        throw new Error(
          response.status === 401
            ? "Your access expired. Reopen your care link or sign in again."
            : "Live updates are unavailable. Your last saved state may be out of date.",
        );
      }
      const snapshot = await response.json();
      if (!signal?.aborted && requestedScope === currentScope.current)
        accept(snapshot);
    },
    [endpoint, headers, accept, storageKey],
  );
  useEffect(() => {
    mounted.current = true;
    newest.current = -1;
    newestTime.current = 0;
    // A changed credential is an external session change: clear the previous view.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setData(null);
    pendingRef.current = null;
    setPending(null);
    setBusy(false);
    let timer: ReturnType<typeof setTimeout> | undefined,
      failures = 0,
      inFlight = false;
    const controller = new AbortController();
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const command = JSON.parse(saved);
        if (typeof command.commandId === "string") {
          pendingRef.current = command;
          setPending(command);
        }
      }
    } catch {
      try {
        sessionStorage.removeItem(storageKey);
      } catch {
        /* Unavailable storage. */
      }
    }
    async function poll() {
      if (controller.signal.aborted || inFlight) return;
      clearTimeout(timer);
      if (document.visibilityState !== "hidden") {
        inFlight = true;
        try {
          await refresh(controller.signal);
          failures = 0;
        } catch (problem) {
          if (controller.signal.aborted) return;
          failures++;
          setStale(true);
          setError(
            problem instanceof Error
              ? problem.message
              : "Live updates are unavailable.",
          );
        } finally {
          inFlight = false;
        }
      }
      timer = setTimeout(
        poll,
        Math.min(30000, 3000 * 2 ** Math.min(failures, 3)),
      );
    }
    const resume = () => {
      clearTimeout(timer);
      void poll();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("focus", resume);
    void poll();
    return () => {
      mounted.current = false;
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("focus", resume);
    };
  }, [refresh, storageKey]);
  const send = useCallback(
    async (command: Command) => {
      if (busy) return null;
      const requestedScope = currentScope.current;
      setBusy(true);
      pendingRef.current = command;
      setPending(command);
      storeCommand(command);
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { ...headers(), "Content-Type": "application/json" },
          body: JSON.stringify(command),
          signal: AbortSignal.timeout(20000),
        });
        const result = await response.json();
        if (!mounted.current || requestedScope !== currentScope.current)
          return null;
        if (!response.ok) {
          if (response.status < 500) {
            pendingRef.current = null;
            setPending(null);
            storeCommand();
            await refresh().catch(() => {});
          }
          throw new Error(
            result.message || "The update could not be confirmed.",
          );
        }
        pendingRef.current = null;
        setPending(null);
        storeCommand();
        accept(result.snapshot);
        return result.result;
      } catch (problem) {
        if (mounted.current && requestedScope === currentScope.current)
          setError(
            problem instanceof Error
              ? problem.message
              : "The update could not be confirmed. Retry the same action.",
          );
        return null;
      } finally {
        if (mounted.current && requestedScope === currentScope.current)
          setBusy(false);
      }
    },
    [busy, endpoint, headers, storeCommand, refresh, accept],
  );
  const mutate = useCallback(
    (kind: string, value: Record<string, unknown> = {}) => {
      if (pendingRef.current) return Promise.resolve(null);
      return send({ commandId: crypto.randomUUID(), kind, ...value });
    },
    [send],
  );
  const retry = useCallback(
    () =>
      pendingRef.current ? send(pendingRef.current) : Promise.resolve(null),
    [send],
  );
  return { data, error, stale, pending, busy, mutate, retry, refresh };
}
