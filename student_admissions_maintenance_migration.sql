-- Adds maintenance deposit fields to student_admissions
ALTER TABLE student_admissions
  ADD COLUMN IF NOT EXISTS maintenance_deposit numeric;

ALTER TABLE student_admissions
  ADD COLUMN IF NOT EXISTS maintenance_deposit_date date;
