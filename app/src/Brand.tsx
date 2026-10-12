export function BrandMark({ className = "" }: { className?: string }) {
  return <svg className={className} width="30" height="30" viewBox="0 0 64 64" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M32 5C44 5 52 13 52 25V40C52 52 44 60 32 60S12 52 12 40V25C12 13 20 5 32 5ZM32 11C23 11 18 17 18 26V38H46V26C46 17 41 11 32 11ZM18 44C20 51 25 54 32 54S44 51 46 44H18Z"/></svg>;
}
export function WalletGlyph({ address }: { address: string }) {
  return <span className="wallet-glyph wallet-initials" aria-hidden="true">{address.slice(2, 4).toUpperCase()}</span>;
}
