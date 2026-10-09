export function BrandMark({ className = "" }: { className?: string }) {
  return <svg className={className} width="30" height="30" viewBox="0 0 64 64" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M32 5C44 5 52 13 52 25V40C52 52 44 60 32 60S12 52 12 40V25C12 13 20 5 32 5ZM32 14C25 14 21 19 21 26V37H43V26C43 19 39 14 32 14ZM22 45C24 49 27 51 32 51S40 49 42 45H22Z"/></svg>;
}
export function WalletGlyph({ address }: { address: string }) {
  return <span className="wallet-glyph wallet-initials" aria-hidden="true">{address.slice(2, 4).toUpperCase()}</span>;
}
