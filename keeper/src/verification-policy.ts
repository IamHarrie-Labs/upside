/** No environment default or spelling mistake may turn a production identity check into a test attestation. */
export function verificationMode(mode: string | undefined, chainId: number, demo: boolean): "api" | "mock" {
  if (mode !== "api" && mode !== "mock") throw new Error("Set CLEANVERSE_MODE explicitly to api or mock.");
  if (mode === "mock" && (!demo || chainId === 143)) throw new Error("Mock attestations are restricted to demo deployments outside Monad mainnet.");
  return mode;
}
