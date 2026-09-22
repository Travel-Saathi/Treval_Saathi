import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useSupabase } from "../../hook/usesupabase";
import { tripCitySequence } from "../../services/liveTripsApi";
import {
  buildLiveTrainStatus,
  fetchLiveTrainStatus,
  type LiveTrainStatusInfo,
} from "../../services/liveTrainStatusApi";
import {
  advanceForNextTravel,
  activeSegmentIndex,
  buildPlannedSegments,
  countdownLabel,
  dateTimeFromTransport,
  modeJourneyHeader,
  persistSegmentStatus,
  persistTransportLiveUpdate,
  type PlannedSegment,
} from "../../services/tripProgressApi";
import { listTransport } from "../../services/tripsApi";
import LiveTrainStatusCard from "./LiveTrainStatusCard";
import MapSection from "./MapSection";
import ModeJourneyCard from "./ModeJourneyCard";
import NextTravelCard from "./NextTravelCard";

const POLL_INTERVAL_MS = 60_000;
const TICK_INTERVAL_MS = 15_000;

export type ProgressTrip = {
  id: string;
  source_city: string | null;
  destination: string | null;
};

export type ProgressStops = import("../../services/tripsApi").TripStop[];

export type ProgressTransports = import("../../services/tripsApi").TripTransport[];

interface TripProgressViewProps {
  trip: ProgressTrip;
  stops: ProgressStops;
  transports: ProgressTransports;
  onTransportsChange?: (
    rows: import("../../services/tripsApi").TripTransport[]
  ) => void;
}

function plainTime(value: string | null | undefined): string | null {
  return String(value ?? "").trim() || null;
}

export default function TripProgressView({
  trip,
  stops,
  transports,
  onTransportsChange,
}: TripProgressViewProps) {
  const supabase = useSupabase();

  const cities = tripCitySequence(trip, stops);

  const [segments, setSegments] = useState<PlannedSegment[]>([]);
  const [liveInfo, setLiveInfo] = useState<LiveTrainStatusInfo | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [liveUnavailable, setLiveUnavailable] = useState(false);
  const [nextStarting, setNextStarting] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const focusedRef = useRef(true);
  const inflightRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const arrivalAppliedRef = useRef<Set<string>>(new Set());
  const overrideRef = useRef<number | null>(null);
  const segmentsRef = useRef<PlannedSegment[]>([]);

  const loadFromRows = useCallback(
    (rows: ProgressTransports) => {
      setSegments(
        buildPlannedSegments(trip, stops, rows, overrideRef.current)
      );
    },
    [trip, stops]
  );

  useEffect(() => {
    loadFromRows(transports);
  }, [transports, loadFromRows]);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  // Stop polling whenever the screen loses focus (user left the screen).
  useFocusEffect(
    useCallback(() => {
      focusedRef.current = true;
      return () => {
        focusedRef.current = false;
        abortRef.current?.abort();
      };
    }, [])
  );

  // Countdown ticker — cheap, keeps the "departs in …" live.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

  const activeIndex = activeSegmentIndex(segments);
  const activeSegment = activeIndex >= 0 ? segments[activeIndex] : null;
  const nextSegment =
    activeIndex >= 0 && activeIndex + 1 < segments.length
      ? segments[activeIndex + 1]
      : null;

  const activeTransportId = activeSegment?.transport?.id ?? null;
  // Poll/fallback tracking only for a live train leg that is not conclusively
  // finished — an ARRIVED or COMPLETED leg is no longer fetched.
  const trackableTrain =
    activeSegment?.mode === "train" &&
    Boolean(activeSegment.transport) &&
    activeSegment.status !== "ARRIVED" &&
    activeSegment.status !== "COMPLETED";

  const refreshLive = useCallback(async () => {
    const segment = segmentsRef.current[activeIndex] ?? null;
    const transport = segment?.transport;

    if (!segment || !transport || segment.mode !== "train") {
      return;
    }

    if (segment.status === "COMPLETED" || segment.status === "ARRIVED") {
      return;
    }

    if (inflightRef.current) {
      return;
    }

    inflightRef.current = true;
    setRefreshing(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const info = await fetchLiveTrainStatus(transport, {
        signal: controller.signal,
      });

      setLiveInfo(info);
      setLiveUnavailable(false);

      await persistTransportLiveUpdate(supabase, transport.id, info);

      // Arrival is adopted only once, and only from the live feed (never the
      // device clock). Persist ARRIVED + update local segments in place.
      if (info.arrived && !arrivalAppliedRef.current.has(transport.id)) {
        arrivalAppliedRef.current.add(transport.id);
        await persistSegmentStatus(supabase, transport.id, "ARRIVED");
        setSegments((prev) =>
          prev.map((segmentRow) =>
            segmentRow.transport?.id === transport.id
              ? { ...segmentRow, status: "ARRIVED" }
              : segmentRow
          )
        );
      }

      if (onTransportsChange) {
        onTransportsChange(await listTransport(supabase, trip.id));
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }

      setLiveUnavailable(true);
    } finally {
      inflightRef.current = false;
      setRefreshing(false);
    }
  }, [activeIndex, supabase, trip.id, onTransportsChange]);

  // Periodic live polling while the current leg is an unconcluded train leg.
  useEffect(() => {
    if (!focusedRef.current || !trackableTrain) {
      return;
    }

    void refreshLive();

    const timer = setInterval(() => {
      if (focusedRef.current) {
        void refreshLive();
      }
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      abortRef.current?.abort();
    };
  }, [trackableTrain, refreshLive]);

  // A changed active leg should always present a fresh card — drop the
  // previous leg's snapshot so nothing stale leaks across segments.
  useEffect(() => {
    setLiveInfo(null);
    setLiveUnavailable(false);
  }, [activeTransportId]);

  const startNextTravel = useCallback(async () => {
    if (activeIndex < 0 || !nextSegment) {
      return;
    }

    setNextStarting(true);

    try {
      await advanceForNextTravel(supabase, segmentsRef.current, activeIndex);

      overrideRef.current = activeIndex + 1;

      const rows = await listTransport(supabase, trip.id);
      loadFromRows(rows);
      setLiveInfo(null);
      setLiveUnavailable(false);

      if (onTransportsChange) {
        onTransportsChange(rows);
      }
    } finally {
      setNextStarting(false);
    }
  }, [activeIndex, nextSegment, supabase, trip.id, loadFromRows, onTransportsChange]);

  const activeDeparture = activeSegment?.transport
    ? dateTimeFromTransport(activeSegment.transport)
    : null;

  const nextDeparture = nextSegment?.transport
    ? dateTimeFromTransport(nextSegment.transport)
    : null;

  const showNextTravelCard =
    activeSegment?.status === "ARRIVED" && Boolean(nextSegment);

  const nextCountdown = showNextTravelCard
    ? countdownLabel(
        nextDeparture ? nextDeparture.getTime() - now : null
      )
    : null;

  const scheduleFallback: LiveTrainStatusInfo | null =
    trackableTrain && activeSegment?.transport && !liveInfo
      ? buildLiveTrainStatus(activeSegment.transport, {
          journeyCities: cities,
          currentStation:
            activeSegment.status === "BOARDING" ||
            activeSegment.status === "IN_PROGRESS"
              ? activeSegment.origin
              : null,
        })
      : null;

  const showLiveTrainCard =
    activeSegment?.mode === "train" &&
    activeSegment.status !== "COMPLETED" &&
    (activeSegment.status !== "ARRIVED" || Boolean(liveInfo));

  const renderJourneyCard = () => {
    if (showLiveTrainCard) {
      return (
        <LiveTrainStatusCard
          status={liveInfo ?? scheduleFallback}
          refreshing={refreshing}
          liveUnavailable={liveUnavailable}
          onRefresh={refreshLive}
        />
      );
    }

    if (activeSegment) {
      return (
        <ModeJourneyCard
          mode={activeSegment.mode}
          transport={activeSegment.transport}
          status={activeSegment.status}
          origin={activeSegment.origin}
          destination={activeSegment.destination}
        />
      );
    }

    return null;
  };

  const allDone =
    segments.length > 0 && activeIndex < 0 && !nextSegment;

  return (
    <View style={styles.root}>
      {cities.length >= 2 && activeSegment ? (
        <View style={styles.block}>
          <MapSection
            segmentCities={[activeSegment.origin, activeSegment.destination]}
            fullRouteCities={cities}
            mapMode="segment"
            height={260}
          />
        </View>
      ) : null}

      {activeSegment ? (
        <View style={styles.block}>
          <View style={styles.journeyHeadingRow}>
            <Text style={styles.journeyHeading}>
              {modeJourneyHeader(activeSegment.mode)}
            </Text>
            <Text style={styles.legCount}>
              Leg {activeSegment.index + 1} of {activeSegment.total}
            </Text>
          </View>

          <View style={styles.legCities}>
            <Text style={styles.legCity} numberOfLines={1}>
              {activeSegment.origin}
            </Text>
            <Text style={styles.legArrow}>→</Text>
            <Text style={[styles.legCity, styles.legCityStrong]} numberOfLines={1}>
              {activeSegment.destination}
            </Text>
          </View>

          {activeSegment.status === "UPCOMING" &&
          activeSegment.transport &&
          activeSegment.transport.departure_time ? (
            <Text style={styles.departingNote}>
              Departs {plainTime(activeSegment.transport.departure_time)} · in{" "}
              {countdownLabel(
                activeDeparture ? activeDeparture.getTime() - now : null
              )}
            </Text>
          ) : null}
        </View>
      ) : null}

      {activeSegment ? <View style={styles.block}>{renderJourneyCard()}</View> : null}

      {showNextTravelCard && nextSegment ? (
        <View style={styles.block}>
          <NextTravelCard
            destination={nextSegment.destination}
            departureTime={plainTime(nextSegment.transport?.departure_time)}
            countdownText={nextCountdown ?? "—"}
            onStart={startNextTravel}
            loading={nextStarting}
          />
        </View>
      ) : null}

      {allDone ? (
        <View style={styles.doneCard}>
          <Text style={styles.doneEmoji}>🎉</Text>
          <Text style={styles.doneTitle}>Journey complete</Text>
          <Text style={styles.doneText}>
            Every leg of this trip has been marked as completed.
          </Text>
        </View>
      ) : null}

      {segments.length === 0 ? (
        <View style={styles.doneCard}>
          <Text style={styles.doneEmoji}>🧳</Text>
          <Text style={styles.doneTitle}>No journey legs yet</Text>
          <Text style={styles.doneText}>
            Add transport for each leg in Trip Setup to start live tracking.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 18,
  },
  block: {
    gap: 10,
  },
  journeyHeadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  journeyHeading: {
    fontSize: 12,
    fontWeight: "800",
    color: "#08751F",
    letterSpacing: 0.5,
  },
  legCount: {
    fontSize: 11,
    fontWeight: "700",
    color: "#9CA3AF",
  },
  legCities: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legCity: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    color: "#1C1C1E",
  },
  legCityStrong: {
    fontWeight: "800",
    textAlign: "right",
  },
  legArrow: {
    fontSize: 15,
    color: "#00BC26",
    fontWeight: "800",
  },
  departingNote: {
    fontSize: 13,
    fontWeight: "600",
    color: "#08751F",
  },
  doneCard: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 22,
    alignItems: "center",
    gap: 4,
  },
  doneEmoji: {
    fontSize: 30,
  },
  doneTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1C1C1E",
  },
  doneText: {
    fontSize: 13,
    color: "#6B7280",
    textAlign: "center",
    lineHeight: 18,
  },
});