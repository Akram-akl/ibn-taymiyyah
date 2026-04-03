-- =====================================================
-- Supabase Schema for Ibn Taymiyyah Competitions App
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
    activity_points INTEGER DEFAULT 0,
    activity_absent_points INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='competitions' AND column_name='activity_points') THEN
        ALTER TABLE competitions ADD COLUMN activity_points INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='competitions' AND column_name='activity_absent_points') THEN
        ALTER TABLE competitions ADD COLUMN activity_absent_points INTEGER DEFAULT 0;
    END IF;
END $$;

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
    "quranSection" TEXT,
    "quranText" TEXT,
    timestamp BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- NEW: Add Quran Fields if they don't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scores' AND column_name='quranSection') THEN
        ALTER TABLE scores ADD COLUMN "quranSection" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scores' AND column_name='quranText') THEN
        ALTER TABLE scores ADD COLUMN "quranText" TEXT;
    END IF;
END $$;

-- 5. Teachers Table
CREATE TABLE IF NOT EXISTS teachers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    level TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Activity Days Table
CREATE TABLE IF NOT EXISTS activity_days (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    competition_id UUID REFERENCES competitions(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    points INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Group Scores Table
CREATE TABLE IF NOT EXISTS group_scores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    competition_id UUID REFERENCES competitions(id) ON DELETE CASCADE,
    reason TEXT,
    points INTEGER NOT NULL,
    type TEXT,
    level TEXT,
    date TEXT,
    timestamp BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- Enable Row Level Security (RLS)
-- =====================================================
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_scores ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- Create Policies (Using DROP IF EXISTS for idempotency)
-- =====================================================
DROP POLICY IF EXISTS "Allow public read students" ON students;
DROP POLICY IF EXISTS "Allow public insert students" ON students;
DROP POLICY IF EXISTS "Allow public update students" ON students;
DROP POLICY IF EXISTS "Allow public delete students" ON students;
CREATE POLICY "Allow public read students" ON students FOR SELECT USING (true);
CREATE POLICY "Allow public insert students" ON students FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update students" ON students FOR UPDATE USING (true);
CREATE POLICY "Allow public delete students" ON students FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read competitions" ON competitions;
DROP POLICY IF EXISTS "Allow public insert competitions" ON competitions;
DROP POLICY IF EXISTS "Allow public update competitions" ON competitions;
DROP POLICY IF EXISTS "Allow public delete competitions" ON competitions;
CREATE POLICY "Allow public read competitions" ON competitions FOR SELECT USING (true);
CREATE POLICY "Allow public insert competitions" ON competitions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update competitions" ON competitions FOR UPDATE USING (true);
CREATE POLICY "Allow public delete competitions" ON competitions FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read groups" ON groups;
DROP POLICY IF EXISTS "Allow public insert groups" ON groups;
DROP POLICY IF EXISTS "Allow public update groups" ON groups;
DROP POLICY IF EXISTS "Allow public delete groups" ON groups;
CREATE POLICY "Allow public read groups" ON groups FOR SELECT USING (true);
CREATE POLICY "Allow public insert groups" ON groups FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update groups" ON groups FOR UPDATE USING (true);
CREATE POLICY "Allow public delete groups" ON groups FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read scores" ON scores;
DROP POLICY IF EXISTS "Allow public insert scores" ON scores;
DROP POLICY IF EXISTS "Allow public update scores" ON scores;
DROP POLICY IF EXISTS "Allow public delete scores" ON scores;
CREATE POLICY "Allow public read scores" ON scores FOR SELECT USING (true);
CREATE POLICY "Allow public insert scores" ON scores FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update scores" ON scores FOR UPDATE USING (true);
CREATE POLICY "Allow public delete scores" ON scores FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read teachers" ON teachers;
DROP POLICY IF EXISTS "Allow public insert teachers" ON teachers;
DROP POLICY IF EXISTS "Allow public update teachers" ON teachers;
DROP POLICY IF EXISTS "Allow public delete teachers" ON teachers;
CREATE POLICY "Allow public read teachers" ON teachers FOR SELECT USING (true);
CREATE POLICY "Allow public insert teachers" ON teachers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update teachers" ON teachers FOR UPDATE USING (true);
CREATE POLICY "Allow public delete teachers" ON teachers FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read activity_days" ON activity_days;
DROP POLICY IF EXISTS "Allow public insert activity_days" ON activity_days;
DROP POLICY IF EXISTS "Allow public update activity_days" ON activity_days;
DROP POLICY IF EXISTS "Allow public delete activity_days" ON activity_days;
CREATE POLICY "Allow public read activity_days" ON activity_days FOR SELECT USING (true);
CREATE POLICY "Allow public insert activity_days" ON activity_days FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update activity_days" ON activity_days FOR UPDATE USING (true);
CREATE POLICY "Allow public delete activity_days" ON activity_days FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read group_scores" ON group_scores;
DROP POLICY IF EXISTS "Allow public insert group_scores" ON group_scores;
DROP POLICY IF EXISTS "Allow public update group_scores" ON group_scores;
DROP POLICY IF EXISTS "Allow public delete group_scores" ON group_scores;
CREATE POLICY "Allow public read group_scores" ON group_scores FOR SELECT USING (true);
CREATE POLICY "Allow public insert group_scores" ON group_scores FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update group_scores" ON group_scores FOR UPDATE USING (true);
CREATE POLICY "Allow public delete group_scores" ON group_scores FOR DELETE USING (true);

-- =====================================================
-- Enable Realtime
-- =====================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'students') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE students;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'competitions') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE competitions;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'groups') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE groups;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'scores') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE scores;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'teachers') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE teachers;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'activity_days') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE activity_days;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'group_scores') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE group_scores;
    END IF;
END $$;

-- =====================================================
-- Create Indexes
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_activity_days_competition_id ON activity_days(competition_id);
CREATE INDEX IF NOT EXISTS idx_activity_days_date ON activity_days(date);
CREATE INDEX IF NOT EXISTS idx_scores_student_id ON scores(student_id);
CREATE INDEX IF NOT EXISTS idx_scores_competition_id ON scores(competition_id);
CREATE INDEX IF NOT EXISTS idx_scores_date ON scores(date);
CREATE INDEX IF NOT EXISTS idx_students_level ON students(level);
CREATE INDEX IF NOT EXISTS idx_students_parent_phone ON students(parent_phone);
CREATE INDEX IF NOT EXISTS idx_groups_competition_id ON groups(competition_id);
CREATE INDEX IF NOT EXISTS idx_teachers_level ON teachers(level);
CREATE INDEX IF NOT EXISTS idx_group_scores_group_id ON group_scores(group_id);
CREATE INDEX IF NOT EXISTS idx_group_scores_competition_id ON group_scores(competition_id);

-- Create trigger functions for updated_at
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DO $$
DECLARE
    t text;
BEGIN
    FOR t IN 
        SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS set_timestamp ON %I', t);
        EXECUTE format('CREATE TRIGGER set_timestamp BEFORE UPDATE ON %I FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp()', t);
    END LOOP;
END;
$$;
