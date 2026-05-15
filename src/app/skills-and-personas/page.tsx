import { AtelierLayout } from '@/components/atelier/AtelierLayout';
import { MarketHero } from '@/components/atelier/market/MarketHero';
import { WhatYouEquip } from '@/components/atelier/market/WhatYouEquip';
import { CreatorSurface } from '@/components/atelier/market/CreatorSurface';
import { MarketFAQ } from '@/components/atelier/market/MarketFAQ';

export default function SkillsAndPersonasPage() {
  return (
    <AtelierLayout>
      <MarketHero />
      <WhatYouEquip />
      <CreatorSurface />
      <MarketFAQ />
    </AtelierLayout>
  );
}
