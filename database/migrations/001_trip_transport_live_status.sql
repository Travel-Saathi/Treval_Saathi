-- =============================================================================
-- Trip Progress + Live Transport Status – schema migration (additive only).
--
-- Adds the live-status and per-segment state fields the Trip Progress /
-- Live Transport Status feature persists back onto the existing
-- `trip_transport` rows.
--
-- The live values are written back on every successful live-status refresh:
--   current_station / next_station        from the mNTES running status
--   actual_* / expected_* / delay         from the mNTES running status
--   status                               short status label (e.g. "On Time",
--                                         "Late by 10 min", "Arrived")
--   last_status_update                    ISO-8601 timestamp of the refresh
--   segment_status                        per-leg state machine:
--                                         UPCOMING / BOARDING / IN_PROGRESS /
--                                         ARRIVED / COMPLETED
--
-- Notes
--   * The migration is strictly ADDITIVE: it only adds columns to
--     `trip_transport` and touches no other table. Nothing is dropped.
--   * `delay` is TEXT so minutes ("10 min") and other provider wording can
--     be preserved without a CHECK constraint.
--   * `status` on `trip_transport` is a NEW column (trip_transport never had
--     one); it is unrelated to `trips.status`.
--   * Apply in the Supabase dashboard (SQL editor) or via
--     `supabase db push` against the linked project. Until it is applied the
--     app still works: reads fall back to the pre-migration column set and
--     live-status writes are skipped (logged, non-fatal).
-- =============================================================================

ALTER TABLE public.trip_transport
  ADD COLUMN IF NOT EXISTS segment_status text,
  ADD COLUMN IF NOT EXISTS current_station text,
  ADD COLUMN IF NOT EXISTS current_station_code text,
  ADD COLUMN IF NOT EXISTS next_station text,
  ADD COLUMN IF NOT EXISTS next_station_code text,
  ADD COLUMN IF NOT EXISTS actual_departure_time text,
  ADD COLUMN IF NOT EXISTS actual_arrival_time text,
  ADD COLUMN IF NOT EXISTS expected_departure_time text,
  ADD COLUMN IF NOT EXISTS expected_arrival_time text,
  ADD COLUMN IF NOT EXISTS delay text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS last_status_update text;

-- The app writes a single live-status row per trip_transport (the same row
-- that was loaded), so an index is only useful for the rare list-based audit
-- query. Optional.
CREATE INDEX IF NOT EXISTS trip_transport_last_status_update_idx
  ON public.trip_transport (last_status_update DESC)
  WHERE last_status_update IS NOT NULL;