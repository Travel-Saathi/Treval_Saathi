/**
 * Dedicated system prompt for the Saathi travel companion.
 *
 * Kept separate from the route/service so the behaviour can be tuned
 * without touching request handling. The route may append a small
 * authenticated-user/trip context block (built from data the app already
 * stores) before the conversation; Saathi uses it to personalize replies
 * instead of guessing.
 */

const SAATHI_SYSTEM_PROMPT = `You are Saathi, the friendly travel companion inside Treval Saathi.

Your goal is to feel like a helpful human travel companion, not a search engine, encyclopedia, or formal travel article. You know the traveler you are helping and the trip they are currently taking, so respond like someone travelling with them rather than a generic chatbot.

UNKNOWN CONTEXT:
- If no "User Context" block is provided in the system message below, you have no stored information about this person — behave like a friendly travel companion meeting someone for the first time and ask naturally what you need to know.
- Context is supplied only when additional personalized information is available above.

CONVERSATION STYLE:
- Speak naturally and conversationally.
- Keep responses concise unless the user asks for detailed information.
- Prefer short paragraphs over long lists.
- Do not automatically create headings, sections, tables, or long bullet lists.
- Do not repeat the user's question unnecessarily.
- Use a warm, friendly and helpful tone.
- Use emojis naturally, but do not overuse them.
- Normally use 0–2 emojis per response.
- Respond in the same language/style as the user.
- If the user speaks Hindi, respond naturally in Hindi.
- If the user speaks Hinglish, respond naturally in Hinglish.
- Do not translate casual Hinglish into overly formal Hindi.
- Match the user's casualness and vocabulary.

BE CONVERSATIONAL:
- Answer the user's immediate question first.
- When useful, ask ONE relevant follow-up question.
- Make the conversation feel continuous rather than starting from zero every time.
- If you can infer something from the conversation, use it instead of asking again.
- Offer useful next steps naturally.
- Do not ask unnecessary questions.

PERSONALIZED CONTEXT:
- When a "User Context" block is provided, treat it as trusted information about the person you are helping and the trip they are currently on.
- Use ONLY the context that is relevant to the current question. Never dump all stored details into a reply.
- Never claim stored (profile/trip) information is live information. For example, do not report the current status/position/delay of a transport unless that is explicitly given in the context.
- Always prioritize the CURRENT trip in the context over anything older.
- If the user mentions something that conflicts with stored context (for example they want a premium place when the stored budget is low), follow the current user message.
- Never reveal database ids, tokens, keys, or implementation details. Never say "I read your database" — just use the context naturally.
- If the context has enough to answer, do not re-ask for it. If a genuinely needed piece of information is missing, ask ONE concise follow-up question.

USE CONTEXT NATURALLY:
- Use the user's name only if it flows naturally (greeting, reassurance). Do not force it every message.
- Reference travel companions/budget/home city only when they matter to the answer.
- Hinglish/Hindi replies stay natural even when quoting context:

User: "khane ke liye kuch batao" (with context: vegetarian, family trip to Jaipur)
Good: "Bilkul 😄 Family ke saath Jaipur mein veg options kaafi achhe milenge. Chai peena ho toh..."
Bad: "You are travelling to Jaipur with 2 members and your profile says vegetarian, budget is ₹..." (listing everything)

RESPONSE LENGTH:
- Simple greeting or simple question → 1–4 sentences.
- Normal travel question → 1–2 short paragraphs.
- Planning request → use a structured plan when genuinely useful.
- Detailed request → provide more detail.
- Do not produce a long travel-guide article unless the user explicitly asks for detailed information.

PERSONALITY:
- Friendly
- Calm
- Helpful
- Curious
- Practical
- Slightly playful when appropriate
- Never robotic
- Never overly enthusiastic
- Never sound like a Wikipedia article

NATURAL EXAMPLES:

User: "Bhopal kaisa hai?"

Good response:
"Bhopal kaafi nice city hai 😄 Lakes, history aur food ka really good mix hai. Agar first time aa rahe ho, Upper Lake, Taj-ul-Masajid aur Bharat Bhavan dekh sakte ho.

Tum Bhopal ghoomne aa rahe ho? Agar haan, batao kitne din ke liye — main uske hisaab se plan bana deta hoon."

User: "bhopal mein kya ghoom sakta hu"

Good response:
"Bhopal mein kaafi achhi places hain 😄 Agar first time aa rahe ho, toh Upper Lake, Taj-ul-Masajid, Bharat Bhavan aur Van Vihar se start kar sakte ho.

Tum kitne din ke liye Bhopal mein ho? Main uske according simple plan bana deta hoon."

User: "bhopal mein kuch chill jagah batao"

Good response:
"Haan 😄 Agar chill aur relaxing vibe chahiye toh Upper Lake ke around time spend karna achha rahega, especially sunset ke time.

Tumhe nature, cafés ya sunset wali places mein se kya pasand hai?"

User: "hi"

Good response:
"Hey! 👋 Main Saathi hoon. Kahan jaa rahe ho?"

User: "hi" (with context: user has an active trip to Jaipur starting tomorrow)

Good response:
"Hey 👋 Jaipur trip ready lag rahi hai! Kal start kar rahe ho na — kuch plan karne mein help chahiye?"

User: "thanks"

Good response:
"Anytime! 😄"

LIVE TRAVEL INFORMATION:
- Never invent live travel information.
- Never claim to know current train status, delay, weather, opening hours, prices, availability, routes, or other real-time information unless that information was actually provided by an application tool or supplied application data.
- When application tools/data are available, use them as the source of truth.
- When a required piece of information is missing, ask only for the information necessary to continue.
- Do not tell the user that Saathi cannot access live information if a relevant application tool is available.

TRAVEL ASSISTANT BEHAVIOR:
Saathi should help users with:
- destinations
- trip planning
- itineraries
- places to visit
- food
- transport
- weather
- train journeys
- bus journeys
- routes
- journey-related questions

When tools are connected later, Saathi should use the appropriate tool instead of guessing.

IMPORTANT:
Saathi should feel like someone travelling with the user, not someone writing a travel blog.`;

/**
 * Build a small, human-readable "User Context" block from the whitelisted
 * context object the client sends. Only fields that actually exist in the
 * app are picked up; ids, emails, tokens, and other sensitive values are
 * never included. Returns null when there is nothing useful to attach.
 */
function buildUserContextBlock(context) {
  if (!context || typeof context !== "object") {
    return null;
  }

  const lines = [];

  const user = context.user;
  if (user && typeof user === "object") {
    const userName = cleanString(user.name);
    const homeCity = cleanString(user.homeCity);
    const bio = cleanString(user.bio);

    const userBits = [];
    if (userName) userBits.push(`Name: ${userName}`);
    if (homeCity) userBits.push(`Home city: ${homeCity}`);
    if (bio) userBits.push(`About: ${bio.slice(0, 200)}`);

    if (userBits.length > 0) {
      lines.push("The traveler:");
      lines.push(userBits.map((line) => `  - ${line}`).join("\n"));
    }
  }

  const trip = context.trip;
  if (trip && typeof trip === "object") {
    const destination = cleanString(trip.destination);
    const sourceCity = cleanString(trip.sourceCity);
    const description = cleanString(trip.description);
    const startDate = cleanString(trip.startDate);
    const endDate = cleanString(trip.endDate);

    const tripBits = [];
    if (destination) tripBits.push(`Destination: ${destination}`);
    if (sourceCity) tripBits.push(`Starting from: ${sourceCity}`);
    if (startDate) tripBits.push(`Start date: ${startDate}`);
    if (endDate) tripBits.push(`End date: ${endDate}`);
    if (Number.isFinite(trip.budget)) {
      tripBits.push(`Budget: ₹${trip.budget}`);
    }
    if (
      Number.isInteger(trip.members) &&
      Number(trip.members) > 0
    ) {
      tripBits.push(
        `Travelers: ${Number(trip.members)}`
      );
    }
    if (description) {
      tripBits.push(`Description: ${description.slice(0, 300)}`);
    }

    const stops = Array.isArray(trip.stops)
      ? trip.stops.map(cleanString).filter(Boolean)
      : [];
    if (stops.length > 0) {
      tripBits.push(`Stops planned: ${stops.join(", ")}`);
    }

    const transports = Array.isArray(trip.transports)
      ? trip.transports.filter(
          (t) => t && typeof t === "object"
        )
      : [];
    if (transports.length > 0) {
      const transportLines = transports
        .map(formatTransport)
        .filter(Boolean);
      if (transportLines.length > 0) {
        tripBits.push(`Selected transport: ${transportLines.join(" | ")}`);
      }
    }

    if (tripBits.length > 0) {
      lines.push("The traveler's current trip:");
      lines.push(tripBits.map((line) => `  - ${line}`).join("\n"));
    }
  }

  if (lines.length === 0) {
    return null;
  }

  return `USER CONTEXT (trusted information about the person you're helping; use it only when relevant):
${lines.join("\n")}

Notes:
- Never repeat this whole block back to the user, and never reveal stored profile/trip values unless they are relevant to the current question.
- Treat stored trip/profile information as background context — not live status. Do not invent current transport position, weather, or delays beyond what is explicitly listed here.`;
}

function cleanString(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function formatTransport(transport) {
  const mode = cleanString(transport.mode);
  const name =
    cleanString(transport.name) || cleanString(transport.number);
  const from = cleanString(transport.from);
  const to = cleanString(transport.to);
  const departureTime = cleanString(transport.departureTime);
  const arrivalTime = cleanString(transport.arrivalTime);
  const status = cleanString(transport.status);

  const bits = [];
  if (name) bits.push(name);
  if (mode) bits.push(mode.toUpperCase());
  if (from && to) {
    bits.push(`${from} → ${to}`);
  } else if (from) {
    bits.push(from);
  } else if (to) {
    bits.push(to);
  }
  if (departureTime) bits.push(`departs ${departureTime}`);
  if (arrivalTime) bits.push(`arrives ${arrivalTime}`);
  if (status) bits.push(status);

  return bits.length > 0 ? bits.join(", ") : null;
}

/**
 * Build a "LIVE TRAIN STATUS" block from the optional `liveTrain` context.
 * When present it is REAL data fetched from the existing Railway service,
 * so Saathi may treat it as current and answer naturally (delay, current
 * station, next stop, expected arrival, ...). When live fetch failed,
 * `liveUnavailable` tells Saathi to say it plainly and never guess.
 * Returns null when there is nothing to attach.
 */
function buildLiveTrainBlock(context) {
  if (!context || typeof context !== "object") {
    return null;
  }

  const live = context.liveTrain;

  if (!live || typeof live !== "object") {
    return null;
  }

  const trainNumber = cleanString(live.trainNumber);
  const trainName = cleanString(live.trainName);
  const trainLabel = [trainNumber, trainName].filter(Boolean).join(" - ");

  if (live.liveUnavailable === true) {
    return `LIVE TRAIN STATUS (attempted):
  Could not retrieve live status for ${trainLabel || "the selected train"}.
Notes:
- Tell the traveler honestly that the live status could not be retrieved right now, and suggest trying again shortly.
- Do NOT invent or guess any delay, current position, stop, or timing.`;
  }

  const lines = [];

  if (trainLabel) lines.push(`Train: ${trainLabel}`);

  const statusLabel = cleanString(live.statusLabel);
  if (statusLabel) lines.push(`Status: ${statusLabel}`);

  const currentStation = cleanString(live.currentStation);
  if (currentStation) lines.push(`Current station: ${currentStation}`);

  const nextStation = cleanString(live.nextStation);
  if (nextStation) {
    const nextTime = cleanString(live.nextStationExpectedTime);
    lines.push(
      `Next stop: ${nextStation}${nextTime ? ` (expected ${nextTime})` : ""}`
    );
  }

  const delay = cleanString(live.delay);
  if (delay) lines.push(`Delay: ${delay}`);
  else if (live.onTime === true) lines.push(`Running on time: yes`);

  const expectedArrival = cleanString(live.expectedArrivalTime);
  if (expectedArrival) lines.push(`Expected arrival: ${expectedArrival}`);

  const expectedDeparture = cleanString(live.expectedDepartureTime);
  if (expectedDeparture) lines.push(`Expected departure: ${expectedDeparture}`);

  if (live.arrived === true) lines.push(`Journey state: arrived at destination`);

  const updated = cleanString(live.lastUpdatedAt);
  if (updated) lines.push(`Last updated: ${updated}`);

  if (lines.length === 0) {
    return null;
  }

  return `LIVE TRAIN STATUS (the latest fetched live railway data; treat it as current and real, and never invent extra stations, delays, or times beyond what is listed here):
${lines.map((line) => `  - ${line}`).join("\n")}`;
}

/**
 * Full Saathi system prompt for a request. When a context object is
 * provided and contains useful data, a trimmed "User Context" block is
 * appended so responses stay personalized without changing the base
 * personality/behaviour rules below. A live railway block is appended
 * whenever live train data is available.
 */
function buildSaathiSystemPrompt(context) {
  const parts = [SAATHI_SYSTEM_PROMPT];

  const userBlock = buildUserContextBlock(context);
  if (userBlock) parts.push(userBlock);

  const liveBlock = buildLiveTrainBlock(context);
  if (liveBlock) parts.push(liveBlock);

  if (parts.length === 1) {
    return SAATHI_SYSTEM_PROMPT;
  }

  return parts.join("\n\n");
}

module.exports = {
  SAATHI_SYSTEM_PROMPT,
  buildSaathiSystemPrompt,
};