import { useState } from 'react';
import { BUFF_NAMES, BuffType } from '@shared/types';

// Buff 效果描述
export const BUFF_DESCRIPTIONS: Record<string, string> = {
  [BuffType.Damage]: '获得时和回合开始时附着对象受到 n 点魔法伤害。',
  [BuffType.FireResist]: '使附着对象免疫火焰伤害。',
  [BuffType.DamageBoost]: '下次造成物理伤害时此次伤害*1.75 (向上取整)。',
  [BuffType.WitherOnDraw]: '附着对象每获得1张牌 +1 层凋零',
  [BuffType.DamageOnDiscard]: '附着对象丢弃牌时受到 n 点魔法伤害（每回合1次）。',
  [BuffType.Strength]: '使附着对象造成的物理伤害增加 n 点。每层 +1 伤害。',
  [BuffType.Weakness]: '使附着对象造成的物理伤害减少 n 点。每层 -1 伤害。',
  [BuffType.Resistance]: '使附着对象受到的物理伤害减少 n 点。每层 -1 受伤。',
  [BuffType.Vulnerability]: '使附着对象受到的物理伤害增加 n 点。每层 +1 受伤。',
  [BuffType.Heal]: '获得时和回合开始时回复附着对象 n 点血量。',
  [BuffType.Wither]: '回血时消耗层数并抵消回血量，每消耗1层就抵消1点回血量（最后生效）。',
  [BuffType.Shield]: '受到物理伤害时消耗层数并抵消伤害，每消耗1层就抵消1点伤害（最后生效）。',
  [BuffType.Poison]: '附着对象回血后减少 3 点血量。',
  [BuffType.FireVuln]: '使附着对象受到的火焰伤害增加 n 点。每层 +1 受伤。',
  [BuffType.HealBoost]: '使附着对象回血时额外回相当于层数的血量。',
  [BuffType.LockAction]: '附着对象无法使用行动牌。受到火焰伤害时移除。',
  [BuffType.LockStrategy]: '附着对象无法使用锦囊牌。受到火焰伤害时移除。',
  [BuffType.Horde]: '获得时和回合开始时对附着玩家造成等量物理伤害。',
  [BuffType.Blight]: '附着玩家回血时减少等量回复量。',
  [BuffType.Block]: '附着玩家下次受到物理伤害时抵消 5 点并移除此状态。',
  [BuffType.EnchantBurst]: '附着玩家丢弃手牌时消耗 1 层，使该牌对当前目标生效，获得当回合无法触发。',
  [BuffType.AttackSign]: '此状态被移除时场上血量最高的玩家受到 5 点魔法伤害（血量相同时拥有袭击之兆的玩家优先）。',
  [BuffType.FireDamage]: '一种伤害类型，受到抗火状态影响，受到易燃状态加成，会移除目标封锁状态。',
  [BuffType.CopyCard]: '复制上一张使用的牌',
  [BuffType.RemoveWither]: '移除目标的凋零状态。',
  [BuffType.ReduceDuration]: '减少目标所有状态的持续回合数。',
  [BuffType.ReduceMaxHp]: '减少目标的最大血量。',
  [BuffType.IncreaseMaxHp]: '增加目标的最大血量。',
  [BuffType.ConditionalDiscard]: '目标丢弃攻击卡，否则获得尸潮[*2]。',
  [BuffType.PhysicalDamage]: '一种伤害类型，受到对方抗性/易伤状态影响，受到自己虚弱/力量影响，可能触发多种事件。',
  [BuffType.DrawCard]: '摸牌。',
  [BuffType.StealCard]: '抽取目标手牌。',
  [BuffType.RevealHand]: '展示目标手牌。',
  [BuffType.ForceDiscardEquip]: '强制目标卸下装备。',
  [BuffType.HealPerBuff]: '每有1个状态就回复1点血量。',
  [BuffType.HealAll]: '回复所有玩家的血量。',
  [BuffType.ValidityExtension]: '延长目标1个状态的持续时间。',
  [BuffType.Rebirth]: '附着对象受到致命伤害时抵消这次伤害，然后移除自身所有状态并将自身血量改为1。',
};

// Buff 与 BuffType 编号映射
export const BUFF_ICON_MAP: Record<string, number> = {
  strength: 1, weakness: 2, resistance: 3, vuln: 4, heal: 5,
  wither: 6, shield: 7, fireResist: 8, poison: 9, fireVuln: 10,
  healBoost: 11, lockAction: 12, lockStrategy: 13, damage: 14,
  witherOnDraw: 15, damageBoost: 16, horde: 17, blight: 18, block: 19,
  damageOnDiscard: 20, enchantBurst: 21, attackSign: 22, rebirth: 23,

  removeWither: 100, reduceDuration: 101, reduceMaxHp: 102, increaseMaxHp: 103,
  conditionalDiscard: 104, physicalDamage: 105, drawCard: 106, stealCard: 107,
  revealHand: 108, forceDiscardEquip: 109, healPerBuff: 110, healAll: 111,
  fireDamage: 112, copyCard: 113, validityExtension: 114,
};

// 忽略特殊效果类型（不显示在图鉴中）`
const SKIP_TYPES = [
  BuffType.RemoveWither, BuffType.ReduceDuration,
  BuffType.ReduceMaxHp, BuffType.IncreaseMaxHp,
  BuffType.ConditionalDiscard, BuffType.PhysicalDamage, BuffType.DrawCard,
  BuffType.StealCard, BuffType.RevealHand, BuffType.ForceDiscardEquip,
  BuffType.HealPerBuff, BuffType.HealAll, BuffType.FireDamage,
  BuffType.CopyCard, BuffType.ValidityExtension,
];

/** 状态图鉴内容（不含弹窗外壳），供 CollectionModal 组合使用 */
export function BuffCollectionContent() {
  const [selected, setSelected] = useState<string | null>(null);

  const buffTypes = Object.values(BuffType).filter(
    t => !SKIP_TYPES.includes(t as BuffType)
  ) as BuffType[];

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {buffTypes.map(type => {
          const iconNum = BUFF_ICON_MAP[type];
          const name = BUFF_NAMES[type] || type;
          const desc = BUFF_DESCRIPTIONS[type] || '';
          return (
            <div
              key={type}
              className={`border rounded-xl p-3 cursor-pointer transition-all ${
                selected === type
                  ? 'border-accent-shield/40 bg-accent-shield/5'
                  : 'border-card-border/60 hover:border-card-border'
              }`}
              onClick={() => setSelected(selected === type ? null : type)}
            >
              <div className="flex items-center gap-2 mb-1">
                {iconNum ? (
                  <img src={`/assets/buff/buff${iconNum}.png`} alt="" className="w-5 h-5" style={{ imageRendering: 'pixelated' }} />
                ) : (
                  <span className="w-5 h-5 rounded bg-gray-200 flex items-center justify-center text-[10px]">?</span>
                )}
                <span className="text-sm font-semibold text-text-primary">{name}</span>
              </div>
              {selected === type && (
                <p className="text-xs text-text-secondary leading-relaxed mt-1 pl-7">{desc}</p>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-center text-text-secondary text-xs mt-4">
        共 {buffTypes.length} 种效果 · 点击展开详情
      </p>
    </>
  );
}

export default function BuffCollection({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8"
      onClick={onClose}
    >
      <div
        className="bg-card-bg border border-card-border rounded-2xl p-6 max-w-xl w-full mx-4 shadow-xl animate-fade-in my-8"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-text-primary">效果图鉴</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full border border-card-border flex items-center justify-center text-text-secondary hover:bg-card-bg/50 transition-colors">✕</button>
        </div>

        <BuffCollectionContent />
      </div>
    </div>
  );
}
