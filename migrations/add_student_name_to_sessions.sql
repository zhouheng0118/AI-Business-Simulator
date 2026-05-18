-- Migration: Add student_name column to sessions table
-- Run this in your Supabase SQL Editor: https://supabase.com/dashboard/project/ccreptdmfropdpbynuxg/sql/new

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS student_name TEXT;
