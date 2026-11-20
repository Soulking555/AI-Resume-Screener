const express = require("express");
const router = express.Router();
const { authenticate } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const {
  getMyProfile,
  updateMyProfile,
  getMyCourses,
  getCourseStudents,
  updateMyCourse,
} = require("../controllers/teacher.controller");

// All teacher routes require TEACHER role
router.use(authenticate, authorize("TEACHER"));

router.get("/me", getMyProfile);
router.put("/me", updateMyProfile);
router.get("/courses", getMyCourses);
router.get("/courses/:id/students", getCourseStudents);
router.put("/courses/:id", updateMyCourse);

module.exports = router;