const localHosts = new Set(['127.0.0.1', 'localhost', '10.0.2.2']);

export function localServiceUrl(value: string, setting: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${setting} must be a local HTTP URL.`);
  }
  if (
    url.protocol !== 'http:' || !localHosts.has(url.hostname) ||
    url.username || url.password || url.pathname !== '/' || url.search || url.hash
  ) {
    throw new Error(`${setting} must be a local HTTP origin (127.0.0.1, localhost, or the Android emulator at 10.0.2.2).`);
  }
  return url.origin;
}
