const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const ClassSession = sequelize.define(
    "ClassSession",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      topic: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      startingDateTime: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      endingDateTime: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      visible: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      courseId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "courses",
          key: "id",
        },
      },
    },
    {
      tableName: "class_sessions",
      timestamps: true,
    },
  );

  ClassSession.associate = (models) => {
    ClassSession.belongsTo(models.Course, {
      foreignKey: "courseId",
      as: "course",
    });
    ClassSession.hasMany(models.Raport, {
      foreignKey: "classSessionId",
      as: "raports",
      onDelete: "CASCADE",
    });
    ClassSession.hasMany(models.Assessment, {
      foreignKey: "classSessionId",
      as: "assessments",
    });
  };

  return ClassSession;
};
