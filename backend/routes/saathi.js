/**
 * Saathi chat route.
 *
 *   POST /api/saathi
 *       {
 *         "messages": [
 *           { "role": "user", "content": "..." }
 *         ],
 *         "context": {           // optional
 *           "user": { ... },
 *           "trip": { ... }
 *         }
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
 * step — the LLM answers from the Saathi system prompt alone. The optional
 * `context` object may carry minimal authenticated-user/trip context, which
 * is whitelisted and folded into the system prompt so replies stay
 * personalized without exposing database details back to the client.
 */

const express = require("express");

const {
  sendChatMessages,
} = require("../services/openRouterService");

const {
  buildSaathiSystemPrompt,
} = require("../utils/saathiPrompt");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { messages, context } = req.body ?? {};

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

    const systemPrompt = buildSaathiSystemPrompt(context);

    const content = await sendChatMessages(messages, {
      systemPrompt,
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