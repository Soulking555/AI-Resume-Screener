const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ─── DASHBOARD STATS ───
exports.getDashboardStats = async (req, res) => {
  try {
    const [
      totalStudents,
      totalTeachers,
      totalCourses,
      totalEnrollments,
      pendingEnrollments,
      pendingDiscounts,
      totalRevenue,
    ] = await Promise.all([
      prisma.student.count(),
      prisma.teacher.count(),
      prisma.course.count(),
      prisma.enrollment.count(),
      prisma.enrollment.count({ where: { status: "PENDING" } }),
      prisma.discountRequest.count({ where: { status: "PENDING" } }),
      prisma.payment.aggregate({
        where: { status: "COMPLETED" },
        _sum: { amount: true },
      }),
    ]);

    res.json({
      totalStudents,
      totalTeachers,
      totalCourses,
      totalEnrollments,
      pendingEnrollments,
      pendingDiscounts,
      totalRevenue: totalRevenue._sum.amount || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── USERS ───
exports.getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        emailVerified: true,
        twoFactorEnabled: true,
        createdAt: true,
        student: { select: { id: true, rollNumber: true } },
        teacher: { select: { id: true, employeeId: true } },
        admin: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getUserById = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        student: { include: { family: true, enrollments: { include: { course: true } } } },
        teacher: { include: { courses: true } },
        admin: true,
      },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateUser = async (req, res) => {
 try {
    const { firstName, lastName, phone, role } = req.body;
    const userId = parseInt(req.params.id);

    // Get current user to check if role changed
    const currentUser = await prisma.user.findUnique({
      where: { id: userId },
      include: { student: true, teacher: true, admin: true },
    });

    if (!currentUser) return res.status(404).json({ error: "User not found" });

    // If role changed, swap profile tables
    if (role && role !== currentUser.role) {
      await prisma.$transaction(async (tx) => { // tx is the transaction client
        // Delete old profile
        if (currentUser.role === "STUDENT" && currentUser.student) {
          await tx.enrollment.deleteMany({ where: { studentId: currentUser.student.id } });
          await tx.payment.deleteMany({ where: { studentId: currentUser.student.id } });
          await tx.student.delete({ where: { userId } });
        } else if (currentUser.role === "TEACHER" && currentUser.teacher) {
          // Unassign courses first
          await tx.course.updateMany({
            where: { teacherId: currentUser.teacher.id },
            data: { teacherId: null },
          });
          await tx.teacher.delete({ where: { userId } });
        } else if (currentUser.role === "ADMIN" && currentUser.admin) {
          await tx.admin.delete({ where: { userId } });
        }

        // Create new profile
        if (role === "STUDENT") {
          await tx.student.create({
            data: { userId, rollNumber: `STU-${userId.toString().padStart(4, '0')}` },
          });
        } else if (role === "TEACHER") {
          await tx.teacher.create({
            data: { userId, employeeId: `EMP-${userId.toString().padStart(4, '0')}` },
          });
        } else if (role === "ADMIN") {
          await tx.admin.create({ data: { userId } });
        }
      });
    }

    // Update user fields
    const user = await prisma.user.update({
      where: { id: userId },
      data: { firstName, lastName, phone, role },
      include: { student: true, teacher: true, admin: true },
    });

    res.json({ message: "User updated", user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    await prisma.$transaction(async (tx) => {
      await tx.otpToken.deleteMany({ where: { email: (await tx.user.findUnique({ where: { id: userId } })).email } });
      await tx.notification.deleteMany({ where: { userId } });
      await tx.student.deleteMany({ where: { userId } });
      await tx.teacher.deleteMany({ where: { userId } });
      await tx.admin.deleteMany({ where: { userId } });
      await tx.user.delete({ where: { id: userId } });
    });
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── COURSES ───
exports.createCourse = async (req, res) => {
  try {
    const { name, description, schedule, fees, capacity, teacherId } = req.body;
    const course = await prisma.course.create({
      data: { name, description, schedule, fees: parseFloat(fees), capacity: parseInt(capacity), teacherId: teacherId ? parseInt(teacherId) : null },
    });
    res.status(201).json(course);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateCourse = async (req, res) => {
  try {
    const { name, description, schedule, fees, capacity, teacherId } = req.body;
    const course = await prisma.course.update({
      where: { id: parseInt(req.params.id) },
      data: {
        name,
        description,
        schedule,
        fees: fees ? parseFloat(fees) : undefined,
        capacity: capacity ? parseInt(capacity) : undefined,
        teacherId: teacherId ? parseInt(teacherId) : null,
      },
    });
    res.json(course);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteCourse = async (req, res) => {
  try {
    await prisma.course.delete({ where: { id: parseInt(req.params.id) } });
    res.json({ message: "Course deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── ENROLLMENTS ───
exports.getAllEnrollments = async (req, res) => {
  try {
    const enrollments = await prisma.enrollment.findMany({
      include: {
        student: { include: { user: { select: { firstName: true, lastName: true, email: true } } } },
        course: true,
      },
      orderBy: { enrolledAt: "desc" },
    });
    res.json(enrollments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateEnrollmentStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const enrollmentId = parseInt(req.params.id);

    const enrollment = await prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { status },
      include: {
        student: { include: { user: true } },
        course: true,
      },
    });

    // Send notification to student when confirmed or cancelled
    if (status === "CONFIRMED" || status === "CANCELLED") {
      await prisma.notification.create({
        data: {
          userId: enrollment.student.user.id,
          title: status === "CONFIRMED" ? "Enrollment Confirmed" : "Enrollment Cancelled",
          message: `Your enrollment in ${enrollment.course.name} has been ${status.toLowerCase()}.`,
        },
      });
    }

    res.json({ message: `Enrollment ${status.toLowerCase()}`, enrollment });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getDiscountRequests = async (req, res) => {
  try {
    const requests = await prisma.discountRequest.findMany({
      include: {
        family: {
          include: {
            students: {
              include: {
                user: { select: { firstName: true, lastName: true, email: true } },
              },
            },
          },
        },
        siblingStudent: {
          include: {
            user: { select: { firstName: true, lastName: true, email: true } },
          },
        },
      },
      orderBy: { requestedAt: "desc" },
    });

    // Format for admin clarity
    const formatted = requests.map((req) => ({
      id: req.id,
      status: req.status,
      requestedAt: req.requestedAt,
      reviewedAt: req.reviewedAt,
      family: {
        id: req.family.id,
        guardianName: req.family.guardianName,
        address: req.family.address,
        phone: req.family.phone,
        allFamilyMembers: req.family.students.map((s) => ({
          studentId: s.id,
          rollNumber: s.rollNumber,
          name: `${s.user.firstName} ${s.user.lastName}`,
          email: s.user.email,
        })),
      },
      claimedSibling: req.siblingStudent
        ? {
            studentId: req.siblingStudent.id,
            rollNumber: req.siblingStudent.rollNumber,
            name: `${req.siblingStudent.user.firstName} ${req.siblingStudent.user.lastName}`,
            email: req.siblingStudent.user.email,
          }
        : null,
    }));

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.approveDiscount = async (req, res) => {
  try {
    const request = await prisma.discountRequest.update({
      where: { id: parseInt(req.params.id) },
      data: { status: "APPROVED", reviewedAt: new Date() },
    });
    res.json({ message: "Discount approved", request });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.rejectDiscount = async (req, res) => {
  try {
    const request = await prisma.discountRequest.update({
      where: { id: parseInt(req.params.id) },
      data: { status: "REJECTED", reviewedAt: new Date() },
    });
    res.json({ message: "Discount rejected", request });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── TEACHER ASSIGNMENT ───
exports.assignTeacherToCourse = async (req, res) => {
  try {
    const { teacherId } = req.body;
    const course = await prisma.course.update({
      where: { id: parseInt(req.params.id) },
      data: { teacherId: parseInt(teacherId) },
    });
    res.json({ message: "Teacher assigned", course });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── REPORTS ───
exports.getReports = async (req, res) => {
  try {
    const { type } = req.query; // enrollments, revenue, courses

    if (type === "enrollments") {
      const data = await prisma.enrollment.groupBy({
        by: ["status"],
        _count: { id: true },
      });
      return res.json(data);
    }

    if (type === "revenue") {
      const data = await prisma.payment.aggregate({
        _sum: { amount: true },
        _count: { id: true },
      });
      return res.json(data);
    }

    if (type === "courses") {
      const data = await prisma.course.findMany({
        include: { _count: { select: { enrollments: true } } },
      });
      return res.json(data);
    }

    res.status(400).json({ error: "Invalid report type. Use: enrollments, revenue, courses" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};