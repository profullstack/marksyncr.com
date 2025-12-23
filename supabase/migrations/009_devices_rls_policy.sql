-- Migration: Add RLS policies for devices table
-- This allows authenticated users to manage their own devices

-- Enable RLS on devices table (if not already enabled)
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to make migration idempotent)
DROP POLICY IF EXISTS "Users can view own devices" ON devices;
DROP POLICY IF EXISTS "Users can insert own devices" ON devices;
DROP POLICY IF EXISTS "Users can update own devices" ON devices;
DROP POLICY IF EXISTS "Users can delete own devices" ON devices;

-- Policy: Users can view their own devices
CREATE POLICY "Users can view own devices"
ON devices FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Policy: Users can insert their own devices
CREATE POLICY "Users can insert own devices"
ON devices FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Policy: Users can update their own devices
CREATE POLICY "Users can update own devices"
ON devices FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Policy: Users can delete their own devices
CREATE POLICY "Users can delete own devices"
ON devices FOR DELETE
TO authenticated
USING (user_id = auth.uid());
