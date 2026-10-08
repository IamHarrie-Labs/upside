import { useEffect, useRef, useState } from "react";
import { BrandMark } from "./Brand";
import { deployment } from "./env";

/* MOTION STORYBOARD
 * 0ms: navigation, headline and actions are ready to use.
 * Scroll: step markers change at the reading line; the heading stays pinned.
 * Receipt: its border and stamp settle once the example enters view.
 * Vault: exposure bar fills once; surrounding text stays visible.
 * Pause/reduced motion: video, clouds and decorative movement stop.
 */
const QUESTIONS = [
  { q: "What am I paying for?", a: "Each trader sets a performance fee on their call. You pay when you close a follow and your total realized trading gains with that trader pass your previous peak. Earlier losses are recovered first. The protocol's share comes out of that fee." },
  { q: "Does following a call place a trade?", a: "Yes. A supported follow buys the position through your vault. You choose how much to commit and when to close it. The target and stop describe the trader's plan; they don't close the position automatically." },
  { q: "Can a trader remove a losing call?", a: "Calls are committed onchain and cannot be edited or deleted. The public record includes scored losses and calls still waiting to be scored. A call's score comes from market mid prices; your own result depends on your fills and when you close." },
  { q: "Who controls my funds?", a: "Your account controls your vault. Traders cannot withdraw your funds. You can set an exposure limit and withdraw available settlement tokens. Trading and smart contracts carry risk; the limit is not a guaranteed maximum loss." },
  { q: "Is this using real money?", a: deployment.demo ? "This deployment uses test tokens and a demo trading venue. MON pays network gas. Test AUSD is for trying the flow and has no redemption promise." : "Check the network and assets before trading. This is a hackathon preview, and production services and contracts need separate validation before handling customer funds." },
];
const STEPS = [
  { title: "Read the whole record.", text: "Start with a trader's calls. See what worked, what missed, and what's still open before you follow." },
  { title: "Make your own move.", text: "Choose a call and an amount. The trade runs through your vault, with an exposure limit you set." },
  { title: "Share what you actually gain.", text: "Close when you're ready. A fee is earned only on new realized gains above your previous peak with that trader." },
];

export default function Landing({ onStart, onBrowse }: { onStart: () => void; onBrowse: () => void }) {
  const [paused, setPaused] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [activeStep, setActiveStep] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => { if (preference.matches) setPaused(true); };
    preference.addEventListener("change", onChange);
    return () => preference.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        if (entry.target.hasAttribute("data-step")) setActiveStep(Number(entry.target.getAttribute("data-step")));
        else { entry.target.classList.add("is-in-view"); observer.unobserve(entry.target); }
      }
    }, { rootMargin: "-18% 0px -28% 0px", threshold: 0.1 });
    root.current?.querySelectorAll("[data-step], [data-decorative-motion]").forEach(el => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return <div ref={root} className={`landing ${paused ? "motion-paused" : ""}`}>
    <a className="skip" href="#landing-main">Skip to content</a>
    <header className="landing-header">
      <a className="wordmark" href="#" aria-label="Upside home"><BrandMark />Upside</a>
      <nav aria-label="About Upside" className="landing-nav"><a href="#how-it-works">How it works</a><a href="#fees">Fees</a><a href="#questions">Questions</a></nav>
      <button className="ink-button small" onClick={onStart}>Open Upside</button>
    </header>
    <main id="landing-main" tabIndex={-1}>
      <section className="intro-section" aria-labelledby="intro-title">
        <div className="landing-hero">
          <div className="hero-copy"><p className="eyebrow">Trading calls on Monad</p><h1 id="intro-title">Good calls.<br /><span>Shared upside.</span></h1><p className="hero-description">Follow a trader through your own vault. They earn a share of your realized gains after earlier closed losses are recovered.</p><div className="hero-actions"><button className="ink-button" onClick={onBrowse}>Explore the calls</button></div><p className="hero-footnote">{deployment.demo ? "Testnet preview · Demo trading venue" : "Hackathon preview"}</p></div>
        <svg className="clouds" viewBox="0 0 1464 230" preserveAspectRatio="none" aria-hidden="true">
          <g fill="#fafbfc" stroke="#575652" strokeWidth="2">
            <path d="M-20 230V185Q8 138 58 175Q70 122 120 126Q143 80 198 110Q228 58 285 100Q311 119 313 154Q355 115 405 148Q420 176 414 203Q474 170 508 230Z"/>
            <path d="M833 230Q850 186 887 192Q895 145 940 152Q940 105 986 111Q1004 47 1068 67Q1120 86 1114 145Q1160 115 1196 153Q1206 117 1253 126Q1255 28 1360 30Q1420 -7 1483 8V230Z"/>
          </g>
          <g fill="none" stroke="#b4bdc0" strokeWidth="12" opacity=".65"><path d="M277 111Q315 150 294 182M1047 79Q1099 104 1081 150M1362 42Q1293 72 1300 125"/></g>
          <g fill="#272621"><circle cx="445" cy="123" r="3"/><circle cx="849" cy="167" r="2"/><circle cx="689" cy="206" r="2"/></g>
        </svg>
        </div>
        <div className="crew-art" aria-label="Decorative illustrations of traders inside an aircraft">
          <img className="cabin-illustration" src="/art/cabin-original-v1.png" alt="" width="2164" height="727" decoding="async" />
          <button className="motion-toggle" aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? "Resume motion" : "Pause motion"}</button>
        </div>
      </section>
      <section className="how-section" id="how-it-works" aria-labelledby="how-title">
        <div className="section-intro"><p className="eyebrow">How following works</p><h2 id="how-title">Conviction is personal.<br /><em>The record is public.</em></h2><p>You decide who to follow. Their record stays there for you to check.</p><div className="step-progress" aria-hidden="true">{STEPS.map((_, i) => <span key={i} className={activeStep >= i ? "active" : ""}/>)}</div></div>
        <ol className="step-list">{STEPS.map((step, i) => <li key={step.title} data-step={i} className={activeStep === i ? "active-step" : ""}><span aria-hidden="true">0{i + 1}</span><div><h3>{step.title}</h3><p>{step.text}</p></div></li>)}</ol>
      </section>
      <section className="fee-story" id="fees" aria-labelledby="fee-title">
        <div><p className="eyebrow">How traders get paid</p><h2 id="fee-title">Recover losses first.<br /><em>Then share the gains.</em></h2><p>Your fee follows your closed trades with each trader. A closed gain first recovers earlier closed losses.</p><p className="section-note">Venue costs affect your trading result. Open losses are excluded. Earlier fees are not refunded. Network gas is paid separately.</p></div>
        <div className="fee-example" data-decorative-motion><span className="folio">An example, before trading costs</span><div><span>First trade</span><b className="down">−20 AUSD</b></div><div><span>Next trade</span><b className="up">+10 AUSD</b></div><div className="example-total"><span>Still recovering earlier losses</span><b>0 fee</b></div><div className="receipt-stamp" aria-hidden="true">Losses recovered first</div></div>
      </section>
      <section className="control-section" id="your-vault" aria-labelledby="control-title">
        <div className="vault-example" data-decorative-motion><div className="vault-example-top"><BrandMark/><span>Example vault</span></div><div className="vault-example-balance"><span>Available cash</span><strong>500 <small>AUSD</small></strong></div><div className="vault-example-exposure"><span>Open exposure</span><b>100 / 500 AUSD</b></div><div className="vault-example-meter"><span/></div><div className="vault-example-receipt"><span>Exposure limit</span><b>Set by you</b></div><div className="vault-example-receipt"><span>Available cash</span><b>Withdraw to your account</b></div><p>Illustrative amounts. Your vault shows its onchain balances.</p></div>
        <div className="control-copy"><p className="eyebrow">Your vault</p><h2 id="control-title">You choose the call.<br /><em>You keep control.</em></h2><p>Set how much you want to put into open follows. Close a position when you're ready, and withdraw the cash that's available.</p><dl><div><dt>Your account signs each trade.</dt><dd>A trader's call doesn't give them access to your funds.</dd></div><div><dt>Every settlement has a receipt.</dt><dd>Check the proceeds, fee and payout against the transaction.</dd></div></dl></div>
      </section>
      <section className="questions-section" id="questions" aria-labelledby="questions-title"><div><p className="eyebrow">Before your first follow</p><h2 id="questions-title">A few things<br />worth knowing.</h2><p>More detail is in the <a href="#/guide">guide</a>.</p></div><div className="questions-list">{QUESTIONS.map(question => <details key={question.q}><summary>{question.q}<span aria-hidden="true" className="question-toggle"/></summary><p>{question.a}</p></details>)}</div></section>
    </main>
    <footer className="landing-footer"><a className="wordmark" href="#"><BrandMark />Upside</a><span>{deployment.demo ? "Test tokens. Demo venue." : "Trading involves risk."}</span><nav aria-label="Resources"><a href="#/guide">Guide</a><a href="#/privacy">Privacy</a><a href="#/terms">Preview terms</a></nav></footer>
  </div>;
}
