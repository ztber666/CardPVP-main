import { useState } from 'react';
import { ActiveBuff, BUFF_NAMES } from '@shared/types';
import { BUFF_ICON_MAP } from './BuffCollection';
import BuffDetail from './BuffDetail';

// 保持清晰易读的配色方案
export const BUFF_STYLES: Record<string, string> = {
  strength: 'bg-red-50 text-red-700 border-red-200',
  weakness: 'bg-purple-50 text-purple-700 border-purple-200',
  resistance: 'bg-blue-50 text-blue-700 border-blue-200',
  vuln: 'bg-amber-50 text-amber-700 border-amber-200',
  heal: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  wither: 'bg-slate-50 text-slate-600 border-slate-200',
  shield: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  fireResist: 'bg-orange-50 text-orange-700 border-orange-200',
  poison: 'bg-lime-50 text-lime-700 border-lime-200',
  fireVuln: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  charge: 'bg-pink-50 text-pink-700 border-pink-200',
  fireDamage: 'bg-rose-50 text-rose-700 border-rose-200',
  lockStrategy: 'bg-sky-50 text-sky-700 border-sky-200',
  horde: 'bg-red-100 text-red-800 border-red-300',
  blight: 'bg-teal-50 text-teal-700 border-teal-200',
  block: 'bg-indigo-50 text-indigo-700 border-indigo-200',
};

interface Props {
  buff: ActiveBuff;
  compactMode: boolean;
}

export default function BuffBadge({ buff, compactMode }: Props) {
  const [showDetail, setShowDetail] = useState(false);

  const styleClass = BUFF_STYLES[buff.buffType] || 'bg-slate-50 text-slate-600 border-slate-200';
  const name = BUFF_NAMES[buff.buffType] || buff.buffType;
  const iconNum = BUFF_ICON_MAP[buff.buffType];
  const hasDuration = buff.remainingTurns !== undefined;

  const showStackBadge = compactMode && buff.stacks > 1;
  const showTurnBadge = compactMode && hasDuration;

  return (
    <>
      {/* 主徽章容器 */}
      <span
        className={` inline-flex items-center border cursor-pointer transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-sm active:scale-95 ${
          compactMode ? 'p-1 relative rounded-full' : 'px-1.5 py-0.5 rounded-full gap-1'
        } ${styleClass} `}
        onClick={(e) => {
          e.stopPropagation();
          setShowDetail(true);
        }}
      >
        {/* 图标区域 */}
        {iconNum ? (
          <img
            src={`/assets/buff/buff${iconNum}.png`}
            alt={name}
            className={`object-contain ${compactMode ? 'w-4 h-4' : 'w-3 h-3'}`}
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <span className={`font-bold ${compactMode ? 'text-xs' : 'text-[8px]'}`}>●</span>
        )}

        {/* 普通模式：微型文字展示 */}
        {!compactMode && (
          <>
            <span className="font-semibold text-[10px] whitespace-nowrap leading-none">{name}</span>
            {buff.stacks > 1 && (
              <span className="text-[9px] font-bold opacity-70 leading-none"> ×{buff.stacks} </span>
            )}
            {hasDuration && (
              <span className="text-[9px] opacity-50 leading-none"> {buff.remainingTurns}T </span>
            )}
          </>
        )}

        {/* 紧凑模式：角标逻辑保持不变 */}
        {showStackBadge && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center shadow-sm border-2 border-white">
            {buff.stacks}
          </span>
        )}
        {showTurnBadge && (
          <span className="absolute -bottom-1 -right-1 min-w-[14px] h-[14px] px-0.5 bg-white text-slate-700 text-[9px] font-bold rounded-full flex items-center justify-center shadow-sm border border-slate-200">
            {buff.remainingTurns}
          </span>
        )}
      </span>

      {/* 详情弹窗：统一由 BuffDetail 渲染，视觉与 CardDetail 一致 */}
      {showDetail && (
        <BuffDetail
          buffType={buff.buffType}
          stacks={buff.stacks}
          remainingTurns={buff.remainingTurns}
          onClose={() => setShowDetail(false)}
        />
      )}
    </>
  );
}
