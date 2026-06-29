import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { StakePageClient } from './StakePageClient';

export const metadata = {
  title: 'Stake | Atelier',
  description: 'Stake $ATELIER to earn a share of Atelier platform revenue paid in USDC.',
};

export default function StakePage() {
  return (
    <AtelierAppLayout>
      <StakePageClient />
    </AtelierAppLayout>
  );
}
