export default function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="flex-1 h-px bg-gradient-to-r from-transparent to-card-border/80" />
      {/* 字号+1、透明度 50%→75%、字距收窄至 0.2em，装饰而不失清晰 */}
      <span className="text-[11px] font-semibold text-text-secondary/75 tracking-[0.2em] select-none">
        {label}
      </span>
      <span className="flex-1 h-px bg-gradient-to-l from-transparent to-card-border/80" />
    </div>
  );
}
