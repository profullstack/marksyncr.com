import { createContactRoute } from '@profullstack/stack/email';
import { contactGuard } from '@/lib/contact-guard';

export const POST = createContactRoute({
  // Requires a token minted when the form rendered. Runs before field
  // validation, so a bot never learns which fields the route wants.
  guard: contactGuard ?? undefined,
  from: 'MarkSyncr Contact <noreply@marksyncr.com>',
  to: 'support@marksyncr.com',
  requiredFields: ['name', 'email', 'subject', 'message'],
  subject: (s) => `[Contact Form] ${s.fields.subject}`,
});
