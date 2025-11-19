const jwt = require("jsonwebtoken");
const db = require('../models');
const UserCourseRole = db.UserCourseRole;
const UserRole = db.UserRole;
const User = db.User; // Added for verifySuperuser

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

const verifySuperuser = async (req, res, next) => {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user || !user.superuser) {
            return res.status(403).json({ error: "Access denied. Superuser privileges required." });
        }
        next();
    } catch (error) {
        console.error("Superuser verification error:", error);
        res.status(500).json({ error: "Internal server error during superuser verification." });
    }
};

module.exports = {
    verifyTokenAndExtractUser,
    checkRole,
    verifySuperuser
};