const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const {
  getDashboardStats,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  createCourse,
  updateCourse,
  deleteCourse,
  getAllEnrollments,
  updateEnrollmentStatus,
  getDiscountRequests,
  approveDiscount,
  rejectDiscount,
  assignTeacherToCourse,
  getReports,
} = require("../controllers/admin.controller.js");

// All admin routes require ADMIN role
router.use(authenticate, authorize("ADMIN"));

// Dashboard
router.get("/dashboard", getDashboardStats);

// Users
router.get("/users", getAllUsers);
router.get("/users/:id", getUserById);
router.put("/users/:id", updateUser);
router.delete("/users/:id", deleteUser);

// Courses
router.post("/courses", createCourse);
router.put("/courses/:id", updateCourse);
router.delete("/courses/:id", deleteCourse);

// Enrollments
router.get("/enrollments", getAllEnrollments);
router.patch("/enrollments/:id", updateEnrollmentStatus);

// Sibling Discounts
router.get("/discounts", getDiscountRequests);
router.patch("/discounts/:id/approve", approveDiscount);
router.patch("/discounts/:id/reject", rejectDiscount);

// Teacher Assignment
router.patch("/courses/:id/assign-teacher", assignTeacherToCourse);

// Reports
router.get("/reports", getReports);

module.exports = router;