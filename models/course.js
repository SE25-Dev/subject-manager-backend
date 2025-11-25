const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Course = sequelize.define(
    "Course",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      password: {
        type: DataTypes.STRING,
        allowNull: true,
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
      tableName: "courses",
      timestamps: true,
    },
  );

  Course.associate = (models) => {
    Course.belongsTo(models.Status, {
      foreignKey: "statusId",
      as: "status",
    });
    Course.belongsToMany(models.Section, {
      through: models.CourseSection,
      foreignKey: "courseId",
      as: "sections",
    });
    Course.belongsToMany(models.User, {
      through: models.UserCourseRole,
      foreignKey: "courseId",
      as: "usersWithRoles",
    });
  };

  return Course;
};
