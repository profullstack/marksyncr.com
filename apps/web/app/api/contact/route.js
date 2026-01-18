import { Resend } from 'resend';
import { NextResponse } from 'next/server';

// Lazy initialization - only create Resend client when needed
let resendClient = null;

function getResendClient() {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY environment variable is not configured');
    }
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, email, subject, message } = body;

    // Validate required fields
    if (!name || !email || !subject || !message) {
      return NextResponse.json({ error: 'All fields are required' }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Send email via Resend
    const resend = getResendClient();
    const { data, error } = await resend.emails.send({
      from: 'MarkSyncr Contact <noreply@marksyncr.com>',
      to: ['support@marksyncr.com'],
      replyTo: email,
      subject: `[Contact Form] ${subject}`,
      html: `
        <h2>New Contact Form Submission</h2>
        <p><strong>From:</strong> ${name} (${email})</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <hr />
        <h3>Message:</h3>
        <p>${message.replace(/\n/g, '<br />')}</p>
      `,
      text: `
New Contact Form Submission

From: ${name} (${email})
Subject: ${subject}

Message:
${message}
      `.trim(),
    });

    if (error) {
      console.error('Resend error:', error);
      return NextResponse.json(
        { error: 'Failed to send message. Please try again later.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, messageId: data?.id }, { status: 200 });
  } catch (error) {
    console.error('Contact form error:', error);
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 });
  }
}
