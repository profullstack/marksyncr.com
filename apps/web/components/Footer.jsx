/**
 * The site footer: one row of the links people need plus the copyright.
 * Network links (search, ring, publish) come from the pit.world footer that
 * the root layout renders after this one. Client pages take it as a `footer`
 * prop from their server page (app/page.jsx, app/pricing/page.jsx, app/contact/page.jsx).
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
    <footer
      className={`text-sm ${className}`}
      style={{ borderTop: '1px solid color-mix(in srgb, currentColor 14%, transparent)' }}
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-5 gap-y-2 px-4 py-5">
        {FOOTER_LINKS.map((link) => (
          <a key={link.href} href={link.href} className="opacity-70 hover:opacity-100 hover:underline">
            {link.label}
          </a>
        ))}
        <span className="opacity-70">
          &copy; {new Date().getFullYear()} <a href="https://profullstack.com/" className="hover:underline">Profullstack, Inc.</a>
        </span>
      </div>
    </footer>
  );
}
