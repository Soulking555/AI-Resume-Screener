const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ─── GET MY PROFILE ───
exports.getMyProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const student = await prisma.student.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phone: true,
            role: true,
            createdAt: true,
          },
        },
        family: true,
      },
    });

    if (!student) return res.status(404).json({ error: "Student profile not found" });

    res.json(student);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── UPDATE MY PROFILE ───
exports.updateMyProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { firstName, lastName, phone, dateOfBirth } = req.body;

    const student = await prisma.student.findUnique({ where: { userId } });
    if (!student) return res.status(404).json({ error: "Student profile not found" });

    await prisma.student.update({
      where: { userId },
      data: { dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined },
    });

    if (firstName || lastName || phone) {
      await prisma.user.update({
        where: { id: userId },
        data: { firstName, lastName, phone },
      });
    }

    res.json({ message: "Profile updated successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── BROWSE ALL COURSES ───
exports.getAllCourses = async (req, res) => {
  try {
    const courses = await prisma.course.findMany({
      include: {
        teacher: {
          include: {
            user: {
              select: { firstName: true, lastName: true },
            },
          },
        },
        _count: {
          select: { enrollments: { where: { status: { not: "CANCELLED" } } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Add available seats calculation
    const coursesWithAvailability = courses.map((course) => ({
      ...course,
      enrolledCount: course._count.enrollments,
      availableSeats: course.capacity - course._count.enrollments,
    }));

    res.json(coursesWithAvailability);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── VIEW COURSE DETAILS ───
exports.getCourseById = async (req, res) => {
  try {
    const courseId = parseInt(req.params.id);

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        teacher: {
          include: {
            user: {
              select: { firstName: true, lastName: true, email: true },
            },
          },
        },
        _count: {
          select: { enrollments: { where: { status: { not: "CANCELLED" } } } },
        },
      },
    });

    if (!course) return res.status(404).json({ error: "Course not found" });

    res.json({
      ...course,
      enrolledCount: course._count.enrollments,
      availableSeats: course.capacity - course._count.enrollments,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── ENROLL IN COURSE ───
exports.enrollInCourse = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { courseId } = req.body;

    const student = await prisma.student.findUnique({ where: { userId } });
    if (!student) return res.status(404).json({ error: "Student profile not found" });

    // Check if course exists
    const course = await prisma.course.findUnique({
      where: { id: parseInt(courseId) },
      include: {
        _count: {
          select: { enrollments: { where: { status: { not: "CANCELLED" } } } },
        },
      },
    });
    if (!course) return res.status(404).json({ error: "Course not found" });

    // Check capacity
    if (course._count.enrollments >= course.capacity) {
      return res.status(400).json({ error: "Course is full. No available seats." });
    }

    // Check if already enrolled
    const existing = await prisma.enrollment.findFirst({
      where: {
        studentId: student.id,
        courseId: parseInt(courseId),
        status: { not: "CANCELLED" },
      },
    });
    if (existing) {
      return res.status(400).json({ error: "You are already enrolled in this course" });
    }

    // Create enrollment
    const enrollment = await prisma.enrollment.create({
      data: {
        studentId: student.id,
        courseId: parseInt(courseId),
        status: "PENDING",
      },
      include: { course: true },
    });

    // Create notification for student
    await prisma.notification.create({
      data: {
        userId,
        title: "Enrollment Submitted",
        message: `Your enrollment in ${course.name} has been submitted and is pending approval.`,
      },
    });

    res.status(201).json({
      message: "Enrollment submitted successfully. Awaiting admin approval.",
      enrollment,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── GET MY ENROLLMENTS ───
exports.getMyEnrollments = async (req, res) => {
  try {
    const userId = req.user.userId;

    const student = await prisma.student.findUnique({ where: { userId } });
    if (!student) return res.status(404).json({ error: "Student profile not found" });

    const enrollments = await prisma.enrollment.findMany({
      where: { studentId: student.id },
      include: {
        course: {
          include: {
            teacher: {
              include: {
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
      },
      orderBy: { enrolledAt: "desc" },
    });

    res.json(enrollments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── GET MY SCHEDULE ───
exports.getMySchedule = async (req, res) => {
  try {
    const userId = req.user.userId;

    const student = await prisma.student.findUnique({ where: { userId } });
    if (!student) return res.status(404).json({ error: "Student profile not found" });

    const enrollments = await prisma.enrollment.findMany({
      where: {
        studentId: student.id,
        status: "CONFIRMED",
      },
      include: {
        course: {
          select: {
            id: true,
            name: true,
            schedule: true,
            fees: true,
            teacher: {
              include: {
                user: { select: { firstName: true, lastName: true } },
              },
            },
          },
        },
      },
      orderBy: { enrolledAt: "desc" },
    });

    const schedule = enrollments.map((e) => ({
      enrollmentId: e.id,
      courseId: e.course.id,
      courseName: e.course.name,
      schedule: e.course.schedule,
      fees: e.course.fees,
      teacher: e.course.teacher?.user
        ? `${e.course.teacher.user.firstName} ${e.course.teacher.user.lastName}`
        : "Not assigned",
    }));

    res.json(schedule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── GET MY PAYMENTS ───
exports.getMyPayments = async (req, res) => {
  try {
    const userId = req.user.userId;

    const student = await prisma.student.findUnique({ where: { userId } });
    if (!student) return res.status(404).json({ error: "Student profile not found" });

    const payments = await prisma.payment.findMany({
      where: { studentId: student.id },
      orderBy: { paidAt: "desc" },
    });

    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── REQUEST SIBLING DISCOUNT ───
exports.requestSiblingDiscount = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { siblingStudentId, guardianName, address, phone } = req.body;

    const student = await prisma.student.findUnique({
      where: { userId },
      include: { family: true },
    });
    if (!student) return res.status(404).json({ error: "Student profile not found" });

    // Validate sibling exists
    if (!siblingStudentId) {
      return res.status(400).json({ error: "Sibling student ID is required" });
    }

    const sibling = await prisma.student.findUnique({
      where: { id: parseInt(siblingStudentId) },
      include: { user: { select: { firstName: true, lastName: true, email: true } } },
    });

    if (!sibling) {
      return res.status(404).json({ error: "Sibling student not found" });
    }

    // Prevent self-referral
    if (sibling.id === student.id) {
      return res.status(400).json({ error: "You cannot claim yourself as a sibling" });
    }

    let familyId = student.familyId;

    // If student has no family, check if sibling has one
    if (!familyId && sibling.familyId) {
      familyId = sibling.familyId;
      // Link this student to sibling's family
      await prisma.student.update({
        where: { id: student.id },
        data: { familyId },
      });
    } else if (!familyId && !sibling.familyId) {
      // Create new family for both
      const family = await prisma.family.create({
        data: { guardianName, address, phone },
      });
      familyId = family.id;

      await prisma.student.update({
        where: { id: student.id },
        data: { familyId },
      });
      await prisma.student.update({
        where: { id: sibling.id },
        data: { familyId },
      });
    } else if (familyId && sibling.familyId && familyId !== sibling.familyId) {
      // Both have different families — this is a conflict
      return res.status(400).json({
        error: "Sibling belongs to a different family. Please contact admin.",
      });
    } else if (familyId && !sibling.familyId) {
      // Link sibling to this student's family
      await prisma.student.update({
        where: { id: sibling.id },
        data: { familyId },
      });
    }

    // Check if discount request already pending for this family
    const existing = await prisma.discountRequest.findFirst({
      where: { familyId, status: "PENDING" },
    });
    if (existing) {
      return res.status(400).json({ error: "You already have a pending discount request for this family" });
    }

    // Create discount request with sibling reference
    const request = await prisma.discountRequest.create({
      data: {
        familyId,
        siblingStudentId: sibling.id,
      },
      include: {
        siblingStudent: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
    });

    // Notify student
    await prisma.notification.create({
      data: {
        userId,
        title: "Discount Request Submitted",
        message: `Your sibling discount request (with ${sibling.user.firstName} ${sibling.user.lastName}) has been submitted for admin review.`,
      },
    });

    res.status(201).json({
      message: "Discount request submitted. Awaiting admin approval.",
      request: {
        id: request.id,
        status: request.status,
        sibling: request.siblingStudent,
        requestedAt: request.requestedAt,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── GET MY NOTIFICATIONS ───
exports.getMyNotifications = async (req, res) => {
  try {
    const userId = req.user.userId;

    const notifications = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });

    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── MARK NOTIFICATION AS READ ───
exports.markNotificationRead = async (req, res) => {
  try {
    const userId = req.user.userId;
    const notificationId = parseInt(req.params.id);

    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });
    if (!notification) return res.status(404).json({ error: "Notification not found" });

    await prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    res.json({ message: "Notification marked as read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── CREATE PAYMENT ───
exports.createPayment = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { amount } = req.body;

    const student = await prisma.student.findUnique({ where: { userId } });
    if (!student) return res.status(404).json({ error: "Student profile not found" });

    const payment = await prisma.payment.create({
      data: {
        studentId: student.id,
        amount: parseFloat(amount),
        status: "COMPLETED",
        paidAt: new Date(),
      },
    });

    res.status(201).json({ message: "Payment recorded", payment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};