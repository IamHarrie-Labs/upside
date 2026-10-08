import { useState } from "react";

/** Artwork supplied by the user in Agent CrewArea.mp4; portraits are decorative. */
export default function Landing({ onStart, onBrowse }: { onStart: () => void; onBrowse: () => void }) {
  const [paused, setPaused] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  return (
    <div className="landing">
      <a className="skip" href="#landing-main">Skip to content</a>
      <header className="landing-header">
        <a className="landing-brand" href="#" aria-label="Upside home"><span aria-hidden="true">❝</span> Upside</a>
        <button className="ink-button small" onClick={onStart}>↗ Get started</button>
      </header>
      <main id="landing-main">
        <section className="landing-hero">
          <p className="landing-eyebrow">Trading calls that work for you</p>
          <h1>Follow great traders.<br />Share in the upside.</h1>
          <button className="ink-button" onClick={onBrowse}>↗ Explore calls</button>
          <p className="landing-description">Choose a trader. Follow their calls.<br />Pay them only when your net gains grow.</p>
          <svg className="clouds" viewBox="0 0 1464 230" preserveAspectRatio="none" aria-hidden="true">
            <g fill="#fafbfc" stroke="#575652" strokeWidth="2">
              <path d="M-20 230V185Q8 138 58 175Q70 122 120 126Q143 80 198 110Q228 58 285 100Q311 119 313 154Q355 115 405 148Q420 176 414 203Q474 170 508 230Z" />
              <path d="M833 230Q850 186 887 192Q895 145 940 152Q940 105 986 111Q1004 47 1068 67Q1120 86 1114 145Q1160 115 1196 153Q1206 117 1253 126Q1255 28 1360 30Q1420 -7 1483 8V230Z" />
            </g>
            <g fill="none" stroke="#b4bdc0" strokeWidth="12" opacity=".65"><path d="M277 111Q315 150 294 182M1047 79Q1099 104 1081 150M1362 42Q1293 72 1300 125" /></g>
            <g fill="#272621"><circle cx="445" cy="123" r="3"/><circle cx="849" cy="167" r="2"/><circle cx="689" cy="206" r="2"/></g>
          </svg>
        </section>
        <section className="crew-art" aria-label="Animated illustrations of a trading community and an aircraft wing">
          {!paused ? <video autoPlay loop muted playsInline poster="/art/crew-poster.jpg" aria-hidden="true"><source src="/art/crew-motion.mp4" type="video/mp4" /></video> : <img src="/art/crew-poster.jpg" alt="" />}
          <button className="motion-toggle" onClick={() => setPaused(!paused)}>{paused ? "Play animation" : "Pause animation"}</button>
        </section>
        <section className="landing-bottom">
          <div><p className="landing-eyebrow">A record you can actually inspect</p><h2>Every call counts.<br />Even the ones that miss.</h2></div>
          <div><p>Calls are committed on Monad before the move. Follow through your own vault, see the full record, and share gains only after previous losses are recovered.</p><button className="ink-button" onClick={onStart}>Create your account ↗</button><p className="landing-note">Testnet preview · demo trading venue and test tokens</p></div>
        </section>
      </main>
      <footer className="landing-footer"><span>Upside · Built on Monad</span><button onClick={onBrowse}>Browse the full record ↗</button></footer>
    </div>
  );
}
