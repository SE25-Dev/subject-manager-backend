const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const CourseCreationRequest = sequelize.define('CourseCreationRequest', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        courseTitle: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        courseDescription: {
            type: DataTypes.TEXT,
            allowNull: true,
        },
        requestedBy: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id',
            },
        },
    }, {
        tableName: 'course_creation_requests',
        timestamps: true,
    });

    CourseCreationRequest.associate = (models) => {
        CourseCreationRequest.belongsTo(models.User, {
            foreignKey: 'requestedBy',
            as: 'requester',
        });
    };

    return CourseCreationRequest;
};