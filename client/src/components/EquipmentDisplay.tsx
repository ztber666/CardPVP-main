import { useState } from 'react';
import { CardDef, BuffType } from '@shared/types';
import { getCardImageUrl } from '../utils/cardImage';
import { buffName, cardText, useLang, useT } from '../i18n/i18n';

interface Props {
  equipment: { equip?: CardDef; weapon?: CardDef; field?: CardDef };
  isOpponent?: boolean;
  onUnequip?: (slot: string) => void;
}

const SLOT_NAMES_ZH: Record<string, string> = {
  equip: '装备',
  weapon: '武器',
  field: '场地'
};
const SLOT_NAMES_EN: Record<string, string> = {
  equip: 'Equip',
  weapon: 'Weapon',
  field: 'Field'
};

const Icon = ({ name, className }: { name: string; className?: string }) => {
  const srcMap: Record<string, string> = {
    equip: '/assets/icons/equip.svg',
    weapon: '/assets/icons/weapon.svg',
    field: '/assets/icons/field.svg'
  };
  return (
    <img 
      src={srcMap[name]} 
      alt={name} 
      className={className || 'w-4 h-4'} 
    />
  );
};

export default function EquipmentDisplay({ equipment, isOpponent, onUnequip }: Props) {
  const [detailCard, setDetailCard] = useState<{ card: CardDef; slot: string } | null>(null);
  const lang = useLang();
  const t = useT();
  const slotLabel = (slot: string) => (lang === 'en' ? SLOT_NAMES_EN[slot] : SLOT_NAMES_ZH[slot]) || SLOT_NAMES_ZH[slot];
  const { name: detailName, description: detailDesc } = detailCard ? cardText(lang, detailCard.card) : { name: '', description: '' };

  const slots = (['equip', 'weapon', 'field'] as const).map(slot => ({
    slot,
    card: equipment[slot],
  }));

  // 修复：将 slot 参数类型限制为具体的联合类型，解决索引签名错误
  const handleCardClick = (slot: 'equip' | 'weapon' | 'field') => {
    return (e: React.MouseEvent | React.TouchEvent) => {
      e.stopPropagation();
      setDetailCard({ card: equipment[slot]!, slot });
    };
  };

  return (
    <>
      <div className="flex items-center justify-center gap-2 h-20">
        {slots.map(({ slot, card }) => (
          <div
            key={slot}
            className={`relative w-16 h-full rounded-xl flex flex-col items-center justify-center gap-1 transition-all duration-300 group cursor-pointer ${
              card
                ? 'bg-card-bg/80 border border-accent-shield/30 shadow-md hover:scale-105 hover:border-accent-shield/60'
                : 'bg-gray-100/20 border border-dashed border-gray-300 text-gray-600'
            }`}
            onClick={card ? handleCardClick(slot) : undefined}
          >
            {card ? (
              <>
                <img src={getCardImageUrl(card.id)} alt={cardText(lang, card).name} className="w-11 h-11 object-contain drop-shadow-sm transition-transform group-hover:scale-110" style={{ imageRendering: 'pixelated' }} />
                <span className="text-[9px] text-text-primary font-medium leading-tight text-center px-1 truncate w-full">
                  {cardText(lang, card).name}
                </span>
              </>
            ) : (
              <span className="flex flex-col items-center gap-1 opacity-70">
                <Icon name={slot} className="w-4 h-4" />
                <span className="text-[10px] tracking-wider">{slotLabel(slot)}</span>
              </span>
            )}
          </div>
        ))}
      </div>

      {/* 装备详情弹窗 */}
      {detailCard && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in p-4"
          onClick={() => setDetailCard(null)}
        >
          <div
            className="bg-card-bg/95 backdrop-blur-md border border-white/10 rounded-2xl p-5 max-w-xs w-full shadow-2xl"
            onClick={e => {
              e.stopPropagation();
              e.preventDefault();
            }}
          >
            {/* 头部信息 */}
            <div className="flex items-start gap-4 mb-4">
              <div className="w-16 h-16 rounded-xl bg-black/20 flex items-center justify-center shrink-0 border border-white/5">
                <img src={getCardImageUrl(detailCard.card.id)} alt={detailName} className="w-12 h-12 object-contain" style={{ imageRendering: 'pixelated' }} />
              </div>
              <div className="flex-1 pt-1">
                <h3 className="text-lg font-bold text-text-primary">{detailName}</h3>
                <span className="inline-flex items-center gap-1 mt-1 text-[11px] text-accent-shield bg-accent-shield/10 px-2 py-0.5 rounded-full font-medium">
                  <Icon name={detailCard.slot} className="w-3 h-3" />
                  {slotLabel(detailCard.slot) || t('其他', 'Other')}
                </span>
              </div>
            </div>

            {/* 描述区 */}
            <p className="text-sm text-text-secondary leading-relaxed mb-4 bg-black/10 p-3 rounded-lg border border-white/5">
              {detailDesc}
            </p>

            {/* 效果列表 */}
            {detailCard.card.effects.length > 0 && (
              <div className="space-y-2 mb-5">
                <div className="text-[11px] text-text-secondary/70 uppercase tracking-wider font-semibold">{t('卡牌效果', 'Card Effects')}</div>
                {detailCard.card.effects.map((eff, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 text-sm text-text-primary bg-white/5 px-3 py-2 rounded-lg border border-white/5"
                  >
                    <span className="w-2 h-2 rounded-full bg-accent-shield shrink-0"></span>
                    <span className="font-medium">
                      {buffName(lang, eff.buffType as BuffType)}
                    </span>
                    {eff.value > 0 && (
                      <span className="text-accent-shield font-bold ml-1">
                        +{eff.value}
                      </span>
                    )}
                    {eff.duration && (
                      <span className="text-text-secondary/70 ml-auto text-[11px]">
                        {eff.duration} {t('回合', 'turns')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 按钮区 */}
            <div className="flex gap-2">
              {!isOpponent && onUnequip && (
                <button
                  onClick={() => {
                    onUnequip(detailCard.slot);
                    setDetailCard(null);
                  }}
                  className="flex-1 py-3 rounded-xl border border-accent-attack/30 text-accent-attack text-sm font-medium hover:bg-accent-attack/10 transition-colors"
                >
                  {t('卸下', 'Unequip')}
                </button>
              )}
              <button
                onClick={() => setDetailCard(null)}
                className={`py-3 rounded-xl text-sm font-medium transition-colors bg-white/5 text-text-secondary hover:bg-white/10 ${
                  !isOpponent && onUnequip ? 'flex-1' : 'w-full'
                }`}
              >
                {t('关闭', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
