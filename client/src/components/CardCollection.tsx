import { useEffect, useState } from 'react';
import { CostType } from '@shared/types';
import type { ActiveBuff } from '@shared/types';
import { parseIcon } from '@shared/constants';
import BuffBadge from './BuffBadge';
import { cardNameForTemplate, costFullName, costFullZh, useLang, useT, CARD_EN } from '../i18n/i18n';

interface CardTemplate {
  id: string;
  name: string;
  icon: string;
  costType: CostType;
  effects: { buffType: string; value: number; target: string; duration?: number }[];
  buffs: ActiveBuff[];
  description: string;
  weight: number;
}

const TYPE_BADGE: Record<string, string> = {
  [CostType.Action]:  'bg-accent-attack/15 text-accent-attack',
  [CostType.Strategy]:'bg-accent-equip/15 text-accent-equip',
  [CostType.Heal]:    'bg-accent-heal/15 text-accent-heal',
  [CostType.Attack]:  'bg-accent-attack/15 text-accent-attack',
  [CostType.Buff]:    'bg-accent-buff/15 text-accent-buff',
  [CostType.Debuff]:  'bg-purple-100 text-purple-700',
  [CostType.Equip]:   'bg-accent-equip/15 text-accent-equip',
  [CostType.Weapon]:  'bg-accent-equip/15 text-accent-equip',
  [CostType.Field]:   'bg-accent-equip/15 text-accent-equip',
  [CostType.Event]:   'bg-blue-100 text-blue-700',
  [CostType.Counter]: 'bg-cyan-100 text-cyan-700',
};

/** 卡牌图鉴内容（不含弹窗外壳），供 CollectionModal 组合使用 */
export function CardCollectionContent() {
  const [cards, setCards] = useState<CardTemplate[]>([]);
  const lang = useLang();
  const t = useT();

  useEffect(() => {
    // 动态导入共享模块
    import('@shared/constants').then(mod => {
      setCards(mod.CARDS || []);
    });
  }, []);

  if (cards.length === 0) {
    return <p className="text-text-secondary text-center py-8">{t('加载中...', 'Loading...')}</p>;
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {cards.map(card => {
          const cardTypes = parseIcon(card.icon);
          const imgNum = card.id.replace('card_', '');
          const imgExt = imgNum === '21' ? '.gif' : '.png';
          const name = cardNameForTemplate(lang, card.id, card.name);
          const desc = lang === 'en' && CARD_EN[imgNum] ? CARD_EN[imgNum].desc : card.description;
          return (
            <div
              key={card.id}
              className="bg-card-bg border border-card-border/60 rounded-xl p-3 flex flex-col items-center gap-2 hover:shadow-md transition-shadow"
            >
              {/* 卡面 */}
              <img
                src={`/assets/item/${imgNum}${imgExt}`}
                alt={name}
                className="w-14 h-14 object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
              {/* 名称 */}
              <span className="text-sm font-semibold text-text-primary text-center leading-tight">{name}</span>
              {/* 类型标签：parseIcon 解析 icon 全部类型（效果类型 + 消耗类型） */}
              <div className="flex flex-wrap items-center justify-center gap-1">
                {cardTypes.map((ct, i) => (
                  <span key={i} className={`px-2 py-0.5 rounded text-[9px] font-medium ${TYPE_BADGE[ct] || 'bg-accent-shield/15 text-accent-shield'}`}>
                    {costFullName(lang, ct, costFullZh(ct))}
                  </span>
                ))}
              </div>
              {/* 权重 */}
              <span className="text-[8px] text-text-secondary/50">{t('权重', 'Weight')} {card.weight}</span>
              {/* 效果列表：根据卡牌 buffs 直接显示 buff 徽章（buffs 为空则留空，description 仍显示在底部） */}
              {card.buffs.length > 0 && (
                <div className="w-full flex flex-wrap items-center justify-center gap-1">
                  {card.buffs.map((buff, i) => (
                    <BuffBadge key={i} buff={buff} compactMode={false} />
                  ))}
                </div>
              )}
              {/* 描述 */}
              <span className="text-[9px] text-text-secondary/70 text-center leading-tight">
                {desc}
              </span>
            </div>
          );
        })}
      </div>

      {/* 底部说明 */}
      <p className="text-center text-text-secondary text-xs mt-6">
        {t('共', 'Total')} {cards.length} {t('种卡牌 · 牌组根据权重随机构成', 'card types · the deck is built randomly by weight')}
      </p>
    </>
  );
}

export default function CardCollection({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8"
      onClick={onClose}
    >
      <div
        className="bg-card-bg border border-card-border rounded-2xl p-6 max-w-2xl w-full mx-4 shadow-xl animate-fade-in my-8"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-text-primary">{t('卡牌图鉴', 'Card Gallery')}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-card-border flex items-center justify-center text-text-secondary hover:bg-card-bg/50 transition-colors"
          >
            ✕
          </button>
        </div>

        <CardCollectionContent />
      </div>
    </div>
  );
}
