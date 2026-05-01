# 📋 دليل التطوير والمراجعة — مسابقات ابن تيمية

> هذا الملف يحتوي على كل الأوامر والنقاط الجوهرية التي يجب مراجعتها مع كل تعديل.
> **آخر تحديث:** 2026-05-01

> [!CAUTION]
> ### ⛔ قاعدة إلزامية قبل أي تعديل:
> - مع كل تعديل كبير على الكود قم بعمل خطه كبيره و عند الانتهاء من الخطوه قم بوضع علاممه انتهاء على الجزء المنتهى من الخطوه
> **يجب على أي مطوّر (أو AI) أن يسأل جميع أسئلته ويوضّح خطته الكاملة قبل البدء في تنفيذ أي تعديل.**
> - لا تضف أي ميزة أو فكرة في الكود بدون استئذان صاحب المشروع أولاً.
> - لا تفترض أن المالك يريد شيئاً لم يطلبه صراحة.
> - اسأل عن كل نقطة غامضة قبل كتابة أي سطر.
> - إذا لم تكن متأكداً → اسأل. لا تجتهد.

---

## 📁 خريطة الملفات الأساسية

| الملف | الوصف | الحجم |
|---|---|---|
| `index.html` | الواجهة الرئيسية + تحميل السكربتات | ~29KB |
| `js/app.js` | **الملف الأساسي** — كل المنطق والواجهات | ~329KB / 6436 سطر |
| `js/supabase.js` | وسيط Firebase→Supabase (محاكي API) | ~10KB |
| `js/quranAnalyzer.js` | محرك بيانات المصحف (بحث + آيات) | ~8KB |
| `css/styles.css` | تنسيقات مخصصة + Dark Mode | ~157 سطر |
| `supabase_schema.sql` | هيكلية قاعدة البيانات (الجداول + RLS) **ملاحظة:** بعد كل تنفيذ لهذا الملف، يجب تشغيل أمر `NOTIFY pgrst, 'reload schema';` لتحديث الـ Cache. | ~19KB |
| `data/hafsData_v2-0.json` | بيانات المصحف (السور والآيات) | ملف بيانات |
| `update_site.bat` | أداة رفع التحديثات لـ GitHub → Cloudflare | سكربت نشر |

---

## 🛠️ أوامر هامة لـ Supabase (SQL Editor)
بعد تنفيذ أي تعديل على هيكلية الجداول باستخدام `supabase_schema.sql`، **يجب دائماً** تنفيذ الأمر التالي في محرر الـ SQL الخاص بـ Supabase لتحديث الـ Schema Cache لتجنب أخطاء "Could not find column in schema cache":
```sql
NOTIFY pgrst, 'reload schema';
```

---

## 🏗️ البنية المعمارية

### الطبقات الثلاث:
```
[index.html] → يحمل السكربتات + Tailwind + Lucide Icons
       ↓
[supabase.js] → وسيط يحول أوامر Firebase إلى Supabase REST API
       ↓
[app.js] → كل المنطق: (Auth → Router → Views → CRUD → Reports)
```

### الـ State المركزي (app.js):
```javascript
const state = {
    currentLevel: '',      // المرحلة الحالية (secondary, middle, upper_elem, lower_elem)
    isTeacher: false,      // هل المستخدم معلم؟
    isParent: false,       // هل المستخدم ولي أمر؟
    parentPhone: '',       // رقم جوال ولي الأمر
    students: [],          // طلاب المرحلة الحالية
    competitions: [],      // المسابقات
    groups: [],            // المجموعات
    scores: [],            // الدرجات
    currentView: 'home',   // الصفحة الحالية
    parentStudents: [],    // طلاب ولي الأمر
    activeWeekDays: ['sun','mon','tue','wed','thu']  // أيام الحلقة المفعلة (من level_settings)
}
```

### 📅 نظام جدولة أيام الأسبوع (Week Scheduling)

**المبدأ:** كل حلقة (ثانوية / متوسطة / ابتدائية عليا / أولية) لها أيام أسبوع خاصة بها، يحددها المعلم من الإعدادات.

**التخزين:** جدول `level_settings` بـ `feature_name = 'week_days'` + عمود `level` لعزل كل حلقة.

**تدفق البيانات:**
```
[المعلم يختار الأيام] → saveWeekDays() → level_settings (Supabase)
                                              ↓
[startGlobalDataSync] → onSnapshot(level_settings, level=currentLevel) → state.activeWeekDays
                                              ↓
[التقارير] → generateReportDatesForPreviousPeriod() → يبحث للخلف عن أيام تطابق state.activeWeekDays
                                              ↓
         → generateWeeklyReport()        (تقرير فردي للطالب)
         → generateGroupWeeklyReport()   (تقرير المجموعة)
         → buildWhatsAppQueue()          (واتساب مجمع)
```

**ملاحظة:** تقارير PDF (`generatePDFReport`, `exportScoresPDF`) تعتمد على فترة يدوية يحددها المعلم (من تاريخ → إلى تاريخ) وليس على الأيام التلقائية.

---

## ⚙️ أوامر النشر والتحديث

### 1. رفع التحديثات (الطريقة السريعة):
```bash
# تشغيل الملف الدفعي الجاهز:
update_site.bat

# أو يدوياً:
git add .
git commit -m "وصف التعديل"
git push
```
> ⚠️ Cloudflare Pages يرصد `git push` ويحدث الموقع تلقائياً خلال ثوانٍ.

### 2. تحديث هيكلية قاعدة البيانات (Supabase):
```sql
-- لتطبيق أي تعديلات على الـ Schema:
-- 1. افتح Supabase Dashboard → SQL Editor
-- 2. الصق أوامر ALTER TABLE أو CREATE TABLE
-- 3. لا تنسَ تفعيل RLS على أي جدول جديد:

ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;

-- سياسة إتاحة للجميع (للجداول العامة):
CREATE POLICY "Allow all" ON new_table FOR ALL USING (true) WITH CHECK (true);
```

---

## 🔍 قائمة المراجعة مع كل تعديل

### ✅ قبل كل تعديل:
- [ ] **اقرأ `state` جيداً** — تأكد أن أي بيانات تضيفها أو تعدلها موجودة في الحالة المركزية
- [ ] **تحقق من الـ Listeners** — أي `onSnapshot` جديد لازم يتم تنظيفه عند تغيير الصفحة
- [ ] **راجع `LEVELS` object** — إذا أضفت مرحلة جديدة، عدّل الكائن في `app.js`

### ✅ بعد كل تعديل:
- [ ] **اختبر الـ Auth** — سجل دخول كمعلم ← طالب ← ولي أمر
- [ ] **اختبر التوجيه (Router)** — انتقل بين الصفحات وتأكد من عدم تسرب الـ Listeners
- [ ] **اختبر على الجوال** — الواجهة responsive وكل الأزرار تعمل
- [ ] **تحقق من console** — لا يوجد أخطاء JavaScript
- [ ] **اختبر زر الرجوع (Back)** — خصوصاً على Android

---

## 📊 جداول قاعدة البيانات (Supabase)

| الجدول | الوصف | الحقول الرئيسية |
|---|---|---|
| `students` | بيانات الطلاب | `id, name, studentNumber, parentPhone, level, icon, password` |
| `competitions` | المسابقات | `id, name, icon, criteria[], level, active, absentExcuse, absentNoExcuse, activityPoints` |
| `scores` | درجات الطلاب | `id, studentId, competitionId, groupId, criteriaId, points, type, date` |
| `groups` | المجموعات | `id, name, icon, competitionId, leader, deputy, members[], level` |
| `activity_days` | سجل أيام النشاط | `id, competitionId, date, points` |
| `group_scores` | نقاط المجموعات المستقلة | `id, groupId, competitionId, reason, points, date` |
| `teachers` | بيانات المعلمين | `id, name, phone, level` |
| `level_settings` | إعدادات مخصصة لكل مرحلة | `id, level, feature_name, is_enabled, settings` |
| `feedback` | بلاغات الأخطاء والاقتراحات | `id, type, message, level, role, user_agent` |

### معرّفات خاصة (criteriaId):
| المعرّف | الاستخدام |
|---|---|
| `ABSENCE_RECORD` | تسجيل غياب (بعذر / بدون عذر) |
| `ACTIVITY_DAY` | حضور يوم نشاط |
| `QURAN_MEMORIZATION` | تسجيل حفظ قرآن |
| `QURAN_REVIEW` | تسجيل مراجعة قرآن |
| `TEACHER_NOTE` | ملاحظة نصية من المعلم للطالب أو ولي الأمر |
| `CUSTOM_*` | نقاط مخصصة (إيجابي / سلبي) |

---

## 🚨 نقاط حرجة يجب الانتباه لها

### 1. تنظيف الـ Listeners (Memory Leaks)
```javascript
// كل onSnapshot يجب حفظ الـ unsubscribe function:
let competitionsUnsubscribe = null;
let activeGroupsUnsubscribe = null;

// وعند الخروج أو تغيير الصفحة:
if (competitionsUnsubscribe) competitionsUnsubscribe();
```
> ⚠️ إذا أضفت listener جديد، أضف الـ cleanup في `logout()` و `startGlobalDataSync()`.

### 2. التعامل مع الدرجات (Scores)
```javascript
// عند رصد الدرجة: يجب التحقق من وجود سجل سابق لنفس الطالب + نفس اليوم + نفس المعيار
// النظام يستبدل (Update) بدل إنشاء مكرر (Add)

// submitScore() يعمل:
// 1. يبحث عن سجل موجود بنفس (studentId + date + criteriaId)
// 2. إذا وجد → يعدّل الأول ويحذف أي مكررات
// 3. إذا لم يجد → ينشئ سجل جديد
```

### 3. تنسيق أرقام الجوال
```javascript
// normalizePhone() يحول الرقم للصيغة الدولية:
// 05XXXXXXXX → 9665XXXXXXXX
// يجب استدعاؤه عند حفظ بيانات الطالب
```

### 4. الكاش (Offline Cache)
```javascript
// IndexedDB يخزن نتائج getDocs تلقائياً
// عند فشل الاتصال → يعرض البيانات المخزنة (صلاحية 24 ساعة)
// للتنظيف: OfflineCache.clear()
```

### 5. تاريخ الرصد
```javascript
// تاريخ الرصد يُحفظ في #grading-date
// لا يُحدّث تلقائياً إلا عند فتح جلسة رصد جديدة (keepDate parameter)
// الحد الأقصى للتاريخ = اليوم (لا يمكن الرصد لتاريخ مستقبلي)
```

---

## 🔧 وظائف مهمة يجب معرفتها

### الـ Router:
```javascript
const router = {
    render(view) {
        // 1. ينظف أي listeners سابقة
        // 2. يعيد رسم view-container بالمحتوى المطلوب
        // 3. يحدث state.currentView
        // 4. يعيد تهيئة Lucide Icons
    }
}
// الصفحات المتاحة: 'home', 'students', 'competitions', 'parent'
```

### Modals (النوافذ المنبثقة):
```javascript
// فتح: toggleModal('modal-id', true)
// إغلاق: closeModal('modal-id')
// أو: toggleModal('modal-id', false)

// الأحداث الديناميكية (تُنشأ عند الحاجة):
// absence-modal, custom-points-modal, group-points-modal
// stats-modal, report-modal, bulk-wa-runner-modal
// day-scores-modal, quran-ayah-viewer
```

### الـ Leaderboard:
```javascript
// calculateLeaderboard() — تُستدعى تلقائياً عند تحديث المسابقات أو المجموعات
// تعرض ترتيب المجموعات حسب النقاط في الـ Home
```

---

## 📱 ميزات النظام الحالية

| الميزة | الحالة | ملاحظات |
|---|---|---|
| تسجيل دخول (معلم/طالب/ولي أمر) | ✅ يعمل | 3 مسارات منفصلة — الطالب يختار المرحلة ثم اسمه ثم كلمة مروره الشخصية فقط (بدون كلمة مرور مرحلة) |
| أمان كلمات المرور | ✅ يعمل | المعلم: تحقق جهة الخادم (Supabase RPC) — الطالب: كلمة مرور شخصية فقط |
| إدارة الطلاب (CRUD) | ✅ يعمل | إضافة + تعديل + حذف + صور |
| إدارة المسابقات | ✅ يعمل | معايير مخصصة + غياب + نشاط |
| المجموعات | ✅ يعمل | قائد + نائب + أعضاء |
| رصد الدرجات | ✅ يعمل | يستبدل بدل التكرار |
| تسجيل حفظ / مراجعة القرآن | ✅ يعمل | نطاقات سور وآيات |
| تقويم شهري للطالب | ✅ يعمل | مع تفاصيل كل يوم |
| ترتيب الطالب (Ranking) | ✅ يعمل | ترتيب وتوجه أداء أسبوعي |
| تقارير أسبوعية WhatsApp | ✅ يعمل | فردي + مجمع |
| تقارير PDF | ✅ يعمل | html2pdf.js |
| تصدير XLSX احترافي | ✅ يعمل | طلاب + درجات (مكتبة SheetJS) |
| إحصائيات متقدمة | ✅ يعمل | إحصائيات ملخصة |
| بوابة ولي الأمر | ✅ يعمل | بحث بالرقم + تقرير الابن مع الترتيب |
| بحث في المصحف | ✅ يعمل | بحث نصي مباشر |
| نقاط مخصصة (إيجابي/سلبي) | ✅ يعمل | للطالب أو المجموعة |
| ملاحظات نصية للطالب | ✅ يعمل | ملاحظة من المعلم للطالب وولي الأمر |
| تصفير درجات الطالب | ✅ يعمل | زر تصفير مع تأكيد |
| نظام بلاغات واقتراحات | ✅ يعمل | مرتبط بقاعدة البيانات مباشرة |
| سجل التدقيق (Audit Log) | ✅ يعمل | لتسجيل الحذف وتعديل المعايير والأمان |
| النسخ الاحتياطي التلقائي | ✅ يعمل | يعمل في الخلفية للمعلم كل 7 أيام |
| جدولة أيام الأسبوع | ✅ يعمل | إعدادات مخصصة لكل مرحلة |
| نقاط مستقلة للمجموعة | ✅ يعمل | group_scores جدول مستقل |
| يوم نشاط | ✅ يعمل | مع تسجيل الغياب + WhatsApp |
| Offline Cache | ✅ يعمل | IndexedDB (24 ساعة) |
| Dark Mode | ✅ يعمل | حسب النظام |
| زر الرجوع Android | ✅ يعمل | يغلق Modal أو يرجع للرئيسية |

---

## ⚠️ ملفات يمكن حذفها أو تنظيفها

| الملف | السبب |
|---|---|
| `js/curriculumManager.js` | تم إلغاء ميزة إدارة المنهج — غير مستخدم نهائياً |

---

## 🧪 سيناريوهات الاختبار الأساسية

### 1. مسار المعلم:
```
تسجيل دخول كمعلم → إضافة طالب → إضافة مسابقة بمعايير → إنشاء مجموعة
→ رصد درجات → تسجيل غياب → تسجيل حفظ/مراجعة → تقرير أسبوعي
→ PDF تقرير → تصدير CSV → إحصائيات → تسجيل خروج
```

### 2. مسار الطالب:
```
اختيار المرحلة → اختيار الاسم → إدخال كلمة المرور الشخصية → دخول
→ عرض التقرير الشخصي → التقويم الشهري
→ تفاصيل يوم معين → عرض آيات القرآن → بحث في المصحف
→ تعديل البيانات الشخصية (بكلمة المرور)
```

### 3. مسار ولي الأمر:
```
تسجيل دخول كولي أمر → عرض قائمة الأبناء → فتح تقرير ابن
→ التقويم الشهري → تفاصيل الغياب → التواصل مع المعلم
```

---

## 📝 ملاحظات عامة للتطوير

1. **الـ Tailwind CSS** محمّل من CDN — لا يوجد build step
2. **Lucide Icons** محمّل من CDN — لازم تستدعي `lucide.createIcons()` بعد أي innerHTML
3. **html2pdf.js** محمّل من CDN — للتقارير PDF فقط
4. **لا يوجد Framework** — كل شيء Vanilla JS
5. **الأخطاء الشائعة:**
   - نسيان `lucide.createIcons()` بعد تغيير DOM
   - عدم تنظيف listeners عند التنقل
   - رقم الجوال بدون تنسيق دولي (966)
   - تكرار درجات نفس المعيار في نفس اليوم

---

## 🔄 ترتيب تحميل السكربتات (index.html)

```html
1. Tailwind CSS (CDN)
2. Lucide Icons (CDN)
3. html2pdf.js (CDN, defer)
4. supabase.js (محلي) → يُنشئ window.firebaseOps + window.db
5. quranAnalyzer.js (محلي) → يُنشئ window.QuranService
6. app.js (محلي) → ينتظر firebaseReady event ثم init()
```

---

> **هذا الملف مرجع حي — يجب تحديثه مع كل ميزة جديدة أو تغيير جوهري.**
