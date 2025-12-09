const express = require("express");
const class_sessions_router = express.Router();

const cors = require("cors");
const {
  verifyTokenAndExtractUser,
  checkRole,
} = require("../../helpers/authMiddleware");

const db = require("../../models");
const ClassSession = db.ClassSession;
const Assessment = db.Assessment;
const UserCourseRole = db.UserCourseRole;
const UserRole = db.UserRole;
const User = db.User;
const Presence = db.Presence;
const Raport = db.Raport;
const Section = db.Section;
const UserSection = db.UserSection;
const Notification = db.Notification;
const Status = db.Status;
const File = db.File;
const RaportFile = db.RaportFile;

const path = require("path");
const fs = require("fs");
const multer = require("multer");

class_sessions_router.use(cors());
class_sessions_router.use(express.json());

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(__dirname, "../../uploads");
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const upload = multer({ storage: storage });

const checkRaportOwner = async (req, res, next) => {
  const raportId = req.params.raportId || req.body.raportId;
  const userId = req.user.id;

  if (!raportId) {
    return res.status(400).json({ error: "Raport ID is required." });
  }

  try {
    const raport = await Raport.findByPk(raportId, {
      include: [
        {
          model: Section,
          as: "section",
          include: [
            {
              model: User,
              as: "users",
              through: { attributes: [] },
            },
          ],
        },
      ],
    });

    if (!raport) {
      return res.status(404).json({ error: "Raport not found." });
    }

    const isOwner = raport.section.users.some((user) => user.id === userId);

    if (!isOwner) {
      return res
        .status(403)
        .json({ error: "Access denied. You are not an owner of this raport." });
    }
    req.raport = raport; // Attach raport to request for later use
    next();
  } catch (error) {
    console.error("Error checking raport owner:", error);
    res.status(500).json({ error: "Failed to verify raport ownership." });
  }
};

/**
 * POST /create_class_session
 * Body: { courseId, topic, startingDateTime, endingDateTime }
 * Creates a new class session and generates null assessments for all enrolled students.
 */
class_sessions_router.post(
  "/create_class_session",
  verifyTokenAndExtractUser,
  checkRole(["headteacher", "teacher"]),
  async (req, res) => {
    const { courseId, topic, startingDateTime, endingDateTime, visible } = req.body;
    const userId = req.user.id; // The user creating the session (e.g., teacher)

    if (!courseId || !topic || !startingDateTime || !endingDateTime) {
      return res
        .status(400)
        .json({
          error: "Course ID, topic, starting and ending times, visibility are required.",
        });
    }

    try {
      const newClassSession = await ClassSession.create({
        courseId,
        topic,
        startingDateTime,
        endingDateTime,
        visible,
      });

      // Get all students enrolled in the course
      const studentRole = await UserRole.findOne({
        where: { name: "student" },
      });
      if (!studentRole) {
        return res
          .status(500)
          .json({
            error: "Student role not found. Please ensure roles are seeded.",
          });
      }

      const enrolledStudents = await UserCourseRole.findAll({
        where: { courseId: courseId, roleId: studentRole.id },
        include: [
          {
            model: User,
            as: "user",
            attributes: ["id"],
          },
        ],
      });

      // Create assessments for each enrolled student with a null grade
      const assessmentsToCreate = enrolledStudents.map((enrollment) => ({
        userId: enrollment.userId,
        classSessionId: newClassSession.id,
        grade: null, // Initial grade is null
      }));

      await Assessment.bulkCreate(assessmentsToCreate);

      // Create presence records for each enrolled student
      const presenceToCreate = enrolledStudents.map((enrollment) => ({
        userId: enrollment.userId,
        classSessionId: newClassSession.id,
        present: false, // Default to not present
      }));

      await Presence.bulkCreate(presenceToCreate);

      res.status(201).json({
        classSession: newClassSession,
        assessmentsCreated: assessmentsToCreate.length,
        presenceRecordsCreated: presenceToCreate.length,
        visible: visible,
      });
    } catch (error) {
      console.error("Error creating class session and assessments:", error);
      res
        .status(500)
        .json({ error: "Failed to create class session and assessments." });
    }
  },
);

/**
 * POST /:classSessionId/submit_raport
 * Body: { description, userIds[], fileIds[] }
 * Files are already uploaded; only their IDs are sent.
 */
class_sessions_router.post(
  "/:classSessionId/submit_raport",
  verifyTokenAndExtractUser,
  async (req, res) => {
    const classSessionId = req.params.classSessionId;
    const { description, userIds, fileIds } = req.body; // now expecting fileIds
    const submittingUserId = req.user.id;
  console.log(classSessionId);
    if (!classSessionId) {
      return res.status(400).json({ error: "Class Session ID is required." });
    }
   
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res
        .status(400)
        .json({ error: "At least one user ID is required for the raport." });
    }

    try {
      const classSession = await ClassSession.findByPk(classSessionId, {
        include: [{ model: db.Course, as: "course" }],
      });
      if (!classSession) {
        return res.status(404).json({ error: "Class session not found." });
      }

      // Create a new Section with 'Pending' status
      const pendingStatus = await Status.findOne({ where: { name: "Pending" } });
      if (!pendingStatus) throw new Error("Pending status not found");

      const newSection = await Section.create({
        name: `Raport Section for Class Session ${classSessionId} by User ${submittingUserId}`,
        statusId: pendingStatus.id,
      });

      // Associate all specified users with the new Section
      const userSectionsToCreate = userIds.map((id) => ({
        userId: id,
        sectionId: newSection.id,
      }));
      await UserSection.bulkCreate(userSectionsToCreate);

      // Create the Raport
      const newRaport = await Raport.create({
        description,
        classSessionId,
        sectionId: newSection.id,
      });

      // Associate already uploaded files (fileIds)
      if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
        const raportFilesToCreate = fileIds.map((fileId) => ({
          raportId: newRaport.id,
          fileId: fileId,
        }));
        await RaportFile.bulkCreate(raportFilesToCreate);
      }

      // Create notifications for other users in the raport
      const otherUserIds = userIds.filter((id) => id !== submittingUserId);
      const notificationsToCreate = otherUserIds.map((id) => ({
        userId: id,
        message: `You have been added to a section in course '${classSession.course.title}' for the class '${classSession.topic}'.`,
        type: "raport_section_addition",
        isRead: false,
        sectionId: newSection.id,
      }));
      await Notification.bulkCreate(notificationsToCreate);

      res.status(201).json({
        message:
          "Raport submitted successfully, section created, and notifications sent.",
        raport: newRaport,
        section: newSection,
        notificationsSent: notificationsToCreate.length,
      });
    } catch (error) {
      console.error("Error submitting raport:", error);
      res.status(500).json({ error: "Failed to submit raport." });
    }
  },
);

/**
 * PUT /:raportId/edit_raport
 * Body: { description, deletedFileIds[], newFiles[] }
 * Allows a raport owner to edit the raport's description and manage associated files.
 */
class_sessions_router.put(
  "/:raportId/edit_raport",
  verifyTokenAndExtractUser,
  checkRole(["student", "teacher", "headteacher"]),
  checkRaportOwner,
  async (req, res) => {
    const raportId = req.params.raportId;
    const { description, deletedFilesId, newFilesId } = req.body;
    const raport = req.raport; // Raport object attached by checkRaportOwner middleware

    try {
      // Update raport description if provided
      if (description !== undefined) {
        raport.description = description;
        await raport.save();
      }

      // Handle file deletions
      if (
        deletedFilesId &&
        Array.isArray(deletedFilesId) &&
        deletedFilesId.length > 0
      ) {
        for (const fileId of deletedFilesId) {
          const raportFile = await RaportFile.findOne({
            where: { raportId: raport.id, fileId: fileId },
          });
          if (raportFile) {
            await raportFile.destroy(); // Delete association
            // Optionally, delete the file record if it's no longer associated with any raport
            const otherAssociations = await RaportFile.count({
              where: { fileId: fileId },
            });
            if (otherAssociations === 0) {
              await File.destroy({ where: { id: fileId } });
            }
          }
        }
      }

      // Handle new file associations
      if (newFilesId && Array.isArray(newFilesId) && newFilesId.length > 0) {
        const raportFilesToCreate = newFilesId.map((fileId) => ({
          raportId: raport.id,
          fileId: fileId,
        }));
        await RaportFile.bulkCreate(raportFilesToCreate);
      }

      res
        .status(200)
        .json({ message: "Raport updated successfully.", raport: raport });
    } catch (error) {
      console.error("Error editing raport:", error);
      res.status(500).json({ error: "Failed to edit raport." });
    }
  },
);
/**
 * GET /:courseId/classsessions/my_raports
 * Returns all class sessions for a course, each including the current user's raport (only files, no section).
 */
class_sessions_router.get(
  "/:courseId/classsessions",
  verifyTokenAndExtractUser,
  async (req, res) => {
    const { courseId } = req.params;
    const userId = req.user.id;

    if (!courseId) {
      return res.status(400).json({ error: "Course ID is required." });
    }

    try {
      const userCourseRole = await UserCourseRole.findOne({
        where: { userId, courseId },
        include: [{ model: UserRole, as: "role" }],
      });

      if (!userCourseRole) {
        return res
          .status(403)
          .json({ error: "Access denied. User not enrolled in this course." });
      }

      const userRoleName = userCourseRole.role.name;
      let whereClause = { courseId: courseId };

      if (userRoleName === "student") {
        whereClause.visible = true; 
      }

      const classSessions = await ClassSession.findAll({
        where: whereClause,
        order: [["startingDateTime", "ASC"]],
      });

      const sessionIds = classSessions.map((s) => s.id);

      const raports = await Raport.findAll({
        where: { classSessionId: sessionIds },
        include: [
          {
            model: Section,
            as: "section",
            include: [
              {
                model: User,
                as: "users",
                attributes: ["id"],
                through: { attributes: [] },
              },
            ],
          },
          {
            model: File,
            as: "files",
          },
        ],
      });

      // Map raport to its class session, filtering only those including the current user
      const sessionsWithRaports = classSessions.map((session) => {
        const myRaport = raports.find(
          (r) =>
            r.classSessionId === session.id &&
            r.section.users.some((u) => u.id === userId)
        );

        const raportForFrontend = myRaport
          ? {
              id: myRaport.id,
              description: myRaport.description,
              classSessionId: myRaport.classSessionId,
              sectionId: myRaport.sectionId,
              createdAt: myRaport.createdAt,
              updatedAt: myRaport.updatedAt,
              files: myRaport.files || [],
            }
          : null;

        return {
          ...session.toJSON(),
          raport: raportForFrontend,
        };
      });

      res.status(200).json(sessionsWithRaports);
    } catch (error) {
      console.error("Error fetching class sessions with raports:", error);
      res
        .status(500)
        .json({ error: "Failed to retrieve class sessions with raports." });
    }
  }
);


module.exports = class_sessions_router;
