-- Run this in Supabase SQL Editor before using the upgraded Finance page.

alter table if exists public.invoices
  add column if not exists billing_month date,
  add column if not exists base_rent numeric(12,2) default 0,
  add column if not exists electricity_units numeric(10,2) default 0,
  add column if not exists electricity_rate numeric(12,2) default 0,
  add column if not exists electricity_amount numeric(12,2) default 0,
  add column if not exists custom_service_name text,
  add column if not exists custom_service_amount numeric(12,2) default 0,
  add column if not exists additional_notes text,
  add column if not exists is_finalized boolean default false,
  add column if not exists finalized_at timestamptz,
  add column if not exists paid_at timestamptz;

update public.invoices
set billing_month = date_trunc('month', coalesce(due_date, created_at::date))::date
where billing_month is null;

update public.invoices
set base_rent = coalesce(base_rent, amount, 0)
where coalesce(base_rent, 0) = 0;

update public.invoices
set is_finalized = case
  when lower(coalesce(status, 'pending')) = 'draft' then false
  else true
end
where is_finalized is null;

create index if not exists idx_invoices_student_status on public.invoices(student_id, status);
create index if not exists idx_invoices_billing_month on public.invoices(billing_month);
