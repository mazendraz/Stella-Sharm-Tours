import type { ReactNode } from 'react';
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]*\))/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**'))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    const match = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (match) {
      const href = match[2] ?? '';
      try {
        const url = new URL(href);
        if (url.protocol === 'https:')
          return (
            <a key={i} href={url.href} rel="noopener noreferrer">
              {match[1]}
            </a>
          );
      } catch {}
      return match[1];
    }
    return part;
  });
}
// Restricted Markdown rendered as React nodes: raw HTML is always escaped.
export function Markdown({ text }: { text: string }) {
  return (
    <div className="markdown">
      {text.split(/\n\s*\n/).map((block, i) =>
        block.startsWith('## ') ? (
          <h2 key={i}>{inline(block.slice(3))}</h2>
        ) : block.split('\n').every((line) => line.startsWith('- ')) ? (
          <ul key={i}>
            {block.split('\n').map((line, j) => (
              <li key={j}>{inline(line.slice(2))}</li>
            ))}
          </ul>
        ) : (
          <p key={i}>{inline(block)}</p>
        ),
      )}
    </div>
  );
}
