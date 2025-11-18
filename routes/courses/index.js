const express = require("express");
const courses_router = express.Router();

const cors = require("cors");
const jwt = require("jsonwebtoken");

const db = require('../../models');
const Course = db.Course;

courses_router.use(cors());
courses_router.use(express.json());

const verifyTokenAndExtractUser = (req, res, next) => {
    const token = req.params?.token || req.body?.jwt || req.query?.jwt || req.headers?.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: "No token provided." });
    }

    try {
        const decoded = jwt.verify(token, process.env.SECRET_KEY);
        req.user = { id: decoded.id };
        next();
    } catch (err) {
        console.error("JWT Verification Error:", err.message);
        return res.status(401).json({ error: "Invalid or expired token." });
    }
};

/**
 * GET /get_courses
 * Returns a list of all courses (id, title, description) after JWT verification.
 */
courses_router.get("/get_courses", verifyTokenAndExtractUser, async (req, res) => {
    try {
        const courses = await Course.findAll({
            attributes: ['id', 'title', 'description']
        });
        res.json(courses);
    } catch (error) {
        console.error("Error fetching courses:", error);
        res.status(500).json({ error: "Failed to fetch courses." });
    }
});

/**
 * POST /enroll_course
 * Body: { jwt, courseId, password }
 * Enrolls a user in a course if the password is correct and assigns 'student' role.
 */
courses_router.post("/enroll_course", verifyTokenAndExtractUser, async (req, res) => {
    const { courseId, password } = req.body;
    const userId = req.user.id;

    if (!courseId || !password) {
        return res.status(400).json({ error: "Course ID and password are required." });
    }

    try {
        const course = await Course.findByPk(courseId);

        if (!course) {
            return res.status(404).json({ error: "Course not found." });
        }

        if (course.password !== password) {
            return res.status(401).json({ error: "Incorrect course password." });
        }

        const studentRole = await db.UserRole.findOne({ where: { name: 'student' } });

        if (!studentRole) {
            return res.status(500).json({ error: "Student role not found. Please ensure roles are seeded." });
        }

        // Check if user is already enrolled in this course
        const existingEnrollment = await db.UserCourseRole.findOne({
            where: {
                userId: userId,
                courseId: courseId
            }
        });

        if (existingEnrollment) {
            return res.status(409).json({ error: "User is already enrolled in this course." });
        }

        await db.UserCourseRole.create({
            userId: userId,
            courseId: courseId,
            roleId: studentRole.id
        });

        res.json({ message: "Successfully enrolled in the course as a student." });

    } catch (error) {
        console.error("Error enrolling in course:", error);
        res.status(500).json({ error: "Failed to enroll in course." });
    }
});

module.exports = courses_router;
