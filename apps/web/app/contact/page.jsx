import { contact } from '@/lib/contact';
import ContactPageClient from './ContactPageClient';
import Footer from '../../components/Footer';

// The form carries a token minted at render time, so this page must not be
// cached — a stale page would hand every visitor the same dead token.
export const dynamic = 'force-dynamic';

/**
 * Server wrapper around the contact form.
 *
 * The page is a client component; this mints the form's proof-of-render
 * token (contact.props()) on the server, so the signing secret never
 * reaches the browser.
 */
export default async function ContactPage() {
  const form = await contact.props();

  return (
    <ContactPageClient
      form={form}
      footer={<Footer />}
    />
  );
}
