import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST || "smtp.gmail.com",
  port: Number(process.env.MAIL_PORT || 587),
  secure: process.env.MAIL_SECURE === "true",
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

const formatPlan = (plan) => plan.charAt(0).toUpperCase() + plan.slice(1);

export const sendPaymentEmail = async ({
  email,
  name,
  plan,
  amount,
  currency,
  paymentId,
  orderId,
}) => {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) {
    console.warn("MAIL_USER not configured, skipping email send");
    return;
  }
  const planName = formatPlan(plan);
  const formattedAmount = `${currency || "INR"} ${amount}`;
  const date = new Date().toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const mailOptions = {
    from: process.env.MAIL_FROM || `YourTube <${process.env.MAIL_USER}>`,
    to: email,
    subject: `YourTube ${planName} subscription confirmation`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #ff0000; padding: 16px; text-align: center;">
          <h1 style="color: white; margin: 0;">YourTube</h1>
        </div>
        <div style="padding: 24px; border: 1px solid #e5e5e5;">
          <h2 style="margin-top: 0;">Subscription Confirmed</h2>
          <p>Hi ${name || "there"},</p>
          <p>Thank you for upgrading to the <strong>${planName}</strong> plan!</p>
          <div style="background: #f9f9f9; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Plan:</strong> ${planName}</p>
            <p style="margin: 4px 0;"><strong>Amount:</strong> ${formattedAmount}</p>
            <p style="margin: 4px 0;"><strong>Payment ID:</strong> ${paymentId}</p>
            <p style="margin: 4px 0;"><strong>Order ID:</strong> ${orderId}</p>
            <p style="margin: 4px 0;"><strong>Date:</strong> ${date}</p>
          </div>
          <p>Your subscription is now active and will expire after 30 days.</p>
          <p>If you have any questions, reply to this email.</p>
        </div>
        <div style="padding: 16px; text-align: center; color: #999; font-size: 12px;">
          © ${new Date().getFullYear()} YourTube. All rights reserved.
        </div>
      </div>
    `,
  };
  await transporter.sendMail(mailOptions);
};