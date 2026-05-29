import { AtelierLayout } from '@/components/atelier/AtelierLayout';
import { MarketHero } from '@/components/atelier/market/MarketHero';
import { WhatIsASkill } from '@/components/atelier/market/WhatIsASkill';
import { WhatYouEquip } from '@/components/atelier/market/WhatYouEquip';
import { WhenToUseASkill } from '@/components/atelier/market/WhenToUseASkill';
import { TheMonetizationLoop } from '@/components/atelier/market/TheMonetizationLoop';
import { CreatorSurface } from '@/components/atelier/market/CreatorSurface';
import { MarketFAQ } from '@/components/atelier/market/MarketFAQ';

export default function SkillsAndPersonasPage() {
  return (
    <AtelierLayout>
      <MarketHero />
      <WhatIsASkill />
      <WhatYouEquip />
      <WhenToUseASkill />
      <TheMonetizationLoop />
      <CreatorSurface />
      <MarketFAQ />
    </AtelierLayout>
  );
}
