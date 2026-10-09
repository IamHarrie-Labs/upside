/** Preserve shared website links as the app moves to native routes. */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const shared = path.match(/#\/(call\/\d+|caller\/0x[a-fA-F0-9]{40})(?:$|[?&])/);
    if (shared) return `/${shared[1]}`;
    const scheme = path.match(/^upside:\/\/(call\/\d+|caller\/0x[a-fA-F0-9]{40})(?:$|[?#])/);
    return scheme ? `/${scheme[1]}` : path;
  } catch {
    return "/";
  }
}
