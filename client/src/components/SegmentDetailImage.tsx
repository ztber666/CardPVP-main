import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ContentSegment, BuffType } from '@shared/types';
import { getCardImageUrl, getCardByImageId } from '../utils/cardImage';
import { BUFF_ICON_MAP } from './BuffCollection';
import CardDetail from './CardDetail';
import BuffDetail from './BuffDetail';

/** 获取 buff 图标 URL */
function getBuffImageUrl(buffType: BuffType): string | null {
  const iconNum = BUFF_ICON_MAP[buffType as string];
  return iconNum ? `/assets/buff/buff${iconNum}.png` : null;
}

interface Props {
  segment: ContentSegment;
  className?: string;
}

/**
 * 可点击的卡牌 / buff 小图（用于战斗记录和触发提示中的富内容段）。
 * 点击后弹出详情：
 * - card 段 → 卡牌图鉴详情（CardDetail）
 * - buff 段 → Buff 详情（BuffDetail）
 * 弹窗通过 Portal 挂到 body，避免受父级 backdrop-filter/transform 影响。
 */
export default function SegmentDetailImage({ segment, className = '' }: Props) {
  const [showDetail, setShowDetail] = useState(false);

  // ===== 卡牌段 =====
  if (segment.type === 'card') {
    const cardId = segment.cardId!;
    const card = getCardByImageId(cardId);
    return (
      <>
        <img
          src={getCardImageUrl(cardId)}
          alt=""
          className={`w-5 h-5 object-contain shrink-0 inline-block align-middle rounded-sm p-[2px] ring-1 ring-card-border/60 bg-card-bg/40 ${
            card
              ? 'cursor-pointer transition-all duration-150 hover:scale-110 hover:ring-accent-shield/50 hover:bg-accent-shield/10 hover:ring-offset-0'
              : 'opacity-80'
          } ${className}`}
          style={{ imageRendering: 'pixelated' }}
          onClick={(e) => {
            if (!card) return;
            e.stopPropagation();
            setShowDetail(true);
          }}
        />
        {showDetail && card && createPortal(
          <CardDetail card={card} onClose={() => setShowDetail(false)} />,
          document.body
        )}
      </>
    );
  }

  // ===== buff 段 =====
  if (segment.type === 'buff') {
    const buffType = segment.buffType!;
    const url = getBuffImageUrl(buffType);

    // 无图标的 buff：降级为文本（与旧版行为一致），不再提供详情
    if (!url) {
      return <span className="text-xs text-text-secondary">[{buffType}]</span>;
    }

    return (
      <>
        <img
          src={url}
          alt=""
          className={`w-5 h-5 object-contain shrink-0 inline-block align-middle rounded-sm p-[2px] ring-1 ring-card-border/60 bg-card-bg/40 cursor-pointer transition-all duration-150 hover:scale-110 hover:ring-accent-shield/50 hover:bg-accent-shield/10 ${className}`}
          style={{ imageRendering: 'pixelated' }}
          onClick={(e) => {
            e.stopPropagation();
            setShowDetail(true);
          }}
        />
        {showDetail && createPortal(
          <BuffDetail
            buffType={buffType}
            onClose={() => setShowDetail(false)}
            glowClass="bg-accent-buff/25"
          />,
          document.body
        )}
      </>
    );
  }

  return null;
}
