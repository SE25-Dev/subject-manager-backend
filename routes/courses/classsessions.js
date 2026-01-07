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
const MaterialFile = db.MaterialFile;

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
    const { description, userIds, fileIds } = req.body;
    const submittingUserId = req.user.id;

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


      const submittingUser = await db.User.findByPk(submittingUserId);
      if (!submittingUser) {
        return res.status(404).json({ error: "Submitting user not found." });
      }

      // Determine status: "Active" if single user, "Pending" if multiple users
      const targetStatusName = userIds.length === 1 ? "Active" : "Pending";
      
      const status = await Status.findOne({ where: { name: targetStatusName } });
      if (!status) throw new Error(`${targetStatusName} status not found`);

      const newSection = await Section.create({
        name: `Raport Section for ${classSession.topic} by ${submittingUser.firstName} ${submittingUser.lastName}`,
        statusId: status.id,
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
        userId: submittingUserId,
      });

      // Associate already uploaded files (fileIds)
      if (fileIds && Array.isArray(fileIds) && fileIds.length > 0) {
        const raportFilesToCreate = fileIds.map((fileId) => ({
          raportId: newRaport.id,
          fileId: fileId,
        }));
        await RaportFile.bulkCreate(raportFilesToCreate);
      }

      const otherUserIds = userIds.filter((id) => id !== submittingUserId);
      
      let notificationsToCreate = [];
      if (otherUserIds.length > 0) {
          notificationsToCreate = otherUserIds.map((id) => ({
            userId: id,
            message: `You have been invited to join the section in course '${classSession.course.title}'. Do you accept?`,
            type: "raport_section_addition",
            isRead: false,
            sectionId: newSection.id,
          }));
          await Notification.bulkCreate(notificationsToCreate);
      }

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
 * Body: { description, deletedFileIds[], newFileIds[] }
 */
class_sessions_router.put(
  "/:raportId/edit_raport",
  verifyTokenAndExtractUser,
  checkRaportOwner,
  async (req, res) => {
    const raportId = req.params.raportId;
    const { description, deletedFileIds, newFileIds } = req.body;
    const raport = req.raport;

    try {
      if (description !== undefined) {
        raport.description = description;
        await raport.save();
      }

      // 2. Handle File Deletions
      if (deletedFileIds && Array.isArray(deletedFileIds) && deletedFileIds.length > 0) {
        for (const fileId of deletedFileIds) {
          
          // Remove the link between Raport and File
          const raportFile = await RaportFile.findOne({
            where: { raportId: raport.id, fileId: fileId },
          });

          if (raportFile) {
            await raportFile.destroy(); // Link removed

            // FIX 2: SAFETY CHECK
            // Before deleting the actual file from disk, ensure NO OTHER Raport OR Material uses it.
            
            const otherRaportAssociations = await RaportFile.count({
              where: { fileId: fileId },
            });
            
            const materialAssociations = await MaterialFile.count({
              where: { fileId: fileId },
            });

            // Only delete if it is truly an orphan (0 usage)
            if (otherRaportAssociations === 0 && materialAssociations === 0) {
              const fileToDelete = await File.findByPk(fileId);
              if (fileToDelete) {
                const filePath = path.join(__dirname, "../../", fileToDelete.url); // Adjust path based on your folder structure
                if (fs.existsSync(filePath)) {
                  fs.unlinkSync(filePath);
                }
                await fileToDelete.destroy();
              }
            }
          }
        }
      }

      // 3. Handle New File Associations
      if (newFileIds && Array.isArray(newFileIds) && newFileIds.length > 0) {
        const raportFilesToCreate = newFileIds.map((fileId) => ({
          raportId: raport.id,
          fileId: fileId,
        }));
        await RaportFile.bulkCreate(raportFilesToCreate);
      }

      // Refresh raport to return updated data (optional but good for frontend)
      await raport.reload(); 

      res.status(200).json({ 
        message: "Raport updated successfully.", 
        raport: raport 
      });

    } catch (error) {
      console.error("Error editing raport:", error);
      res.status(500).json({ error: "Failed to edit raport." });
    }
  },
);

/**
 * GET /:courseId/classsessions
 * Returns all class sessions for a course.
 * Includes the current user's raport if:
 * 1. They are in the section AND the section is 'Active'.
 * 2. OR they are the OWNER of the raport (even if 'Pending').
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
      // 1. Check User Enrollment
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
      
      // 2. Determine Class Session Visibility
      let whereClause = { courseId: courseId };
      if (userRoleName === "student") {
        whereClause.visible = true;
      }

      // 3. Fetch Class Sessions
      const classSessions = await ClassSession.findAll({
        where: whereClause,
        order: [["startingDateTime", "ASC"]],
      });

      const sessionIds = classSessions.map((s) => s.id);

      // 4. Fetch Raports with Section, Status, and Section Users
      const raports = await Raport.findAll({
        where: { classSessionId: sessionIds },
        include: [
          {
            model: Section,
            as: "section",
            include: [
              {
                model: Status, // Include Status to check for 'Active'/'Pending'
                as: "status",
              },
              {
                model: User,
                as: "users",
                attributes: ["id", "firstName", "lastName", "username"], // Fetch user details
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

     const assessments = await Assessment.findAll({
        where: {
          classSessionId: sessionIds,
          userId: userId // Only get assessments for the requesting user
        },
        attributes: ['classSessionId', 'grade', 'feedback']
      });

      // 6. Map data to sessions
      const sessionsWithData = classSessions.map((session) => {
        
        // A. Handle Raport Logic (Existing)
        const myRaport = raports.find((r) => {
          if (r.classSessionId !== session.id) return false;
          const isMember = r.section.users.some((u) => u.id === userId);
          if (!isMember) return false;
          const isOwner = r.userId === userId; 
          const statusName = r.section.status ? r.section.status.name : "";
          const isActive = statusName === "Active";
          return isActive || isOwner;
        });

        let raportForFrontend = null;
        if (myRaport) {
          raportForFrontend = {
            id: myRaport.id,
            description: myRaport.description,
            classSessionId: myRaport.classSessionId,
            sectionId: myRaport.sectionId,
            createdAt: myRaport.createdAt,
            updatedAt: myRaport.updatedAt,
            files: myRaport.files || [],
            section: {
              id: myRaport.section.id,
              name: myRaport.section.name,
              statusId: myRaport.section.statusId,
              status: myRaport.section.status,
              users: myRaport.section.users,
            },
          };
        }

        // --- B. NEW: Handle Assessment Logic ---
        const myAssessment = assessments.find(a => a.classSessionId === session.id);

        return {
          ...session.toJSON(),
          raport: raportForFrontend,
          // Attach grade/feedback directly to the session object
          grade: myAssessment ? myAssessment.grade : null,
          feedback: myAssessment ? myAssessment.feedback : null
        };
      });

      res.status(200).json(sessionsWithData);
    } catch (error) {
      console.error("Error fetching class sessions with raports:", error);
      res
        .status(500)
        .json({ error: "Failed to retrieve class sessions with raports." });
    }
  }
);


module.exports = class_sessions_router;
