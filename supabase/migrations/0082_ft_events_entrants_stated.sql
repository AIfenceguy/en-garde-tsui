-- The entry page states its own count; the copier keeps it beside what it
-- parsed and flags a short read, so a partial list is never treated as the
-- field (Ricky, 2026-09-11: "false information is worse than no information").
alter table ft_events
  add column if not exists entrants_stated integer,
  add column if not exists entrants_complete boolean;
