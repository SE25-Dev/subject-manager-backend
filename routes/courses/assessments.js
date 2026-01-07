const express = require("express");
const assessments_router = express.Router();

const cors = require("cors");
const {
  verifyTokenAndExtractUser,
  checkRole,
} = require("../../helpers/authMiddleware");

const db = require("../../models");
const Assessment = db.Assessment;
const User = db.User;
const UserCourseRole = db.UserCourseRole;
const UserRole = db.UserRole;
const ClassSession = db.ClassSession;
const Raport = db.Raport;
const Section = db.Section;
const Status = db.Status;
const File = db.File;

assessments_router.use(cors());
assessments_router.use(express.json());

/**
 * GET /courses/:courseId/class_sessions/:classSessionId/assessments_and_raports
 * Returns a list of assessments for students, raports per section, and sections for a class session.
 * Only accessible by 'teacher' and 'headteacher'.
 */
assessments_router.get(
  "/:courseId/class_sessions/:classSessionId/assessments_and_raports",
  verifyTokenAndExtractUser,
  checkRole(["teacher", "headteacher"]),
  async (req, res) => {
    const { courseId, classSessionId } = req.params;

    try {
      const classSession = await ClassSession.findByPk(classSessionId);
      if (!classSession) {
        return res.status(404).json({ error: "Class session not found." });
      }

      if (classSession.courseId != courseId) {
        return res
          .status(400)
          .json({
            error: "Class session does not belong to the specified course.",
          });
      }

      // Fetch all assessments for the class session
      const assessments = await Assessment.findAll({
        where: { classSessionId: classSessionId },
        include: [
          {
            model: User,
            as: "user",
            attributes: ["id", "firstName", "lastName", "username"],
          },
        ],
        order: [[{ model: User, as: "user" }, "lastName", "ASC"]],
      });

      // Fetch all sections associated with raports for this class session
      const sections = await Section.findAll({
        include: [
          {
            model: Raport,
            as: "raports",
            where: { classSessionId: classSessionId },
            required: true, // Only include sections that have raports for this class session
            include: [
              {
                model: File,
                as: "files",
                attributes: ["id", "name", "type", "url"],
                through: { attributes: [] }, // Exclude join table attributes
              },
            ],
          },
          {
            model: Status,
            as: "status",
            attributes: ["name"],
          },
          {
            model: User,
            as: "users",
            attributes: ["id", "firstName", "lastName", "username"],
            through: { attributes: [] },
          },
        ],
        order: [["createdAt", "ASC"]],
      });

      // Process sections to conditionally include raport files
      const processedSections = sections.map((section) => {
        const sectionJson = section.toJSON();
        if (sectionJson.status.name === "Pending") {
          // Remove file information from raports if section status is 'Pending'
          sectionJson.raports = sectionJson.raports.map((raport) => {
            const { files, ...raportWithoutFiles } = raport;
            return raportWithoutFiles;
          });
        }
        return sectionJson;
      });

      res.status(200).json({
        assessments: assessments,
        sections: processedSections,
      });
    } catch (error) {
      console.error("Error fetching assessments and raports:", error);
      res
        .status(500)
        .json({ error: "Failed to fetch assessments and raports." });
    }
  },
);

/**
 * PUT /courses/:courseId/class_sessions/:classSessionId/assessments
 */
assessments_router.put(
  "/:courseId/class_sessions/:classSessionId/assessments",
  verifyTokenAndExtractUser,
  checkRole(["teacher", "headteacher"]),
  async (req, res) => {
    const { courseId, classSessionId } = req.params;
    const { userId, grade, feedback } = req.body; // feedback is extracted here

    // Basic validation
    if (!userId || grade === undefined) {
      return res.status(400).json({ error: "userId and grade are required." });
    }

    // Strict Validation: Range 0-5
    const numericGrade = parseFloat(grade);
    if (isNaN(numericGrade) || numericGrade < 0 || numericGrade > 5) {
      return res.status(400).json({ error: "Grade must be a number between 0 and 5." });
    }

    try {
      const classSession = await ClassSession.findByPk(classSessionId);
      if (!classSession) {
        return res.status(404).json({ error: "Class session not found." });
      }

      if (classSession.courseId != courseId) {
        return res.status(400).json({ 
          error: "Class session does not belong to the specified course." 
        });
      }

      const existingAssessment = await Assessment.findOne({
        where: {
          classSessionId: classSessionId,
          userId: userId
        }
      });

      let result;

      if (existingAssessment) {
        // --- FIX: Include feedback in update ---
        result = await existingAssessment.update({
          grade: numericGrade,
          feedback: feedback // Save the feedback
        });
      } else {
        // --- FIX: Include feedback in create ---
        result = await Assessment.create({
          classSessionId: parseInt(classSessionId),
          userId: userId,
          grade: numericGrade,
          feedback: feedback // Save the feedback
        });
      }

      res.status(200).json(result);

    } catch (error) {
      console.error("Error saving assessment:", error);
      res.status(500).json({ error: "Failed to save assessment." });
    }
  }
);

module.exports = assessments_router;
