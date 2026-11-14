'use client';
import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Menu, type MenuItem } from './menu';
import { usePageTitle } from './editor';

/** Title + one-line description + actions (one primary max, rest in ⋯). */
export function PageHeader({
  title,
  description,
  primary,
  secondary,
  menu,
}: {
  title: string;
  description?: ReactNode;
  primary?: { label: string; onClick: () => void; icon?: ReactNode };
  secondary?: ReactNode;
  menu?: MenuItem[];
}) {
  usePageTitle(title);
  return (
    <header className="page-header">
      <div className="page-header-text">
        <h1>{title}</h1>
        {description && <p className="muted">{description}</p>}
      </div>
      <div className="page-header-actions">
        {secondary}
        {menu && menu.length > 0 && <Menu items={menu} />}
        {primary && (
          <button
            type="button"
            className="btn btn-primary page-primary"
            onClick={primary.onClick}
          >
            {primary.icon ?? <Plus size={18} aria-hidden />}
            <span>{primary.label}</span>
          </button>
        )}
      </div>
    </header>
  );
}
