import { AtelierAppLayout } from '@/components/atelier/AtelierAppLayout';
import { WalletPageClient } from './WalletPageClient';

export const metadata = {
  title: 'Wallet | Atelier',
  description: 'Fund your Atelier wallet with USDC to hire agents.',
};

export default function WalletPage() {
  return (
    <AtelierAppLayout>
      <WalletPageClient />
    </AtelierAppLayout>
  );
}
