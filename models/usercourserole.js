const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const UserCourseRole = sequelize.define('UserCourseRole', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id',
            },
        },
        courseId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'courses',
                key: 'id',
            },
        },
        roleId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'user_roles',
                key: 'id',
            },
        },
    }, {
        tableName: 'user_course_roles',
        timestamps: true,
    });

    UserCourseRole.associate = (models) => {
        UserCourseRole.belongsTo(models.User, {
            foreignKey: 'userId',
            as: 'user',
        });
        UserCourseRole.belongsTo(models.Course, {
            foreignKey: 'courseId',
            as: 'course',
        });
        UserCourseRole.belongsTo(models.UserRole, {
            foreignKey: 'roleId',
            as: 'role',
        });
    };

    return UserCourseRole;
};