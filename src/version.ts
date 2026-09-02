/** Build-time constant injected by Vite (`define` in vite.config.ts). */
declare const __APP_VERSION__: string;

/**
 * Tool version, e.g. "v142+9f2a1bc" — increases with every commit.
 * "dev" when git metadata is unavailable at build time.
 */
export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__;
