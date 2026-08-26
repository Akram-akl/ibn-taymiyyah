// =====================================================
// Instance Configuration File - النسخة التجريبية (برنامج المتابعة)
// =====================================================

const APP_CONFIG = {
    // 1. App Identity
    appName: "برنامج المتابعة",
    appDescription: "منصة التحفيظ والمتابعه القرآنية",

    // 2. Theme Configuration (الثيمات)
    themeColors: {
        50:  '#ecfdf5',
        100: '#d1fae5',
        200: '#a7f3d0',
        300: '#6ee7b7',
        400: '#34d399',
        500: '#10b981', // اللون الأساسي
        600: '#059669',
        700: '#047857',
        800: '#065f46',
        900: '#064e3b',
    },
    // لون الهيدر (الشريط العلوي)
    headerColor: '#064e3b',

    // إظهار ملاحظات التجربة (لنسخة أكرم والتجريبية فقط)
    showDemoHints: false,

    // 3. Supabase Database Configuration
    supabaseUrl: 'https://xxcqfqedyymuafqvdtgg.supabase.co',
    supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh4Y3FmcWVkeXltdWFmcXZkdGdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MDE1MTAsImV4cCI6MjA4NTE3NzUxMH0.t5NArVykZRw5vX-e_Sr-eHzIuwlV6fch85APqL0nZi0',

    // 4. Levels Configuration
    levels: {
        'ibn_umar': {
            name: 'حلقة عبدالله بن عمر',
            emoji: '<i data-lucide="star" class="w-6 h-6 inline-block text-emerald-500"></i>'
        },
        'ijazat': {
            name: 'حلقة إجازات',
            emoji: '<i data-lucide="award" class="w-6 h-6 inline-block text-yellow-500"></i>',
            isAdult: true
        }
    }
};
