/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Origin of the sync Worker, e.g. `wss://volei-sync.<subdomain>.workers.dev`.
   * Unset in a checkout with no Worker deployed, which leaves the app in its
   * original single-device mode.
   */
  readonly VITE_SYNC_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
