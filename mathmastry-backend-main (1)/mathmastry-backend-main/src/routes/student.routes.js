const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const {
  getMyProfile,
  updateMyProfile,
  getAllCourses,
  getCourseById,
  enrollInCourse,
  getMyEnrollments,
  getMySchedule,
  getMyPayments,
  requestSiblingDiscount,
  getMyNotifications,
  markNotificationRead,
  createPayment,
} = require("../controllers/student.controller");

router.use(authenticate, authorize("STUDENT"));

router.get("/me", getMyProfile);
router.put("/me", updateMyProfile);
router.get("/courses", getAllCourses);
router.get("/courses/:id", getCourseById);
router.post("/enrollments", enrollInCourse);
router.get("/enrollments", getMyEnrollments);
router.get("/schedule", getMySchedule);
router.get("/payments", getMyPayments);
router.post("/discounts", requestSiblingDiscount);
router.get("/notifications", getMyNotifications);
router.patch("/notifications/:id/read", markNotificationRead);
router.post("/payments", createPayment);


module.exports = router;