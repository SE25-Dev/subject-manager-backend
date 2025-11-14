const express = require("express");
const flashcards_api = express.Router();

const cors = require("cors");
const jwt = require("jsonwebtoken");
const { Op, fn, col, literal } = require('sequelize');


const db = require('../models');
const Flashcard = db.Flashcard;
const UserFlashcard = db.UserFlashcard;
const Group = db.Group;
const UserGroup = db.UserGroup;
const ReviewEvent = db.ReviewEvent;

flashcards_api.use(cors());
flashcards_api.use(express.json());

const verifyTokenAndExtractUser = (req, res, next) => {
    const token = req.params?.token || req.body?.jwt || req.query?.jwt || req.headers?.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: "No token provided." });
    }

    try {
        const decoded = jwt.verify(token, process.env.SECRET_KEY);
        req.user = { id: decoded.id };
        next();
    } catch (err) {
        console.error("JWT Verification Error:", err.message);
        return res.status(401).json({ error: "Invalid or expired token." });
    }
};

/**
 * POST /new_card
 * Body: { jwt, group, front, back, importance, one_sided }
 */
flashcards_api.post("/new_card", verifyTokenAndExtractUser, async (req, res) => {
    const { group, front, backMeaning, backPronunciation, importance, one_sided } = req.body;
    const userId = req.user.id;

    const isOneSided = Boolean(one_sided);
    const isFrontEmpty = !front || front.length < 1;
    const isBackEmpty = (!backMeaning || backMeaning.length < 1) && (!backPronunciation || backPronunciation.length < 1);

    if ((isOneSided && isFrontEmpty && isBackEmpty) || (!isOneSided && (isFrontEmpty || isBackEmpty))) {
        return res.json("empty card");
    }

    if (!group || importance === undefined) {
        return res.status(400).json({ error: "Group ID and importance are required." });
    }

    try {
        await db.sequelize.transaction(async (t) => {
            const newFlashcard = await Flashcard.create({
                front: front,
                back_meaning: backMeaning || null,
                back_pronunciation: backPronunciation || null,
                one_sided: isOneSided,
                groupId: group,
                owner_id: userId
            }, { transaction: t });

            await UserFlashcard.create({
                flashcardId: newFlashcard.id,
                userId: userId,
                importance: importance,
                last_check: new Date(),
                seconds_till_review: 0,
                times_reviewed: 0,
                completion_percentage: 0,
                ease_factor: 2.5
            }, { transaction: t });

            res.json("success");
        });
    } catch (error) {
        console.error("Error adding flashcard:", error);
        res.status(500).json({ error: "Błąd" });
    }
});

/**
 * GET /get_cards?jwt=...&group=<groupId>
 * Returns all cards for a given group, including user's progress if present
 */
flashcards_api.get("/get_cards", verifyTokenAndExtractUser, async (req, res) => {
    const groupId = req.query.group;
    const userId = req.user.id;

    if (!groupId) {
        return res.status(400).json({ error: "Group ID is required." });
    }

    try {
        const cards = await Flashcard.findAll({
            where: { groupId },
            attributes: ['id', 'front', 'back_meaning', 'back_pronunciation', 'one_sided', 'groupId'],
            include: [{
                model: UserFlashcard,
                as: 'UserProgress',
                attributes: [
                    'importance',
                    'last_check',
                    'seconds_till_review',
                    'times_reviewed',
                    'completion_percentage',
                    'ease_factor'
                ],
                where: { userId: userId },
                required: false
            }],
        });

        const formattedCards = cards.map(card => {
            const progress = (card.UserProgress && card.UserProgress[0]) || {};
            return {
                id: card.id,
                front: card.front,
                backMeaning: card.back_meaning,
                backPronunciation: card.back_pronunciation,
                one_sided: card.one_sided,
                importance: progress.importance || null,
                last_check: progress.last_check || null,
                seconds: progress.seconds_till_review || 0,
                times_reviewed: progress.times_reviewed || 0,
                completion_percentage: progress.completion_percentage || 0,
                ease_factor: progress.ease_factor || null
            };
        });

        res.json(formattedCards);
    } catch (error) {
        console.error("Error fetching flashcards:", error);
        res.status(500).json({ error: "Błąd" });
    }
});

/**
 * POST /edit_card
 * Body: { jwt, id, front, back, importance, one_sided }
 */
flashcards_api.post("/edit_card", verifyTokenAndExtractUser, async (req, res) => {
    const { id, group, front, backMeaning, backPronunciation, importance, one_sided } = req.body;
    const userId = req.user.id;

    if (!id) return res.status(400).json({ error: "Card ID is required." });

    const isOneSided = Boolean(one_sided);
    const isFrontEmpty = !front || front.length < 1;
    const isBackEmpty = (!backMeaning || backMeaning.length < 1) && (!backPronunciation || backPronunciation.length < 1);

    if ((isOneSided && isFrontEmpty && isBackEmpty) || (!isOneSided && (isFrontEmpty || isBackEmpty))) {
        return res.json("empty card");
    }

    try {
        await db.sequelize.transaction(async (t) => {
           await Flashcard.update({
                front: front,
                back_meaning: backMeaning || null,
                back_pronunciation: backPronunciation || null,
                one_sided: isOneSided,
            }, {
                where: { id },
                transaction: t
            });
            // upsert user-specific values like importance
            await UserFlashcard.upsert({
                flashcardId: id,
                userId: userId,
                importance: importance
            }, { transaction: t });

            res.json("success");
        });
    } catch (error) {
        console.error("Error editing flashcard:", error);
        res.status(500).json({ error: "Błąd" });
    }
});

/**
 * POST /update_card
 * Body: { jwt, id, difficulty, seconds, importance }
 *
 * The frontend sends review results here. We update user progress fields.
 */
flashcards_api.post("/update_card", verifyTokenAndExtractUser, async (req, res) => {
    const { id, difficulty, importance } = req.body; // difficulty: 0-3 (0:hard, 1:medium, 2:easy, 3:very easy)
    const userId = req.user.id;

    if (!id) return res.status(400).json({ error: "Card ID is required." });
    if (typeof difficulty === 'undefined') return res.status(400).json({ error: "Difficulty is required." });

    try {
        const flashcard = await Flashcard.findByPk(id);
        if (!flashcard) {
            return res.status(404).json({ error: "Flashcard not found." });
        }
        const groupId = flashcard.groupId;

        let userFlashcard = await UserFlashcard.findOne({
            where: { flashcardId: id, userId }
        });

        // Store old values before update
        const oldEaseFactor = userFlashcard ? userFlashcard.ease_factor : 2.5;
        const oldSecondsTillReview = userFlashcard ? userFlashcard.seconds_till_review : 0;
        const oldCompletionPercentage = userFlashcard ? userFlashcard.completion_percentage : 0;
        const oldTimesReviewed = userFlashcard ? userFlashcard.times_reviewed : 0;
        const oldImportance = userFlashcard ? userFlashcard.importance : (importance || 1);


        if (!userFlashcard) {
            // Create a new progress entry if missing
            userFlashcard = await UserFlashcard.create({
                flashcardId: id,
                userId,
                importance: importance || 1,
                last_check: new Date(),
                seconds_till_review: 0,
                times_reviewed: 0,
                completion_percentage: 0,
                ease_factor: 2.5
            });
        }

        // 1. Map difficulty to quality (0-5 scale for SM-2)
        let quality;
        if (difficulty === 0) quality = 0; // Hard
        else if (difficulty === 1) quality = 3; // Medium
        else if (difficulty === 2) quality = 4; // Easy
        else if (difficulty === 3) quality = 5; // Very Easy
        else quality = 3; // Default to medium if invalid difficulty

        // 2. Update ease_factor
        let newEaseFactor = userFlashcard.ease_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
        userFlashcard.ease_factor = Math.max(1.3, newEaseFactor);

        // 3. Update times_reviewed
        if (quality < 3) { // Failed to recall
            userFlashcard.times_reviewed = 0;
        } else {
            userFlashcard.times_reviewed += 1;
        }

        // 4. Update completion_percentage
        if (quality >= 3) {
            userFlashcard.completion_percentage = Math.min(100, userFlashcard.completion_percentage + 10);
        } else {
            userFlashcard.completion_percentage = Math.max(0, userFlashcard.completion_percentage - 20);
        }

        // 5. Calculate Base interval_days
        let interval_days;
        if (userFlashcard.times_reviewed === 0) {
            interval_days = 0.007; // Approximately 10 minutes for first review
        } else if (userFlashcard.times_reviewed === 1) {
            interval_days = 1; // 1 day
        } else if (userFlashcard.times_reviewed === 2) {
            interval_days = 6; // 6 days
        } else {
            // Previous interval in days multiplied by ease factor
            interval_days = (userFlashcard.seconds_till_review / (24 * 60 * 60)) * userFlashcard.ease_factor;
        }

        // 6. Apply importance and completion_percentage adjustments to interval_days
        const importance_multiplier = 1 - (userFlashcard.importance / 10); // importance 0: 1x, 1: 0.9x, 2: 0.8x, 3: 0.7x
        const completion_multiplier = 1 + (userFlashcard.completion_percentage / 200); // completion 0%: 1x, 50%: 1.25x, 100%: 1.5x
        let final_interval_days = interval_days * importance_multiplier * completion_multiplier;

        // Ensure minimum interval for failed cards
        if (quality < 3) {
            final_interval_days = 0.007; // Reset to 10 minutes if failed
        }

        // 7. Convert to seconds_till_review
        userFlashcard.seconds_till_review = Math.round(final_interval_days * 24 * 60 * 60);

        // 8. Update last_check
        userFlashcard.last_check = new Date();

        // 9. Update importance (if provided in request body)
        if (typeof importance !== 'undefined') {
            userFlashcard.importance = importance;
        }

        await userFlashcard.save(); // Save all updated fields

        // Store new values after update
        const newEaseFactorAfterSave = userFlashcard.ease_factor;
        const newSecondsTillReviewAfterSave = userFlashcard.seconds_till_review;
        const newCompletionPercentageAfterSave = userFlashcard.completion_percentage;
        const newTimesReviewedAfterSave = userFlashcard.times_reviewed;
        const newImportanceAfterSave = userFlashcard.importance;

        // Create ReviewEvent entry
        await ReviewEvent.create({
            userId: userId,
            flashcardId: id,
            groupId: groupId,
            reviewDate: new Date(),
            difficulty: difficulty,
            oldEaseFactor: oldEaseFactor,
            newEaseFactor: newEaseFactorAfterSave,
            oldSecondsTillReview: oldSecondsTillReview,
            newSecondsTillReview: newSecondsTillReviewAfterSave,
            oldCompletionPercentage: oldCompletionPercentage,
            newCompletionPercentage: newCompletionPercentageAfterSave,
            oldTimesReviewed: oldTimesReviewed,
            newTimesReviewed: newTimesReviewedAfterSave,
            importance: newImportanceAfterSave,
        });

        res.json("success");
    } catch (error) {
        console.error("Error updating card:", error);
        res.status(500).json({ error: "Błąd" });
    }
});


/**
 * DELETE /delete_card
 * Body: { jwt, id }
 * If user is owner -> delete Flashcard (and cascade). Otherwise remove only UserFlashcard row for user.
 */
flashcards_api.delete("/delete_card", verifyTokenAndExtractUser, async (req, res) => {
    const { id } = req.body;
    const userId = req.user.id;

    if (!id) return res.status(400).json({ error: "Card ID is required." });

    try {
        const flashcard = await Flashcard.findByPk(id);

        if (!flashcard) return res.status(404).json({ error: "Flashcard not found." });

        // Owner check; if your Flashcard model uses owner_id, adjust accordingly
        const isOwner = flashcard.owner_id && flashcard.owner_id === userId;

        if (isOwner) {
            await flashcard.destroy();
            return res.json("success");
        } else {
            const deleted = await UserFlashcard.destroy({
                where: { flashcardId: id, userId }
            });
            if (deleted === 0) {
                // nothing to delete for this user
                return res.status(404).json({ error: "User progress for this flashcard not found." });
            }
            return res.json("success");
        }
    } catch (error) {
        console.error("Error deleting flashcard:", error);
        res.status(500).json({ error: "Błąd" });
    }
});
flashcards_api.get("/get_soonest", verifyTokenAndExtractUser, async (req, res) => {
  const userId = req.user.id;

  try {
    const userGroups = await UserGroup.findAll({
      where: { userId },
      attributes: ['groupId'],
      include: [{ model: Group, as: 'Group', attributes: ['id', 'title', 'color'], required: true }]
    });

    if (!userGroups.length) return res.json([]);

    const soonestCardsPerGroup = [];

    for (const { groupId } of userGroups) {
      const userCards = await UserFlashcard.findAll({
        where: { userId, last_check: { [Op.not]: null } },
        include: [{
          model: Flashcard,
          as: 'Flashcard',
          where: { groupId },
          attributes: ['id', 'front', 'back_meaning', 'back_pronunciation', 'one_sided', 'groupId'],
          required: true
        }],
      });

      if (!userCards.length) continue;

      // Compute soonest due card manually in JS
      const now = Date.now() / 1000;
      let soonest = null;
      let minDue = Infinity;

      for (const card of userCards) {
        const lastCheck = new Date(card.last_check).getTime() / 1000;
        const dueTime = lastCheck + (card.seconds_till_review || 0);
        if (dueTime < minDue) {
          minDue = dueTime;
          soonest = card;
        }
      }

      if (soonest) {
        const cardData = soonest.Flashcard;
        soonestCardsPerGroup.push({
          id: cardData.id,
          front: cardData.front,
          backMeaning: cardData.back_meaning,
          backPronunciation: cardData.back_pronunciation,
          one_sided: cardData.one_sided,
          importance: soonest.importance,
          last_check: soonest.last_check,
          seconds: soonest.seconds_till_review,
          card_group_id: cardData.groupId,
        });
      }
    }

    res.json(soonestCardsPerGroup);
  } catch (error) {
    console.error("Error fetching soonest cards per group:", error);
    res.status(500).json({ error: "Błąd" });
  }
});
module.exports = flashcards_api;