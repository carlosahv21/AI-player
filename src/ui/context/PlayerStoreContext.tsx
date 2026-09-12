import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { PlayerStoreInstance } from "../../core/store";

const PlayerStoreContext = createContext<PlayerStoreInstance | null>(null);

export function PlayerStoreProvider({
  value,
  children,
}: {
  value: PlayerStoreInstance;
  children: ReactNode;
}) {
  return (
    <PlayerStoreContext.Provider value={value}>
      {children}
    </PlayerStoreContext.Provider>
  );
}

/** The store instance for the nearest <PlayerStoreProvider>. */
export function usePlayerStoreInstance(): PlayerStoreInstance {
  const instance = useContext(PlayerStoreContext);
  if (!instance) {
    throw new Error(
      "usePlayerStoreInstance must be used within a PlayerStoreProvider",
    );
  }
  return instance;
}

/**
 * How this player reloads its payload. Set when the video came from the REST
 * endpoint, so "Reintentar" re-runs the request instead of re-loading a
 * payload the store may never have received.
 */
const ReloadContext = createContext<(() => void) | null>(null);

export function ReloadProvider({
  value,
  children,
}: {
  value: (() => void) | null;
  children: ReactNode;
}) {
  return (
    <ReloadContext.Provider value={value}>{children}</ReloadContext.Provider>
  );
}

export function useReload(): (() => void) | null {
  return useContext(ReloadContext);
}
