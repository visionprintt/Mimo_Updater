import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(request: Request) {
  try {
    const { email, displayName, role, department } = await request.json();

    if (!email || !displayName) {
      return NextResponse.json({ error: 'Missing email or display name' }, { status: 400 });
    }

    if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      console.warn('EMAIL_USER or EMAIL_PASS is not set. Email not sent.');
      return NextResponse.json({ error: 'Email credentials are missing on the server.' }, { status: 500 });
    }

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: `"Mimo" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'You have been invited to join Mimo!',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eaeaea; border-radius: 8px;">
          <h2 style="color: #333;">Welcome to Mimo, ${displayName}!</h2>
          <p style="color: #555; font-size: 16px;">
            You have been invited to join the <strong>${department}</strong> department as a <strong>${role}</strong>.
          </p>
          <p style="color: #555; font-size: 16px;">
            Click the link below to accept your invitation and sign in using your Google account:
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login" style="background-color: #0070f3; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">
              Accept Invitation
            </a>
          </div>
          <p style="color: #888; font-size: 14px; margin-top: 40px; text-align: center;">
            If you were not expecting this invitation, you can ignore this email.
          </p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error sending email via Nodemailer:', error);
    return NextResponse.json({ error: error.message || 'Failed to send invitation' }, { status: 500 });
  }
}
