'use strict';

const fs = require('fs');
const path = require('path');
const Sequelize = require('sequelize');
const basename = path.basename(__filename);
const env = process.env.NODE_ENV || 'development';
const config = require(__dirname + '/../config/config.json')[env];
const db = {};

let sequelize;
if (config.use_env_variable) {
    sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
    sequelize = new Sequelize(config.database, config.username, config.password, config);
}

fs
    .readdirSync(__dirname)
    .filter(file => {
        return (file.indexOf('.') !== 0) && (file !== basename) && (file.slice(-3) === '.js');
    })
    .forEach(file => {
        const model = require(path.join(__dirname, file))(sequelize, Sequelize.DataTypes);
        db[model.name] = model;
    });

Object.keys(db).forEach(modelName => {
    if (db[modelName].associate) {
        db[modelName].associate(db);
    }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

// Function to seed UserRoles
db.sequelize.sync().then(async () => {
    const roles = ['headteacher', 'teacher', 'student'];
    for (const roleName of roles) {
        await db.UserRole.findOrCreate({
            where: { name: roleName },
            defaults: { name: roleName }
        });
    }
    console.log("User roles seeded successfully.");
}).catch(err => {
    console.error("Error seeding user roles:", err);
});

// Function to seed Statuses
db.sequelize.sync().then(async () => {
    const statuses = ['Active', 'Pending', 'Archived'];
    for (const statusName of statuses) {
        await db.Status.findOrCreate({
            where: { name: statusName },
            defaults: { name: statusName }
        });
    }
    console.log("Statuses seeded successfully.");
}).catch(err => {
    console.error("Error seeding statuses:", err);
});

module.exports = db;