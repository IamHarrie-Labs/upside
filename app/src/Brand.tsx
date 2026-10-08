export function BrandMark({ className = "" }: { className?: string }) {
  return <svg className={className} width="30" height="30" viewBox="0 0 64 64" fill="currentColor" aria-hidden="true"><path fillRule="evenodd" d="M32 5C44 5 52 13 52 25V40C52 52 44 60 32 60S12 52 12 40V25C12 13 20 5 32 5ZM32 14C25 14 21 19 21 26V37H43V26C43 19 39 14 32 14ZM22 45C24 49 27 51 32 51S40 49 42 45H22Z"/></svg>;
}
export function WalletGlyph({ address }: { address: string }) {
  const n = parseInt(address.slice(2, 8), 16) || 1;
  return <svg className="wallet-glyph" width="38" height="38" viewBox="0 0 40 40" aria-hidden="true"><rect x="1" y="1" width="38" height="38" rx="12" fill={n % 2 ? "#e4d4be" : "#d8e0cc"}/><path d={`M9 27L17 ${12 + n % 6}L23 25L31 ${8 + n % 5}`} stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/><circle cx="31" cy={8 + n % 5} r="2.5" fill="currentColor"/></svg>;
}
