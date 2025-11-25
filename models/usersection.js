const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const UserSection = sequelize.define(
    "UserSection",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        references: {
          model: "users",
          key: "id",
        },
      },
      sectionId: {
        type: DataTypes.INTEGER,
        references: {
          model: "sections",
          key: "id",
        },
      },
    },
    {
      tableName: "user_sections",
      timestamps: false,
    },
  );

  return UserSection;
};
