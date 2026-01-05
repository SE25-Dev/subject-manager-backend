const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Presence = sequelize.define(
    "Presence",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      present: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      classSessionId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "class_sessions",
          key: "id",
        },
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
      },
    },
    {
      tableName: "presence",
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ["classSessionId", "userId"],
        },
      ],
    },
  );

  Presence.associate = (models) => {
    Presence.belongsTo(models.ClassSession, {
      foreignKey: "classSessionId",
      as: "classSession",
    });
    Presence.belongsTo(models.User, {
      foreignKey: "userId",
      as: "user",
    });
  };

  return Presence;
};
