import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import type { LiveUpdatesInfo } from "../../services/tripLiveApi";
import { SectionTitle } from "./primitives";

const SEVERITY_COLORS: Record<string, string> = {
  info: "#0EA5E9",
  warning: "#F59E0B",
  alert: "#EF4444",
};

export default function LiveUpdatesSection({
  info,
}: {
  info?: LiveUpdatesInfo | null;
}) {
  if (!info || info.items.length === 0) {
    return (
      <View>
        <SectionTitle icon="notifications" title="Live Updates" />
        <View style={styles.emptyCard}>
          <Ionicons name="checkmark-circle-outline" size={22} color="#00BC26" />
          <Text style={styles.emptyTitle}>No new updates</Text>
          <Text style={styles.emptySubtitle}>Your journey is on track.</Text>
        </View>
      </View>
    );
  }

  return (
    <View>
      <SectionTitle icon="notifications" title="Live Updates" subtitle={info.updatedAt ?? undefined} />
      <View style={styles.list}>
        {info.items.map((item) => {
          const color = SEVERITY_COLORS[item.severity] ?? "#0EA5E9";
          return (
            <View key={item.id} style={styles.row}>
              <View style={[styles.dot, { backgroundColor: color }]} />
              <View style={styles.body}>
                <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                {item.message ? <Text style={styles.message} numberOfLines={2}>{item.message}</Text> : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderRadius: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB", overflow: "hidden" },
  row: { flexDirection: "row", gap: 10, paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#EEF0F3" },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  body: { flex: 1 },
  title: { fontSize: 14, fontWeight: "600", color: "#1C1C1E" },
  message: { fontSize: 12, color: "#71717A", marginTop: 1 },
  emptyCard: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1C1C1E",
  },
  emptySubtitle: {
    width: "100%",
    fontSize: 12,
    color: "#71717A",
    marginTop: 2,
  },
});
