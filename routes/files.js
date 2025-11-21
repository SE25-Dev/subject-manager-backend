const express = require("express");
const files_router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const { verifyTokenAndExtractUser } = require('../helpers/authMiddleware');
const db = require('../models');
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
    let courseId; // Declare courseId here

    try {
        const materialFile = await db.MaterialFile.findByPk(materialFileId, {
            include: [{
                model: Material,
                as: 'Material',
                include: [{
                    model: db.Course,
                    as: 'course'
                }]
            }, {
                model: File,
                as: 'File'
            }]
        });

        if (!materialFile) {
            return res.status(404).json({ error: "Material file not found." });
        }

        courseId = materialFile.Material.course.id; // Assign value to declared courseId

        // Check user's role in the course
        const userCourseRole = await UserCourseRole.findOne({
            where: { userId, courseId },
            include: [{ model: UserRole, as: 'role' }]
        });

        const userRoleName = userCourseRole ? userCourseRole.role.name : null;

        if (!userCourseRole || (!['headteacher', 'teacher'].includes(userRoleName) && !materialFile.Material.visible)) {
            return res.status(403).json({ error: "Access denied. Material is not visible or user has insufficient role." });
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

/**
 * GET /download/:raportFileId
 * Downloads a file associated with a raport, identified by RaportFile ID.
 */
files_router.get("/download/:raportFileId", verifyTokenAndExtractUser, async (req, res) => {
    const raportFileId = req.params.raportFileId;
    const userId = req.user.id;

    try {
        const raportFile = await RaportFile.findByPk(raportFileId, {
            include: [{
                model: Raport,
                as: 'Raport',
                include: [{
                    model: Section,
                    as: 'Section'
                }]
            }, {
                model: File,
                as: 'File'
            }]
        });

        if (!raportFile) {
            return res.status(404).json({ error: "Raport file not found." });
        }

        const sectionId = raportFile.Raport.Section.id;

        // Check user's role in any course associated with this section
        const courseSections = await CourseSection.findAll({
            where: { sectionId: sectionId }
        });

        let canDownload = false;
        for (const cs of courseSections) {
            const userCourseRole = await UserCourseRole.findOne({
                where: { userId, courseId: cs.courseId },
                include: [{ model: UserRole, as: 'role' }]
            });

            if (userCourseRole && (userCourseRole.role.name === 'headteacher' || userCourseRole.role.name === 'teacher')) {
                canDownload = true;
                break;
            }
        }

        if (!canDownload) {
            // If not headteacher/teacher, check if user is directly associated with the section
            const userSection = await UserSection.findOne({
                where: { userId, sectionId }
            });

            if (!userSection) {
                return res.status(403).json({ error: "Access denied. User has insufficient role or is not associated with this section." });
            }
        }

        const filePath = path.join(__dirname, '..', raportFile.File.url);

        if (fs.existsSync(filePath)) {
            res.download(filePath, raportFile.File.name);
        } else {
            res.status(404).json({ error: "File not found on server." });
        }

    } catch (error) {
        console.error("Error downloading raport file:", error);
        res.status(500).json({ error: "Failed to download raport file." });
    }
});

module.exports = files_router;