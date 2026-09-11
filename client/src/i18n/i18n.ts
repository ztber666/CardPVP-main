import { useSettingsStore, type AppLang } from '../store/settingsStore';
import type { CardDef, BuffType, CostType } from '@shared/types';
import { BUFF_NAMES, COST_TYPE_NAMES } from '@shared/types';
import { getCardImageNum } from '../utils/cardImage';

export type { AppLang };

/**
 * 极简双语方案。
 * - UI 固定文案：组件内用 useT() 得到 t(zh, en)，按当前语言返回其一。
 * - 静态数据（卡牌名/描述、Buff 名/描述、消耗类型名）：按稳定键（卡牌模板 id / BuffType / CostType）
 *   在 EN 字典查询，未命中则回退中文原文（服务端数据始终是中文）。
 * 注意：不改动 shared 数据与逻辑，card.name 等仍保留中文作语义判断，仅在显示层翻译。
 */

/** 读取当前语言（组件内使用以获得重渲染） */
export function useLang(): AppLang {
  return useSettingsStore((s) => s.lang);
}

/** UI 文案助手：t(中文, 英文) */
export function useT() {
  const lang = useLang();
  return (zh: string, en: string) => (lang === 'en' ? en : zh);
}

/** 纯文本切换（非 hook，供模块级使用） */
export function txt(lang: AppLang, zh: string, en: string): string {
  return lang === 'en' ? en : zh;
}

/* ============================ Buff 名称/描述 ============================ */

export const EN_BUFF_NAMES: Record<string, string> = {
  strength: 'Strength',
  weakness: 'Weakness',
  resistance: 'Resistance',
  vuln: 'Vulnerability',
  heal: 'Regeneration',
  wither: 'Wither',
  shield: 'Absorption',
  fireResist: 'Fire Resistance',
  poison: 'Poison',
  fireVuln: 'Flammable',
  healBoost: 'Heal Boost',
  lockAction: 'Action Lock',
  lockStrategy: 'Strategy Lock',
  witherOnDraw: 'Trap',
  damageBoost: 'Critical',
  removeWither: 'Remove Wither',
  reduceDuration: 'Duration Cut',
  reduceMaxHp: 'Max HP Down',
  increaseMaxHp: 'Max HP Up',
  conditionalDiscard: 'Conditional Discard',
  physicalDamage: 'Physical Damage',
  damage: 'Magic Damage',
  fireDamage: 'Fire Damage',
  drawCard: 'Draw',
  stealCard: 'Steal',
  revealHand: 'Reveal Hand',
  forceDiscardEquip: 'Force Unequip',
  damageOnDiscard: 'Discard Damage',
  healPerBuff: 'Status Heal',
  healAll: 'Heal All',
  horde: 'Horde',
  blight: 'Blight',
  block: 'Block',
  enchantBurst: 'Enchant Burst',
  attackSign: 'Attack Omen',
  copyCard: 'Copy',
  validityExtension: 'Duration Extend',
  rebirth: 'Rebirth',
};

export const EN_BUFF_DESCRIPTIONS: Record<string, string> = {
  damage: 'When granted and at the start of each turn, the bearer takes n magic damage.',
  fireResist: 'Makes the bearer immune to fire damage.',
  damageBoost: 'The next physical damage dealt by the bearer is multiplied by 1.75 (rounded up).',
  witherOnDraw: 'The bearer gains +1 Wither for each card it draws.',
  damageOnDiscard: 'The bearer takes n magic damage whenever it discards a card (once per turn).',
  strength: 'The bearer deals n more physical damage. +1 damage per stack.',
  weakness: 'The bearer deals n less physical damage. -1 damage per stack.',
  resistance: 'The bearer takes n less physical damage. -1 damage taken per stack.',
  vulnerability: 'The bearer takes n more physical damage. +1 damage taken per stack.',
  heal: 'When granted and at the start of each turn, the bearer restores n HP.',
  wither: 'When the bearer heals, consume stacks to cancel that much healing; each stack cancels 1 HP (applied last).',
  shield: 'When the bearer takes physical damage, consume stacks to block that much; each stack blocks 1 damage (applied last).',
  poison: 'After the bearer heals, it loses 3 HP.',
  fireVuln: 'The bearer takes n more fire damage. +1 damage taken per stack.',
  healBoost: 'The bearer heals for extra HP equal to the number of stacks.',
  lockAction: 'The bearer cannot use action cards. Removed upon taking fire damage.',
  lockStrategy: 'The bearer cannot use strategy cards. Removed upon taking fire damage.',
  horde: 'When granted and at the start of each turn, deals equal physical damage to the bearer.',
  blight: 'The bearer heals for n less HP.',
  block: 'The next physical damage the bearer takes is reduced by 5, then this effect is removed.',
  enchantBurst: 'When the bearer discards a card, consume 1 stack to also trigger that card on its current target. Cannot trigger the turn it is gained.',
  attackSign: 'When removed, the player with the most HP on the field takes 5 magic damage (ties favor the bearer of this effect).',
  fireDamage: 'A damage type affected by Fire Resistance and Flammable; removes the target\'s lock effects.',
  copyCard: 'Copies the effect of the last card played.',
  removeWither: 'Removes the target\'s Wither.',
  reduceDuration: 'Reduces the duration of all the target\'s timed effects by 1 turn.',
  reduceMaxHp: 'Lowers the target\'s maximum HP.',
  increaseMaxHp: 'Raises the target\'s maximum HP.',
  conditionalDiscard: 'The target discards an attack card, otherwise gains Horde for 2 turns.',
  physicalDamage: 'A damage type affected by Resistance/Vulnerability and the attacker\'s Weakness/Strength; may trigger several events.',
  drawCard: 'Draw a card.',
  stealCard: 'Steal a card from the target\'s hand.',
  revealHand: 'Reveal the target\'s hand.',
  forceDiscardEquip: 'Force the target to unequip its equipment.',
  healPerBuff: 'Restore 1 HP for each status effect on the bearer.',
  healAll: 'Restore HP to all players.',
  validityExtension: 'Extend the duration of one of the target\'s effects by 1 turn.',
  rebirth: 'When the bearer takes lethal damage, cancel it, then remove all its status effects and set its HP to 1.',
};

/* ============================ 消耗类型名称 ============================ */

export const EN_COST_FULL: Record<string, string> = {
  action: 'Action Card',
  strategy: 'Strategy Card',
  heal: 'Heal Card',
  attack: 'Attack Card',
  buff: 'Buff Card',
  debuff: 'Debuff Card',
  event: 'Event Card',
  equip: 'Equipment',
  weapon: 'Weapon',
  field: 'Field',
  counter: 'Counter Card',
};

export const EN_COST_SHORT: Record<string, string> = {
  action: 'Action',
  strategy: 'Strategy',
  heal: 'Heal',
  attack: 'Attack',
  buff: 'Buff',
  debuff: 'Debuff',
  event: 'Event',
  equip: 'Equip',
  weapon: 'Weapon',
  field: 'Field',
  counter: 'Counter',
};

/* ============================ 卡牌名称/描述 ============================ */

/**
 * 卡牌英文数据，按模板编号（与 assets/item/{n}.png 对应）。
 */
export const CARD_EN: Record<string, { name: string; desc: string }> = {
  1: { name: 'Apple', desc: 'Restore 3 HP.' },
  2: { name: 'Firework Rocket', desc: 'Deal 5 physical damage.' },
  3: { name: "Dragon's Breath", desc: '3 magic damage for 2 turns.' },
  4: { name: 'Golden Apple', desc: 'Restore 2 HP for 2 turns.' },
  5: { name: 'Torch', desc: 'Gain +1 Strength for 2 turns. / Remove 3 stacks of Wither.' },
  6: { name: 'Lantern', desc: 'Gain +1 Resistance and +1 Fire Resistance for 2 turns, plus 1 Absorption.' },
  7: { name: 'Milk Bucket', desc: "Reduce the duration of all the target's timed effects by 1 turn." },
  8: { name: 'Soul Torch', desc: 'Give +1 Weakness for 2 turns. / Lower max HP by 2.' },
  9: { name: 'Soul Lantern', desc: 'Give +1 Vulnerability for 2 turns. / Add 2 Wither.' },
  10: { name: 'Spawner', desc: 'The target must discard an attack card, otherwise it gains Horde for 2 turns.' },
  11: { name: 'Cactus', desc: 'Deal 1 physical damage to all players. / When discarded, draw 1 card.' },
  12: { name: 'Glow Berries', desc: 'Gain +1 Heal Boost for 2 turns. / Raise max HP by 2.' },
  13: { name: 'Cobweb', desc: 'Give the target Action Lock or Strategy Lock for 1 turn (your choice).' },
  14: { name: 'Dead Bush', desc: 'Give +2 Flammable for 2 turns. / Give +1 Blight for 2 turns.' },
  15: { name: 'Netherite Scrap', desc: 'Give the target Block for 2 turns. / Give +1 Weakness for 2 turns.' },
  16: { name: 'Spyglass', desc: 'The target reveals its entire hand to the player who played this.' },
  17: { name: 'Carrot on a Stick', desc: "Steal 1 card from the target's hand." },
  18: { name: 'Warped Fungus on a Stick', desc: "Choose one piece of the target's equipment and make them discard it." },
  19: { name: 'Cake', desc: 'Both players heal 1 HP twice. / The target heals 2 HP.' },
  20: { name: 'Shulker Box', desc: 'Draw 3 cards. / +1 Vulnerability for 1 turn.' },
  21: { name: 'Curse of Binding', desc: 'Give the target Curse of Binding for 2 turns (takes 3 damage when discarding).' },
  22: { name: 'Suspicious Stew', desc: 'For each status effect on the target, restore 1 HP.' },
  23: { name: 'Diamond Chestplate', desc: 'Gain +1 Resistance for 1 turn. / Gain Absorption as healing instead.' },
  24: { name: 'Golden Leggings', desc: 'When healing, each stack of Wither consumed grants 1 Absorption.' },
  25: { name: 'Leather Boots', desc: 'While equipped, draw 1 extra card at the start of your turn.' },
  26: { name: 'Turtle Shell', desc: 'Immune to Cobweb. / +1 Fire Resistance for 1 turn.' },
  27: { name: 'Trident', desc: 'Gain +1 Strength for 1 turn. / Physical damage dealt to a Withering target is +1.' },
  28: { name: 'Blaze Rod', desc: 'After you deal physical damage, you may discard a card to deal 2 fire damage.' },
  29: { name: 'Glass Pane', desc: 'Re-trigger the effect of the last non–Glass Pane card you played. As an action card it costs 2 extra uses.' },
  30: { name: 'Brewing Stand', desc: "While equipped, you may convert Apple to Firework Rocket and Dragon's Breath to Golden Apple (and vice versa)." },
  31: { name: 'Spider Eye', desc: 'Give the target Poison for 2 turns.' },
  32: { name: 'Observer', desc: 'Guess the weight of a random card in the target\'s hand. If correct, gain Critical (next physical damage +75%, non-stacking).' },
  33: { name: 'Nether Wastes', desc: 'Gain 1 Absorption whenever you discard a card.' },
  34: { name: 'Ice Plains', desc: 'Heal-type and attack-type cards share the same use limit.' },
  35: { name: 'Trapped Chest', desc: 'Give the target Trap for 1 turn (gain Wither when drawing).' },
  36: { name: 'Jungle', desc: 'Healing restores 1 extra HP once per turn. / When your Wither clears, max HP +1.' },
  37: { name: 'Enchanting Table', desc: 'Gain 1 Enchant Burst for 2 turns.' },
  38: { name: 'Village', desc: 'Hand size limit +4. / Immune to Horde.' },
  39: { name: 'Blaze Powder', desc: 'Deal 3 fire damage. / Against the opponent: usable only after dealing physical damage this turn, once per turn.' },
  40: { name: 'Pointed Dripstone', desc: 'Restore 1 HP whenever you deal physical damage.' },
  41: { name: 'Minecart with Chest', desc: 'Reveal 5 cards from your deck, then players take turns choosing one each to add to hand, starting with you.' },
  42: { name: 'Sculk Shrieker', desc: 'When you deal physical damage, all players gain +1 Wither. When Wither clears, the opponent discards a random card.' },
  43: { name: 'Respawn Anchor', desc: '3 physical damage / 2 fire damage. / When discarded, gain Rebirth for 2 turns.' },
  44: { name: 'Heart of the Sea', desc: 'When you take fire damage, discard this card to cancel it. / When discarded, gain 2 Absorption.' },
  45: { name: 'Shield', desc: 'Draw 1 card whenever you take physical damage.' },
  46: { name: 'Ominous Banner', desc: 'Give the target Attack Omen for 2 turns. / When discarded, restore 1 HP.' },
  47: { name: 'Redstone Dust', desc: 'Choose one timed effect on the target and increase its duration by 1 turn.' },
};

/** 取得本地化的卡牌显示名/描述（未命中英文时回退中文原文） */
export function cardText(lang: AppLang, card: CardDef): { name: string; description: string } {
  if (lang === 'en') {
    const num = getCardImageNum(card.id);
    const en = CARD_EN[num];
    if (en) return { name: en.name, description: en.desc };
  }
  return { name: card.name, description: card.description };
}

/** 本地化 Buff 显示名（未命中英文时回退 BUFF_NAMES 中文） */
export function buffName(lang: AppLang, type: BuffType): string {
  if (lang === 'en') {
    const en = EN_BUFF_NAMES[type as string];
    if (en) return en;
  }
  return BUFF_NAMES[type] || type;
}

/** 本地化 Buff 描述（回退中文 BUFF_DESCRIPTIONS；中文描述字典由调用方传入 zhDesc） */
export function buffDesc(lang: AppLang, type: BuffType, zhDesc: string, fallback = '暂无描述'): string {
  if (lang === 'en') {
    const en = EN_BUFF_DESCRIPTIONS[type as string];
    if (en) return en;
  }
  return zhDesc || fallback;
}

/** 本地化消耗类型全称（行动卡…） */
export function costFullName(lang: AppLang, type: CostType, zh: string): string {
  if (lang === 'en') {
    const en = EN_COST_FULL[type as string];
    if (en) return en;
  }
  return zh;
}

/** 消耗类型中文全称（用于传参给 costFullName） */
export function costFullZh(type: CostType): string {
  return COST_TYPE_NAMES[type] || '其他';
}

/** 卡牌模板 id 的中文名（图鉴等静态列表用） */
export function cardNameForTemplate(lang: AppLang, templateId: string, zhName: string): string {
  if (lang === 'en') {
    const num = getCardImageNum(templateId);
    const en = CARD_EN[num];
    if (en) return en.name;
  }
  return zhName;
}
