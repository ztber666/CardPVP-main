import { PlayerState, BuffType } from '@shared/types';
import { useT } from '../i18n/i18n';

interface Props {
  player: PlayerState;
  isOpponent?: boolean;
  className?: string;
  onAvatarClick?: () => void;
}

// 血条颜色：按真实血量计算
// <6 红色, 6-10 橙色, 11-15 黄色, 16-20 绿色, >20 蓝色
function getHpColor(hp: number) {
  if (hp < 6) return { bar: 'bg-red-500', border: '#b91c1c' };     // red-700
  if (hp <= 10) return { bar: 'bg-orange-500', border: '#c2410c' }; // orange-700
  if (hp <= 15) return { bar: 'bg-yellow-400', border: '#ca8a04' }; // yellow-600
  if (hp <= 20) return { bar: 'bg-green-500', border: '#15803d' }; // green-700
  return { bar: 'bg-blue-500', border: '#1d4ed8' };                // blue-700
}

// 单位长度：maxHp/20 * unitPx = 3 × 原来血条长度(w-10=40px)
// 20/20 * unitPx = 120 → unitPx = 6
const UNIT_PX = 6;

export default function PlayerInfo({ player, isOpponent, className, onAvatarClick }: Props) {
  const t = useT();
  const hp = player.hp;
  const hpColor = getHpColor(hp);

  // 凋零和护盾层数
  const witherStacks = player.buffs
    .filter(b => b.buffType === BuffType.Wither)
    .reduce((sum, b) => sum + b.stacks, 0);
  const shieldStacks = player.buffs
    .filter(b => b.buffType === BuffType.Shield)
    .reduce((sum, b) => sum + b.stacks, 0);

  // 血条尺寸
  const hpBarWidth = hp * UNIT_PX;
  const maxBarWidth = player.maxHp * UNIT_PX;
  const shieldWidth = shieldStacks * UNIT_PX;

  // 凋零条定位
  let witherLeft = 0;
  let witherWidth = 0;
  if (witherStacks > 0) {
    witherWidth = witherStacks * UNIT_PX;
    witherLeft = witherStacks <= hp ? hpBarWidth - witherWidth : 0;
  }

  // 最右侧条边缘 → 数值显示的 margin
  const rightmostEdge = Math.max(
    hpBarWidth + shieldWidth,                              // 血量+护盾
    witherStacks > hp ? witherWidth : 0,                   // 凋零>血量时从左延伸
    maxBarWidth                                            // 背景轨道
  );
  const barOverflow = Math.max(0, rightmostEdge - maxBarWidth);

  return (
    <div className={`flex items-center gap-2 relative z-0 ${className || ''}`}>
      {/* 头像 */}
      <div
        className={`w-6 h-6 rounded-full bg-card-bg border border-card-border flex items-center justify-center text-xs shrink-0 ${onAvatarClick ? 'cursor-pointer active:scale-90 transition-transform' : ''}`}
        onClick={onAvatarClick}
      >
        {isOpponent ? '👤' : '🧑'}
      </div>
      <div className="min-w-0">
        {/* 名称 */}
        <div className="flex items-center gap-1">
          <span className="font-semibold text-xs text-text-primary truncate max-w-[80px]">{player.name}</span>
          {isOpponent && <span className="text-[8px] text-text-secondary bg-card-bg/60 px-1 rounded-full border border-card-border/50">{t('对手', 'Rival')}</span>}
        </div>
        {/* 血条 + 数值显示 */}
        <div className="flex items-center gap-1">
          {/* 血条容器（overflow 可见，允许护盾/凋零延伸超出） */}
          <div className="relative shrink-0" style={{ width: maxBarWidth, height: 8 }}>
            {/* 背景轨道（血量上限条） */}
            <div className="absolute inset-0 bg-card-bg/60" style={{ border: '1px solid rgba(0,0,0,0.4)' }} />
            {/* 血量条 */}
            <div
              className={`absolute left-0 top-0 h-full transition-all duration-500 ${hpColor.bar}`}
              style={{ width: Math.max(hpBarWidth, 0), border: `1px solid ${hpColor.border}` }}
            />
            {/* 凋零条（暗红色边框 + 阴影线，已有边框不改） */}
            {witherStacks > 0 && (
              <div
                className="absolute top-0 h-full"
                style={{
                  left: witherLeft,
                  width: witherWidth,
                  background: 'repeating-linear-gradient(45deg, rgba(127,29,29,0.35), rgba(127,29,29,0.35) 2px, transparent 2px, transparent 5px)',
                  border: '1px solid rgba(127,29,29,0.6)',
                }}
              />
            )}
            {/* 护盾条（白色，从血量条右端向右延伸） */}
            {shieldStacks > 0 && (
              <div
                className="absolute top-0 h-full bg-white/80"
                style={{ left: hpBarWidth, width: shieldWidth, border: '1px solid rgba(100,100,100,0.8)' }}
              />
            )}
          </div>
          {/* 数值显示：紧贴最右侧条的右边，格式 "x/x +x -x" 带空格 */}
          <span className="text-xs font-mono whitespace-nowrap relative z-10" style={{ marginLeft: barOverflow }}>
            <span className="text-text-primary">{hp}/{player.maxHp}</span>
            {shieldStacks > 0 && <span className="text-white"> +{shieldStacks}</span>}
            {witherStacks > 0 && <span className="text-red-800"> -{witherStacks}</span>}
          </span>
        </div>
      </div>
    </div>
  );
}
