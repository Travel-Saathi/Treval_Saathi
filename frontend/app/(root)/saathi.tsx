import { useUser } from "@clerk/expo";
import { Ionicons } from "@expo/vector-icons";
import type { SupabaseClient } from "@supabase/supabase-js";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  ImageBackground,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSupabase } from "../../hook/usesupabase";
import {
  listUserTrips,
  toTripSummary,
  getTripDetails,
  type TripSummaryCard,
} from "../../services/liveTripsApi";
import {
  SaathiChatMessage,
  SaathiContext,
  SaathiContextLiveTrain,
  SaathiContextTrip,
  SaathiContextUser,
  sendSaathiMessage,
} from "../../services/saathiApi";
import {
  fetchLiveTrainStatus,
} from "../../services/liveTrainStatusApi";
import {
  listStops,
  listTransport,
  type TripRow,
  type TripStop,
  type TripTransport,
} from "../../services/tripsApi";
import { useAppTheme } from "../../src/theme/ThemeProvider";

const SAATHI_LOGO = require("../../assets/images/saathilogo.png");
const SAATHI_BG_LIGHT = require("../../assets/images/saathibglg.png");
const SAATHI_BG_DARK = require("../../assets/images/saathibgdk.png");

const SUGGESTED_CHIPS = [
  { label: "Places to visit", prompt: "Suggest places to visit near me." },
  { label: "Check my train", prompt: "Help me check my train journey." },
  { label: "Weather", prompt: "What is the weather like at my destination?" },
  { label: "What should I eat?", prompt: "What should I eat while travelling?" },
  { label: "Plan my route", prompt: "Help me plan my route." },
  { label: "More", prompt: "I need more travel tips." },
];

const ERROR_MESSAGE =
  "Sorry, I couldn't reach Saathi right now.\nPlease try again.";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  time: string;
};

let messageCounter = 0;

function makeMessageId() {
  messageCounter += 1;

  return `msg-${Date.now()}-${messageCounter}`;
}

function formatTime(date: Date) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TRIP_QUESTION_PATTERN = new RegExp(
  [
    "train",
    "railway",
    "rail",
    "station",
    "journey",
    "next stop",
    "agli",
    "agla station",
    "next station",
    "platform",
    "delay",
    "late",
    "depart",
    "arriv",
    "pahunch",
    "pahuche",
    "pahuchegi",
    "pahuchega",
    "kab pahunch",
    "reach",
    "timing",
    "schedule",
    "status",
    "current location",
  ].join("|"),
  "i"
);

function isTripSpecificQuestion(text: string): boolean {
  return TRIP_QUESTION_PATTERN.test(text);
}

const MONTH_SHORT_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatTripDate(iso: string | null): string {
  if (!iso) {
    return "";
  }

  const parts = iso.split("-").map(Number);

  if (parts.length !== 3) {
    return iso;
  }

  const [year, month, day] = parts;

  if (!year || !month || !day) {
    return iso;
  }

  return `${day} ${MONTH_SHORT_LABELS[(month - 1) % 12]}`;
}

function cleanContextString(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function buildUserContext(
  user: { fullName?: string | null; firstName?: string | null } | null,
  profile: { full_name?: string | null; home_city?: string | null; bio?: string | null } | null
): SaathiContextUser | null {
  const name =
    user?.fullName ||
    user?.firstName ||
    profile?.full_name ||
    null;
  const homeCity = cleanContextString(profile?.home_city);
  const bio = cleanContextString(profile?.bio);

  if (!name && !homeCity && !bio) {
    return null;
  }

  return { name, homeCity, bio };
}

function buildTripContext(
  trip: TripRow | TripSummaryCard,
  stops: TripStop[],
  transports: TripTransport[]
): SaathiContextTrip | null {
  const stopCities = (stops ?? [])
    .map((stop) => stop.city.trim())
    .filter(Boolean);

  const transportRows = (transports ?? [])
    .map((transport) => ({
      mode: cleanContextString(transport.mode),
      name: cleanContextString(transport.transport_name),
      number: cleanContextString(transport.transport_number),
      from: cleanContextString(transport.departure_city),
      to: cleanContextString(transport.arrival_city),
      departureTime: cleanContextString(transport.departure_time),
      arrivalTime: cleanContextString(transport.arrival_time),
      status: cleanContextString(transport.status),
    }))
    .filter((row) =>
      row.name ||
      row.number ||
      row.from ||
      row.to ||
      row.status
    );

  return {
    sourceCity: cleanContextString(trip.source_city),
    destination: cleanContextString(trip.destination),
    description: cleanContextString(trip.description),
    startDate: cleanContextString(trip.start_date),
    endDate: cleanContextString(trip.end_date),
    budget:
      typeof trip.budget === "number" && Number.isFinite(trip.budget)
        ? trip.budget
        : null,
    members:
      typeof trip.members === "number" && Number.isInteger(trip.members)
        ? trip.members
        : null,
    stops: stopCities.length > 0 ? stopCities : null,
    transports: transportRows.length > 0 ? transportRows : null,
  };
}

interface LoadedTripContext {
  trip: TripRow | TripSummaryCard;
  stops: TripStop[];
  transports: TripTransport[];
}

async function loadBundleForTrip(
  supabase: SupabaseClient,
  trip: TripRow | TripSummaryCard
): Promise<LoadedTripContext | null> {
  try {
    const [stopsResult, transportsResult] = await Promise.allSettled([
      listStops(supabase, trip.id),
      listTransport(supabase, trip.id),
    ]);

    const stops =
      stopsResult.status === "fulfilled" ? stopsResult.value : [];

    if (stopsResult.status === "rejected") {
      console.error("[SAATHI] listStops failed:", stopsResult.reason);
    }

    const transports =
      transportsResult.status === "fulfilled"
        ? transportsResult.value
        : [];

    if (transportsResult.status === "rejected") {
      console.error(
        "[SAATHI] listTransport failed:",
        transportsResult.reason
      );
    }

    return { trip, stops, transports };
  } catch (err) {
    console.error("[SAATHI] loadBundleForTrip failed:", err);
    return null;
  }
}

/**
 * Home entry: only auto-pick a trip when exactly one relevant trip exists
 * (active/upcoming). With zero or multiple trips we never guess — Saathi
 * shows the trip picker instead when a trip is actually needed.
 */
async function resolveHomeCurrentTrip(
  supabase: SupabaseClient,
  userId: string
): Promise<LoadedTripContext | null> {
  const rows = await listUserTrips(supabase, userId);
  const summaries = rows.map(toTripSummary);

  const relevant = summaries.filter(
    (summary) =>
      summary.lifecycle === "active" ||
      summary.lifecycle === "upcoming"
  );

  if (relevant.length !== 1) {
    return null;
  }

  return loadBundleForTrip(supabase, relevant[0]);
}

/**
 * Candidate trips offered in the trip-selection UI (Home entry).
 * Active + upcoming trips first (soonest start first); if there are none,
 * fall back to the most recently created trips for continuity.
 */
async function loadTripCandidates(
  supabase: SupabaseClient,
  userId: string
): Promise<TripSummaryCard[]> {
  const rows = await listUserTrips(supabase, userId);
  const summaries = rows.map(toTripSummary);

  const active = summaries.filter(
    (summary) => summary.lifecycle === "active"
  );

  const upcoming = summaries
    .filter((summary) => summary.lifecycle === "upcoming")
    .sort((a, b) =>
      (a.start_date ?? "9999").localeCompare(b.start_date ?? "9999")
    );

  const relevant = [...active, ...upcoming];

  if (relevant.length > 0) {
    return relevant.slice(0, 5);
  }

  return summaries.slice(0, 3);
}

/**
 * Fetch live status (existing Railway service) for a trip's train. On any
 * failure returns an `liveUnavailable` envelope so Saathi says it clearly
 * instead of guessing.
 */
async function fetchLiveForTransport(
  transport: TripTransport
): Promise<SaathiContextLiveTrain> {
  const base: SaathiContextLiveTrain = {
    trainNumber: transport.transport_number ?? null,
    trainName: transport.transport_name ?? null,
    liveUnavailable: false,
  };

  try {
    const info = await fetchLiveTrainStatus(transport);

    if (info.liveUnavailable) {
      return { ...base, liveUnavailable: true };
    }

    return {
      trainNumber: info.trainNumber ?? base.trainNumber,
      trainName: info.trainName ?? base.trainName,
      liveUnavailable: false,
      statusLabel: info.statusLabel,
      currentStation: info.currentStation,
      nextStation: info.nextStation,
      nextStationExpectedTime: info.nextStationExpectedTime,
      expectedArrivalTime: info.expectedArrivalTime,
      expectedDepartureTime: info.expectedDepartureTime,
      delay: info.delay,
      onTime: info.onTime,
      arrived: info.arrived,
      lastUpdatedAt: info.lastUpdatedAt,
    };
  } catch (err) {
    console.error("[SAATHI] fetchLiveTrainStatus failed:", err);
    return { ...base, liveUnavailable: true };
  }
}

function TypingIndicator({ color }: { color: string }) {
  const dots = useRef<Animated.Value[]>(
    [0, 1, 2].map(() => new Animated.Value(0))
  ).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.stagger(
        160,
        dots.map((dot) =>
          Animated.sequence([
            Animated.timing(dot, {
              toValue: 1,
              duration: 340,
              useNativeDriver: Platform.OS !== "web",
            }),
            Animated.timing(dot, {
              toValue: 0,
              duration: 340,
              useNativeDriver: Platform.OS !== "web",
            }),
          ])
        )
      )
    );

    loopRef.current = animation;
    animation.start();

    return () => {
      loopRef.current?.stop();
    };
  }, [dots]);

  return (
    <View style={styles.typingDots}>
      {dots.map((dot, index) => (
        <Animated.View
          key={index}
          style={[
            styles.typingDot,
            {
              backgroundColor: color,
              opacity: dot.interpolate({
                inputRange: [0, 1],
                outputRange: [0.25, 1],
              }),
              transform: [
                {
                  translateY: dot.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -3],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

export default function SaathiScreen() {
  const params = useLocalSearchParams<{
    tripId?: string;
    entryContext?: string;
  }>();
  const entryContext: "home" | "trip" =
    params.entryContext === "trip" ? "trip" : "home";
  const tripId =
    typeof params.tripId === "string" && params.tripId
      ? params.tripId
      : null;

  const { user } = useUser();
  const supabase = useSupabase();
  const { theme, dark } = useAppTheme();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<SaathiContext | null>(null);
  const [activeTrip, setActiveTrip] = useState<LoadedTripContext | null>(
    null
  );
  const [tripOptions, setTripOptions] = useState<TripSummaryCard[]>([]);
  const [tripPickerVisible, setTripPickerVisible] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(
    null
  );
  const [tripLoading, setTripLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const chatBackground = dark ? SAATHI_BG_DARK : SAATHI_BG_LIGHT;

  const assistantSurface = dark
    ? "rgba(24, 32, 27, 0.82)"
    : "rgba(255, 255, 255, 0.86)";
  const chipSurface = dark
    ? "rgba(30, 40, 34, 0.78)"
    : "rgba(255, 255, 255, 0.92)";
  const composerSurface = dark
    ? "rgba(16, 20, 18, 0.9)"
    : "rgba(255, 255, 255, 0.92)";

  const loadContext = useCallback(async () => {
    if (!user?.id) {
      setContext(null);
      return;
    }

    try {
      const profilePromise = supabase
        .from("profiles")
        .select("full_name, home_city, bio")
        .eq("clerk_id", user.id)
        .maybeSingle();

      let tripPromise: Promise<LoadedTripContext | null>;

      if (entryContext === "trip" && tripId) {
        tripPromise = getTripDetails(supabase, tripId)
          .then((bundle) => ({
            trip: bundle.trip,
            stops: bundle.stops,
            transports: bundle.transports,
          }))
          .catch((tripErr) => {
            console.error("[SAATHI] getTripDetails failed:", tripErr);
            return null;
          });
      } else if (entryContext === "home") {
        tripPromise = resolveHomeCurrentTrip(supabase, user.id).catch(
          (tripErr) => {
            console.error(
              "[SAATHI] resolveHomeCurrentTrip failed:",
              tripErr
            );
            return null;
          }
        );
      } else {
        tripPromise = Promise.resolve(null);
      }

      const [profileSettled, tripSettled] = await Promise.allSettled([
        profilePromise,
        tripPromise,
      ]);

      const profileResult =
        profileSettled.status === "fulfilled" ? profileSettled.value : null;

      if (profileSettled.status === "rejected") {
        console.error("[SAATHI] profile query failed:", profileSettled.reason);
      }

      const profile =
        !profileResult || profileResult.error || !profileResult.data
          ? null
          : profileResult.data;

      const tripBundle =
        tripSettled.status === "fulfilled" ? tripSettled.value : null;

      if (tripSettled.status === "rejected") {
        console.error("[SAATHI] trip query failed:", tripSettled.reason);
      }

      const nextContext: SaathiContext = {};
      const userContext = buildUserContext(user, profile);
      if (userContext) {
        nextContext.user = userContext;
      }

      if (tripBundle?.trip) {
        setActiveTrip(tripBundle);

        const tripContext = buildTripContext(
          tripBundle.trip,
          tripBundle.stops,
          tripBundle.transports
        );

        if (
          tripContext &&
          (tripContext.destination ||
            tripContext.sourceCity ||
            (tripContext.transports &&
              tripContext.transports.length > 0) ||
            (tripContext.stops && tripContext.stops.length > 0))
        ) {
          nextContext.trip = tripContext;
        }
      }

      console.log(
        "[SAATHI] context loaded:",
        JSON.stringify({
          hasUser: !!nextContext.user,
          hasTrip: !!nextContext.trip,
          entryContext,
        })
      );

      setContext(nextContext);
    } catch (err) {
      console.error("[SAATHI] loadContext unexpected error:", err);
      setContext(null);
    }
  }, [user, supabase, tripId, entryContext]);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  function appendUserMessage(content: string) {
    setMessages((current) => [
      ...current,
      {
        id: makeMessageId(),
        role: "user",
        content,
        time: formatTime(new Date()),
      },
    ]);
  }

  function appendAssistantMessage(content: string) {
    setMessages((current) => [
      ...current,
      {
        id: makeMessageId(),
        role: "assistant",
        content,
        time: formatTime(new Date()),
      },
    ]);
  }

  async function sendHistory(
    history: SaathiChatMessage[],
    sendContext: SaathiContext | null
  ) {
    setSending(true);

    try {
      const reply = await sendSaathiMessage(history, sendContext);
      appendAssistantMessage(reply.content);
    } catch {
      setError(ERROR_MESSAGE);
    } finally {
      setSending(false);
    }
  }

  async function buildContextForTrip(
    question: string,
    bundle: LoadedTripContext
  ): Promise<SaathiContext> {
    const nextContext: SaathiContext = {
      ...(context ?? {}),
      user: context?.user ?? null,
    };

    const tripContext = buildTripContext(
      bundle.trip,
      bundle.stops,
      bundle.transports
    );

    if (
      tripContext &&
      (tripContext.destination ||
        tripContext.sourceCity ||
        (tripContext.transports &&
          tripContext.transports.length > 0) ||
        (tripContext.stops && tripContext.stops.length > 0))
    ) {
      nextContext.trip = tripContext;
    }

    const train = (bundle.transports ?? []).find(
      (transport) =>
        transport.mode === "train" &&
        Boolean(transport.transport_number)
    );

    if (train && isTripSpecificQuestion(question)) {
      nextContext.liveTrain = await fetchLiveForTransport(train);
    }

    return nextContext;
  }

  async function handleSend(rawText: string) {
    const text = rawText.trim();

    if (!text || sending) {
      return;
    }

    setError(null);
    setInputText("");

    const history: SaathiChatMessage[] = [
      ...messages.map(({ role, content }) => ({ role, content })),
      { role: "user", content: text },
    ];

    appendUserMessage(text);

    const tripQuestion = isTripSpecificQuestion(text);

    if (entryContext === "home" && tripQuestion && !activeTrip) {
      const candidates = user?.id
        ? await loadTripCandidates(supabase, user.id)
        : [];

      if (candidates.length > 1) {
        appendAssistantMessage(
          "Sure 🚆 Kis trip ki train check karni hai?"
        );
        setPendingQuestion(text);
        setTripOptions(candidates);
        setTripPickerVisible(true);
        return;
      }

      if (candidates.length === 1) {
        const bundle = await loadBundleForTrip(supabase, candidates[0]);

        if (bundle) {
          setActiveTrip(bundle);
          const tripContextNow = await buildContextForTrip(text, bundle);
          setContext(tripContextNow);
          await sendHistory(history, tripContextNow);
          return;
        }
      }
    }

    if (tripQuestion && activeTrip) {
      const tripContextNow = await buildContextForTrip(text, activeTrip);
      setContext(tripContextNow);
      await sendHistory(history, tripContextNow);
      return;
    }

    await sendHistory(history, context);
  }

  async function selectTrip(trip: TripSummaryCard) {
    if (!user?.id || !pendingQuestion) {
      setTripPickerVisible(false);
      return;
    }

    const question = pendingQuestion;

    setTripPickerVisible(false);
    setTripOptions([]);
    setPendingQuestion(null);
    setTripLoading(true);
    setSending(true);

    const bundle = await loadBundleForTrip(supabase, trip);

    setTripLoading(false);

    if (!bundle) {
      setError(ERROR_MESSAGE);
      setSending(false);
      return;
    }

    setActiveTrip(bundle);

    const tripContextNow = await buildContextForTrip(question, bundle);
    setContext(tripContextNow);

    const history: SaathiChatMessage[] = messages.map(
      ({ role, content }) => ({ role, content })
    );

    await sendHistory(history, tripContextNow);
  }

  const scrollToEnd = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, []);

  const canSend = Boolean(inputText.trim()) && !sending;
  const lastIsAssistant = messages[messages.length - 1]?.role === "assistant";
  const showQuickReplies =
    messages.length > 0 &&
    lastIsAssistant &&
    !sending &&
    !tripPickerVisible;

  const userBubbleColor = dark ? theme.primaryDark : theme.primary;
  const sendReadyColor = theme.primary;
  const sendIdleColor = dark ? "#3E4A42" : "#CFD6D1";

  const errorBanner = error ? (
    <View
      style={[
        styles.errorCard,
        {
          backgroundColor: dark
            ? "rgba(63, 24, 22, 0.85)"
            : "rgba(255, 243, 241, 0.92)",
          borderColor: dark ? "#7A3B37" : "#F5C6C6",
        },
      ]}
    >
      <Ionicons name="cloud-offline-outline" size={16} color={theme.danger} />
      <Text style={[styles.errorText, { color: theme.danger }]}>{error}</Text>
    </View>
  ) : null;

  return (
    <ImageBackground
      source={chatBackground}
      style={styles.background}
      resizeMode="cover"
    >
      <SafeAreaView style={styles.screen} edges={["top", "bottom"]}>
        <View style={styles.headerWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={10}
            onPress={() => {
              if (router.canGoBack()) {
                router.back();
              } else {
                router.replace("/");
              }
            }}
            style={({ pressed }) => [
              styles.backButton,
              {
                backgroundColor: composerSurface,
                borderColor: theme.border,
              },
              pressed && styles.pressedDim,
            ]}
          >
            <Ionicons name="arrow-back" size={22} color={theme.text} />
          </Pressable>

          <Image
            source={SAATHI_LOGO}
            style={styles.headerLogo}
            resizeMode="cover"
          />

          <View style={styles.headerText}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>
              Saathi
            </Text>
            <Text
              style={[styles.headerSubtitle, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              Your Travel Companion
            </Text>
          </View>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            ref={scrollRef}
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            onContentSizeChange={scrollToEnd}
          >
            {messages.length === 0 ? (
              <View style={styles.emptyWrap}>
                <View
                  style={[
                    styles.logoRing,
                    { backgroundColor: assistantSurface, borderColor: theme.border },
                  ]}
                >
                  <Image
                    source={SAATHI_LOGO}
                    style={styles.logo}
                    resizeMode="cover"
                  />
                </View>

                <Text style={[styles.emptyTitle, { color: theme.text }]}>
                  {`Hi! I'm Saathi \u{1F44B}`}
                </Text>

                <Text
                  style={[styles.emptyDesc, { color: theme.textSecondary }]}
                >
                  I can help you with your journey, destinations and travel
                  questions.
                  {"\n"}
                  Where are you travelling?
                </Text>

                <View style={styles.chipWrap}>
                  {SUGGESTED_CHIPS.map((chip) => (
                    <Pressable
                      key={chip.label}
                      accessibilityRole="button"
                      disabled={sending}
                      onPress={() => handleSend(chip.prompt)}
                      style={({ pressed }) => [
                        styles.chip,
                        {
                          backgroundColor: chipSurface,
                          borderColor: theme.border,
                        },
                        pressed && styles.chipPressed,
                      ]}
                    >
                      <Ionicons
                        name="sparkles-outline"
                        size={14}
                        color={theme.primary}
                      />
                      <Text
                        style={[styles.chipText, { color: theme.text }]}
                      >
                        {chip.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {errorBanner}
              </View>
            ) : (
              <View style={styles.chatList}>
                {messages.map((message) => {
                  const isUser = message.role === "user";

                  return (
                    <View
                      key={message.id}
                      style={[
                        styles.msgRow,
                        isUser ? styles.msgRowUser : styles.msgRowAssistant,
                      ]}
                    >
                      {isUser ? null : (
                        <View
                          style={[
                            styles.avatar,
                            { borderColor: theme.border },
                          ]}
                        >
                          <Image
                            source={SAATHI_LOGO}
                            style={styles.avatarImage}
                            resizeMode="cover"
                          />
                        </View>
                      )}

                      <View
                        style={[
                          styles.msgColumn,
                          isUser && styles.msgColumnUser,
                        ]}
                      >
                        <View
                          style={[
                            styles.bubble,
                            isUser
                              ? { backgroundColor: userBubbleColor }
                              : {
                                  backgroundColor: assistantSurface,
                                  borderColor: theme.border,
                                },
                            isUser
                              ? styles.bubbleUser
                              : styles.bubbleAssistant,
                          ]}
                        >
                          <Text
                            style={[
                              styles.bubbleText,
                              isUser
                                ? { color: theme.onPrimary }
                                : { color: theme.text },
                            ]}
                          >
                            {message.content}
                          </Text>
                        </View>

                        <Text
                          style={[
                            styles.bubbleTime,
                            isUser && styles.bubbleTimeUser,
                            { color: theme.textMuted },
                          ]}
                        >
                          {message.time}
                        </Text>
                      </View>
                    </View>
                  );
                })}

                {tripPickerVisible && tripOptions.length > 0 ? (
                  <View style={styles.tripPickerWrap}>
                    {tripOptions.map((trip) => {
                      const displayTitle =
                        trip.title ||
                        [trip.source_city, trip.destination]
                          .filter(Boolean)
                          .join(" → ") ||
                        "Trip";
                      const routeLine = [
                        trip.source_city,
                        trip.destination,
                      ]
                        .filter(Boolean)
                        .join(" → ");
                      const startLabel = formatTripDate(
                        trip.start_date
                      );

                      return (
                        <Pressable
                          key={trip.id}
                          accessibilityRole="button"
                          accessibilityLabel={`Select ${displayTitle}`}
                          disabled={tripLoading || sending}
                          onPress={() => selectTrip(trip)}
                          style={({ pressed }) => [
                            styles.tripOptionCard,
                            {
                              backgroundColor: chipSurface,
                              borderColor: theme.border,
                            },
                            pressed && styles.tripOptionPressed,
                          ]}
                        >
                          <View style={styles.tripOptionHeader}>
                            <Ionicons
                              name="location"
                              size={16}
                              color={theme.primary}
                            />
                            <Text
                              style={[
                                styles.tripOptionTitle,
                                { color: theme.text },
                              ]}
                              numberOfLines={1}
                            >
                              {displayTitle}
                            </Text>
                          </View>

                          {routeLine ? (
                            <Text
                              style={[
                                styles.tripOptionRoute,
                                { color: theme.textSecondary },
                              ]}
                              numberOfLines={1}
                            >
                              {routeLine}
                            </Text>
                          ) : null}

                          {startLabel ? (
                            <Text
                              style={[
                                styles.tripOptionDate,
                                { color: theme.textMuted },
                              ]}
                            >
                              {startLabel}
                            </Text>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}

                {sending ? (
                  <View style={[styles.msgRow, styles.msgRowAssistant]}>
                    <View
                      style={[styles.avatar, { borderColor: theme.border }]}
                    >
                      <Image
                        source={SAATHI_LOGO}
                        style={styles.avatarImage}
                        resizeMode="cover"
                      />
                    </View>

                    <View
                      style={[
                        styles.bubble,
                        styles.bubbleAssistant,
                        styles.typingBubble,
                        {
                          backgroundColor: assistantSurface,
                          borderColor: theme.border,
                        },
                      ]}
                    >
                      <TypingIndicator color={theme.primary} />
                    </View>
                  </View>
                ) : null}

                {showQuickReplies ? (
                  <View style={styles.repliesBlock}>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      keyboardShouldPersistTaps="handled"
                      contentContainerStyle={styles.repliesContent}
                    >
                      {SUGGESTED_CHIPS.map((chip) => (
                        <Pressable
                          key={chip.label}
                          accessibilityRole="button"
                          onPress={() => handleSend(chip.prompt)}
                          style={({ pressed }) => [
                            styles.replyChip,
                            {
                              backgroundColor: chipSurface,
                              borderColor: theme.border,
                            },
                            pressed && styles.replyChipPressed,
                          ]}
                        >
                          <Text
                            style={[styles.replyChipText, { color: theme.text }]}
                          >
                            {chip.label}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                ) : null}

                {errorBanner}
              </View>
            )}
          </ScrollView>

          <View
            style={[
              styles.composer,
              {
                backgroundColor: composerSurface,
                borderTopColor: theme.border,
              },
            ]}
          >
            <View style={styles.composerRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add"
                hitSlop={6}
                style={({ pressed }) => [
                  styles.addButton,
                  {
                    backgroundColor: chipSurface,
                    borderColor: theme.border,
                  },
                  pressed && styles.pressedDim,
                ]}
              >
                <Ionicons name="add" size={22} color={theme.textSecondary} />
              </Pressable>

              <View
                style={[
                  styles.inputShell,
                  {
                    backgroundColor: theme.inputBg,
                    borderColor: theme.border,
                  },
                ]}
              >
                <TextInput
                  style={[styles.input, { color: theme.text }]}
                  value={inputText}
                  onChangeText={setInputText}
                  placeholder="Ask Saathi anything..."
                  placeholderTextColor={theme.textMuted}
                  returnKeyType="send"
                  onSubmitEditing={() => handleSend(inputText)}
                  editable={!sending}
                />
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message to Saathi"
                accessibilityState={{ disabled: !canSend }}
                disabled={!canSend}
                onPress={() => handleSend(inputText)}
                style={({ pressed }) => [
                  styles.sendButton,
                  {
                    backgroundColor: canSend
                      ? sendReadyColor
                      : sendIdleColor,
                  },
                  pressed && styles.pressedDim,
                ]}
              >
                {sending ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="arrow-up" size={20} color="#FFFFFF" />
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },

  screen: {
    flex: 1,
  },

  flex: {
    flex: 1,
  },

  headerWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 10,
  },

  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
    shadowColor: "#000000",
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },

  headerLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 10,
  },

  headerText: {
    flex: 1,
  },

  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
  },

  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexGrow: 1,
  },

  emptyWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 28,
  },

  logoRing: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },

  logo: {
    width: 92,
    height: 92,
    borderRadius: 46,
  },

  emptyTitle: {
    fontSize: 24,
    fontWeight: "800",
    letterSpacing: -0.4,
    textAlign: "center",
  },

  emptyDesc: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },

  chipWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    marginTop: 26,
  },

  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 11,
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  chipPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.85,
  },

  chipText: {
    fontSize: 14,
    fontWeight: "600",
  },

  chatList: {
    gap: 14,
    paddingTop: 6,
  },

  msgRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },

  msgRowAssistant: {
    justifyContent: "flex-start",
  },

  msgRowUser: {
    justifyContent: "flex-end",
  },

  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    overflow: "hidden",
  },

  avatarImage: {
    width: 34,
    height: 34,
  },

  msgColumn: {
    maxWidth: "82%",
  },

  msgColumnUser: {
    alignItems: "flex-end",
  },

  bubble: {
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 11,
  },

  bubbleAssistant: {
    borderWidth: 1,
    borderBottomLeftRadius: 6,
  },

  bubbleUser: {
    borderBottomRightRadius: 6,
  },

  bubbleText: {
    fontSize: 15,
    lineHeight: 21,
  },

  bubbleTime: {
    marginTop: 4,
    marginHorizontal: 4,
    fontSize: 11,
  },

  bubbleTimeUser: {
    marginRight: 2,
  },

  typingBubble: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },

  typingDots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },

  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },

  repliesBlock: {
    marginTop: 2,
  },

  repliesContent: {
    gap: 8,
    paddingVertical: 2,
  },

  replyChip: {
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },

  replyChipPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.85,
  },

  replyChipText: {
    fontSize: 13,
    fontWeight: "600",
  },

  tripPickerWrap: {
    gap: 10,
    paddingVertical: 2,
  },

  tripOptionCard: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },

  tripOptionPressed: {
    transform: [{ scale: 0.97 }],
    opacity: 0.85,
  },

  tripOptionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },

  tripOptionTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
  },

  tripOptionRoute: {
    marginTop: 3,
    marginLeft: 22,
    fontSize: 13,
  },

  tripOptionDate: {
    marginTop: 2,
    marginLeft: 22,
    fontSize: 12,
  },

  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 10,
  },

  errorText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },

  composer: {
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
  },

  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },

  addButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
  },

  inputShell: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 9,
  },

  input: {
    fontSize: 15,
    lineHeight: 20,
    paddingVertical: 0,
    minHeight: 24,
    maxHeight: 110,
  },

  sendButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 1,
    shadowColor: "#000000",
    shadowOpacity: 0.12,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },

  pressedDim: {
    opacity: 0.8,
    transform: [{ scale: 0.96 }],
  },
});