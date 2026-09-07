import { contactGuard } from '@/lib/contact-guard';
import ContactPageClient from './ContactPageClient';

// The form carries a token minted at render time, so this page must not be
// cached — a stale page would hand every visitor the same dead token.
export const dynamic = 'force-dynamic';

/**
 * Server wrapper around the contact form.
 *
 * The form itself is a client component; this exists only to mint the
 * proof-of-render token, which has to happen on the server so the signing
 * secret never reaches the browser.
 */
export default async function ContactPage() {
  const token = contactGuard ? await contactGuard.issue() : null;
  const guardFields = token ? contactGuard.fields(token) : null;

  return (
    <ContactPageClient
      token={token}
      tokenName={guardFields?.token.name ?? null}
      honeypotName={guardFields?.honeypot.name ?? null}
    />
  );
}
