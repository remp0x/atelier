import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { atelierHref } from '@/lib/atelier-paths';
import type { AtelierAgentListItem, ServiceCategory } from '@/lib/atelier-db';
import type { MarketData } from '@/app/api/market/route';
import { formatMcap } from '@/lib/format';
import { CATEGORY_LABELS } from './constants';

interface AgentCardProps {
  agent: AtelierAgentListItem;
  marketData?: MarketData | null;
  onHire?: () => void;
}

type ChipKey = 'skills' | 'models';

export function AgentCard({ agent, marketData, onHire }: AgentCardProps) {
  const [copied, setCopied] = useState(false);
  const [openChip, setOpenChip] = useState<ChipKey | null>(null);

  const avatarLetter = agent.name.charAt(0).toUpperCase();
  const imageSrc = agent.avatar_url || agent.token_image_url;
  const hasToken = !!agent.token_symbol;
  const skills = agent.categories;
  const models = agent.provider_models;

  function copyCA() {
    if (!agent.token_mint) return;
    navigator.clipboard.writeText(agent.token_mint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-lg bg-gray-50 dark:bg-black-soft transition-all duration-200 hover:shadow-lg flex flex-col border border-gray-200 dark:border-neutral-800 hover:border-atelier/40 dark:hover:border-atelier/40 hover:shadow-atelier/5">
      {/* Image */}
      <Link href={atelierHref(`/atelier/agents/${agent.slug}`)} className="relative block aspect-[16/9] bg-gray-100 dark:bg-neutral-900 overflow-hidden rounded-t-lg">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={agent.name}
            className="w-full h-full object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-atelier/10">
            <span className="text-4xl font-bold font-display text-atelier/60">{avatarLetter}</span>
          </div>
        )}
      </Link>

      {/* Name */}
      <div className="px-3 pt-3">
        <Link href={atelierHref(`/atelier/agents/${agent.slug}`)} className="font-bold font-display text-sm text-black dark:text-white truncate flex items-center gap-1 hover:text-atelier transition-colors">
          {agent.name}
          {agent.blue_check === 1 && (
            <svg className="w-4 h-4 text-blue-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.403 12.652a3 3 0 010-5.304 3 3 0 00-3.75-3.751 3 3 0 00-5.305 0 3 3 0 00-3.751 3.75 3 3 0 000 5.305 3 3 0 003.75 3.751 3 3 0 005.305 0 3 3 0 003.751-3.75zm-2.546-4.46a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
          )}
        </Link>
      </div>

      {/* Token info block */}
      <div className="px-3 pt-2">
        {hasToken && agent.token_mint ? (
          <button
            onClick={copyCA}
            className={`relative inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 cursor-pointer transition-all duration-200 ${
              copied
                ? 'bg-green-500/15 dark:bg-green-500/20 scale-[1.03]'
                : 'bg-atelier/10 dark:bg-atelier/15 hover:bg-atelier/20 dark:hover:bg-atelier/25 active:scale-95'
            }`}
          >
            <span className={`text-[10px] font-mono font-bold transition-colors duration-200 ${copied ? 'text-green-500' : 'text-atelier'}`}>
              {copied ? 'Copied!' : `$${agent.token_symbol}`}
            </span>
            {!copied && marketData && marketData.market_cap_usd > 0 && (
              <>
                <span className="w-px h-2.5 bg-atelier/30" />
                <span className="text-[9px] font-mono font-medium text-atelier/75">mcap {formatMcap(marketData.market_cap_usd)}</span>
              </>
            )}
          </button>
        ) : (
          <span className="inline-flex items-center rounded px-1.5 py-0.5 bg-gray-100 dark:bg-neutral-800/40">
            <span className="text-[10px] font-mono font-semibold text-gray-400 dark:text-neutral-500">No Token</span>
          </span>
        )}
      </div>

      {/* Description */}
      {agent.description && (
        <p className="text-xs text-gray-500 dark:text-neutral-400 line-clamp-2 px-3 pt-1.5">{agent.description}</p>
      )}

      {/* Skills + Models dropdowns */}
      {(skills.length > 0 || models.length > 0) && (
        <div className="flex items-center gap-1.5 px-3 pt-2">
          {skills.length > 0 && (
            <ChipDropdown
              label="Skills"
              count={skills.length}
              open={openChip === 'skills'}
              onToggle={() => setOpenChip(openChip === 'skills' ? null : 'skills')}
              onClose={() => setOpenChip(null)}
            >
              {skills.map((cat) => (
                <div
                  key={cat}
                  className="px-2 py-1.5 rounded-md text-xs font-mono text-gray-700 dark:text-neutral-300"
                >
                  {CATEGORY_LABELS[cat as ServiceCategory] || cat}
                </div>
              ))}
            </ChipDropdown>
          )}
          {models.length > 0 && (
            <ChipDropdown
              label="AI Models"
              count={models.length}
              open={openChip === 'models'}
              onToggle={() => setOpenChip(openChip === 'models' ? null : 'models')}
              onClose={() => setOpenChip(null)}
            >
              {models.map((m) => (
                <div
                  key={m}
                  className="px-2 py-1.5 rounded-md text-xs font-mono text-gray-700 dark:text-neutral-300"
                >
                  {m}
                </div>
              ))}
            </ChipDropdown>
          )}
        </div>
      )}

      <div className="mx-3 mt-2 border-t border-gray-200 dark:border-neutral-800" />

      {/* Stats + Hire */}
      <div className="px-3 py-2.5 mt-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {agent.min_price_usd != null && (
            <span className="text-xs font-mono font-semibold text-black dark:text-white">
              from ${agent.min_price_usd % 1 === 0 ? agent.min_price_usd.toFixed(0) : agent.min_price_usd.toFixed(2)}
            </span>
          )}
          {agent.avg_rating != null && (
            <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-neutral-400 font-mono">
              <svg className="w-3.5 h-3.5 text-atelier" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {agent.avg_rating.toFixed(1)}
            </span>
          )}
          {agent.total_orders > 0 && (
            <span className="text-xs text-gray-500 dark:text-neutral-400 font-mono">
              {agent.total_orders} orders
            </span>
          )}
        </div>
        <button
          onClick={(e) => {
            e.preventDefault();
            onHire?.();
          }}
          className="px-3 py-1 rounded border border-atelier/40 text-atelier text-xs font-medium font-mono transition-all duration-200 hover:bg-atelier hover:text-white hover:border-atelier"
        >
          Hire
        </button>
      </div>
    </div>
  );
}

const CHIP_DROPDOWN_WIDTH = 176;
const CHIP_DROPDOWN_GAP = 6;

type ChipDropdownPosition =
  | { placement: 'down'; left: number; top: number }
  | { placement: 'up'; left: number; bottom: number };

function chipDropdownPositionStyle(p: ChipDropdownPosition): React.CSSProperties {
  if (p.placement === 'down') return { left: p.left, top: p.top, width: CHIP_DROPDOWN_WIDTH };
  return { left: p.left, bottom: p.bottom, width: CHIP_DROPDOWN_WIDTH };
}

function ChipDropdown({
  label,
  count,
  open,
  onToggle,
  onClose,
  children,
}: {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState<ChipDropdownPosition | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (portalRef.current?.contains(target)) return;
      onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const updatePosition = () => {
      const anchor = triggerRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const maxLeft = Math.max(CHIP_DROPDOWN_GAP, vw - CHIP_DROPDOWN_WIDTH - CHIP_DROPDOWN_GAP);
      const left = Math.min(Math.max(CHIP_DROPDOWN_GAP, rect.left), maxLeft);
      const spaceBelow = vh - rect.bottom;
      const spaceAbove = rect.top;
      if (spaceBelow < 180 && spaceAbove > spaceBelow) {
        setPosition({ placement: 'up', left, bottom: vh - rect.top + CHIP_DROPDOWN_GAP });
      } else {
        setPosition({ placement: 'down', left, top: rect.bottom + CHIP_DROPDOWN_GAP });
      }
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 h-7 px-2 rounded-md text-[11px] font-mono whitespace-nowrap border bg-gray-50 dark:bg-neutral-900/50 border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-neutral-400 hover:border-atelier/50 hover:bg-atelier/5 dark:hover:bg-atelier/10 hover:text-black dark:hover:text-atelier transition-colors cursor-pointer"
      >
        <span>{label}</span>
        <span className="text-gray-400 dark:text-neutral-500">·</span>
        <span className="font-semibold">{count}</span>
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && mounted && position && createPortal(
        <div
          ref={portalRef}
          className="fixed rounded-lg bg-white dark:bg-[#0a0a0a] border border-gray-200 dark:border-neutral-800 shadow-lg z-50 p-1 max-h-60 overflow-y-auto"
          style={chipDropdownPositionStyle(position)}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
