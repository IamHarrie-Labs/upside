import { BrandMark } from "./Brand";

export default function Footer({ landing = false }: { landing?: boolean }) {
  return <footer className={landing ? "landing-footer" : "workspace-footer"}>
    <a className="wordmark" href="/" aria-label="Upside home"><BrandMark/>Upside</a>
    <nav aria-label="Product resources"><a href="/docs">Help & documentation</a>{landing && <><a href="/privacy">Privacy</a><a href="/terms">Terms</a></>}</nav>
    <span className="footer-year">© 2026 Upside</span>
  </footer>;
}
