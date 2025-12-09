const express = require("express");
const courses_router = express.Router();

const cors = require("cors");
const {
  verifyTokenAndExtractUser,
  verifySuperuser,
} = require("../../helpers/authMiddleware");

const db = require("../../models");
const Course = db.Course;
const User = db.User;
const UserRole = db.UserRole;
const UserCourseRole = db.UserCourseRole;
const CourseCreationRequest = db.CourseCreationRequest;
const Status = db.Status;
const ClassSession = db.ClassSession; // Added
const Assessment = db.Assessment; // Added
const Presence = db.Presence; // Added

courses_router.use(cors());
courses_router.use(express.json());

/**
 * GET /get_courses
 * Returns a list of all courses (id, title, description) after JWT verification.
 */
courses_router.get("/", verifyTokenAndExtractUser, async (req, res) => {
  try {
    const courses = await Course.findAll({
      attributes: ["id", "title", "description"],
    });

    const coursesWithTeachers = await Promise.all(
      courses.map(async (course) => {
        const teacherRoles = await UserCourseRole.findAll({
          where: { courseId: course.id },
          include: [
            {
              model: User,
              as: "user", // alias from model
              attributes: ["id", "firstName", "lastName", "username", "email"],
            },
            {
              model: UserRole,
              as: "role", // alias from model
              attributes: ["name"],
            },
          ],
        });

        const teachers = teacherRoles
          .filter(
            (ucr) =>
              ucr.role.name === "headteacher" || ucr.role.name === "teacher"
          )
          .sort((a, b) => {
            if (a.role.name === "headteacher") return -1;
            if (b.role.name === "headteacher") return 1;
            return 0;
          })
          .map((ucr) => ({
            id: ucr.user.id,
            firstName: ucr.user.firstName,
            lastName: ucr.user.lastName,
            username: ucr.user.username,
            email: ucr.user.email,
            role: ucr.role.name,
          }));

        return {
          id: course.id,
          title: course.title,
          description: course.description,
          teachers,
        };
      })
    );

    res.json(coursesWithTeachers);
  } catch (error) {
    console.error("Error fetching courses with teachers:", error);
    res
      .status(500)
      .json({ error: "Failed to fetch courses with teacher info." });
  }
});

/**
 * POST /enroll
 * Body: { jwt, courseId, password }
 * Enrolls a user in a course if the password is correct and assigns 'student' role.
 */
courses_router.post(
  "/:courseId/enroll",
  verifyTokenAndExtractUser,
  async (req, res) => {
    const courseId = req.params.courseId;
    const { password } = req.body;
    const userId = req.user.id;

    if (!courseId || !password) {
      return res
        .status(400)
        .json({ error: "Course ID and password are required." });
    }

    try {
      const course = await Course.findByPk(courseId);

      if (!course) {
        return res.status(404).json({ error: "Course not found." });
      }

      if (course.password !== password) {
        return res.status(401).json({ error: "Incorrect course password." });
      }

      const studentRole = await db.UserRole.findOne({
        where: { name: "student" },
      });

      if (!studentRole) {
        return res
          .status(500)
          .json({
            error: "Student role not found. Please ensure roles are seeded.",
          });
      }

      // Check if user is already enrolled in this course
      const existingEnrollment = await db.UserCourseRole.findOne({
        where: {
          userId: userId,
          courseId: courseId,
        },
      });

      if (existingEnrollment) {
        return res
          .status(409)
          .json({ error: "User is already enrolled in this course." });
      }

      const newUserCourseRole = await db.UserCourseRole.create({
        userId: userId,
        courseId: courseId,
        roleId: studentRole.id,
      });

      // Find all existing class sessions for the course
      const classSessions = await ClassSession.findAll({
        where: { courseId: courseId },
        attributes: ["id"],
      });

      // Create assessments and presence records for the new student for each class session
      if (classSessions.length > 0) {
        const assessmentsToCreate = classSessions.map((session) => ({
          userId: userId,
          classSessionId: session.id,
          grade: null,
        }));
        await Assessment.bulkCreate(assessmentsToCreate);

        const presenceToCreate = classSessions.map((session) => ({
          userId: userId,
          classSessionId: session.id,
          present: false,
        }));
        await Presence.bulkCreate(presenceToCreate);
      }

      res.json({
        message: "Successfully enrolled in the course as a student.",
      });
    } catch (error) {
      console.error("Error enrolling in course:", error);
      res.status(500).json({ error: "Failed to enroll in course." });
    }
  },
);

/**
 * GET /my_courses
 * Returns a list of course IDs the authenticated user is enrolled in.
 */
courses_router.get("/my_courses", verifyTokenAndExtractUser, async (req, res) => {
  try {
    const userId = req.user.id;

    const roles = await db.UserCourseRole.findAll({
      where: { userId: userId },
      attributes: ["courseId"]
    });

    const courseIds = roles.map(r => Number(r.courseId));

    res.json(courseIds);
  } catch (error) {
    console.error("Error fetching user courses:", error);
    res.status(500).json({ error: "Failed to fetch user course list." });
  }
});

/**
 * POST /request_course_creation
 * Allows any authenticated user to create a course creation request.
 * Body: { title, description }
 */
courses_router.post(
  "/course_creation_request",
  verifyTokenAndExtractUser,
  async (req, res) => {
    const { title, description, coursePassword } = req.body;
    const requestedBy = req.user.id;

    if (!title) {
      return res.status(400).json({ error: "Course title is required." });
    }

    try {
      const newRequest = await db.CourseCreationRequest.create({
        courseTitle: title,
        courseDescription: description,
        coursePassword: coursePassword,
        requestedBy: requestedBy,
      });

      res
        .status(201)
        .json({
          message: "Course creation request submitted successfully.",
          request: newRequest,
        });
    } catch (error) {
      console.error("Error submitting course creation request:", error);
      res
        .status(500)
        .json({ error: "Failed to submit course creation request." });
    }
  },
);

courses_router.put(
  "/course_creation_request/:requestId",
  verifyTokenAndExtractUser,
  verifySuperuser,
  async (req, res) => {
    const requestId = req.params.requestId;
    const { action } = req.body;

    if (!requestId || !action) {
      return res
        .status(400)
        .json({ error: "Request ID and action are required." });
    }

    if (action !== "accept" && action !== "reject") {
      return res
        .status(400)
        .json({ error: "Invalid action. Must be 'accept' or 'reject'." });
    }

    try {
      const request = await CourseCreationRequest.findByPk(requestId);

      if (!request) {
        return res
          .status(404)
          .json({ error: "Course creation request not found." });
      }

      if (action === "accept") {
        // Create the course
        const newCourse = await Course.create({
          title: request.courseTitle,
          description: request.courseDescription,
          password: request.coursePassword,
          statusId: (await Status.findOne({ where: { name: "Active" } })).id, // Assuming 'Active' status for new courses
        });

        // Assign the requester as HeadTeacher
        const headTeacherRole = await UserRole.findOne({
          where: { name: "headteacher" },
        });

        if (!headTeacherRole) {
          return res
            .status(500)
            .json({
              error:
                "HeadTeacher role not found. Please ensure roles are seeded.",
            });
        }

        await UserCourseRole.create({
          userId: request.requestedBy,
          courseId: newCourse.id,
          roleId: headTeacherRole.id,
        });

        // Remove the request
        await request.destroy();

        res
          .status(200)
          .json({
            message: "Course creation request accepted and course created.",
            course: newCourse,
          });
      } else if (action === "reject") {
        // Remove the request
        await request.destroy();
        res.status(200).json({ message: "Course creation request rejected." });
      }
    } catch (error) {
      console.error("Error handling course creation request:", error);
      res
        .status(500)
        .json({ error: "Failed to handle course creation request." });
    }
  },
);

/**
 * GET /course_creation_requests
 * Returns a list of all course creation requests for superusers.
 */
courses_router.get(
  "/course_creation_requests",
  verifyTokenAndExtractUser,
  verifySuperuser,
  async (req, res) => {
    try {
      const requests = await CourseCreationRequest.findAll({
        include: [
          {
            model: User,
            as: "requester",
            attributes: ["id", "firstName", "lastName", "username", "email"],
          },
        ],
      });
      res.json(requests);
    } catch (error) {
      console.error("Error fetching course creation requests:", error);
      res
        .status(500)
        .json({ error: "Failed to fetch course creation requests." });
    }
  },
);

module.exports = courses_router;

