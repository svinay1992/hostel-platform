-- Adds snacks column to mess_menu
ALTER TABLE mess_menu
  ADD COLUMN IF NOT EXISTS snacks text;
