const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Assessment = sequelize.define('Assessment', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        grade: {
            type: DataTypes.FLOAT,
            allowNull: true,
        },
        userId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'users',
                key: 'id',
            },
        },
        classSessionId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: 'class_sessions',
                key: 'id',
            },
        },
    }, {
        tableName: 'assessments',
        timestamps: true,
    });

    Assessment.associate = (models) => {
        Assessment.belongsTo(models.User, {
            foreignKey: 'userId',
            as: 'user',
        });
        Assessment.belongsTo(models.ClassSession, {
            foreignKey: 'classSessionId',
            as: 'classSession',
        });
    };

    return Assessment;
};