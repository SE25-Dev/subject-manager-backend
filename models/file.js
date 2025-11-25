const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const File = sequelize.define(
    "File",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      url: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
    },
    {
      tableName: "files",
      timestamps: true,
    },
  );

  File.associate = (models) => {
    File.belongsToMany(models.Material, {
      through: models.MaterialFile,
      foreignKey: "fileId",
      as: "materials",
    });
    File.belongsToMany(models.Raport, {
      through: models.RaportFile,
      foreignKey: "fileId",
      as: "raports",
    });
  };

  return File;
};
