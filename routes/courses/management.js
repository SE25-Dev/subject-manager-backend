const express = require("express");
const management_router = express.Router();

const cors = require("cors");
const {
  verifyTokenAndExtractUser,
  checkRole,
} = require("../../helpers/authMiddleware");

const db = require("../../models");
const Course = db.Course;
const UserCourseRole = db.UserCourseRole;
const UserRole = db.UserRole;

management_router.use(cors());
management_router.use(express.json());

/**
 * PUT /:courseId/details
 * Allows HeadTeachers to change course details (title, description, statusId).
 */
management_router.put(
  "/:courseId/details",
  verifyTokenAndExtractUser,
  checkRole(["headteacher"]),
  async (req, res) => {
    const courseId = req.params.courseId;
    const { title, description, statusId } = req.body;

    try {
      const course = await Course.findByPk(courseId);

      if (!course) {
        return res.status(404).json({ error: "Course not found." });
      }

      const updatedFields = {};
      if (title !== undefined) updatedFields.title = title;
      if (description !== undefined) updatedFields.description = description;
      if (statusId !== undefined) updatedFields.statusId = statusId;

      if (Object.keys(updatedFields).length === 0) {
        return res
          .status(400)
          .json({ error: "No fields provided for update." });
      }

      await course.update(updatedFields);

      res.json({ message: "Course details updated successfully.", course });
    } catch (error) {
      console.error("Error updating course details:", error);
      res.status(500).json({ error: "Failed to update course details." });
    }
  },
);

/**
 * PUT /:courseId/password
 * Allows HeadTeachers to change the course password.
 */
management_router.put(
  "/:courseId/password",
  verifyTokenAndExtractUser,
  checkRole(["headteacher"]),
  async (req, res) => {
    const courseId = req.params.courseId;
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({ error: "New password is required." });
    }

    try {
      const course = await Course.findByPk(courseId);

      if (!course) {
        return res.status(404).json({ error: "Course not found." });
      }

      await course.update({ password: newPassword });

      res.json({ message: "Course password updated successfully." });
    } catch (error) {
      console.error("Error updating course password:", error);
      res.status(500).json({ error: "Failed to update course password." });
    }
  },
);

module.exports = management_router;
