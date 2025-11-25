const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Material = sequelize.define(
    "Material",
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
      index: {
        type: DataTypes.INTEGER,
        allowNull: false,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
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
      tableName: "materials",
      timestamps: true,
    },
  );

  Material.associate = (models) => {
    Material.belongsTo(models.Course, {
      foreignKey: "courseId",
      as: "course",
    });
    Material.belongsToMany(models.File, {
      through: models.MaterialFile,
      foreignKey: "materialId",
      as: "files",
    });
  };

  return Material;
};
