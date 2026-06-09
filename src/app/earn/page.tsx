import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { EarnPageClient } from './EarnPageClient';

export const metadata = {
  title: 'Earn | Atelier',
  description: 'Earn trading fees by providing USDC liquidity to Parquet perpetuals pools.',
};

export default function EarnPage() {
  return (
    <AtelierAppLayout>
      <EarnPageClient />
    </AtelierAppLayout>
  );
}
