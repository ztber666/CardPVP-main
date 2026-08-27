import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ChoiceRequest } from '../hooks/useChoiceModal';
import { getCardImageUrl, getCardByImageId } from '../utils/cardImage';
import CardDetail from './CardDetail';
import BuffDetail from './BuffDetail';

const KEYFRAMES = `
@keyframes cd-backdrop-in{from{opacity:0}to{opacity:1}}
@keyframes cd-backdrop-out{from{opacity:1}to{opacity:0}}
@keyframes cd-panel-in{from{opacity:0;transform:translateY(14px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
@keyframes cd-panel-out{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(10px) scale(.97)}}
@keyframes cd-pill-in{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes cd-dot-pulse{0%,100%{opacity:.25;transform:scale(.8)}50%{opacity:1;transform:scale(1.5)}}
`;

const ACCENT: Record<string, { icon: string; btn: string; dot: string }> = {
  shield: { icon: 'bg-accent-shield/10 border-accent-shield/25 text-accent-shield', btn: 'bg-accent-shield/15 border-accent-shield/25 text-accent-shield hover:bg-accent-shield/25', dot: 'bg-accent-shield' },
  attack: { icon: 'bg-accent-attack/10 border-accent-attack/25 text-accent-attack', btn: 'bg-accent-attack/15 border-accent-attack/25 text-accent-attack hover:bg-accent-attack/25', dot: 'bg-accent-attack' },
  equip:  { icon: 'bg-accent-equip/10 border-accent-equip/25 text-accent-equip',   btn: 'bg-accent-equip/15 border-accent-equip/25 text-accent-equip hover:bg-accent-equip/25',   dot: 'bg-accent-equip' },
  heal:   { icon: 'bg-accent-heal/10 border-accent-heal/25 text-accent-heal',     btn: 'bg-accent-heal/15 border-accent-heal/25 text-accent-heal hover:bg-accent-heal/25',     dot: 'bg-accent-heal' },
};

interface Props {
  request: ChoiceRequest;
  onSubmit: (key: string) => void;
  onDismiss: () => void;
  onCancelServer?: () => void; // 仅 equip 弹窗需要（服务端返还卡牌）
  busy?: boolean;
}

export default function ChoiceDialog({ request, onSubmit, onDismiss, onCancelServer, busy }: Props) {
  const a = ACCENT[request.accent];
  const [hidden, setHidden] = useState(false);
  const [closing, setClosing] = useState(false);
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);   // 选中的选项 key（可切换）
  const [detailKey, setDetailKey] = useState<string | null>(null); // 行内详情按钮：正在查看详情的选项 key
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // 新一次触发：复位全部本地状态
  useEffect(() => {
    setHidden(false); setClosing(false); setValue(''); setInvalid(false);
    setSelected(null); setDetailKey(null);
  }, [request.triggerKey]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const hide = () => {
    if (closing) return;
    setClosing(true);
    timer.current = setTimeout(() => { setHidden(true); setClosing(false); }, 180);
  };

  const submitNumber = () => {
    const n = parseInt(value, 10);
    if (isNaN(n) || n < (request.min ?? 0) || (request.max !== undefined && n > request.max)) {
      setInvalid(true); return;
    }
    onSubmit(String(n));
  };

  // ===== 隐藏态：全屏拦截层（挡住一切点击）+ 悬浮胶囊（唯一可点） =====
  if (hidden) {
    return (
      <>
        <style>{KEYFRAMES}</style>
        <div className="fixed inset-0 z-[54]" onClick={e => e.stopPropagation()} />
        <button
          onClick={e => { e.stopPropagation(); setHidden(false); }}
          className="fixed top-14 left-1/2 z-[55] flex items-center gap-2 rounded-full border border-card-border bg-card-bg/95 py-2 pl-3.5 pr-3 text-xs font-semibold text-text-primary shadow-lg"
          style={{ animation: 'cd-pill-in 220ms cubic-bezier(.22,1,.36,1) both' }}
        >
          <span className={`text-sm leading-none ${a.icon.split(' ').pop()}`}>
            {request.cardId ? (
              <img src={getCardImageUrl(request.cardId)} alt="" className="h-5 w-5 object-contain" style={{ imageRendering: 'pixelated' }} />
            ) : (
              request.icon
            )}
          </span>
          <span>{request.title}</span>
          <span className="relative flex h-1.5 w-1.5">
            <span className={`absolute h-full w-full rounded-full ${a.dot}`} style={{ animation: 'cd-dot-pulse 1.6s ease-in-out infinite' }} />
          </span>
        </button>
      </>
    );
  }

  const grid = request.layout === 'grid';

  // 选中项 / 详情项解析（详情：卡牌→CardDetail，buff→BuffDetail）
  const selectedOption = selected ? request.options.find(o => o.key === selected) : undefined;
  const detailOption = detailKey ? request.options.find(o => o.key === detailKey) : undefined;
  const detailCard = detailOption?.cardId ? getCardByImageId(detailOption.cardId) : undefined;
  const detailBuff = detailOption?.buff;
  const closeDetail = () => setDetailKey(null);

  return (
    <>
      <style>{KEYFRAMES}</style>
      {/* 遮罩：点击任何地方都不会关闭 */}
      <div
        className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50 px-4"
        onClick={e => e.stopPropagation()}
        style={{ animation: `cd-backdrop-${closing ? 'out' : 'in'} ${closing ? '160ms ease-in' : '220ms ease-out'} both` }}
      >
        <div
          className="w-full max-w-sm rounded-2xl border border-card-border bg-card-bg p-5 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.4)]"
          style={{ animation: `cd-panel-${closing ? 'out' : 'in'} ${closing ? '180ms ease-in' : '260ms cubic-bezier(.22,1,.36,1)'} both` }}
        >
          {/* 头部 */}
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-xl ${a.icon}`}>
              {request.cardId ? (
                <img src={getCardImageUrl(request.cardId)} alt="" className="h-7 w-7 object-contain" style={{ imageRendering: 'pixelated' }} />
              ) : (
                request.icon
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[15px] font-bold leading-5 text-text-primary">{request.title}</h3>
              <p className="mt-0.5 truncate text-xs leading-4 text-text-secondary">{request.subtitle}</p>
            </div>
            {/* 隐藏按钮（所有弹窗都有） */}
            <button
  onClick={e => { e.stopPropagation(); hide(); }}
  className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary/60 transition-all hover:bg-card-border/15 hover:text-text-secondary active:scale-90"
  title="暂时隐藏"
>
  <svg
    className="h-3.5 w-3.5"
    viewBox="0 -960 960 960"
    fill="currentColor"
  >
    <path d="m644-428-58-58q9-47-27-88t-93-32l-58-58q17-8 34.5-12t37.5-4q75 0 127.5 52.5T660-500q0 20-4 37.5T644-428Zm128 126-58-56q38-29 67.5-63.5T832-500q-50-101-143.5-160.5T480-720q-29 0-57 4t-55 12l-62-62q41-17 84-25.5t90-8.5q151 0 269 83.5T920-500q-23 59-60.5 109.5T772-302Zm20 246L624-222q-35 11-70.5 16.5T480-200q-151 0-269-83.5T40-500q21-53 53-98.5t73-81.5L56-792l56-56 736 736-56 56ZM222-624q-29 26-53 57t-41 67q50 101 143.5 160.5T480-280q20 0 39-2.5t39-5.5l-36-38q-11 3-21 4.5t-21 1.5q-75 0-127.5-52.5T300-500q0-11 1.5-21t4.5-21l-84-82Zm319 93Zm-151 75Z"/>
  </svg>
</button>
            {/* ✕ 按原有设计，仅部分弹窗有 */}
            {request.dismissible && (
              <button
                onClick={e => { e.stopPropagation(); onDismiss(); }}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary/60 transition-all hover:bg-card-border/15 hover:text-text-primary active:scale-90"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 14 14" fill="none">
                  <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>

          {request.note && (
            <div className="mt-4 rounded-lg bg-card-border/10 px-3 py-2 text-xs leading-5 text-text-secondary">{request.note}</div>
          )}

          {/* 正文：数字输入 或 选项列表 */}
          <div className="mt-5">
            {request.kind === 'number' ? (
              <>
                <input
                  autoFocus type="number" inputMode="numeric" min={request.min} max={request.max}
                  value={value}
                  onChange={e => { setValue(e.target.value); if (invalid) setInvalid(false); }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); submitNumber(); } }}
                  placeholder="输入数字"
                  className={`w-full rounded-xl border bg-page-bg/40 px-4 py-3 text-center text-lg font-bold text-text-primary outline-none transition-colors focus:border-accent-shield/50 ${invalid ? 'border-accent-attack/60' : 'border-card-border'}`}
                />
                <p className={`mt-1.5 h-4 text-xs text-accent-attack transition-opacity ${invalid ? 'opacity-100' : 'opacity-0'}`}>
                  请输入 {request.min}~{request.max} 的数字
                </p>
                <button
                  onClick={e => { e.stopPropagation(); submitNumber(); }} disabled={busy}
                  className={`mt-2 w-full rounded-xl border py-2.5 text-sm font-semibold transition-all active:scale-[.98] disabled:opacity-50 ${a.btn}`}
                >
                  ✅ 确认
                </button>
              </>
            ) : request.options.length === 0 ? (
              <p className="py-6 text-center text-sm text-text-secondary">
                {request.id === 'equip' ? '目标没有任何装备' : request.id === 'redstone' ? '目标没有限时状态' : '没有可选项'}
              </p>
            ) : (
              <>
                <div className={grid ? 'grid grid-cols-2 gap-2' : 'space-y-2'}>
                  {request.options.map(o => {
                    const isSel = selected === o.key;
                    const hasDetail = isSel && (!!o.cardId || !!o.buff);
                    return (
                      <div key={o.key} className={`relative ${grid ? '' : 'w-full'}`}>
                        <button
                          disabled={o.disabled || busy}
                          onClick={e => { e.stopPropagation(); setSelected(prev => (prev === o.key ? null : o.key)); }}
                          className={`rounded-xl border p-2.5 text-left transition-all duration-150 active:scale-[.97] disabled:pointer-events-none disabled:opacity-40 ${grid ? 'flex w-full flex-col items-center gap-1.5' : 'flex w-full items-center gap-3'} ${isSel ? 'border-accent-shield/70 bg-accent-shield/10 ring-2 ring-accent-shield/40' : 'border-card-border hover:border-accent-shield/40 hover:bg-card-bg/60'}`}
                        >
                          {o.img ? (
                            <img src={o.img} alt="" className={grid ? 'h-10 w-10 object-contain' : 'h-9 w-9 shrink-0 object-contain'} style={{ imageRendering: 'pixelated' }} />
                          ) : o.emoji ? (
                            <span className={grid ? 'text-2xl' : 'text-xl'}>{o.emoji}</span>
                          ) : null}
                          <div className={`${grid ? 'text-center' : 'min-w-0 flex-1'} ${hasDetail && !grid ? 'pr-16' : ''}`}>
                            <div className={`font-semibold text-text-primary ${grid ? 'text-xs leading-tight' : 'text-sm'} ${grid ? '' : 'truncate'} ${(o.emoji && !grid) ? 'inline' : ''}`}>
                              {o.emoji && !grid ? `${o.emoji} ` : ''}{o.label}
                            </div>
                            {o.sub && <div className="mt-0.5 text-xs text-text-secondary">{o.sub}</div>}
                          </div>
                          {o.badge && <span className="shrink-0 rounded-md bg-card-border/15 px-1.5 py-0.5 text-[10px] text-text-secondary">{o.badge} 已选</span>}
                        </button>
                        {/* 选中项为卡牌/buff 时：行内详情按钮 */}
                        {hasDetail && (
                          <button
                            onClick={e => { e.stopPropagation(); setDetailKey(o.key); }}
                            className={`absolute z-10 inline-flex items-center gap-1 rounded-lg border border-accent-shield/40 bg-card-bg/95 px-2 py-1 text-[10px] font-semibold text-accent-shield shadow-md backdrop-blur transition-all hover:bg-accent-shield/15 active:scale-95 ${grid ? 'right-1.5 top-1.5' : 'right-2 top-1/2 -translate-y-1/2'}`}
                          >
                            <span className="text-[11px] leading-none">📖</span>
                            详情
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* 选中后出现确认按钮 */}
                {selectedOption && (
                  <button
                    onClick={e => { e.stopPropagation(); onSubmit(selectedOption.key); }}
                    disabled={busy}
                    className={`mt-2 w-full rounded-xl border py-2.5 text-sm font-semibold transition-all active:scale-[.98] disabled:opacity-50 ${a.btn}`}
                  >
                    ✅ 确认
                  </button>
                )}
              </>
            )}
          </div>

          {/* 底部取消（按原有设计） */}
          {request.cancelLabel && (
            <button
              onClick={e => {
                e.stopPropagation();
                request.onCancel === 'equipCancel' ? onCancelServer?.() : onDismiss();
              }}
              disabled={busy}
              className="mt-4 w-full rounded-xl border border-card-border py-2.5 text-sm font-medium text-text-secondary transition-colors hover:bg-card-bg/50 disabled:opacity-50"
            >
              {request.cancelLabel}
            </button>
          )}
        </div>
      </div>

      {/* 选中项详情：卡牌→CardDetail / buff→BuffDetail（Portal 挂 body，层级高于弹窗） */}
      {detailOption && (detailCard || detailBuff) && createPortal(
        detailCard
          ? <CardDetail card={detailCard} onClose={closeDetail} />
          : (
              <BuffDetail
                buffType={detailBuff!.buffType}
                stacks={detailBuff!.stacks}
                remainingTurns={detailBuff!.remainingTurns}
                onClose={closeDetail}
              />
            ),
        document.body,
      )}
    </>
  );
}
