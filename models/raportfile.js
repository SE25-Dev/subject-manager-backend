const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const RaportFile = sequelize.define(
    "RaportFile",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      raportId: {
        type: DataTypes.INTEGER,
        references: {
          model: "raports",
          key: "id",
        },
      },
      fileId: {
        type: DataTypes.INTEGER,
        references: {
          model: "files",
          key: "id",
        },
      },
    },
    {
      tableName: "raport_files",
      timestamps: false,
    },
  );

  return RaportFile;
};
