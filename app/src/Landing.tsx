import { useState } from "react";
import { BrandMark, SignalIllustration } from "./Brand";
import { deployment } from "./env";

export default function Landing({ onStart, onBrowse }: { onStart: () => void; onBrowse: () => void }) {
  const [paused, setPaused] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  return <div className={`landing ${paused ? "motion-paused" : ""}`}>
    <a className="skip" href="#landing-main">Skip to content</a>
    <header className="landing-header">
      <a className="wordmark" href="#" aria-label="Upside home"><BrandMark />Upside</a>
      <nav aria-label="About Upside" className="landing-nav"><a href="#how-it-works">How it works</a><a href="#/guide">The field guide</a></nav>
      <button className="ink-button small" onClick={onStart}>Open Upside <span aria-hidden="true">↗</span></button>
    </header>
    <main id="landing-main" tabIndex={-1}>
      <section className="landing-hero">
        <div className="hero-copy"><p className="eyebrow"><span className="edition-line"/>Good judgment deserves good company.</p><h1>Good calls.<br /><span>Shared upside.</span></h1><p className="hero-description">Find a trader worth following.<br />Share the gains. Recover losses first.</p><div className="hero-actions"><button className="ink-button" onClick={onBrowse}>Explore the calls <span aria-hidden="true">↗</span></button><a className="text-link" href="#how-it-works">See how it works <span aria-hidden="true">↓</span></a></div><p className="hero-footnote">Your vault. Your decisions. Their full record.</p></div>
        <aside className="hero-margin"><span className="folio">FIELD NOTES / 001</span><p>A following<br />has to be<br /><em>earned.</em></p><span className="margin-rule"/><span className="hero-environment">{deployment.demo ? "Testnet preview" : "Built on Monad"}</span></aside>
      </section>
      <section className="original-art" aria-label="The Upside journey"><SignalIllustration /><div className="art-foot"><span>From conviction to commitment.</span><button className="motion-toggle" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? "Resume motion" : "Pause motion"}</button></div></section>
      <div className="principle-strip"><span>01 / Calls on record</span><span>02 / Capital in your control</span><span>03 / Fees from net gains</span></div>
      <section className="how-section" id="how-it-works"><div className="section-intro"><p className="eyebrow">A better kind of following</p><h2>Conviction is personal.<br /><em>The record is public.</em></h2><p>Less guessing who to trust. More evidence you can inspect.</p></div><ol className="step-list"><li><span>01</span><div><h3>Read the whole record.</h3><p>Explore committed calls and scored outcomes. Winning calls, losing calls, and unresolved calls stay visible.</p></div></li><li><span>02</span><div><h3>Make your own move.</h3><p>Choose a call and an amount. Execute through your own vault with an exposure limit you control.</p></div></li><li><span>03</span><div><h3>Share what you actually gain.</h3><p>Close the position to settle. The caller earns a fee only on new net gains above your previous peak with them.</p></div></li></ol></section>
      <section className="fee-story"><div><p className="eyebrow">The part that makes it Upside</p><h2>Still recovering?<br /><em>No new performance fee.</em></h2><p>One winning trade does not erase the losses that came before it. Fees follow your cumulative result with each caller.</p><a className="text-link" href="#/guide">Understand the fee rule ↗</a></div><div className="fee-example"><span className="folio">ILLUSTRATIVE FEE EXAMPLE</span><div><span>First trade</span><b className="down">−20 AUSD</b></div><div><span>Next trade</span><b className="up">+10 AUSD</b></div><div className="example-total"><span>Still below your previous peak</span><b>0 fee</b></div><p>Before trading costs. Your actual settlement uses the vault’s recorded proceeds and fee rules.</p></div></section>
      <section className="closing-section"><BrandMark /><p className="eyebrow">Bring your judgment. Keep your agency.</p><h2>The upside is earned.</h2><button className="ink-button" onClick={onStart}>Find your next call ↗</button><p>{deployment.demo ? "Testnet preview · demo venue · test tokens only" : "Trading involves risk. Outcomes and returns vary."}</p></section>
    </main>
    <footer className="landing-footer"><a className="wordmark" href="#"><BrandMark />Upside</a><span>Good calls. Shared upside.</span><nav aria-label="Resources"><a href="#/guide">Guide</a><a href="#/privacy">Privacy</a><a href="#/terms">Preview terms</a></nav></footer>
  </div>;
}
