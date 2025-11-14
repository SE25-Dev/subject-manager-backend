const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const User = sequelize.define('User', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        firstName: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        lastName: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        email: {
            type: DataTypes.STRING,
            allowNull: true,
            unique: true,
        },
        username: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        superuser: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
    }, {
        tableName: 'users',
        timestamps: true,
    });

    User.associate = (models) => {
        User.belongsToMany(models.Section, {
            through: models.UserSection,
            foreignKey: 'userId',
            as: 'sections',
        });
        User.hasMany(models.Assessment, {
            foreignKey: 'userId',
            as: 'assessments',
        });
        User.belongsToMany(models.Course, {
            through: models.UserCourseRole,
            foreignKey: 'userId',
            as: 'courseRoles',
        });
        User.hasMany(models.Notification, {
            foreignKey: 'userId',
            as: 'notifications',
        });
        User.hasMany(models.CourseCreationRequest, {
            foreignKey: 'requestedBy',
            as: 'courseCreationRequests',
        });
    };

    return User;
};