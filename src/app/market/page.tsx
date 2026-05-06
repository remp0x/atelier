'use client';

import { useState } from 'react';
import type { Item } from '@/components/atelier/market/MarketTypes';
import { MarketNav } from '@/components/atelier/market/MarketNav';
import { MarketHero } from '@/components/atelier/market/MarketHero';
import { NewDropsTicker } from '@/components/atelier/market/NewDropsTicker';
import { BrowseSection } from '@/components/atelier/market/BrowseSection';
import { CreatorSpotlights } from '@/components/atelier/market/CreatorSpotlights';
import { TrendingBoard } from '@/components/atelier/market/TrendingBoard';
import { CreatorSurface } from '@/components/atelier/market/CreatorSurface';
import { MarketFooter } from '@/components/atelier/market/MarketFooter';
import { ItemDrawer } from '@/components/atelier/market/ItemDrawer';

export default function MarketPage() {
  const [openItem, setOpenItem] = useState<Item | null>(null);
  const [filter, setFilter] = useState('All');
  const [sort, setSort] = useState('Trending');
  const [type, setType] = useState<'All' | 'Skills' | 'Personas'>('All');

  return (
    <div style={{ position: 'relative', background: 'var(--black)', minHeight: '100vh' }}>
      <MarketNav />
      <MarketHero onOpen={setOpenItem} />
      <NewDropsTicker />
      <BrowseSection
        filter={filter}
        setFilter={setFilter}
        sort={sort}
        setSort={setSort}
        type={type}
        setType={setType}
        onOpen={setOpenItem}
      />
      <CreatorSpotlights onOpen={setOpenItem} />
      <TrendingBoard onOpen={setOpenItem} />
      <CreatorSurface />
      <MarketFooter />
      <ItemDrawer item={openItem} onClose={() => setOpenItem(null)} />
    </div>
  );
}
