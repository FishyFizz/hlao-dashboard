import { useCallback, useEffect, useRef } from "react";
import { store, type DashboardState } from "../store/store";
import { parseSessionHash, replaceLocation, sessionHash } from "./routing";

/**
 * Address-bar state: `?demo=1` selects the simulated instance and
 * `#/s/<handle>?created=<iso>` selects a session. Selection is a local view,
 * never a wire operation, so a stale link resolves to the fleet with a toast.
 */
export function useDashboardLocation(state: DashboardState): void {
  const appliedHash = useRef(false);

  const applySessionHash = useCallback(() => {
    const snapshot = store.getSnapshot();
    const target = parseSessionHash(window.location.hash);
    if (!target) {
      if (window.location.hash === "#/fleet" && snapshot.selection) {
        store.backToFleet();
      }
      return;
    }
    const session = snapshot.sessions[target.id];
    if (!session) return;
    if (!target.createdAt || session.createdAt === target.createdAt) {
      store.selectSession(session.id);
      return;
    }
    store.addToast({
      tone: "info",
      title: "That handle now belongs to a different session",
      text: "The dashboard did not retarget the link. The fleet is shown instead.",
    });
    store.backToFleet();
  }, []);

  useEffect(() => {
    appliedHash.current = false;
  }, [state.home, state.mode]);

  useEffect(() => {
    if (state.phase !== "live" || appliedHash.current || !state.fleetLoaded) {
      return;
    }
    appliedHash.current = true;
    applySessionHash();
  }, [state.phase, state.fleetLoaded, applySessionHash]);

  useEffect(() => {
    if (!state.mode) return;
    const params = new URLSearchParams(window.location.search);
    if (state.mode === "demo") params.set("demo", "1");
    else params.delete("demo");
    const search = params.toString();
    replaceLocation(search ? `?${search}` : "", window.location.hash);
  }, [state.mode]);

  useEffect(() => {
    if (state.phase !== "live" || !state.fleetLoaded) return;
    replaceLocation(window.location.search, sessionHash(state.selection));
  }, [state.phase, state.fleetLoaded, state.selection]);

  useEffect(() => {
    window.addEventListener("hashchange", applySessionHash);
    return () => window.removeEventListener("hashchange", applySessionHash);
  }, [applySessionHash]);
}
