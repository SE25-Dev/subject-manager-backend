const { DataTypes } = require("sequelize");

module.exports = (sequelize) => {
  const Raport = sequelize.define(
    "Raport",
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      description: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "users",
          key: "id",
        },
      },
      classSessionId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "class_sessions",
          key: "id",
        },
      },
      sectionId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: "sections",
          key: "id",
        },
      },
    },
    {
      tableName: "raports",
      timestamps: true,
    },
  );

  Raport.associate = (models) => {
    Raport.belongsTo(models.User, {
      foreignKey: "userId",
      as: "author",
    });
    Raport.belongsTo(models.ClassSession, {
      foreignKey: "classSessionId",
      as: "classSession",
      onDelete: "CASCADE",
    });
    Raport.belongsTo(models.Section, {
      foreignKey: "sectionId",
      as: "section",
    });
    Raport.belongsToMany(models.File, {
      through: models.RaportFile,
      foreignKey: "raportId",
      as: "files",
    });
  };

  return Raport;
};
