const express = require("express");
const materials_router = express.Router();

const cors = require("cors");
const { verifyTokenAndExtractUser, checkRole } = require('../../helpers/authMiddleware');
const { Op } = require('sequelize');

const db = require('../../models');
const Material = db.Material;
const File = db.File;
const UserCourseRole = db.UserCourseRole;
const UserRole = db.UserRole;
const MaterialFile = db.MaterialFile; // Added MaterialFile model

const path = require('path');
const fs = require('fs');
const multer = require('multer');

materials_router.use(cors());
materials_router.use(express.json());

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadPath = path.join(__dirname, '../../uploads');
        fs.mkdirSync(uploadPath, { recursive: true });
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

/**
 * GET /:courseId/materials
 * Returns a list of materials and associated files for a given course,
 * filtered by user role and material visibility.
 */
materials_router.get("/:courseId/materials", verifyTokenAndExtractUser, async (req, res) => {
    const courseId = req.params.courseId;
    const userId = req.user.id;

    if (!courseId) {
        return res.status(400).json({ error: "Course ID is required." });
    }

    try {
        // Determine user's role in the course
        const userCourseRole = await UserCourseRole.findOne({
            where: { userId, courseId },
            include: [{ model: UserRole, as: 'role' }]
        });

        if (!userCourseRole) {
            return res.status(403).json({ error: "User is not enrolled in this course." });
        }

        const userRoleName = userCourseRole.role.name;

        let whereCondition = { courseId: courseId };

        // Students only see visible materials
        if (userRoleName === 'student') {
            whereCondition.visible = true;
        }

        const materials = await Material.findAll({
            where: whereCondition,
            attributes: ['id', 'title', 'description', 'visible'],
            include: [{
                model: File,
                as: 'files',
                attributes: ['id', 'name', 'type'],
                through: { attributes: ['id'] } // Include MaterialFile ID
            }],
            order: [['index', 'ASC']]
        });

        res.json(materials);

    } catch (error) {
        console.error("Error fetching materials:", error);
        res.status(500).json({ error: "Failed to fetch materials." });
    }
});

/**
 * POST /:courseId/new_materials
 * Creates a new material for a course. Only accessible by 'teacher' and 'headteacher'.
 * Body: { title, description, visible, fileIds[] }
 */
materials_router.post("/:courseId/materials", verifyTokenAndExtractUser, checkRole(['teacher', 'headteacher']), async (req, res) => {
    const courseId = req.params.courseId;
    const { title, description, visible, fileIds } = req.body;

    if (!title) {
        return res.status(400).json({ error: "Material title is required." });
    }

    try {
        const newMaterial = await Material.create({
            courseId: courseId,
            title: title,
            description: description,
            visible: visible !== undefined ? visible : true, // Default to true if not provided
            index: 0 // Placeholder, actual index logic might be more complex
        });

        if (fileIds && fileIds.length > 0) {
            const materialFiles = fileIds.map(fileId => ({
                materialId: newMaterial.id,
                fileId: fileId
            }));
            await db.MaterialFile.bulkCreate(materialFiles);
        }

        res.status(201).json({ message: "Material created successfully", material: newMaterial });

    } catch (error) {
        console.error("Error creating material:", error);
        res.status(500).json({ error: "Failed to create material." });
    }
});

/**
 * DELETE /:courseId/materials/:materialId
 * Deletes a material and its associated files. Only accessible by 'teacher' and 'headteacher'.
 */
materials_router.delete("/:courseId/materials/:materialId", verifyTokenAndExtractUser, checkRole(['teacher', 'headteacher']), async (req, res) => {
    const courseId = req.params.courseId; // Not directly used for deletion but for role check context
    const materialId = req.params.materialId;

    try {
        const material = await Material.findByPk(materialId, {
            include: [{
                model: File,
                as: 'files',
                through: { attributes: ['id'] }
            }]
        });

        if (!material) {
            return res.status(404).json({ error: "Material not found." });
        }

        // Delete associated files from the file system and database
        for (const file of material.files) {
            const filePath = path.join(__dirname, '../../uploads', file.MaterialFile.filename); // Assuming filename is stored in MaterialFile or File.url
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath); // Delete file from disk
            }
            await db.MaterialFile.destroy({ where: { id: file.MaterialFile.id } });
            await File.destroy({ where: { id: file.id } });
        }

        await material.destroy(); // Delete the material itself

        res.json({ message: "Material and associated files deleted successfully." });

    } catch (error) {
        console.error("Error deleting material:", error);
        res.status(500).json({ error: "Failed to delete material." });
    }
});

/**
 * PUT /:courseId/materials/:materialId/edit_material
 * Body: { title, description, visible, deletedFileIds[], newFileIds[] }
 * Allows 'teacher' and 'headteacher' to edit a material's details and manage associated files.
 */
materials_router.put("/:courseId/materials/:materialId", verifyTokenAndExtractUser, checkRole(['teacher', 'headteacher']), async (req, res) => {
    const courseId = req.params.courseId; // Used for role check context
    const materialId = req.params.materialId;
    const { title, description, visible, deletedFileIds, newFileIds } = req.body;

    try {
        const material = await Material.findByPk(materialId);

        if (!material) {
            return res.status(404).json({ error: "Material not found." });
        }

        // Update material properties if provided
        if (title !== undefined) material.title = title;
        if (description !== undefined) material.description = description;
        if (visible !== undefined) material.visible = visible;
        await material.save();

        // Handle file deletions
        if (deletedFileIds && Array.isArray(deletedFileIds) && deletedFileIds.length > 0) {
            for (const fileId of deletedFileIds) {
                const materialFile = await MaterialFile.findOne({ where: { materialId: material.id, fileId: fileId } });
                if (materialFile) {
                    // No need to delete from disk here, as files are managed by /routes/files.js
                    await materialFile.destroy(); // Delete association
                    // Optionally, delete the file record if it's no longer associated with any material
                    const otherAssociations = await MaterialFile.count({ where: { fileId: fileId } });
                    if (otherAssociations === 0) {
                        await File.destroy({ where: { id: fileId } });
                    }
                }
            }
        }

        // Handle new file associations
        if (newFileIds && Array.isArray(newFileIds) && newFileIds.length > 0) {
            const materialFilesToCreate = newFileIds.map(fileId => ({
                materialId: material.id,
                fileId: fileId,
            }));
            await MaterialFile.bulkCreate(materialFilesToCreate);
        }

        res.status(200).json({ message: "Material updated successfully.", material: material });

    } catch (error) {
        console.error("Error editing material:", error);
        res.status(500).json({ error: "Failed to edit material." });
    }
});

module.exports = materials_router;
