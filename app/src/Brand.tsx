export function BrandMark({ className = "" }: { className?: string }) {
  return <svg className={className} width="30" height="30" viewBox="0 0 40 40" fill="currentColor" aria-hidden="true"><path d="M6 23C6 14 10 9 18 8V13C14 14 12 16 12 20H18V31H6V23ZM23 23C23 14 27 9 35 8V13C31 14 29 16 29 20H35V31H23V23Z"/></svg>;
}
export function WalletGlyph({ address }: { address: string }) {
  const n = parseInt(address.slice(2, 8), 16) || 1;
  return <svg className="wallet-glyph" width="38" height="38" viewBox="0 0 40 40" aria-hidden="true"><rect x="1" y="1" width="38" height="38" rx="12" fill={n % 2 ? "#e4d4be" : "#d8e0cc"}/><path d={`M9 27L17 ${12 + n % 6}L23 25L31 ${8 + n % 5}`} stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/><circle cx="31" cy={8 + n % 5} r="2.5" fill="currentColor"/></svg>;
}
