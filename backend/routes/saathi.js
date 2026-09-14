/**
 * Saathi chat route.
 *
 *   POST /api/saathi
 *       {
 *         "messages": [
 *           { "role": "user", "content": "..." }
 *         ]
 *       }
 *
 * Returns:
 *       {
 *         "message": {
 *           "role": "assistant",
 *           "content": "..."
 *         }
 *       }
 *
 * The frontend never learns anything about the model/provider: it only
 * receives the assistant reply. No tool/function calling is wired in this
 * step — Gemma answers from the Saathi system prompt alone.
 */

const express = require("express");

const {
  sendChatMessages,
} = require("../services/openRouterService");

const {
  SAATHI_SYSTEM_PROMPT,
} = require("../utils/saathiPrompt");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { messages } = req.body ?? {};

    if (!Array.isArray(messages)) {
      return res.status(400).json({
        message: "A messages array is required.",
      });
    }

    if (messages.length === 0) {
      return res.status(400).json({
        message: "messages must not be empty.",
      });
    }

    for (const message of messages) {
      if (!message || typeof message !== "object") {
        return res.status(400).json({
          message: "Each message must be an object.",
        });
      }

      const role = String(message.role ?? "").trim();
      const content = String(message.content ?? "").trim();

      if (
        !["user", "assistant", "system"].includes(role) ||
        !content
      ) {
        return res.status(400).json({
          message:
            "Each message needs a valid role and non-empty content.",
        });
      }
    }

    const content = await sendChatMessages(messages, {
      systemPrompt: SAATHI_SYSTEM_PROMPT,
    });

    return res.json({
      message: {
        role: "assistant",
        content,
      },
    });
  } catch (error) {
    console.error(
      "[Saathi] chat error:",
      error.message || error
    );

    return res.status(502).json({
      message: "Unable to reach Saathi right now.",
    });
  }
});

module.exports = router;