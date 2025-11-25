const express = require("express");
const notifications_router = express.Router();

const cors = require("cors");
const { verifyTokenAndExtractUser } = require("../helpers/authMiddleware");

const db = require("../models");
const Notification = db.Notification;
const User = db.User;
const Section = db.Section; // Added
const Status = db.Status; // Added

notifications_router.use(cors());
notifications_router.use(express.json());

/**
 * GET /notifications
 * Returns a list of notifications for the authenticated user.
 * Query Params: { isRead } (optional, filters by read status)
 */
notifications_router.get(
  "/notifications",
  verifyTokenAndExtractUser,
  async (req, res) => {
    const userId = req.user.id;
    const { isRead } = req.query;

    let whereCondition = { userId: userId };

    if (isRead !== undefined) {
      whereCondition.isRead = isRead === "true";
    }

    try {
      const notifications = await Notification.findAll({
        where: whereCondition,
        order: [["createdAt", "DESC"]],
      });

      res.status(200).json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications." });
    }
  },
);

/**
 * PUT /notifications/:notificationId/mark_as_read
 * Marks a specific notification as read.
 */
notifications_router.put(
  "/notifications/:notificationId/mark_as_read",
  verifyTokenAndExtractUser,
  async (req, res) => {
    const notificationId = req.params.notificationId;
    const userId = req.user.id;

    try {
      const notification = await Notification.findOne({
        where: { id: notificationId, userId: userId },
      });

      if (!notification) {
        return res
          .status(404)
          .json({
            error:
              "Notification not found or you don't have permission to update it.",
          });
      }

      notification.isRead = true;
      await notification.save();

      if (notification.type === "raport_section_addition") {
        // Check if all notifications for this section are read
        const sectionId = notification.sectionId;
        if (sectionId) {
          const allSectionNotifications = await Notification.findAll({
            where: { sectionId: sectionId },
          });

          const allRead = allSectionNotifications.every(
            (notif) => notif.isRead,
          );

          if (allRead) {
            // Update section status to 'Active'
            const activeStatus = await Status.findOne({
              where: { name: "Active" },
            });
            if (activeStatus) {
              await Section.update(
                { statusId: activeStatus.id },
                { where: { id: sectionId } },
              );
            }

            // Delete all notifications for this section
            await Notification.destroy({ where: { sectionId: sectionId } });
            return res
              .status(200)
              .json({
                message:
                  "All section notifications marked as read, section activated, and notifications deleted.",
                sectionId: sectionId,
              });
          }
        }
      } else {
        await notification.destroy();
        return res
          .status(200)
          .json({
            message: "Notification marked as read and deleted.",
            notificationId: notificationId,
          });
      }

      res
        .status(200)
        .json({
          message: "Notification marked as read.",
          notification: notification,
        });
    } catch (error) {
      console.error("Error marking notification as read:", error);
      res.status(500).json({ error: "Failed to mark notification as read." });
    }
  },
);

module.exports = notifications_router;
