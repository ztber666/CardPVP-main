import { CardDef, ActiveBuff } from '@shared/types';
import { parseIcon } from '@shared/constants';
import { getCardImageUrl } from '../utils/cardImage';
import BuffBadge from './BuffBadge';
import { cardText, costFullName, costFullZh, useLang } from '../i18n/i18n';

interface Props {
  card: CardDef & { buffs?: ActiveBuff[] };
}

const TYPE_STYLE: Record<string, string> = {
  action: 'bg-accent-attack/15 text-accent-attack',
  strategy: 'bg-accent-equip/15 text-accent-equip',
  heal: 'bg-accent-heal/15 text-accent-heal',
  attack: 'bg-accent-attack/15 text-accent-attack',
  buff: 'bg-accent-buff/15 text-accent-buff',
  debuff: 'bg-purple-100 text-purple-700',
  event: 'bg-blue-100 text-blue-700',
  equip: 'bg-accent-equip/15 text-accent-equip',
  weapon: 'bg-accent-equip/15 text-accent-equip',
  field: 'bg-accent-equip/15 text-accent-equip',
  counter: 'bg-accent-shield/15 text-accent-shield',
};

export default function SelectedCardDetail({ card }: Props) {
  const lang = useLang();
  const { name: displayName, description: displayDesc } = cardText(lang, card);
  const cardTypes = parseIcon(card.icon);

  return (
    <div className="w-44 bg-card-bg/95 backdrop-blur-sm border border-card-border rounded-xl p-3 shadow-xl flex flex-col animate-fade-in">
      {/* 卡牌图标 + 名称 + 全部类型标签 */}
      <div className="flex items-center gap-2 mb-2">
        <img src={getCardImageUrl(card.id)} alt={displayName} className="w-10 h-10 object-contain" style={{ imageRendering: 'pixelated' }} />
        <div className="min-w-0">
          <div className="text-sm font-bold text-text-primary truncate">{displayName}</div>
          <div className="flex flex-wrap gap-1 mt-0.5">
            {cardTypes.map((t, i) => (
              <span key={i} className={`inline-block px-1.5 py-[1px] rounded text-[9px] font-medium ${TYPE_STYLE[t] || 'bg-accent-shield/15 text-accent-shield'}`}>
                {costFullName(lang, t, costFullZh(t))}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="h-px bg-card-border/60 mb-2" />

      {/* buff 徽章 */}
      {card.buffs && card.buffs.length > 0 && (
        <div className="w-full flex flex-wrap items-center justify-center gap-1 mb-2">
          {card.buffs.map((buff, i) => (
            <BuffBadge key={i} buff={buff} compactMode={false} />
          ))}
        </div>
      )}

      {/* 仅显示描述 */}
      <p className="text-[11px] text-text-secondary leading-relaxed">{displayDesc}</p>
    </div>
  );
}
