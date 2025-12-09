const express = require("express");
const files_router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const { verifyTokenAndExtractUser } = require("../helpers/authMiddleware");
const db = require("../models");
const File = db.File;
const RaportFile = db.RaportFile;
const CourseSection = db.CourseSection;
const Material = db.Material;
const Raport = db.Raport;
const Section = db.Section;
const UserCourseRole = db.UserCourseRole;
const UserRole = db.UserRole;
const UserSection = db.UserSection;

files_router.use(express.json());

// Ensure the uploads directory exists
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname); // Use original filename with timestamp to prevent overlaps
  },
});

const upload = multer({ storage: storage });

/**
 * POST /upload
 * Uploads a single file and saves its metadata to the database.
 */
files_router.post(
  "/upload",
  verifyTokenAndExtractUser,
  upload.single("file"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded." });
    }

    try {
      const newFile = await File.create({
        name: req.file.originalname,
        url: `/uploads/${req.file.filename}`,
        type: req.file.mimetype,
      });
      res.json({
          id: newFile.id,
          name: newFile.name,
          url: newFile.url,
          type: newFile.type,
      });
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({ error: "Failed to upload file." });
    }
  },
);

files_router.get(
  "/download/:fileId",
  verifyTokenAndExtractUser,
  async (req, res) => {
    const fileId = req.params.fileId;
    const userId = req.user.id;

    try {
     
      const file = await db.File.findByPk(fileId, {
        include: [
          {
            model: db.Material,
            as: "materials",
            include: [{ model: db.Course, as: "course" }],
          },
        ],
      });

      if (!file || file.materials.length === 0) {
        return res.status(404).json({ error: "File or material not found." });
      }

     
      const material = file.materials[0];
      const courseId = material.course.id;

    
      const userCourseRole = await UserCourseRole.findOne({
        where: { userId, courseId },
        include: [{ model: UserRole, as: "role" }],
      });

      const userRoleName = userCourseRole ? userCourseRole.role.name : null;

      if (
        !userCourseRole ||
        (!["headteacher", "teacher"].includes(userRoleName) && !material.visible)
      ) {
        return res.status(403).json({
          error: "Access denied. Material is not visible or user has insufficient role.",
        });
      }

      const filePath = path.join(__dirname, "..", file.url);

      if (fs.existsSync(filePath)) {
        res.download(filePath, file.name);
      } else {
        res.status(404).json({ error: "File not found on server." });
      }
    } catch (error) {
      console.error("Error downloading file:", error);
      res.status(500).json({ error: "Failed to download file." });
    }
  }
);

files_router.get(
  "/download-raport/:fileId",
  verifyTokenAndExtractUser,
  async (req, res) => {
    const fileId = req.params.fileId;
    const userId = req.user.id;

    try {
      // Find file and its raport association
      const file = await db.File.findByPk(fileId, {
        include: [
          {
            model: db.Raport,
            as: "raports",
            include: [
              {
                model: db.ClassSession,
                as: "classSession",
                include: [{ model: db.Course, as: "course" }],
              },
            ],
          },
        ],
      });

      if (!file || file.raports.length === 0) {
        return res.status(404).json({ error: "File or raport not found." });
      }

      const raport = file.raports[0];
      const courseId = raport.classSession.course.id;

      // Check user enrollment
      const userCourseRole = await db.UserCourseRole.findOne({
        where: { userId, courseId },
        include: [{ model: db.UserRole, as: "role" }],
      });

      if (!userCourseRole) {
        return res.status(403).json({
          error: "Access denied. User not enrolled in this course.",
        });
      }

      // Optional: you can add further checks (e.g., only headteacher/teacher can download all raports)

      const filePath = path.join(__dirname, "..", file.url);

      if (fs.existsSync(filePath)) {
        return res.download(filePath, file.name);
      } else {
        return res.status(404).json({ error: "File not found on server." });
      }
    } catch (error) {
      console.error("Error downloading raport file:", error);
      res.status(500).json({ error: "Failed to download file." });
    }
  }
);


module.exports = files_router;
