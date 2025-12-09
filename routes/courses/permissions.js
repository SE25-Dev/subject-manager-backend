const express = require("express");
const permissions_router = express.Router();

const cors = require("cors");
const {
  verifyTokenAndExtractUser,
  checkRole,
} = require("../../helpers/authMiddleware");

const db = require("../../models");
const User = db.User;
const UserCourseRole = db.UserCourseRole;
const UserRole = db.UserRole;

permissions_router.use(cors());
permissions_router.use(express.json());

/**
 * GET /:courseId/users
 * Allows HeadTeachers to get all users with a UserCourseRole for that course and their roles.
 */
permissions_router.get(
  "/:courseId/users",
  verifyTokenAndExtractUser,
  async (req, res) => {
    const courseId = req.params.courseId;

    try {
      const usersInCourse = await UserCourseRole.findAll({
        where: { courseId },
        include: [
          {
            model: User,
            as: "user",
            attributes: ["id", "firstName", "lastName", "username", "email"],
          },
          { model: UserRole, as: "role", attributes: ["name"] },
        ],
      });

      const formattedUsers = usersInCourse.map((ucr) => ({
        userId: ucr.user.id,
        firstName: ucr.user.firstName,
        lastName: ucr.user.lastName,
        username: ucr.user.username,
        email: ucr.user.email,
        role: ucr.role.name,
      }));

      res.json(formattedUsers);
    } catch (error) {
      console.error("Error fetching users in course:", error);
      res.status(500).json({ error: "Failed to fetch users in course." });
    }
  },
);

/**
 * PUT /:courseId/users/:userId/role
 * Allows HeadTeachers to change the role of a user in a course.
 * Body: { newRoleId }
 */
permissions_router.put(
  "/:courseId/users/:userId/role",
  verifyTokenAndExtractUser,
  checkRole(["headteacher"]),
  async (req, res) => {
    const { courseId, userId: targetUserId } = req.params;
    const { newRole } = req.body; // string: 'student', 'teacher', 'headteacher'

    if (!newRole) {
      console.log("erorr1");
      return res.status(400).json({ error: "New role is required." });
    }

    try {
      // Find the role by name
      const roleRecord = await UserRole.findOne({ where: { name: newRole } });
      if (!roleRecord) {
        console.log("2");
        return res.status(400).json({ error: "Invalid role name." });
      }

      const userCourseRole = await UserCourseRole.findOne({
        where: { userId: targetUserId, courseId },
      });

      if (!userCourseRole) {
        return res.status(404).json({ error: "User not found in this course." });
      }

      await userCourseRole.update({ roleId: roleRecord.id });

      res.json({
        message: "User role updated successfully.",
        role: newRole,
        userCourseRole,
      });
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ error: "Failed to update user role." });
    }
  },
);

/**
 * DELETE /:courseId/users/:userId
 * Allows HeadTeachers to remove a user from a course (deletes UserCourseRole entry).
 */
permissions_router.delete(
  "/:courseId/users/:userId",
  verifyTokenAndExtractUser,
  checkRole(["headteacher"]),
  async (req, res) => {
    const courseId = req.params.courseId;
    const targetUserId = req.params.userId;

    try {
      const deletedCount = await UserCourseRole.destroy({
        where: { userId: targetUserId, courseId },
      });

      if (deletedCount === 0) {
        return res
          .status(404)
          .json({ error: "User not found in this course." });
      }

      res.json({ message: "User removed from course successfully." });
    } catch (error) {
      console.error("Error removing user from course:", error);
      res.status(500).json({ error: "Failed to remove user from course." });
    }
  },
);

module.exports = permissions_router;
