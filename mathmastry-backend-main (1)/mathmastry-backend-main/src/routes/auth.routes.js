const express = require("express");
const rateLimit = require("express-rate-limit");
const { body } = require("express-validator"); 
const router = express.Router();

const { authenticate } = require("../middleware/auth.middleware");
const {
  register,
  verifyEmail,
  loginStep1,
  loginStep2,
  resendOtp,
  forgotPassword,
  resetPassword,
  logout,
  toggleTwoFactor,
  getMe,
} = require("../controllers/auth.controller");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many attempts. Try again later." },
});

// Helper to check validation errors
const validate = (req, res, next) => {
  const errors = require("express-validator").validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  next();
};

// Public routes
router.post("/register", [
  body("email").isEmail().withMessage("Valid email required"),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  body("firstName").notEmpty().withMessage("First name required"),
  body("lastName").notEmpty().withMessage("Last name required"),
  body("role").isIn(["STUDENT", "TEACHER", "ADMIN"]).withMessage("Role must be STUDENT, TEACHER, or ADMIN"),
  validate,
], register);

router.post("/verify-email", [
  body("email").isEmail(),
  body("otp").isLength({ min: 6, max: 6 }).isNumeric(),
  validate,
], verifyEmail);

// Rate-limited auth routes
router.post("/login", authLimiter, [
  body("email").isEmail(),
  body("password").notEmpty(),
  validate,
], loginStep1);

router.post("/login/verify", authLimiter, [
  body("email").isEmail(),
  body("otp").isLength({ min: 6, max: 6 }).isNumeric(),
  validate,
], loginStep2);

router.post("/resend-otp", authLimiter, [
  body("email").isEmail(),
  body("purpose").isIn(["EMAIL_VERIFY", "LOGIN_2FA", "PASSWORD_RESET"]),
  validate,
], resendOtp);

router.post("/forgot-password", authLimiter, [
  body("email").isEmail(),
  validate,
], forgotPassword);

router.post("/reset-password", authLimiter, [
  body("email").isEmail(),
  body("otp").isLength({ min: 6, max: 6 }).isNumeric(),
  body("newPassword").isLength({ min: 6 }),
  validate,
], resetPassword);

// Protected routes
router.post("/logout", authenticate, logout);
router.post("/toggle-2fa", authenticate, [
  body("enabled").isBoolean(),
  validate,
], toggleTwoFactor);
router.get("/me", authenticate, getMe);

module.exports = router;
