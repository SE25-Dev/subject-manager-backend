const express = require("express");
const auth_api = express.Router();

const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { readFirstLine } = require("../helpers/utils");

const db_2 = require('../models_2'); // Using models_2
const User = db_2.User; // Using User from models_2

auth_api.use(cors());

const blacklistedTokens = new Set();

process.env.SECRET_KEY = readFirstLine("../keys/private_key.pub");

const objectWithoutKey = (object, key) => {
    const { [key]: deletedKey, ...otherKeys } = object;
    return otherKeys;
};

auth_api.post("/register", (req, res) => {
    const userData = {
        firstName: req.body.firstName,
        lastName: req.body.lastName,
        username: req.body.username,
        password: req.body.password,
    };

    // Email is not mandatory
    if (req.body.email) {
        userData.email = req.body.email;
    }

    User.findOne({
        where: {
            username: userData.username, // Check for username instead of login
        },
    })
        .then((user) => {
            if (!user || user == null) {
                let hash = bcrypt.hashSync(userData.password, 10);
                userData.password = hash;

                User.create(userData)
                    .then((user) => {
                        let token = jwt.sign(
                            objectWithoutKey(user.dataValues, "password"),
                            process.env.SECRET_KEY,
                            {
                                expiresIn: "2h",
                            }
                        );
                        res.json({
                            token: token,
                        });
                    })
                    .catch((error) => {
                        res.send("error: " + error);
                    });
            } else {
                res.json("usernametaken"); // Changed from logintaken
            }
        })
        .catch((error) => {
            res.json("error: " + error);
        });
});

auth_api.post("/login", (req, res) => {
    const userData = {
        username: req.body.username, // Changed from login
        password: req.body.password,
    };

    User.findOne({
        where: {
            username: userData.username, // Changed from login
        },
    })
        .then((user) => {
            if (user) {
                let pass = bcrypt.compareSync(userData.password, user.password);

                if (pass) {
                    let token = jwt.sign(
                        objectWithoutKey(user.dataValues, "password"),
                        process.env.SECRET_KEY,
                        {
                            expiresIn: "2h",
                        }
                    );
                    res.json({
                        token: token,
                    });
                } else {
                    res.json("wrongpassword");
                }
            } else {
                res.json("nouser");
            }
        })
        .catch((err) => {
            res.json("error: " + err);
        });
});

auth_api.post("/update_token", (req, res) => {
    const userData = {
        username: req.body.username, // Changed from login
    };

    User.findOne({
        where: {
            username: userData.username, // Changed from login
        },
    })
        .then((user) => {
            if (user) {
                let token = jwt.sign(
                    objectWithoutKey(user.dataValues, "password"),
                    process.env.SECRET_KEY,
                    {
                        expiresIn: 7200,
                    }
                );
                res.json({
                    token: token,
                });
            }
        })
        .catch((error) => {
            res.json("error" + error);
        });
});

auth_api.post("/logout", (req, res) => {
    const token = req.headers["authorization"]?.split(" ")[1]; // Assuming Bearer token
    if (!token) {
        return res.status(400).json({ message: "Token required" });
    }

    blacklistedTokens.add(token); // Add token to blacklist
    res.json({ message: "Logged out successfully" });
});

module.exports = auth_api;