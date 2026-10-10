import PricingPageClient from './PricingPageClient';
import Footer from '../../components/Footer';

/** Server wrapper: the page is a client component; the footer renders here, on the server. */
export default function PricingPage() {
  return <PricingPageClient footer={<Footer className="bg-gray-900 text-gray-400" />} />;
}
