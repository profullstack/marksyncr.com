import { createContactRoute } from '@profullstack/stack/email';

export const POST = createContactRoute({
  from: 'MarkSyncr Contact <noreply@marksyncr.com>',
  to: 'support@marksyncr.com',
  requiredFields: ['name', 'email', 'subject', 'message'],
  subject: (s) => `[Contact Form] ${s.fields.subject}`,
});
