import nodemailer from "nodemailer";

const formatPlan = (plan) => plan.charAt(0).toUpperCase() + plan.slice(1);

const formatDate = (date) =>
  new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const buildSubject = (planName) =>
  `YourTube ${planName} subscription confirmation`;

const buildHtml = ({
  name,
  email,
  planName,
  formattedAmount,
  paymentId,
  orderId,
  paymentDate,
  subscriptionStart,
  subscriptionEnd,
}) => {
  const renewalDate = formatDate(subscriptionEnd || paymentDate);
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #ff0000; padding: 16px; text-align: center;">
        <h1 style="color: white; margin: 0;">YourTube</h1>
      </div>
      <div style="padding: 24px; border: 1px solid #e5e5e5;">
        <h2 style="margin-top: 0;">Subscription Confirmed</h2>
        <p>Hi ${name || "there"},</p>
        <p style="color: #666; margin-top: -8px;">${email}</p>
        <p>Thank you for upgrading to the <strong>${planName}</strong> plan!</p>
        <div style="background: #f9f9f9; padding: 16px; border-radius: 8px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Customer:</strong> ${name || "-"}</p>
          <p style="margin: 4px 0;"><strong>Email:</strong> ${email}</p>
          <p style="margin: 4px 0;"><strong>Plan:</strong> ${planName}</p>
          <p style="margin: 4px 0;"><strong>Amount:</strong> ${formattedAmount}</p>
          <p style="margin: 4px 0;"><strong>Payment ID:</strong> ${paymentId}</p>
          <p style="margin: 4px 0;"><strong>Order ID:</strong> ${orderId}</p>
          <p style="margin: 4px 0;"><strong>Payment date:</strong> ${formatDate(paymentDate)}</p>
          <p style="margin: 4px 0;"><strong>Subscription:</strong> ${formatDate(subscriptionStart || paymentDate)} – ${formatDate(subscriptionEnd || paymentDate)}</p>
        </div>
        <p>Your subscription is now active, and will renew on <strong>${renewalDate}</strong> unless cancelled.</p>
        <p>If you have any questions, reply to this email.</p>
      </div>
      <div style="padding: 16px; text-align: center; color: #999; font-size: 12px;">
        © ${new Date().getFullYear()} YourTube. All rights reserved.
      </div>
    </div>
  `;
};

const sendViaBrevo = async ({ fromEmail, fromName, toEmail, toName, subject, html }) => {
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "api-key": process.env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: fromName, email: fromEmail },
      to: [{ email: toEmail, name: toName || toEmail }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = JSON.stringify(await res.json());
    } catch {
      detail = await res.text();
    }
    throw new Error(`Brevo send failed (${res.status}): ${detail}`);
  }
  const body = await res.json().catch(() => ({}));
  console.log(
    `Invoice email sent to ${toEmail} via Brevo (messageId: ${body.messageId || "?"})`
  );
  return body;
};

const sendViaSmtp = async ({ from, toEmail, subject, html }) => {
  const transporter = nodemailer.createTransport({
    host: process.env.MAIL_HOST || "smtp.gmail.com",
    port: Number(process.env.MAIL_PORT || 587),
    secure: process.env.MAIL_SECURE === "true",
    auth: {
      user: process.env.MAIL_USER,
      pass: process.env.MAIL_PASS,
    },
  });
  await transporter.sendMail({ from, to: toEmail, subject, html });
  console.log(`Invoice email sent to ${toEmail} via SMTP`);
};

export const sendPaymentEmail = async ({
  email,
  name,
  plan,
  amount,
  currency,
  paymentId,
  orderId,
  paymentDate = new Date(),
  subscriptionStart,
  subscriptionEnd,
}) => {
  const planName = formatPlan(plan);
  const formattedAmount = `${currency || "INR"} ${amount}`;
  const subject = buildSubject(planName);
  const html = buildHtml({
    name,
    email,
    planName,
    formattedAmount,
    paymentId,
    orderId,
    paymentDate,
    subscriptionStart,
    subscriptionEnd,
  });

  const useBrevo = Boolean(process.env.BREVO_API_KEY);
  const smtpReady = Boolean(process.env.MAIL_USER && process.env.MAIL_PASS);

  if (!useBrevo && !smtpReady) {
    console.warn(
      "No mail provider configured (set BREVO_API_KEY or MAIL_USER/MAIL_PASS), skipping email send"
    );
    return;
  }

  if (useBrevo) {
    const fromEmail =
      process.env.BREVO_FROM_EMAIL || process.env.MAIL_FROM_EMAIL || process.env.MAIL_USER;
    if (!fromEmail) {
      console.warn(
        "Brevo requires a validated sender email. Set BREVO_FROM_EMAIL (e.g. your verified Brevo sender address), skipping email send"
      );
      return;
    }
    return sendViaBrevo({
      fromEmail,
      fromName: process.env.BREVO_FROM_NAME || "YourTube",
      toEmail: email,
      toName: name,
      subject,
      html,
    });
  }

  return sendViaSmtp({
    from: process.env.MAIL_FROM || `YourTube <${process.env.MAIL_USER}>`,
    toEmail: email,
    subject,
    html,
  });
};