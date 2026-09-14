import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
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
import {
  SaathiChatMessage,
  sendSaathiMessage,
} from "../../services/saathiApi";
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
  const { theme, dark } = useAppTheme();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  async function handleSend(rawText: string) {
    const text = rawText.trim();

    if (!text || sending) {
      return;
    }

    const history: SaathiChatMessage[] = [
      ...messages.map(({ role, content }) => ({ role, content })),
      { role: "user", content: text },
    ];

    setError(null);
    setSending(true);
    setInputText("");

    setMessages((current) => [
      ...current,
      {
        id: makeMessageId(),
        role: "user",
        content: text,
        time: formatTime(new Date()),
      },
    ]);

    try {
      const reply = await sendSaathiMessage(history);

      setMessages((current) => [
        ...current,
        {
          id: makeMessageId(),
          role: "assistant",
          content: reply.content,
          time: formatTime(new Date()),
        },
      ]);
    } catch {
      setError(ERROR_MESSAGE);
    } finally {
      setSending(false);
    }
  }

  const scrollToEnd = useCallback(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, []);

  const canSend = Boolean(inputText.trim()) && !sending;
  const lastIsAssistant = messages[messages.length - 1]?.role === "assistant";
  const showQuickReplies = messages.length > 0 && lastIsAssistant && !sending;

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