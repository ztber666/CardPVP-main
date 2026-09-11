import React, { useState, useEffect } from 'react';
import { useLang, useT } from '../i18n/i18n';

/* ---------- 轻量 Markdown 渲染 ---------- */

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-text-primary">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={i} className="bg-card-bg/60 px-1 py-0.5 rounded text-[0.85em] text-accent-shield">{part.slice(1, -1)}</code>;
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function SimpleMarkdown({ content }: { content: string }) {
  const lines = content.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 空行
    if (line.trim() === '') { i++; continue; }

    // 代码块
    if (line.trim().startsWith('```')) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code.push(lines[i]);
        i++;
      }
      i++;
      blocks.push(
        <pre key={key++} className="bg-black/30 rounded-lg p-3 my-2 overflow-x-auto text-xs text-gray-300">
          <code>{code.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // 表格（当前行含 | 且下一行含 --- 分隔符）
    if (line.includes('|') && i + 1 < lines.length && lines[i + 1].includes('---')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const rows = tableLines.map(l =>
        l.split('|').map(c => c.trim()).filter(c => c !== '')
      );
      // 过滤分隔行 (|---|---|)
      const dataRows = rows.filter(r => !r.every(c => c.match(/^[-:]+$/)));
      if (dataRows.length > 0) {
        blocks.push(
          <div key={key++} className="overflow-x-auto my-2">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  {dataRows[0].map((h, j) => (
                    <th key={j} className="border border-card-border/60 px-3 py-1.5 text-left text-text-primary bg-card-bg/30 font-semibold">
                      {renderInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dataRows.slice(1).map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="border border-card-border/60 px-3 py-1.5 text-text-secondary">
                        {renderInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    }

    // 标题
    const h1 = line.match(/^#\s+(.*)/);
    const h2 = line.match(/^##\s+(.*)/);
    const h3 = line.match(/^###\s+(.*)/);
    if (h1) {
      blocks.push(<h1 key={key++} className="text-2xl font-bold text-text-primary mt-5 mb-2">{renderInline(h1[1])}</h1>);
      i++; continue;
    }
    if (h2) {
      blocks.push(<h2 key={key++} className="text-xl font-bold text-text-primary mt-4 mb-2">{renderInline(h2[1])}</h2>);
      i++; continue;
    }
    if (h3) {
      blocks.push(<h3 key={key++} className="text-base font-semibold text-text-primary mt-3 mb-1">{renderInline(h3[1])}</h3>);
      i++; continue;
    }

    // 引用块
    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push(
        <blockquote key={key++} className="border-l-4 border-accent-shield/40 pl-3 my-2 text-text-secondary text-sm">
          {renderInline(quoteLines.join(' '))}
        </blockquote>
      );
      continue;
    }

    // 分隔线
    if (line.match(/^---+\s*$/)) {
      blocks.push(<hr key={key++} className="border-card-border/60 my-4" />);
      i++; continue;
    }

    // 有序列表
    if (line.match(/^\d+\.\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\d+\.\s/)) {
        items.push(lines[i].replace(/^\d+\.\s/, ''));
        i++;
      }
      blocks.push(
        <ol key={key++} className="list-decimal list-inside my-2 space-y-1 text-text-secondary text-sm pl-2">
          {items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
        </ol>
      );
      continue;
    }

    // 无序列表
    if (line.match(/^[-*]\s/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^[-*]\s/)) {
        items.push(lines[i].replace(/^[-*]\s/, ''));
        i++;
      }
      blocks.push(
        <ul key={key++} className="list-disc list-inside my-2 space-y-1 text-text-secondary text-sm pl-2">
          {items.map((item, j) => <li key={j}>{renderInline(item)}</li>)}
        </ul>
      );
      continue;
    }

    // 普通段落
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].match(/^#{1,3}\s/) &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].startsWith('> ') &&
      !lines[i].match(/^---+\s*$/) &&
      !lines[i].match(/^\d+\.\s/) &&
      !lines[i].match(/^[-*]\s/) &&
      !(lines[i].includes('|') && i + 1 < lines.length && lines[i + 1].includes('---'))
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push(
        <p key={key++} className="text-text-secondary text-sm my-1 leading-relaxed">
          {renderInline(paraLines.join(' '))}
        </p>
      );
    }
  }

  return <div className="space-y-1">{blocks}</div>;
}

/* ---------- 规则弹窗 ---------- */

export default function RulesModal({ onClose }: { onClose: () => void }) {
  const [content, setContent] = useState<string | null>(null);
  const t = useT();
  const lang = useLang();

  useEffect(() => {
    // 按语言运行时 fetch 规则文档；英文缺失时回退中文 RULE.md
    const files = lang === 'en' ? ['/RULE_EN.md', '/RULE.md'] : ['/RULE.md'];
    let cancelled = false;
    (async () => {
      for (const f of files) {
        try {
          const res = await fetch(f);
          if (res.ok) {
            const text = await res.text();
            if (!cancelled) setContent(text);
            return;
          }
        } catch { /* 尝试下一个 */ }
      }
      if (!cancelled) setContent(t('规则文档加载失败，请检查 RULE.md 是否位于 public 目录。', 'Failed to load the rules document. Please check that the rules file exists.'));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto py-8"
      onClick={onClose}
    >
      <div
        className="bg-card-bg border border-card-border rounded-2xl p-6 max-w-2xl w-full mx-4 shadow-xl animate-fade-in my-8"
        onClick={e => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-text-primary">{t('游戏规则', 'Rules')}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-card-border flex items-center justify-center text-text-secondary hover:bg-card-bg/50 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* README 内容 */}
        {content === null ? (
          <p className="text-text-secondary text-center py-8">{t('加载中...', 'Loading...')}</p>
        ) : (
          <SimpleMarkdown content={content} />
        )}
      </div>
    </div>
  );
}
