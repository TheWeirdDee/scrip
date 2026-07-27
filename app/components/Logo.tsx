export function Logo({ withWordmark = true }: { withWordmark?: boolean }) {
  return <span className="brand"><span className="brand-mark" aria-hidden>§</span>{withWordmark && <span className="brand-name">Scrip</span>}</span>;
}
