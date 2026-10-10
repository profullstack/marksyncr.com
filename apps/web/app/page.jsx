import HomePageClient from './HomePageClient';
import Footer from '../components/Footer';

/** Server wrapper: the page is a client component; the footer renders here, on the server. */
export default function HomePage() {
  return <HomePageClient footer={<Footer />} />;
}
