const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const Notification = sequelize.define('Notification', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        message: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        isRead: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
        },
        type: {
            type: DataTypes.STRING,
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
        sectionId: {
            type: DataTypes.INTEGER,
            allowNull: true, // Optional field
            references: {
                model: 'sections',
                key: 'id',
            },
        },
    }, {
        tableName: 'notifications',
        timestamps: true,
    });

    Notification.associate = (models) => {
        Notification.belongsTo(models.User, {
            foreignKey: 'userId',
            as: 'user',
        });
        Notification.belongsTo(models.Section, {
            foreignKey: 'sectionId',
            as: 'section',
        });
    };

    return Notification;
};