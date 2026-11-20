const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ─── GET MY PROFILE ───
exports.getMyProfile = async (req, res) => {
  try {
    const userId = req.user.userId;

    const teacher = await prisma.teacher.findUnique({
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
      },
    });

    if (!teacher) return res.status(404).json({ error: "Teacher profile not found" });

    res.json(teacher);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── UPDATE MY PROFILE ───
exports.updateMyProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const { department, availability, firstName, lastName, phone } = req.body;

    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) return res.status(404).json({ error: "Teacher profile not found" });

    // Update teacher-specific fields
    await prisma.teacher.update({
      where: { userId },
      data: { department, availability },
    });

    // Update user fields if provided
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

// ─── GET MY ASSIGNED COURSES ───
exports.getMyCourses = async (req, res) => {
  try {
    const userId = req.user.userId;

    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) return res.status(404).json({ error: "Teacher profile not found" });

    const courses = await prisma.course.findMany({
      where: { teacherId: teacher.id },
      include: {
        _count: {
          select: { enrollments: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    res.json(courses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── GET STUDENTS IN A SPECIFIC COURSE ───
exports.getCourseStudents = async (req, res) => {
  try {
    const userId = req.user.userId;
    const courseId = parseInt(req.params.id);

    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) return res.status(404).json({ error: "Teacher profile not found" });

    // Verify this teacher is assigned to this course
    const course = await prisma.course.findFirst({
      where: { id: courseId, teacherId: teacher.id },
    });
    if (!course) return res.status(403).json({ error: "You are not assigned to this course" });

    const enrollments = await prisma.enrollment.findMany({
      where: { courseId },
      include: {
        student: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
              },
            },
            family: {
              select: { guardianName: true, phone: true },
            },
          },
        },
      },
      orderBy: { enrolledAt: "desc" },
    });

    res.json({
      course: {
        id: course.id,
        name: course.name,
        schedule: course.schedule,
      },
      students: enrollments.map((e) => ({
        enrollmentId: e.id,
        status: e.status,
        enrolledAt: e.enrolledAt,
        ...e.student.user,
        family: e.student.family,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ─── UPDATE MY COURSE DETAILS ───
exports.updateMyCourse = async (req, res) => {
  try {
    const userId = req.user.userId;
    const courseId = parseInt(req.params.id);
    const { description, schedule } = req.body;

    const teacher = await prisma.teacher.findUnique({ where: { userId } });
    if (!teacher) return res.status(404).json({ error: "Teacher profile not found" });

    // Verify this teacher owns the course
    const course = await prisma.course.findFirst({
      where: { id: courseId, teacherId: teacher.id },
    });
    if (!course) return res.status(403).json({ error: "You are not assigned to this course" });

    const updated = await prisma.course.update({
      where: { id: courseId },
      data: { description, schedule },
    });

    res.json({ message: "Course updated successfully", course: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};