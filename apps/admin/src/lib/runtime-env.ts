/** Keep deployment URLs as runtime values when promoting a built image. */
export function runtimeEnv(key: string, fallback: string) {
  return process.env[key] ?? fallback;
}
