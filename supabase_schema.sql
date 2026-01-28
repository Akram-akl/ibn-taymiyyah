-- =====================================================
-- Supabase Schema for Ibn Taymiyyah Competitions App
-- =====================================================
-- Run this SQL in your Supabase SQL Editor (Dashboard > SQL Editor)
-- =====================================================

-- 1. Students Table
CREATE TABLE IF NOT EXISTS students (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    student_number TEXT,
    parent_phone TEXT,
    level TEXT NOT NULL,
    memorization_plan TEXT,
    review_plan TEXT,
    icon TEXT,
    password TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Competitions Table
CREATE TABLE IF NOT EXISTS competitions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '🏆',
    level TEXT NOT NULL,
    active BOOLEAN DEFAULT FALSE,
    criteria JSONB DEFAULT '[]'::jsonb,
    absent_excuse INTEGER DEFAULT 1,
    absent_no_excuse INTEGER DEFAULT 4,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Groups Table
CREATE TABLE IF NOT EXISTS groups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '🛡️',
    competition_id UUID REFERENCES competitions(id) ON DELETE CASCADE,
    level TEXT NOT NULL,
    leader UUID,
    deputy UUID,
    members UUID[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Scores Table
CREATE TABLE IF NOT EXISTS scores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    competition_id UUID REFERENCES competitions(id) ON DELETE CASCADE,
    group_id UUID,
    criteria_id TEXT,
    criteria_name TEXT,
    points INTEGER NOT NULL,
    type TEXT,
    level TEXT,
    date TEXT,
    timestamp BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Teachers Table
CREATE TABLE IF NOT EXISTS teachers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    level TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- Enable Row Level Security (RLS) - IMPORTANT for public access
-- =====================================================

ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- Create Policies for Public Access (using anon key)
-- These allow read/write for all users with the anon key
-- =====================================================

-- Students Policies
CREATE POLICY "Allow public read students" ON students FOR SELECT USING (true);
CREATE POLICY "Allow public insert students" ON students FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update students" ON students FOR UPDATE USING (true);
CREATE POLICY "Allow public delete students" ON students FOR DELETE USING (true);

-- Competitions Policies
CREATE POLICY "Allow public read competitions" ON competitions FOR SELECT USING (true);
CREATE POLICY "Allow public insert competitions" ON competitions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update competitions" ON competitions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete competitions" ON competitions FOR DELETE USING (true);

-- Groups Policies
CREATE POLICY "Allow public read groups" ON groups FOR SELECT USING (true);
CREATE POLICY "Allow public insert groups" ON groups FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update groups" ON groups FOR UPDATE USING (true);
CREATE POLICY "Allow public delete groups" ON groups FOR DELETE USING (true);

-- Scores Policies
CREATE POLICY "Allow public read scores" ON scores FOR SELECT USING (true);
CREATE POLICY "Allow public insert scores" ON scores FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update scores" ON scores FOR UPDATE USING (true);
CREATE POLICY "Allow public delete scores" ON scores FOR DELETE USING (true);

-- Teachers Policies
CREATE POLICY "Allow public read teachers" ON teachers FOR SELECT USING (true);
CREATE POLICY "Allow public insert teachers" ON teachers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update teachers" ON teachers FOR UPDATE USING (true);
CREATE POLICY "Allow public delete teachers" ON teachers FOR DELETE USING (true);

-- =====================================================
-- Enable Realtime for all tables (for live updates)
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE students;
ALTER PUBLICATION supabase_realtime ADD TABLE competitions;
ALTER PUBLICATION supabase_realtime ADD TABLE groups;
ALTER PUBLICATION supabase_realtime ADD TABLE scores;
ALTER PUBLICATION supabase_realtime ADD TABLE teachers;

-- =====================================================
-- Create Indexes for Performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_students_level ON students(level);
CREATE INDEX IF NOT EXISTS idx_students_parent_phone ON students(parent_phone);
CREATE INDEX IF NOT EXISTS idx_competitions_level ON competitions(level);
CREATE INDEX IF NOT EXISTS idx_groups_competition_id ON groups(competition_id);
CREATE INDEX IF NOT EXISTS idx_groups_level ON groups(level);
CREATE INDEX IF NOT EXISTS idx_scores_student_id ON scores(student_id);
CREATE INDEX IF NOT EXISTS idx_scores_competition_id ON scores(competition_id);
CREATE INDEX IF NOT EXISTS idx_scores_date ON scores(date);
CREATE INDEX IF NOT EXISTS idx_teachers_level ON teachers(level);
