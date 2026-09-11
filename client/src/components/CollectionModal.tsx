import { useState } from 'react';
import { CardCollectionContent } from './CardCollection';
import { BuffCollectionContent } from './BuffCollection';
import { useT } from '../i18n/i18n';

type Tab = 'cards' | 'buffs';

export default function CollectionModal({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [tab, setTab] = useState<Tab>('cards');

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8"
      onClick={onClose}
    >
      <div
        className="bg-card-bg border border-card-border rounded-2xl p-6 max-w-2xl w-full mx-4 shadow-xl animate-fade-in my-8"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题 + Tab 切换 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-1 bg-card-bg/50 rounded-lg p-1 border border-card-border/60">
            <button
              onClick={() => setTab('cards')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                tab === 'cards'
                  ? 'bg-accent-shield/20 text-accent-shield'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              🃏 {t('卡牌', 'Cards')}
            </button>
            <button
              onClick={() => setTab('buffs')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                tab === 'buffs'
                  ? 'bg-accent-shield/20 text-accent-shield'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              ✨ {t('状态', 'Effects')}
            </button>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-card-border flex items-center justify-center text-text-secondary hover:bg-card-bg/50 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* 内容区 */}
        {tab === 'cards' ? <CardCollectionContent /> : <BuffCollectionContent />}
      </div>
    </div>
  );
}
