const nodemailer = require("nodemailer");

// Create a transporter object using SMTP transport
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: false, // Allow self-signed certificates and helps avoid cert issues in some environments
  },
});

// Verify the connection configuration
exports.sendEmail = async (to, subject, html) => {
  const info = await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject,
    html,
  });
    console.log("Message sent: %s", info.messageId);
    return info;
};

// Function to send OTP email
exports.sendOtpEmail = async (to, otp, purpose) => {
  const titles = {
   EMAIL_VERIFY: "Verify Your Email Address",
   LOGIN_2FA: "Your Login OTP",
   PASSWORD_RESET: "Reset Your Password",    
  };

  // Define the email subject based on the purpose
  const title = titles[purpose] || "Your OTP Code";

  await this.sendEmail(
    to,
    `${title} - Mathsmastery`,
    `<div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:20px;border:1px solid #ddd;border-radius:8px;">
      <h2 style="color:#2563eb;">${title}</h2>
      <p>Your verification code is:</p>
      <div style="font-size:32px;font-weight:bold;letter-spacing:4px;padding:15px;background:#f3f4f6;border-radius:6px;text-align:center;margin:20px 0;">
        ${otp}
      </div>
      <p style="color:#666;">This code expires in <strong>10 minutes</strong>.</p>
      <p style="color:#999;font-size:12px;">If you didn't request this, please ignore this email. Do not share OTP to anyone.</p>
    </div>`
  );
};
