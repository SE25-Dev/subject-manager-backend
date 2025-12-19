require("dotenv").config();
const bcrypt = require("bcryptjs");
const db = require("./models");

const SYNC_OPTIONS = { alter: true };

async function syncDatabase() {
  try {
    console.log("Starting database synchronization...");

    await db.sequelize.authenticate();
    console.log(
      "Connection to the database has been established successfully.",
    );

    await db.sequelize.sync(SYNC_OPTIONS);
    console.log("All models were synchronized successfully!");

    await seedUserRoles();
    await seedStatuses();
    if (process.env.NODE_ENV === "development") {
      await seedTestUser();
    }
    await seedSuperUser();
  } catch (error) {
    console.error("Unable to synchronize the database:", error);
  } finally {
    await db.sequelize.close();
  }
}

async function seedUserRoles() {
  try {
    const roles = ["headteacher", "teacher", "student"];
    for (const roleName of roles) {
      await db.UserRole.findOrCreate({
        where: { name: roleName },
        defaults: { name: roleName },
      });
    }
    console.log("User roles seeded successfully.");
  } catch (err) {
    console.error("Error seeding user roles:", err);
    throw err;
  }
}

async function seedStatuses() {
  try {
    const statuses = ["Active", "Pending", "Archived"];
    for (const statusName of statuses) {
      await db.Status.findOrCreate({
        where: { name: statusName },
        defaults: { name: statusName },
      });
    }
    console.log("Statuses seeded successfully.");
  } catch (err) {
    console.error("Error seeding statuses:", err);
    throw err;
  }
}

async function seedTestUser() {
  const userData = {
    firstName: "Jon",
    lastName: "Snow",
    email: null,
    username: "testuser",
    password: "$2b$10$vp8H9wEMDSmZcQUkIBp8oeZgz8gvKGv3El8fZeFbPydJyxCLtssma", // "test"
  };
  try {
    await db.User.findOrCreate({
      where: { username: userData.username },
      defaults: userData,
    });
    console.log("Test user seeded successfully.");
  } catch (err) {
    console.error("Error seeding test user:", err);
    throw err;
  }
}

async function seedSuperUser() {
  const superuserPassword = await bcrypt.hash("superuser", 10);
  const superUserData = {
    firstName: "Super",
    lastName: "User",
    email: "superuser@example.com",
    username: "superuser",
    password: superuserPassword,
    superuser: true,
  };
  try {
    await db.User.findOrCreate({
      where: { username: superUserData.username },
      defaults: superUserData,
    });
    console.log("Superuser seeded successfully.");
  } catch (err) {
    console.error("Error seeding superuser:", err);
    throw err;
  }
}

if (require.main === module) {
  syncDatabase();
}
