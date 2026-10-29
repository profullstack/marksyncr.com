import 'server-only';
import { createContactForm } from '@profullstack/contact-form';

/**
 * The contact form. /contact renders it and /api/contact answers it from
 * this one object, so the token binding, the honeypot and the questions can
 * never disagree between them.
 */
export const contact = createContactForm({
  binding: 'marksyncr:contact',
  brandTerms: ['marksyncr', 'mark syncr'],
  from: 'MarkSyncr Contact <noreply@marksyncr.com>',
  to: 'support@marksyncr.com',
  questions: [
    { name: 'name', label: 'Name', required: true, maxLength: 120, autocomplete: 'name', placeholder: 'Your name' },
    {
      name: 'email',
      label: 'Email',
      type: 'email',
      required: true,
      maxLength: 254,
      autocomplete: 'email',
      placeholder: 'you@example.com',
    },
    {
      name: 'subject',
      label: 'Subject',
      type: 'select',
      required: true,
      placeholder: 'Select a subject',
      options: [
        'General Inquiry',
        'Technical Support',
        'Billing Question',
        'Feature Request',
        'Bug Report',
        'Partnership',
        'Other',
      ],
    },
    {
      name: 'message',
      label: 'Message',
      type: 'textarea',
      required: true,
      rows: 6,
      placeholder: 'How can we help you?',
    },
  ],
  subject: (s) => `[Contact Form] ${s.fields.subject}`,
  submitLabel: 'Send Message',
  successMessage: 'Thank you! Your message has been sent successfully.',
});
