-- =====================================================
-- Supabase Schema for برنامج البراء بن مالك
-- Project URL: https://mngfqzkhlfoxmlsjbwyt.supabase.co
-- =====================================================

-- 1. Students Table
CREATE TABLE IF NOT EXISTS students (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    student_number TEXT,
    parent_phone TEXT,
    national_id TEXT,
    last_association_exam TEXT,
    level TEXT NOT NULL,
    icon TEXT,
    password TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='national_id') THEN
        ALTER TABLE students ADD COLUMN national_id TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='students' AND column_name='last_association_exam') THEN
        ALTER TABLE students ADD COLUMN last_association_exam TEXT;
    END IF;
END $$;

-- 2. Competitions Table
CREATE TABLE IF NOT EXISTS competitions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '🏆',
    level TEXT NOT NULL,
    active BOOLEAN DEFAULT FALSE,
    criteria JSONB DEFAULT '[]'::jsonb,
    absent_excuse NUMERIC DEFAULT 1,
    absent_no_excuse NUMERIC DEFAULT 4,
    activity_points NUMERIC DEFAULT 0,
    activity_absent_points NUMERIC DEFAULT 0,
    memorization_points NUMERIC DEFAULT 0,
    memorization_negative_points NUMERIC DEFAULT 0,
    review_points NUMERIC DEFAULT 0,
    review_negative_points NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='competitions' AND column_name='activity_points') THEN
        ALTER TABLE competitions ADD COLUMN activity_points NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='competitions' AND column_name='activity_absent_points') THEN
        ALTER TABLE competitions ADD COLUMN activity_absent_points NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='competitions' AND column_name='memorization_points') THEN
        ALTER TABLE competitions ADD COLUMN memorization_points NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='competitions' AND column_name='memorization_negative_points') THEN
        ALTER TABLE competitions ADD COLUMN memorization_negative_points NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='competitions' AND column_name='review_points') THEN
        ALTER TABLE competitions ADD COLUMN review_points NUMERIC DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='competitions' AND column_name='review_negative_points') THEN
        ALTER TABLE competitions ADD COLUMN review_negative_points NUMERIC DEFAULT 0;
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
    points NUMERIC NOT NULL,
    type TEXT,
    level TEXT,
    "date" TEXT,
    timestamp BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    quran_type TEXT,
    quran_section TEXT,
    quran_start_sura INTEGER,
    quran_end_sura INTEGER,
    quran_start_aya INTEGER,
    quran_end_aya INTEGER,
    quran_grade TEXT,
    note_text TEXT,
    visibility TEXT,
    is_collective BOOLEAN DEFAULT FALSE
);

DO $$ 
BEGIN
    -- snake_case columns
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scores' AND column_name='date') THEN
        ALTER TABLE scores ADD COLUMN "date" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scores' AND column_name='quran_end_aya') THEN
        ALTER TABLE scores ADD COLUMN quran_end_aya INTEGER;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scores' AND column_name='quran_grade') THEN
        ALTER TABLE scores ADD COLUMN quran_grade TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scores' AND column_name='note_text') THEN
        ALTER TABLE scores ADD COLUMN note_text TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scores' AND column_name='visibility') THEN
        ALTER TABLE scores ADD COLUMN visibility TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='scores' AND column_name='is_collective') THEN
        ALTER TABLE scores ADD COLUMN is_collective BOOLEAN DEFAULT FALSE;
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
    points NUMERIC NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Group Scores Table
CREATE TABLE IF NOT EXISTS group_scores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
    competition_id UUID REFERENCES competitions(id) ON DELETE CASCADE,
    reason TEXT,
    points NUMERIC NOT NULL,
    type TEXT,
    level TEXT,
    date TEXT,
    timestamp BIGINT DEFAULT EXTRACT(EPOCH FROM NOW()) * 1000,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Student Plans Table (Curriculum Management)
CREATE TABLE IF NOT EXISTS student_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    plan_type TEXT NOT NULL, -- 'memorization' or 'review'
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    start_sura INTEGER NOT NULL,
    start_ayah INTEGER NOT NULL,
    end_sura INTEGER NOT NULL,
    end_ayah INTEGER NOT NULL,
    start_page NUMERIC NOT NULL,
    end_page NUMERIC NOT NULL,
    active_week_days JSONB DEFAULT '["sun","mon","tue","wed","thu"]'::jsonb,
    study_days JSONB DEFAULT '[0,1,2,3,4]'::jsonb, -- NEW: Flexible study days (0=Sun, 4=Thu)
    level TEXT NOT NULL,
    status TEXT DEFAULT 'active', -- 'active', 'completed', 'paused'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Plan Daily Records Table (only stores actual events: completed, absent, intensive)
CREATE TABLE IF NOT EXISTS plan_daily_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    plan_id UUID REFERENCES student_plans(id) ON DELETE CASCADE,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    planned_start_page NUMERIC,
    planned_end_page NUMERIC,
    planned_sections JSONB DEFAULT '[]'::jsonb,
    planned_start_sura INTEGER,
    planned_start_ayah INTEGER,
    planned_end_sura INTEGER,
    planned_end_ayah INTEGER,
    actual_start_page NUMERIC,
    actual_end_page NUMERIC,
    actual_sections JSONB DEFAULT '[]'::jsonb,
    actual_start_sura INTEGER,
    actual_start_ayah INTEGER,
    actual_end_sura INTEGER,
    actual_end_ayah INTEGER,
    status TEXT DEFAULT 'pending', -- 'completed', 'absent', 'activity_day', 'intensive', 'different'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- New columns for flexible plans
ALTER TABLE student_plans ADD COLUMN IF NOT EXISTS pages_per_day NUMERIC DEFAULT 1;
ALTER TABLE plan_daily_records ADD COLUMN IF NOT EXISTS planned_start_sura INTEGER;
ALTER TABLE plan_daily_records ADD COLUMN IF NOT EXISTS planned_start_ayah INTEGER;
ALTER TABLE plan_daily_records ADD COLUMN IF NOT EXISTS planned_end_sura INTEGER;
ALTER TABLE plan_daily_records ADD COLUMN IF NOT EXISTS planned_end_ayah INTEGER;
ALTER TABLE plan_daily_records ADD COLUMN IF NOT EXISTS actual_start_sura INTEGER;
ALTER TABLE plan_daily_records ADD COLUMN IF NOT EXISTS actual_start_ayah INTEGER;
ALTER TABLE plan_daily_records ADD COLUMN IF NOT EXISTS actual_end_sura INTEGER;
ALTER TABLE plan_daily_records ADD COLUMN IF NOT EXISTS actual_end_ayah INTEGER;
ALTER TABLE plan_daily_records ADD COLUMN IF NOT EXISTS undo_snapshot JSONB;

-- 10. Level Settings Table
CREATE TABLE IF NOT EXISTS level_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    level TEXT NOT NULL,
    feature_name TEXT NOT NULL,
    is_enabled BOOLEAN DEFAULT FALSE,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(level, feature_name)
);

-- Force add columns if table already existed without them
ALTER TABLE level_settings ADD COLUMN IF NOT EXISTS feature_name TEXT;
ALTER TABLE level_settings ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE level_settings ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;
ALTER TABLE level_settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE level_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Drop old constraint that forced 1 row per level
ALTER TABLE level_settings DROP CONSTRAINT IF EXISTS level_settings_level_key;

-- 11. Feedback Table
CREATE TABLE IF NOT EXISTS feedback (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    level TEXT,
    role TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Transfer Requests Table
CREATE TABLE IF NOT EXISTS transfer_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    from_level TEXT NOT NULL,
    to_level TEXT NOT NULL,
    delete_old_data BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'pending', -- 'pending', 'rejected'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. Tomorrow Plans Table (خطة الغد المباشرة)
CREATE TABLE IF NOT EXISTS tomorrow_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    level TEXT,
    for_date TEXT NOT NULL,
    hifz_start_sura INTEGER,
    hifz_start_ayah INTEGER,
    hifz_end_sura INTEGER,
    hifz_end_ayah INTEGER,
    hifz_start_page NUMERIC,
    hifz_end_page NUMERIC,
    hifz_sections JSONB DEFAULT '[]'::jsonb,
    review_start_sura INTEGER,
    review_start_ayah INTEGER,
    review_end_sura INTEGER,
    review_end_ayah INTEGER,
    review_start_page NUMERIC,
    review_end_page NUMERIC,
    review_sections JSONB DEFAULT '[]'::jsonb,
    completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(student_id, for_date)
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
ALTER TABLE student_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_daily_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE level_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfer_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE tomorrow_plans ENABLE ROW LEVEL SECURITY;

-- Tomorrow Plans Policies
DROP POLICY IF EXISTS "Allow public read tomorrow_plans" ON tomorrow_plans;
CREATE POLICY "Allow public read tomorrow_plans" ON tomorrow_plans FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert tomorrow_plans" ON tomorrow_plans;
CREATE POLICY "Allow public insert tomorrow_plans" ON tomorrow_plans FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update tomorrow_plans" ON tomorrow_plans;
CREATE POLICY "Allow public update tomorrow_plans" ON tomorrow_plans FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete tomorrow_plans" ON tomorrow_plans;
CREATE POLICY "Allow public delete tomorrow_plans" ON tomorrow_plans FOR DELETE USING (true);

-- =====================================================
-- Create Policies (Using DROP IF EXISTS for idempotency)
-- =====================================================
DROP POLICY IF EXISTS "Allow public read students" ON students;
DROP POLICY IF EXISTS "Allow public insert students" ON students;
DROP POLICY IF EXISTS "Allow public update students" ON students;
DROP POLICY IF EXISTS "Allow public delete students" ON students;
DROP POLICY IF EXISTS "Allow public read students" ON students;
CREATE POLICY "Allow public read students" ON students FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert students" ON students;
CREATE POLICY "Allow public insert students" ON students FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update students" ON students;
CREATE POLICY "Allow public update students" ON students FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete students" ON students;
CREATE POLICY "Allow public delete students" ON students FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read competitions" ON competitions;
DROP POLICY IF EXISTS "Allow public insert competitions" ON competitions;
DROP POLICY IF EXISTS "Allow public update competitions" ON competitions;
DROP POLICY IF EXISTS "Allow public delete competitions" ON competitions;
DROP POLICY IF EXISTS "Allow public read competitions" ON competitions;
CREATE POLICY "Allow public read competitions" ON competitions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert competitions" ON competitions;
CREATE POLICY "Allow public insert competitions" ON competitions FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update competitions" ON competitions;
CREATE POLICY "Allow public update competitions" ON competitions FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete competitions" ON competitions;
CREATE POLICY "Allow public delete competitions" ON competitions FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read groups" ON groups;
DROP POLICY IF EXISTS "Allow public insert groups" ON groups;
DROP POLICY IF EXISTS "Allow public update groups" ON groups;
DROP POLICY IF EXISTS "Allow public delete groups" ON groups;
DROP POLICY IF EXISTS "Allow public read groups" ON groups;
CREATE POLICY "Allow public read groups" ON groups FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert groups" ON groups;
CREATE POLICY "Allow public insert groups" ON groups FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update groups" ON groups;
CREATE POLICY "Allow public update groups" ON groups FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete groups" ON groups;
CREATE POLICY "Allow public delete groups" ON groups FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read scores" ON scores;
DROP POLICY IF EXISTS "Allow public insert scores" ON scores;
DROP POLICY IF EXISTS "Allow public update scores" ON scores;
DROP POLICY IF EXISTS "Allow public delete scores" ON scores;
DROP POLICY IF EXISTS "Allow public read scores" ON scores;
CREATE POLICY "Allow public read scores" ON scores FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert scores" ON scores;
CREATE POLICY "Allow public insert scores" ON scores FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update scores" ON scores;
CREATE POLICY "Allow public update scores" ON scores FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete scores" ON scores;
CREATE POLICY "Allow public delete scores" ON scores FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read teachers" ON teachers;
DROP POLICY IF EXISTS "Allow public insert teachers" ON teachers;
DROP POLICY IF EXISTS "Allow public update teachers" ON teachers;
DROP POLICY IF EXISTS "Allow public delete teachers" ON teachers;
DROP POLICY IF EXISTS "Allow public read teachers" ON teachers;
CREATE POLICY "Allow public read teachers" ON teachers FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert teachers" ON teachers;
CREATE POLICY "Allow public insert teachers" ON teachers FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update teachers" ON teachers;
CREATE POLICY "Allow public update teachers" ON teachers FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete teachers" ON teachers;
CREATE POLICY "Allow public delete teachers" ON teachers FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read activity_days" ON activity_days;
DROP POLICY IF EXISTS "Allow public insert activity_days" ON activity_days;
DROP POLICY IF EXISTS "Allow public update activity_days" ON activity_days;
DROP POLICY IF EXISTS "Allow public delete activity_days" ON activity_days;
DROP POLICY IF EXISTS "Allow public read activity_days" ON activity_days;
CREATE POLICY "Allow public read activity_days" ON activity_days FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert activity_days" ON activity_days;
CREATE POLICY "Allow public insert activity_days" ON activity_days FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update activity_days" ON activity_days;
CREATE POLICY "Allow public update activity_days" ON activity_days FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete activity_days" ON activity_days;
CREATE POLICY "Allow public delete activity_days" ON activity_days FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read group_scores" ON group_scores;
DROP POLICY IF EXISTS "Allow public insert group_scores" ON group_scores;
DROP POLICY IF EXISTS "Allow public update group_scores" ON group_scores;
DROP POLICY IF EXISTS "Allow public delete group_scores" ON group_scores;
DROP POLICY IF EXISTS "Allow public read group_scores" ON group_scores;
CREATE POLICY "Allow public read group_scores" ON group_scores FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert group_scores" ON group_scores;
CREATE POLICY "Allow public insert group_scores" ON group_scores FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update group_scores" ON group_scores;
CREATE POLICY "Allow public update group_scores" ON group_scores FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete group_scores" ON group_scores;
CREATE POLICY "Allow public delete group_scores" ON group_scores FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read student_plans" ON student_plans;
DROP POLICY IF EXISTS "Allow public insert student_plans" ON student_plans;
DROP POLICY IF EXISTS "Allow public update student_plans" ON student_plans;
DROP POLICY IF EXISTS "Allow public delete student_plans" ON student_plans;
DROP POLICY IF EXISTS "Allow public read student_plans" ON student_plans;
CREATE POLICY "Allow public read student_plans" ON student_plans FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert student_plans" ON student_plans;
CREATE POLICY "Allow public insert student_plans" ON student_plans FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update student_plans" ON student_plans;
CREATE POLICY "Allow public update student_plans" ON student_plans FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete student_plans" ON student_plans;
CREATE POLICY "Allow public delete student_plans" ON student_plans FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read plan_daily_records" ON plan_daily_records;
DROP POLICY IF EXISTS "Allow public insert plan_daily_records" ON plan_daily_records;
DROP POLICY IF EXISTS "Allow public update plan_daily_records" ON plan_daily_records;
DROP POLICY IF EXISTS "Allow public delete plan_daily_records" ON plan_daily_records;
DROP POLICY IF EXISTS "Allow public read plan_daily_records" ON plan_daily_records;
CREATE POLICY "Allow public read plan_daily_records" ON plan_daily_records FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert plan_daily_records" ON plan_daily_records;
CREATE POLICY "Allow public insert plan_daily_records" ON plan_daily_records FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update plan_daily_records" ON plan_daily_records;
CREATE POLICY "Allow public update plan_daily_records" ON plan_daily_records FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete plan_daily_records" ON plan_daily_records;
CREATE POLICY "Allow public delete plan_daily_records" ON plan_daily_records FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read level_settings" ON level_settings;
DROP POLICY IF EXISTS "Allow public insert level_settings" ON level_settings;
DROP POLICY IF EXISTS "Allow public update level_settings" ON level_settings;
DROP POLICY IF EXISTS "Allow public delete level_settings" ON level_settings;
DROP POLICY IF EXISTS "Hide passwords from level_settings" ON level_settings;
-- SECURITY: Hide password records from direct reads (verify_password RPC still works as SECURITY DEFINER)
CREATE POLICY "Hide passwords from level_settings" ON level_settings FOR SELECT
  USING (feature_name NOT IN ('auth_passwords', 'master_password'));
DROP POLICY IF EXISTS "Allow public insert level_settings" ON level_settings;
CREATE POLICY "Allow public insert level_settings" ON level_settings FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update level_settings" ON level_settings;
CREATE POLICY "Allow public update level_settings" ON level_settings FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete level_settings" ON level_settings;
CREATE POLICY "Allow public delete level_settings" ON level_settings FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read feedback" ON feedback;
DROP POLICY IF EXISTS "Allow public insert feedback" ON feedback;
DROP POLICY IF EXISTS "Allow public update feedback" ON feedback;
DROP POLICY IF EXISTS "Allow public delete feedback" ON feedback;
DROP POLICY IF EXISTS "Allow public read feedback" ON feedback;
CREATE POLICY "Allow public read feedback" ON feedback FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert feedback" ON feedback;
CREATE POLICY "Allow public insert feedback" ON feedback FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update feedback" ON feedback;
CREATE POLICY "Allow public update feedback" ON feedback FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete feedback" ON feedback;
CREATE POLICY "Allow public delete feedback" ON feedback FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public all transfer_requests" ON transfer_requests;
CREATE POLICY "Allow public all transfer_requests" ON transfer_requests FOR ALL USING (true) WITH CHECK (true);

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
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'level_settings') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE level_settings;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'feedback') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE feedback;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'transfer_requests') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE transfer_requests;
    END IF;
END $$;


-- =====================================================
-- NEW FEATURES: Security, Audit, Backup
-- =====================================================

-- AUDIT LOG TABLE
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,
    details JSONB,
    level TEXT,
    role TEXT,
    device_info TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public insert audit_log" ON audit_log;
CREATE POLICY "Allow public insert audit_log" ON audit_log FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public read audit_log" ON audit_log;
CREATE POLICY "Allow public read audit_log" ON audit_log FOR SELECT USING (true);

-- BACKUPS TABLE
CREATE TABLE IF NOT EXISTS backups (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    level TEXT NOT NULL,
    backup_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE backups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all backups" ON backups;
CREATE POLICY "Allow public all backups" ON backups FOR ALL USING (true) WITH CHECK (true);

-- VERIFY PASSWORD RPC FUNCTION (server-side check)
CREATE OR REPLACE FUNCTION verify_password(p_level TEXT, p_role TEXT, p_password TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_settings JSONB;
    v_master JSONB;
    v_correct TEXT;
BEGIN
    -- Check master password first
    SELECT settings INTO v_master
    FROM level_settings
    WHERE level = '_global' AND feature_name = 'master_password' AND is_enabled = true
    LIMIT 1;
    
    IF v_master IS NOT NULL AND v_master->>'password' = p_password THEN
        RETURN true;
    END IF;
    
    -- Check level-specific password
    SELECT settings INTO v_settings
    FROM level_settings
    WHERE level = p_level AND feature_name = 'auth_passwords' AND is_enabled = true
    LIMIT 1;
    
    IF v_settings IS NULL THEN
        RETURN false;
    END IF;
    
    IF p_role = 'teacher' THEN
        v_correct := v_settings->>'teacherPass';
    ELSIF p_role = 'student' THEN
        v_correct := v_settings->>'studentPass';
    ELSE
        RETURN false;
    END IF;
    
    RETURN v_correct = p_password;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- GET LEADERBOARD RPC FUNCTION (server-side calculation)
-- [FIX]: Changed return type from BIGINT to NUMERIC to match the points column type.
--        Previously, the BIGINT cast caused precision loss and type mismatch errors.
-- DROP required because PostgreSQL cannot change return type of existing function directly.
DROP FUNCTION IF EXISTS get_leaderboard(text, uuid);
CREATE OR REPLACE FUNCTION get_leaderboard(p_level TEXT, p_competition_id UUID DEFAULT NULL)
RETURNS TABLE(student_id UUID, student_name TEXT, total_points NUMERIC) AS $$
BEGIN
    RETURN QUERY
    SELECT s.id, s.name,
           COALESCE(SUM(sc.points), 0)::NUMERIC as total
    FROM students s
    LEFT JOIN scores sc ON sc.student_id = s.id
        AND sc.level = p_level
        AND (p_competition_id IS NULL OR sc.competition_id = p_competition_id)
    WHERE s.level = p_level
    GROUP BY s.id, s.name
    ORDER BY total DESC;
END;
$$ LANGUAGE plpgsql;

-- Initial Auth Passwords
DELETE FROM level_settings WHERE feature_name IN ('auth_passwords', 'master_password');

INSERT INTO level_settings (level, feature_name, is_enabled, settings)
VALUES 
    ('ibn_umar', 'auth_passwords', true, '{"teacherPass": "1234"}'::jsonb),
    ('ijazat', 'auth_passwords', true, '{"teacherPass": "5678"}'::jsonb),
    ('_global', 'master_password', true, '{"password": "112233"}'::jsonb);

-- =====================================================
-- Create Indexes
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_activity_days_competition_id ON activity_days(competition_id);
CREATE INDEX IF NOT EXISTS idx_activity_days_date ON activity_days(date);
CREATE INDEX IF NOT EXISTS idx_scores_student_id ON scores(student_id);
CREATE INDEX IF NOT EXISTS idx_scores_competition_id ON scores(competition_id);
CREATE INDEX IF NOT EXISTS idx_scores_date ON scores(date);
-- [FIX]: Added missing index on scores.level - critical for leaderboard and export queries
CREATE INDEX IF NOT EXISTS idx_scores_level ON scores(level);
CREATE INDEX IF NOT EXISTS idx_scores_level_student_id ON scores(level, student_id);
CREATE INDEX IF NOT EXISTS idx_students_level ON students(level);
CREATE INDEX IF NOT EXISTS idx_students_parent_phone ON students(parent_phone);
CREATE INDEX IF NOT EXISTS idx_groups_competition_id ON groups(competition_id);
CREATE INDEX IF NOT EXISTS idx_teachers_level ON teachers(level);
CREATE INDEX IF NOT EXISTS idx_group_scores_group_id ON group_scores(group_id);
CREATE INDEX IF NOT EXISTS idx_group_scores_competition_id ON group_scores(competition_id);
CREATE INDEX IF NOT EXISTS idx_level_settings_level ON level_settings(level);

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


-- ================================================
-- RECENT SCHEMA UPDATES (ALTER TABLES)
-- ================================================

-- Add scheduling fields to student_plans
ALTER TABLE student_plans ADD COLUMN IF NOT EXISTS active_week_days JSONB DEFAULT '["sun","mon","tue","wed","thu"]'::jsonb;
ALTER TABLE student_plans ADD COLUMN IF NOT EXISTS study_days JSONB DEFAULT '[0,1,2,3,4]'::jsonb;
ALTER TABLE student_plans ADD COLUMN IF NOT EXISTS pages_per_day NUMERIC DEFAULT 1;
ALTER TABLE student_plans ADD COLUMN IF NOT EXISTS original_snapshot JSONB;

-- ================================================
-- FORMS (Surveys) FEATURE
-- ================================================

CREATE TABLE IF NOT EXISTS forms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    level TEXT NOT NULL,
    fields JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT TRUE,
    end_date TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS form_responses (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    form_id UUID REFERENCES forms(id) ON DELETE CASCADE,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    level TEXT NOT NULL,
    responses JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(form_id, student_id)
);

-- RLS for forms
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read forms" ON forms;
CREATE POLICY "Allow public read forms" ON forms FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert forms" ON forms;
CREATE POLICY "Allow public insert forms" ON forms FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update forms" ON forms;
CREATE POLICY "Allow public update forms" ON forms FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete forms" ON forms;
CREATE POLICY "Allow public delete forms" ON forms FOR DELETE USING (true);

-- RLS for form_responses
ALTER TABLE form_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read form_responses" ON form_responses;
CREATE POLICY "Allow public read form_responses" ON form_responses FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert form_responses" ON form_responses;
CREATE POLICY "Allow public insert form_responses" ON form_responses FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update form_responses" ON form_responses;
CREATE POLICY "Allow public update form_responses" ON form_responses FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete form_responses" ON form_responses;
CREATE POLICY "Allow public delete form_responses" ON form_responses FOR DELETE USING (true);

-- Add to realtime
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'forms') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE forms;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'form_responses') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE form_responses;
    END IF;
END $$;

-- ================================================
-- TOMORROW PLANS FEATURE
-- خطة الغد: يحدد المعلم ما سيُسمَّع للطالب غداً
-- ================================================

CREATE TABLE IF NOT EXISTS tomorrow_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES students(id) ON DELETE CASCADE,
    level TEXT NOT NULL,
    -- قسم الحفظ / مراجعة صغرى
    hifz_start_sura INTEGER,
    hifz_start_ayah INTEGER,
    hifz_end_sura INTEGER,
    hifz_end_ayah INTEGER,
    hifz_start_page NUMERIC,
    hifz_end_page NUMERIC,
    hifz_sections JSONB DEFAULT '[]'::jsonb,
    -- قسم المراجعة الكبرى
    review_start_sura INTEGER,
    review_start_ayah INTEGER,
    review_end_sura INTEGER,
    review_end_ayah INTEGER,
    review_start_page NUMERIC,
    review_end_page NUMERIC,
    review_sections JSONB DEFAULT '[]'::jsonb,
    -- التاريخ الذي ستُطبَّق فيه الخطة (= غد وقت الإنشاء)
    for_date TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    -- خطة واحدة لكل طالب لكل يوم
    UNIQUE(student_id, for_date)
);

ALTER TABLE tomorrow_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all tomorrow_plans" ON tomorrow_plans;
CREATE POLICY "Allow public all tomorrow_plans" ON tomorrow_plans FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_tomorrow_plans_student_date ON tomorrow_plans(student_id, for_date);
CREATE INDEX IF NOT EXISTS idx_tomorrow_plans_level ON tomorrow_plans(level);

-- Add to Realtime
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'tomorrow_plans') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE tomorrow_plans;
    END IF;
END $$;

-- ================================================
-- KEEP-ALIVE: استعلام دوري لمنع تجميد المشروع
-- (يعمل فقط إذا كان pg_cron مفعّلاً - الخطط المدفوعة)
-- ================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
        PERFORM cron.schedule(
            'keep-alive-project',
            '0 9 */3 * *',
            $cron$SELECT count(*) FROM students LIMIT 1$cron$
        );
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- pg_cron not available, skip silently
    NULL;
END $$;

NOTIFY pgrst, 'reload schema';
