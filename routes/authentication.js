const express = require("express");
const auth_api = express.Router();

const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { readFirstLine } = require("../helpers/utils");
const { verifyTokenAndExtractUser } = require('../helpers/authMiddleware');

const db_2 = require('../models_2'); // Using models_2
const User = db_2.User; // Using User from models_2

auth_api.use(cors());

const blacklistedTokens = new Set();

process.env.SECRET_KEY = readFirstLine("../keys/private_key.pub");

const objectWithoutKey = (object, key) => {
    const { [key]: deletedKey, ...otherKeys } = object;
    return otherKeys;
};

auth_api.post("/register", async (req, res) => {
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

    try {
        const user = await User.findOne({
            where: {
                username: userData.username,
            },
        });

        if (!user) {
            let hash = bcrypt.hashSync(userData.password, 10);
            userData.password = hash;

            const newUser = await User.create(userData);
            let token = jwt.sign(
                objectWithoutKey(newUser.dataValues, "password"),
                process.env.SECRET_KEY,
                {
                    expiresIn: "2h",
                }
            );
            res.json({ token: token });
        } else {
            res.status(409).json({ error: "Username already taken." });
        }
    } catch (error) {
        res.status(500).json({ error: "Registration failed: " + error });
    }
});

auth_api.post("/login", async (req, res) => {
    const userData = {
        username: req.body.username,
        password: req.body.password,
    };

    try {
        const user = await User.findOne({
            where: {
                username: userData.username,
            },
        });

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
                res.json({ token: token });
            } else {
                res.status(401).json({ error: "Wrong password." });
            }
        } else {
            res.status(404).json({ error: "User not found." });
        }
    } catch (err) {
        res.status(500).json({ error: "Login failed: " + err });
    }
});

auth_api.post("/update_token", verifyTokenAndExtractUser, async (req, res) => {
    const userId = req.user.id;

    try {
        const user = await User.findByPk(userId);

        if (user) {
            let token = jwt.sign(
                objectWithoutKey(user.dataValues, "password"),
                process.env.SECRET_KEY,
                {
                    expiresIn: 7200,
                }
            );
            res.json({ token: token });
        } else {
            res.status(404).json({ error: "User not found." });
        }
    } catch (error) {
        res.status(500).json({ error: "Token update failed: " + error });
    }
});

auth_api.post("/logout", verifyTokenAndExtractUser, (req, res) => {
    const token = req.headers["authorization"]?.split(" ")[1];
    if (!token) {
        return res.status(400).json({ message: "Token required" });
    }

    blacklistedTokens.add(token);
    res.json({ message: "Logged out successfully" });
});

module.exports = auth_api;