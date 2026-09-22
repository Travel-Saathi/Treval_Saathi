import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";
import { buildLiveTrainStatus } from "../../services/liveTrainStatusApi";
import { MODE_LABELS, TRANSPORT_MODES, type TransportMode } from "../../services/transportApi";
import type { TripTransport } from "../../services/tripsApi";
import LiveTrainStatusCard from "./LiveTrainStatusCard";

type IoniconName = keyof typeof Ionicons.glyphMap;

function modeIcon(mode: string | null): IoniconName {
  const matched = TRANSPORT_MODES.find((item) => item.id === (mode ?? ""));
  return matched?.icon ?? "train-outline";
}

function normalise(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export default function TransportCard({
  transport,
  segmentOrigin,
  segmentDestination,
  onOpenCity,
  journeyCities,
  isCurrentLeg,
}: {
  transport: TripTransport;
  segmentOrigin?: string | null;
  segmentDestination?: string | null;
  onOpenCity?: (city: string) => void;
  journeyCities?: string[];
  isCurrentLeg?: boolean;
}) {
  const mode = (transport.mode ?? null) as TransportMode | null;
  const icon = modeIcon(transport.mode);
  const label = mode ? MODE_LABELS[mode] : "Transport";
  const name = transport.transport_name?.trim();
  const number = transport.transport_number?.trim();
  const title = name ?? number ?? label;
  const duration = transport.duration?.trim();
  const price = transport.deal_price?.trim() || transport.price?.trim();
  const availability = transport.availability?.trim() || null;

  const depCity = transport.departure_city?.trim() ?? null;
  const arrCity = transport.arrival_city?.trim() ?? null;

  const matchesSegment =
    segmentOrigin && segmentDestination && depCity && arrCity
      ? normalise(depCity) === normalise(segmentOrigin) &&
        normalise(arrCity) === normalise(segmentDestination)
      : true;

  const displayOrigin = matchesSegment ? depCity : segmentOrigin ?? depCity;
  const displayDestination = matchesSegment ? arrCity : segmentDestination ?? arrCity;

  const currentStation =
    isCurrentLeg
      ? segmentOrigin?.trim() ?? depCity
      : depCity;

  const liveStatus =
    mode === "train"
      ? buildLiveTrainStatus(transport, {
          journeyCities: journeyCities ?? [],
          currentStation,
        })
      : null;

  const detailLines: { icon: IoniconName; text: string }[] = [];
  if (duration) detailLines.push({ icon: "time-outline", text: duration });
  if (price) detailLines.push({ icon: "ticket-outline", text: price });
  if (availability) detailLines.push({ icon: "checkmark-circle-outline", text: availability });

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}><Ionicons name={icon} size={20} color="#00BC26" /></View>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.subtitle}>
            {matchesSegment ? label : `Transport for full journey`}
          </Text>
        </View>
      </View>
      {displayOrigin || displayDestination ? (
        <View style={styles.leg}>
          {onOpenCity && displayOrigin ? (
            <Text style={styles.legCity} onPress={() => onOpenCity(displayOrigin)}>{displayOrigin}</Text>
          ) : (
            <Text style={styles.legCityText}>{displayOrigin ?? "—"}</Text>
          )}
          <View style={styles.legLine}><Ionicons name="arrow-forward" size={15} color="#00BC26" /></View>
          {onOpenCity && displayDestination ? (
            <Text style={styles.legCity} onPress={() => onOpenCity(displayDestination)}>{displayDestination}</Text>
          ) : (
            <Text style={styles.legCityText}>{displayDestination ?? "—"}</Text>
          )}
        </View>
      ) : null}
      {transport.departure_time || transport.arrival_time ? (
        <View style={styles.times}>
          <Text style={styles.timeText}>{transport.departure_time ?? "—"}</Text>
          <Text style={styles.timeText}>{transport.arrival_time ?? "—"}</Text>
        </View>
      ) : null}
      <View style={styles.details}>
        {detailLines.map((line) => (
          <View key={line.icon} style={styles.detailRow}>
            <Ionicons name={line.icon} size={14} color="#71717A" />
            <Text style={styles.detailText} numberOfLines={1}>{line.text}</Text>
          </View>
        ))}
      </View>
      {liveStatus ? (
        <View style={styles.liveStatusWrap}>
          <LiveTrainStatusCard status={liveStatus} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#E5E7EB", padding: 16 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#E7F9EB", alignItems: "center", justifyContent: "center", marginRight: 10 },
  headerText: { flex: 1 },
  title: { fontSize: 15, fontWeight: "700", color: "#1C1C1E" },
  subtitle: { fontSize: 12, color: "#71717A", marginTop: 1 },
  leg: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  legCity: { flex: 1, fontSize: 15, fontWeight: "700", color: "#00BC26", textAlign: "center" },
  legCityText: { flex: 1, fontSize: 15, fontWeight: "600", color: "#1C1C1E", textAlign: "center" },
  legLine: { paddingHorizontal: 10 },
  times: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 4, marginBottom: 10 },
  timeText: { fontSize: 12, color: "#71717A" },
  details: { gap: 7 },
  detailRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  detailText: { flex: 1, fontSize: 13, color: "#3F3F46" },
  liveStatusWrap: { marginTop: 14 },
});
