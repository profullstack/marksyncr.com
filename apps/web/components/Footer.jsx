import { Footer as ProfullstackFooter } from '@profullstack/footer/react';

/**
 * The site footer: @profullstack/footer (links, copyright and the Profullstack
 * webring). A server component: the package renders on the server, where the
 * ring's verifier reads it, and fetches the @latest template so a footer release
 * reaches the site without a redeploy. Client pages take it as a `footer` prop
 * from their server page (app/page.jsx, app/pricing/page.jsx, app/contact/page.jsx).
 */
export const FOOTER_LINKS = [
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Docs', href: '/docs' },
  { label: 'Contact', href: '/contact' },
  { label: 'GitHub', href: 'https://github.com/profullstack/marksyncr.com' },
  { label: 'Discord', href: 'https://discord.gg/U7dEXfBA3s' },
];

export default function Footer({ className = 'bg-white text-slate-600' }) {
  return (
    <div className={className}>
      <ProfullstackFooter site="https://marksyncr.com/" links={FOOTER_LINKS} />
    </div>
  );
}
