const express = require("express");
const files_router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const { verifyTokenAndExtractUser } = require('../helpers/authMiddleware');
const db = require('../models');
const File = db.File;

files_router.use(express.json());

// Ensure the uploads directory exists
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname); // Use original filename with timestamp to prevent overlaps
    }
});

const upload = multer({ storage: storage });

/**
 * POST /upload
 * Uploads a single file and saves its metadata to the database.
 */
files_router.post("/upload", verifyTokenAndExtractUser, upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded." });
    }

    try {
        const newFile = await File.create({
            name: req.file.originalname,
            url: `/uploads/${req.file.filename}`,
            type: req.file.mimetype,
        });
        res.json({ message: "File uploaded successfully", file: { id: newFile.id, name: newFile.name, url: newFile.url, type: newFile.type } });
    } catch (error) {
        console.error("Error uploading file:", error);
        res.status(500).json({ error: "Failed to upload file." });
    }
});

/**
 * GET /download/:materialFileId
 * Downloads a file associated with a material, identified by MaterialFile ID.
 */
files_router.get("/download/:materialFileId", verifyTokenAndExtractUser, async (req, res) => {
    const materialFileId = req.params.materialFileId;
    const userId = req.user.id;

    try {
        const materialFile = await db.MaterialFile.findByPk(materialFileId, {
            include: [{
                model: db.Material,
                as: 'Material',
                include: [{
                    model: db.Course,
                    as: 'course'
                }]
            }, {
                model: db.File,
                as: 'File'
            }]
        });

        if (!materialFile) {
            return res.status(404).json({ error: "Material file not found." });
        }

        const courseId = materialFile.Material.course.id;

        // Check if user is enrolled in the course
        const userCourseRole = await db.UserCourseRole.findOne({
            where: { userId, courseId }
        });

        if (!userCourseRole) {
            return res.status(403).json({ error: "Access denied. User is not enrolled in this course." });
        }

        const filePath = path.join(__dirname, '..', materialFile.File.url);

        if (fs.existsSync(filePath)) {
            res.download(filePath, materialFile.File.name);
        } else {
            res.status(404).json({ error: "File not found on server." });
        }

    } catch (error) {
        console.error("Error downloading file:", error);
        res.status(500).json({ error: "Failed to download file." });
    }
});

module.exports = files_router;