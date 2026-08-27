import { useEffect, useLayoutEffect, useRef, useState, ReactNode } from 'react';
import { CardDef, PlayerState } from '@shared/types';
import { isCardConsumptionExhausted } from '@shared/validation';
import CardComponent from './Card';

interface Props {
  cards: CardDef[];
  player: PlayerState | null | undefined; // 用于按消耗类型次数用尽置灰
  disabled: boolean;
  selectedCardId: string | null;
  onSelectCard: (card: CardDef) => void;
  collapsed: boolean;
  onToggle: () => void;
}

// 用于新手牌加入时的入场动画
const CardEnterWrapper = ({ children, isNew }: { children: ReactNode; isNew: boolean }) => {
  const [entered, setEntered] = useState(!isNew);
  
  useEffect(() => {
    if (isNew) {
      const id = requestAnimationFrame(() => setEntered(true));
      return () => cancelAnimationFrame(id);
    }
  }, []); 

  return (
    <div
      className={`transition-all duration-300 ease-out ${
        entered ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 -translate-y-6 scale-90'
      }`}
    >
      {children}
    </div>
  );
};

export default function PlayerHand({ cards, player, disabled, selectedCardId, onSelectCard, collapsed, onToggle }: Props) {
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  
  interface CardOffset { left: number; top: number; }
  const lastOffsets = useRef<Map<string, CardOffset>>(new Map());
  const prevCardIdsRef = useRef<string[]>([]);
  const prevCardsLength = useRef(cards.length);
  
  // 实时追踪滚动位置，避免重渲染间隙的滑动导致旧位置计算失误
  const liveScrollLeft = useRef(0);

  const currentIds = cards.map((c, i) => c.id || `card-${i}`);
  const newCardIds = currentIds.filter(id => !prevCardIdsRef.current.includes(id));

  useEffect(() => {
    prevCardIdsRef.current = currentIds;
  }, [currentIds]);

  // 监听滚动事件，始终记录最新的 scrollLeft
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const handleScroll = () => {
      liveScrollLeft.current = container.scrollLeft;
    };
    
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // FLIP 动画核心逻辑
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    if (collapsed) {
      prevCardsLength.current = cards.length;
      lastOffsets.current.clear();
      return;
    }

    if (cards.length !== prevCardsLength.current) {
      // 获取重排后的真实 scrollLeft
      const newScrollLeft = container.scrollLeft;
      // 使用实时追踪的 scrollLeft 作为旧视觉位置的基准
      const oldScrollLeft = liveScrollLeft.current;

      cardRefs.current.forEach((el, id) => {
        if (!el) return;
        const currentLeft = el.offsetLeft;
        const currentTop = el.offsetTop;
        
        const lastOffset = lastOffsets.current.get(id);
        if (lastOffset) {
          // 基于视觉位置精确计算位移差，彻底消除浏览器自动修正 scrollLeft 带来的干扰
          const oldVisualLeft = lastOffset.left - oldScrollLeft;
          const newVisualLeft = currentLeft - newScrollLeft;
          const dx = oldVisualLeft - newVisualLeft;
          const dy = lastOffset.top - currentTop;
          
          if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
            if (el.getAnimations) {
              el.getAnimations().forEach(a => a.cancel());
            }
            el.animate([
              { transform: `translate(${dx}px, ${dy}px) scale(1)` },
              { transform: 'translate(0, 0) scale(1)' }
            ], {
              duration: 500,
              easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
            });
          }
        }
      });
    }
    
    // 更新布局记录
    const currentOffsets = new Map<string, CardOffset>();
    cardRefs.current.forEach((el, id) => {
      if (el) currentOffsets.set(id, { left: el.offsetLeft, top: el.offsetTop });
    });
    lastOffsets.current = currentOffsets;
    // 同步更新实时记录
    liveScrollLeft.current = container.scrollLeft;
    prevCardsLength.current = cards.length;
  }, [cards, collapsed]);

  if (cards.length === 0) {
    return (
      <div className="text-text-secondary/40 text-xs p-4 text-center">无手牌</div>
    );
  }

  const STACK_SPACING = 68; // 卡片堆叠时的聚拢间距

  return (
    <div
      className={`relative transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]
        ${collapsed
          ? 'translate-y-32 opacity-0 pointer-events-none'
          : 'translate-y-0 opacity-100'}`}
    >

      {/* ===== 手牌列表 ===== */}
      <div 
        ref={scrollContainerRef}
        className="relative flex px-4 pb-3 overflow-x-auto [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        <div className="flex items-end gap-1 pt-8 mx-auto w-max">
          {cards.map((card, i) => {
            const center = (cards.length - 1) / 2;
            const offset = i - center;
            const cardId = card.id || `card-${i}`;
            const isNew = newCardIds.includes(cardId);
            // 消耗类型次数用尽 → 变灰且不可点（与服务端校验一致）
            const exhausted = !!player && isCardConsumptionExhausted(player, card);
            
            return (
              <div
                key={cardId}
                ref={(el) => {
                  if (el) cardRefs.current.set(cardId, el);
                  else cardRefs.current.delete(cardId);
                }}
                className="shrink-0 transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]"
                style={{
                  transform: collapsed 
                    ? `translateX(${-offset * STACK_SPACING}px) translateY(${Math.abs(offset) * 3}px) scale(0.6)` 
                    : 'translateX(0) translateY(0) scale(1)',
                  transitionDelay: collapsed ? `${Math.abs(offset) * 30}ms` : '0ms',
                  zIndex: collapsed ? cards.length - Math.abs(offset) : i,
                }}
              >
                <CardEnterWrapper isNew={isNew}>
                  <CardComponent
                    card={card}
                    compact
                    disabled={disabled || exhausted}
                    selected={selectedCardId === card.id}
                    onClick={() => onSelectCard(card)}
                  />
                </CardEnterWrapper>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
