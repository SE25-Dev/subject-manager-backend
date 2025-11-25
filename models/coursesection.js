const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const CourseSection = sequelize.define(
    "CourseSection",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      courseId: {
        type: DataTypes.INTEGER,
        references: {
          model: "courses",
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
      tableName: "course_sections",
      timestamps: false,
    },
  );

  return CourseSection;
};
