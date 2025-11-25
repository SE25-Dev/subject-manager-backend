const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Status = sequelize.define(
    "Status",
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
    },
    {
      tableName: "statuses",
      timestamps: false,
    },
  );

  return Status;
};
