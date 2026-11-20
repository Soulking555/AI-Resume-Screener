const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { generateOtp } = require('../utils/otp');
const { sendOtpEmail } = require('../utils/email');

const prisma = new PrismaClient();

// ─── REGISTER ───
exports.register = async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, role } = req.body;

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(400).json({ error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password: hashed, firstName, lastName, phone, role, emailVerified: false },
    });

    if (role === 'STUDENT') {
      await prisma.student.create({
        data: { userId: user.id, rollNumber: `STU-${user.id.toString().padStart(4, '0')}` },
      });
    } else if (role === 'TEACHER') {
      await prisma.teacher.create({
        data: { userId: user.id, employeeId: `EMP-${user.id.toString().padStart(4, '0')}` },
      });
    } else if (role === 'ADMIN') {
      await prisma.admin.create({ data: { userId: user.id } });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.otpToken.create({
      data: { email, code: otp, purpose: 'EMAIL_VERIFY', expiresAt },
    });
    await sendOtpEmail(email, otp, 'EMAIL_VERIFY');

    res.status(201).json({ message: 'Registered successfully. Check your email for OTP.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── VERIFY EMAIL ───
exports.verifyEmail = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const otpRecord = await prisma.otpToken.findFirst({
      where: {
        email,
        code: otp,
        purpose: 'EMAIL_VERIFY',
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!otpRecord) return res.status(400).json({ error: 'Invalid or expired OTP' });

    await prisma.$transaction([
      prisma.otpToken.update({ where: { id: otpRecord.id }, data: { used: true } }),
      prisma.user.update({ where: { email }, data: { emailVerified: true } }),
    ]);

    res.json({ message: 'Email verified. You can now log in.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── LOGIN STEP 1: CREDENTIALS ───
exports.loginStep1 = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    if (!user.emailVerified) {
      return res.status(403).json({ error: 'Please verify your email first.' });
    }

    // ── 2FA ENABLED ──
    if (user.twoFactorEnabled) {
      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await prisma.otpToken.create({
        data: { email, code: otp, purpose: 'LOGIN_2FA', expiresAt },
      });
      await sendOtpEmail(email, otp, 'LOGIN_2FA');

      return res.json({
        message: 'OTP sent to your email. Enter it to complete login.',
        twoFactorRequired: true,
      });
    }

    // ── 2FA DISABLED ── login immediately
    const jwtToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.cookie('token', jwtToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.json({
      message: 'Login successful',
      twoFactorRequired: false,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── LOGIN STEP 2: VERIFY OTP ───
exports.loginStep2 = async (req, res) => {
  try {
    const { email, otp } = req.body;

    const otpRecord = await prisma.otpToken.findFirst({
      where: {
        email,
        code: otp,
        purpose: 'LOGIN_2FA',
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!otpRecord) return res.status(400).json({ error: 'Invalid or expired OTP' });

    await prisma.otpToken.update({ where: { id: otpRecord.id }, data: { used: true } });

    const user = await prisma.user.findUnique({ where: { email } });
    
    const jwtToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Send token as HTTP-only cookie
    res.cookie('token', jwtToken, {
      httpOnly: true,        // JavaScript cannot access this cookie
      secure: false,         // set to true in production (HTTPS only)
      sameSite: 'strict',    // prevents CSRF
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── RESEND OTP ───
exports.resendOtp = async (req, res) => {
  try {
    const { email, purpose } = req.body;

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await prisma.otpToken.create({
      data: { email, code: otp, purpose, expiresAt },
    });
    await sendOtpEmail(email, otp, purpose);

    res.json({ message: 'New OTP sent to your email.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// ─── FORGOT PASSWORD ───
// Step 1: User enters email → system sends OTP
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // Return same message even if email doesn't exist (security best practice)
      return res.json({ message: 'If this email exists, a reset code has been sent.' });
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.otpToken.create({
      data: { email, code: otp, purpose: 'PASSWORD_RESET', expiresAt },
    });

    await sendOtpEmail(email, otp, 'PASSWORD_RESET');

    res.json({ message: 'If this email exists, a reset code has been sent.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── RESET PASSWORD ───
// Step 2: User submits OTP + new password
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    // Validate new password length
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Find valid OTP
    const otpRecord = await prisma.otpToken.findFirst({
      where: {
        email,
        code: otp,
        purpose: 'PASSWORD_RESET',
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!otpRecord) {
      return res.status(400).json({ error: 'Invalid or expired reset code' });
    }

    // Hash new password and update user
    const hashed = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction([
      prisma.otpToken.update({ where: { id: otpRecord.id }, data: { used: true } }),
      prisma.user.update({ where: { email }, data: { password: hashed } }),
    ]);

    res.json({ message: 'Password reset successful. You can now log in with your new password.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// ─── LOGOUT ───
exports.logout = (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out successfully' });
};

// ─── TOGGLE 2FA ───
exports.toggleTwoFactor = async (req, res) => {
  try {
    const { enabled } = req.body; // true or false
    const userId = req.user.userId; // set by auth middleware

    await prisma.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: enabled },
    });

    res.json({
      message: `Two-factor authentication ${enabled ? 'enabled' : 'disabled'}`,
      twoFactorEnabled: enabled,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getMe = async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    include: { student: true, teacher: true, admin: true },
  });
  res.json(user);
};