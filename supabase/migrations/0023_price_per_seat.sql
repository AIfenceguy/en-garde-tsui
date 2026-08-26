-- Price per seat, because that is how people book.
--
-- The fares API returns a party total. The app and the alerts showed that
-- total, so Kelly's own $159 United booking appeared as "$317" and Ricky could
-- not recognise his own flight in the results. A number the customer cannot
-- match against what they actually paid is worse than no number.
--
-- Per seat is the primary unit everywhere now. The party total is still stored
-- and still shown, but secondary.

alter table flight_prices add column if not exists price_per_person numeric(10,2);
alter table flight_prices add column if not exists effective_per_person numeric(10,2);

comment on column flight_prices.price_per_person is
'price / passengers. The primary display unit - what a parent compares against the fare they were quoted.';

update flight_prices fp
   set price_per_person = round(fp.price / greatest(w.passengers,1), 2),
       effective_per_person = round(fp.effective_cost / greatest(w.passengers,1), 2)
  from flight_watches w
 where w.id = fp.watch_id and fp.price_per_person is null;

alter table flight_watches add column if not exists target_is_per_person boolean not null default true;

update flight_watches
   set target_price = round(target_price::numeric / greatest(passengers,1)),
       target_is_per_person = true
 where label = 'October NAC 2026 - Orlando' and target_price = 718;

comment on column flight_watches.target_price is
'Alert threshold PER SEAT. Kelly booked at $159/seat out and $200/seat back, so per-seat matches how the family actually thinks.';
