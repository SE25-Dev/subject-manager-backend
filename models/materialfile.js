const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const MaterialFile = sequelize.define('MaterialFile', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true,
        },
        materialId: {
            type: DataTypes.INTEGER,
            references: {
                model: 'materials',
                key: 'id',
            },
        },
        fileId: {
            type: DataTypes.INTEGER,
            references: {
                model: 'files',
                key: 'id',
            },
        },
    }, {
        tableName: 'material_files',
        timestamps: false,
    });

    return MaterialFile;
};