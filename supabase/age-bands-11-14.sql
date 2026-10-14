-- New age cut-offs: up to 10 = Beginner, 11 to 14 = Developing (both start with Essentials and need 1 minute to unlock a tempo), 15 to 17, 18 and older.
-- The band names stay the same in the database: under_10 = up to 10, 10_13 = 11 to 14, 14_17 = 15 to 17. Boards stay: up to 10 / 11-17 / 18+.
create or replace function public.age_band_on(dob date, asof date) returns text language sql immutable as $$
  select case
    when dob is null then null
    when date_part('year', age(asof, dob)) < 11 then 'under_10'
    when date_part('year', age(asof, dob)) < 15 then '10_13'
    when date_part('year', age(asof, dob)) < 18 then '14_17'
    else '18_plus' end
$$;
