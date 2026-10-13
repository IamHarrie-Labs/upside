/** Select one allowed browser origin. Native clients without Origin remain usable. */
export function corsOrigin(origin: string | undefined, configuration = "*"): string | undefined {
  if (configuration.trim() === "*") return "*";
  return origin && configuration.split(",").map(value => value.trim()).includes(origin) ? origin : undefined;
}
