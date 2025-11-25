const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Section = sequelize.define(
    "Section",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
      statusId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "statuses",
          key: "id",
        },
      },
    },
    {
      tableName: "sections",
      timestamps: true,
    },
  );

  Section.associate = (models) => {
    Section.belongsTo(models.Status, {
      foreignKey: "statusId",
      as: "status",
    });
    Section.belongsToMany(models.User, {
      through: models.UserSection,
      foreignKey: "sectionId",
      as: "users",
    });
    Section.belongsToMany(models.Course, {
      through: models.CourseSection,
      foreignKey: "sectionId",
      as: "courses",
    });
    Section.hasMany(models.Raport, {
      foreignKey: "sectionId",
      as: "raports",
    });
  };

  return Section;
};
