export function Logo({ withWordmark = true }: { withWordmark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400 to-emerald-600 font-mono text-base font-bold text-black shadow-[0_0_20px_rgba(52,211,153,0.35)]">
        §
      </span>
      {withWordmark && (
        <span className="text-lg font-semibold tracking-tight text-zinc-50">Scrip</span>
      )}
    </span>
  );
}
