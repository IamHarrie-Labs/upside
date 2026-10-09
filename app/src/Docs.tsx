import { chain, deployment, EXPLORER } from "./env";
import { BASE_SYMBOL, QUOTE_SYMBOL } from "./lib/upside";

const topics = [ ["", "Overview"], ["assets", "Tokens & network"], ["calls", "Calls & outcomes"], ["fees", "Performance fees"], ["vault", "Your vault"], ["security", "Accounts & limits"] ];
const content: Record<string, { title: string; intro: string; sections: { title: string; text: string }[] }> = {
  "": { title: "How Upside works", intro: "Follow a trader’s plan through your own trading vault. You choose the amount, review the trade and decide when to close it.", sections: [
    { title: "Sign in with a passkey", text: "A passkey uses your device’s sign-in prompt to open your account. Use the same passkey when you return. Signing out closes your signing session; it does not delete your account or its funds." },
    { title: "Fund the right address", text: "Your account holds MON to pay network fees. Your vault holds AUSD to fund trades. These are separate addresses, shown on the Funding page. This version uses test assets; check Tokens & network before sending funds." },
    { title: "Read before you follow", text: "Calls are recorded before their outcomes. Inspect the caller's scored wins, losses and unresolved calls. A call score measures a price change; it does not measure what a follower earned." },
    { title: "Review before you buy", text: "Following a supported call buys the asset through your vault. Review the amount, estimated fill and fee before signing. A trader cannot withdraw your funds. Targets and stops are price plans, not automatic sell orders." },
    { title: "Close a trade and share new gains", text: "Closing sells the position. A performance fee applies only when your closed trades with that trader pass your previous gain peak, after earlier closed losses have been recovered. Open losses, fees already paid and network fees are excluded. Your receipt records the result." },
  ] },
  assets: { title: "Tokens & network", intro: `This interface is connected to ${chain.name} (chain ${chain.id}). Check the asset and network before sending funds.`, sections: [
    { title: "There is no Upside token", text: "Upside is an application, not a token launchpad. This deployment has no issued UPSIDE token, token sale, supply schedule or vesting plan. Its name does not represent an investment asset." },
    { title: "MON pays for transactions", text: "MON is the network's native currency. Your signing account needs MON for gas, separate from funds in your vault. Testnet MON is for network testing." },
    { title: `${QUOTE_SYMBOL} settles follows`, text: deployment.demo ? "The current contracts use a test AUSD token and a demo venue. This token is not Agora's mainnet AUSD and has no redemption promise. Matching symbols do not make assets interchangeable." : "The configured settlement asset is used to fund, close and withdraw follows. Verify its contract address and issuer separately; a token symbol alone does not establish identity or redemption rights." },
    { title: `${BASE_SYMBOL} is the traded asset`, text: deployment.demo ? "The demo base token represents the position bought and sold in the test flow. Generated prices and DemoRouter execution demonstrate contract behavior, not live market performance." : "A follow buys the configured base asset through a permitted route. Fills, liquidity and venue costs affect your own result." },
  ] },
  calls: { title: "Calls & outcomes", intro: "An opinion becomes a dated public commitment.", sections: [
    { title: "What a call contains", text: "Each call contains its market, direction, target, stop, expiry and performance fee. Posted calls cannot be edited or deleted. The current contract caps the declared performance fee at 30%." },
    { title: "Targets are a plan", text: "Targets and stops are informational levels. Neither automatically closes a follow. You decide when to close the position." },
    { title: "A score is not your return", text: "After expiry, the keeper scores the call from the recorded entry and scoring mid prices. Your entry fill, exit fill, chosen exit time, fees and gas are separate. Losing and unresolved calls remain on the record." },
    { title: "Comparing callers", text: "The ranking combines average scored call return with the square root of scored call count. Followers do not enter that formula. Different histories and sample sizes still need judgment; the ranking is not a guarantee." },
  ] },
  fees: { title: "Performance fees", intro: "Recover closed losses with a caller before paying for new gains.", sections: [
    { title: "One relationship, one running record", text: "The vault tracks cumulative realized trading profit or loss for each follower–caller relationship. Only the amount above that relationship's previous high-water mark can earn a new performance fee." },
    { title: "An example", text: "Starting at zero, a loss of 20 AUSD followed by a gain of 10 AUSD earns no fee. Another gain of 20 AUSD takes cumulative realized trading gains to 10 AUSD. At a 20% rate, the total performance fee on that new gain is 2 AUSD." },
    { title: "What the calculation includes", text: "The running result uses actual swap proceeds after venue costs, before performance fee deductions and network gas. Open position losses are excluded until closed. Previously paid fees are not refunded. The closing call's fee rate applies if the caller used different rates." },
    { title: "Verification and protocol share", text: "A caller needs the configured gate's attestation to receive a fee. The configured protocol share comes out of the performance fee, not on top of it. A badge does not establish competence or uniqueness." },
  ] },
  vault: { title: "Your vault", intro: "Your account signs. Your vault holds the position.", sections: [
    { title: "Fund and set a limit", text: "Create your account's vault, fund it with the settlement token, then choose an exposure limit. The limit caps the original cost of open follows. It is not a guaranteed maximum loss." },
    { title: "Review every follow", text: "Before signing, review the network, token addresses, amount, route, minimum output and fee. The transaction uses an allowlisted router and checks measured token balance changes." },
    { title: "Close and withdraw", text: "Closing sells the base position and settles its relationship fee. Available settlement tokens can be withdrawn to your account. Base tokens backing open follows remain locked." },
  ] },
  security: { title: "Accounts & limits", intro: "Know the current implementation before relying on it.", sections: [
    { title: "Passkeys", text: "Mera derives your signing account from your provider's passkey PRF output. Device and provider support varies. Keep the original passkey available: a different passkey can derive a different account. Signing out ends the in-memory session." },
    { title: "Prices and availability", text: "A stale or unavailable keeper price prevents both new follows and closing existing positions. There is no emergency exit in this deployment. The contract owner can replace the price source and allowlisted routers." },
    { title: "External context", text: "Nansen labels and Perpl positions provide context when available. They are not endorsements. A Perpl position is separate from an Upside follow. Test attestations do not establish verified human identity." },
    { title: "Current release", text: "This hackathon deployment has not received an independent production security audit. Real-device passkey compatibility, production integrations and operational recovery require separate validation. Blockchain transactions are irreversible." },
  ] },
};

export default function Docs({ topic = "" }: { topic?: string }) {
  const page = content[topic];
  if (!page) return <article className="info-page"><h1>Topic not found</h1><a href="/docs">Documentation overview</a></article>;
  return <div className="docs-layout"><aside><p>Documentation</p><nav aria-label="Documentation topics">{topics.map(([slug, label]) => <a key={slug} href={`/docs${slug ? `/${slug}` : ""}`} aria-current={slug === topic ? "page" : undefined}>{label}</a>)}</nav></aside><article className="docs-content"><p className="docs-breadcrumb">Upside / Documentation</p><h1>{page.title}</h1><p className="info-intro">{page.intro}</p>{page.sections.map(section => <section key={section.title}><h2>{section.title}</h2><p>{section.text}</p></section>)}{topic === "assets" && <section><h2>Configured contract addresses</h2><dl className="asset-addresses">{[["Settlement token", deployment.settlement], ["Base token", deployment.base], ["Call book", deployment.callBook], ["Vault factory", deployment.factory]].map(([label, address]) => <div key={label}><dt>{label}</dt><dd>{EXPLORER ? <a href={`${EXPLORER}/address/${address}`} target="_blank" rel="noreferrer">{address}</a> : <code>{address}</code>}</dd></div>)}</dl></section>}<p className="docs-updated">Updated 9 October 2026</p></article></div>;
}
