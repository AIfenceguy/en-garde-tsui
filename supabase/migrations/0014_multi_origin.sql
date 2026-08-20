-- Watch several departure airports at once.
--
-- The family can fly out of LAX, Ontario, Santa Ana, Long Beach or Burbank,
-- and Ontario is preferred. Checking five airports by hand every day is the
-- actual chore, so a watch now holds a set of origins and the job prices each
-- one. preferred_origin is not a filter - it is a tie-breaker, so a small
-- saving elsewhere does not beat the airport they actually want.

alter table flight_watches add column if not exists origins          text[];
alter table flight_watches add column if not exists preferred_origin text;

-- Carry any existing single-origin watch over.
update flight_watches
   set origins = array[origin]
 where origins is null and origin is not null;

update flight_watches
   set preferred_origin = origin
 where preferred_origin is null and origin is not null;

alter table flight_watches alter column origin drop not null;

-- Which airport a given fare departs from, so prices stay comparable.
alter table flight_prices add column if not exists origin text;

create index if not exists flight_prices_watch_origin_idx
    on flight_prices (watch_id, origin, price);

comment on column flight_watches.origins is
'All departure airports to price. LA basin options: LAX, ONT, SNA, LGB, BUR.';
comment on column flight_watches.preferred_origin is
'Tie-breaker, not a filter. Shown first and favoured when fares are close.';
