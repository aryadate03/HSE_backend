const nodemailer = require('nodemailer');

// ─── Create transporter ───────────────────────────────────────────────────────
const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

// ─── Common email wrapper ─────────────────────────────────────────────────────
const sendEmail = async ({ to, subject, html }) => {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
  });
};

// ─── Email Verification ───────────────────────────────────────────────────────
const sendVerificationEmail = async (email, name, token) => {
  const verifyUrl = `${process.env.FRONTEND_URL}/verify-email/${token}`;
  await sendEmail({
    to: email,
    subject: 'HSE System - Verify Your Email',
    html: `
      <div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:12px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="background:#2563eb;display:inline-block;padding:12px 20px;border-radius:10px;">
            <span style="color:white;font-size:20px;font-weight:800;">🛡️ BUILDTECH HSE</span>
          </div>
        </div>
        <div style="background:white;border-radius:10px;padding:28px;border:1px solid #e2e8f0;">
          <h2 style="color:#1e293b;margin:0 0 12px;">Hello ${name},</h2>
          <p style="color:#64748b;line-height:1.6;">Please verify your email address to complete your registration.</p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${verifyUrl}" style="background:#2563eb;color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:700;display:inline-block;">
              ✅ Verify Email
            </a>
          </div>
          <p style="color:#94a3b8;font-size:13px;">This link expires in 24 hours. If you did not register, ignore this email.</p>
        </div>
      </div>
    `,
  });
};

// ─── Password Reset ───────────────────────────────────────────────────────────
const sendPasswordResetEmail = async (email, name, token) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password/${token}`;
  await sendEmail({
    to: email,
    subject: 'HSE System - Password Reset Request',
    html: `
      <div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:12px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="background:#2563eb;display:inline-block;padding:12px 20px;border-radius:10px;">
            <span style="color:white;font-size:20px;font-weight:800;">🛡️ BUILDTECH HSE</span>
          </div>
        </div>
        <div style="background:white;border-radius:10px;padding:28px;border:1px solid #e2e8f0;">
          <h2 style="color:#1e293b;margin:0 0 12px;">Hello ${name},</h2>
          <p style="color:#64748b;line-height:1.6;">You requested a password reset. Click the button below to reset your password.</p>
          <div style="text-align:center;margin:28px 0;">
            <a href="${resetUrl}" style="background:#dc2626;color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:700;display:inline-block;">
              🔑 Reset Password
            </a>
          </div>
          <p style="color:#94a3b8;font-size:13px;">This link expires in 1 hour. If you did not request this, ignore this email.</p>
        </div>
      </div>
    `,
  });
};

// ─── Account Approved ─────────────────────────────────────────────────────────
const sendApprovalEmail = async (email, name, role) => {
  const roleLabel = role === 'safety_officer' ? 'Safety Officer' : 'Supervisor';
  const loginUrl = `${process.env.FRONTEND_URL}/login`;
  await sendEmail({
    to: email,
    subject: 'HSE System - Your Account Has Been Approved ✅',
    html: `
      <div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:12px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="background:#2563eb;display:inline-block;padding:12px 20px;border-radius:10px;">
            <span style="color:white;font-size:20px;font-weight:800;">🛡️ BUILDTECH HSE</span>
          </div>
        </div>
        <div style="background:white;border-radius:10px;padding:28px;border:1px solid #e2e8f0;">
          <div style="text-align:center;margin-bottom:20px;">
            <div style="background:#f0fdf4;border-radius:50%;width:64px;height:64px;display:inline-flex;align-items:center;justify-content:center;font-size:32px;">✅</div>
          </div>
          <h2 style="color:#1e293b;margin:0 0 8px;text-align:center;">Account Approved!</h2>
          <p style="color:#64748b;text-align:center;margin:0 0 20px;">Congratulations ${name}!</p>
          <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin-bottom:20px;">
            <p style="color:#16a34a;margin:0;font-weight:600;text-align:center;">
              Your <strong>${roleLabel}</strong> account has been approved by management.
            </p>
          </div>
          <p style="color:#64748b;line-height:1.6;">You can now log in to the HSE system and start using your ${roleLabel} dashboard.</p>
          <div style="text-align:center;margin:24px 0;">
            <a href="${loginUrl}" style="background:#2563eb;color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-weight:700;display:inline-block;">
              🚀 Login Now
            </a>
          </div>
          <p style="color:#94a3b8;font-size:13px;text-align:center;">If you have any issues, please contact your administrator.</p>
        </div>
      </div>
    `,
  });
};

// ─── Account Rejected ─────────────────────────────────────────────────────────
const sendRejectionEmail = async (email, name, role, reason) => {
  const roleLabel = role === 'safety_officer' ? 'Safety Officer' : 'Supervisor';
  await sendEmail({
    to: email,
    subject: 'HSE System - Account Registration Update',
    html: `
      <div style="font-family:Inter,sans-serif;max-width:500px;margin:0 auto;padding:32px;background:#f8fafc;border-radius:12px;">
        <div style="text-align:center;margin-bottom:24px;">
          <div style="background:#2563eb;display:inline-block;padding:12px 20px;border-radius:10px;">
            <span style="color:white;font-size:20px;font-weight:800;">🛡️ BUILDTECH HSE</span>
          </div>
        </div>
        <div style="background:white;border-radius:10px;padding:28px;border:1px solid #e2e8f0;">
          <div style="text-align:center;margin-bottom:20px;">
            <div style="background:#fef2f2;border-radius:50%;width:64px;height:64px;display:inline-flex;align-items:center;justify-content:center;font-size:32px;">❌</div>
          </div>
          <h2 style="color:#1e293b;margin:0 0 8px;text-align:center;">Registration Update</h2>
          <p style="color:#64748b;text-align:center;margin:0 0 20px;">Hello ${name},</p>
          <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:20px;">
            <p style="color:#dc2626;margin:0;font-weight:600;text-align:center;">
              Your <strong>${roleLabel}</strong> account registration was not approved.
            </p>
          </div>
          ${reason ? `
          <div style="background:#f8fafc;border-radius:8px;padding:14px;margin-bottom:16px;">
            <p style="color:#64748b;margin:0;font-size:14px;"><strong>Reason:</strong> ${reason}</p>
          </div>` : ''}
          <p style="color:#64748b;line-height:1.6;font-size:14px;">
            If you believe this is a mistake or need further clarification, please contact your administrator.
          </p>
          <p style="color:#94a3b8;font-size:13px;text-align:center;margin-top:20px;">BUILDTECH HSE System</p>
        </div>
      </div>
    `,
  });
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendApprovalEmail,
  sendRejectionEmail,
};