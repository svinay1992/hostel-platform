-- Run this in Supabase SQL Editor once.

alter table if exists public.student_admissions
  add column if not exists electricity_units numeric(10,2) default 0,
  add column if not exists electricity_rate_per_unit numeric(10,2) default 0;

update public.student_admissions
set electricity_units = coalesce(electricity_units, 0),
    electricity_rate_per_unit = coalesce(electricity_rate_per_unit, 0)
where electricity_units is null
   or electricity_rate_per_unit is null;
