const express = require("express");
const materials_router = express.Router();

const cors = require("cors");
const jwt = require("jsonwebtoken");
const { Op } = require('sequelize');

const db = require('../../models');
const Material = db.Material;
const File = db.File;
const UserCourseRole = db.UserCourseRole;
const UserRole = db.UserRole;

materials_router.use(cors());
materials_router.use(express.json());

const verifyTokenAndExtractUser = (req, res, next) => {
    const token = req.params?.token || req.body?.jwt || req.query?.jwt || req.headers?.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: "No token provided." });
    }

    try {
        const decoded = jwt.verify(token, process.env.SECRET_KEY);
        req.user = { id: decoded.id };
        next();
    } catch (err) {
        console.error("JWT Verification Error:", err.message);
        return res.status(401).json({ error: "Invalid or expired token." });
    }
};

/**
 * GET /:courseId/materials
 * Returns a list of materials and associated files for a given course,
 * filtered by user role and material visibility.
 */
materials_router.get("/:courseId/get_materials", verifyTokenAndExtractUser, async (req, res) => {
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

const checkRole = (allowedRoles) => async (req, res, next) => {
    const courseId = req.params.courseId || req.body.courseId;
    const userId = req.user.id;

    if (!courseId) {
        return res.status(400).json({ error: "Course ID is required." });
    }

    try {
        const userCourseRole = await UserCourseRole.findOne({
            where: { userId, courseId },
            include: [{ model: UserRole, as: 'role' }]
        });

        if (!userCourseRole || !allowedRoles.includes(userCourseRole.role.name)) {
            return res.status(403).json({ error: "Access denied. Insufficient role." });
        }
        req.userRole = userCourseRole.role.name;
        next();
    } catch (error) {
        console.error("Error checking user role:", error);
        res.status(500).json({ error: "Failed to verify user role." });
    }
};

/**
 * POST /:courseId/new_materials
 * Creates a new material for a course. Only accessible by 'teacher' and 'headteacher'.
 * Body: { title, description, visible, fileIds[] }
 */
materials_router.post("/:courseId/new_materials", verifyTokenAndExtractUser, checkRole(['teacher', 'headteacher']), async (req, res) => {
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

module.exports = materials_router;
