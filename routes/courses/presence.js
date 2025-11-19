const express = require("express");
const presence_router = express.Router();

const cors = require("cors");
const { verifyTokenAndExtractUser, checkRole } = require('../../helpers/authMiddleware');

const db = require('../../models');
const Presence = db.Presence;
const User = db.User;
const UserCourseRole = db.UserCourseRole;
const UserRole = db.UserRole;
const ClassSession = db.ClassSession;
const Course = db.Course;

presence_router.use(cors());
presence_router.use(express.json());

/**
 * GET /courses/:courseId/class_sessions/:classSessionId/presence
 * Returns a list of presence records for all students in a specific class session.
 * Only accessible by 'teacher' and 'headteacher'.
 */
presence_router.get("/:courseId/class_sessions/:classSessionId/presence", verifyTokenAndExtractUser, checkRole(['teacher', 'headteacher']), async (req, res) => {
    const { courseId, classSessionId } = req.params;

    try {
        const classSession = await ClassSession.findByPk(classSessionId);
        if (!classSession) {
            return res.status(404).json({ error: "Class session not found." });
        }

        if (classSession.courseId != courseId) {
            return res.status(400).json({ error: "Class session does not belong to the specified course." });
        }

        const presenceRecords = await Presence.findAll({
            where: { classSessionId: classSessionId },
            include: [{
                model: User,
                as: 'user',
                attributes: ['id', 'firstName', 'lastName', 'username']
            }],
            order: [[{ model: User, as: 'user' }, 'lastName', 'ASC']]
        });

        res.status(200).json(presenceRecords);

    } catch (error) {
        console.error("Error fetching presence records:", error);
        res.status(500).json({ error: "Failed to fetch presence records." });
    }
});

module.exports = presence_router;