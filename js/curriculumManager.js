/**
 * =====================================================
 * curriculumManager.js - نظام إدارة الخطط القرآنية والتسميع الذكي
 * =====================================================
 * Dual-Track Auto Plan Generator + Dynamic Shifting Engine
 * =====================================================
 */

window.CurriculumManager = (function() {

    // =====================================================
    // ثوابت النظام
    // =====================================================
    const DAY_NAMES = {0:'الأحد', 1:'الإثنين', 2:'الثلاثاء', 3:'الأربعاء', 4:'الخميس', 5:'الجمعة', 6:'السبت'};
    const DEFAULT_STUDY_DAYS = [0, 1, 2, 3, 4]; // الأحد - الخميس

    // =====================================================
    // 1. محركات الوصول لقاعدة البيانات (Supabase via Firebase wrapper)
    // =====================================================
    const db = () => window.db;
    const ops = () => window.firebaseOps;

    /** جلب خطة طالب نشطة حسب النوع */
    async function loadStudentPlan(studentId, planType = 'memorization') {
        try {
            const q = ops().query(
                ops().collection(db(), "student_plans"),
                ops().where("student_id", "==", studentId),
                ops().where("plan_type", "==", planType),
                ops().where("status", "==", "active")
            );
            const snap = await ops().getDocs(q);
            if (snap.empty) return null;
            const data = snap.docs[0].data();
            data.id = snap.docs[0].id;
            // التوافقية: توحيد أسماء الحقول لتكون snake_case
            return normalizePlanFields(data);
        } catch (e) {
            console.error("[Curriculum] Error loading plan:", e);
            return null;
        }
    }

    /** توحيد أسماء الحقول (snake_case ↔ camelCase) */
    function normalizePlanFields(plan) {
        if (!plan) return null;
        return {
            id: plan.id,
            student_id: plan.student_id || plan.studentId,
            plan_type: plan.plan_type || plan.planType,
            start_date: plan.start_date || plan.startDate,
            end_date: plan.end_date || plan.endDate,
            start_sura: Number(plan.start_sura || plan.startSura || 0),
            start_ayah: Number(plan.start_ayah || plan.startAyah || 0),
            end_sura: Number(plan.end_sura || plan.endSura || 0),
            end_ayah: Number(plan.end_ayah || plan.endAyah || 0),
            start_page: Number(plan.start_page || plan.startPage || 0),
            end_page: Number(plan.end_page || plan.endPage || 0),
            weekly_pages: plan.weekly_pages || plan.weeklyPages || {},
            level: plan.level,
            status: plan.status || 'active'
        };
    }

    /** جلب سجلات الأيام المنجزة/الغياب لخطة معينة */
    async function loadDailyRecords(planId) {
        try {
            const q = ops().query(
                ops().collection(db(), "plan_daily_records"),
                ops().where("plan_id", "==", planId)
            );
            const snap = await ops().getDocs(q);
            const records = [];
            snap.forEach(d => { const r = d.data(); r.id = d.id; records.push(r); });
            return records;
        } catch (e) {
            console.error("[Curriculum] Error loading records:", e);
            return [];
        }
    }

    // =====================================================
    // 2. مولد الخطط التلقائي (Dynamic Plan Generator)
    // =====================================================

    /**
     * توليد الجدول اليومي الكامل للخطة
     * يأخذ نقطة البداية والنهاية ويوزع الآيات على أيام الحضور الفعلية
     * يتعامل مع حواف السور تلقائياً عبر محرك QuranService
     * 
     * @param {object} planData - بيانات الخطة
     * @returns {Array} [{date, sections: [{suraNo, suraName, fromAyah, toAyah}], totalAyahs}]
     */
    async function generateDailySchedule(planData) {
        if (!planData) return [];
        const plan = normalizePlanFields(planData);
        if (!plan.start_sura || !plan.end_sura) return [];

        if (!window.QuranService.isLoaded()) await window.QuranService.loadData();

        // 1. جلب كل الآيات في النطاق 
        const allAyahs = window.QuranService.getAyahsInRange(
            plan.start_sura, plan.start_ayah,
            plan.end_sura, plan.end_ayah
        );
        if (allAyahs.length === 0) return [];

        // 2. حساب أيام الدراسة الفعلية (بدون جمعة وسبت)
        const studyDates = getStudyDatesBetween(plan.start_date, plan.end_date);
        if (studyDates.length === 0) return [];

        // 3. حساب الوزن المطلوب لكل يوم
        // الوزن = طول النص (لتوزيع عادل بين الآيات القصيرة والطويلة)
        allAyahs.forEach(a => { a._weight = (a.aya_text || "").length || 1; });
        const totalWeight = allAyahs.reduce((sum, a) => sum + a._weight, 0);
        const avgWeightPerDay = totalWeight / studyDates.length;

        // 4. التوزيع الذكي
        const schedule = [];
        let ayaIndex = 0;

        for (let i = 0; i < studyDates.length; i++) {
            if (ayaIndex >= allAyahs.length) break;

            let dayWeight = 0;
            let dayEndIndex = ayaIndex;

            while (dayEndIndex < allAyahs.length) {
                const aya = allAyahs[dayEndIndex];

                // لا نتجاوز 120% من المتوسط إلا إذا لم نبدأ بعد
                if (dayWeight > 0 && (dayWeight + aya._weight > avgWeightPerDay * 1.2)) break;

                dayWeight += aya._weight;
                dayEndIndex++;

                // قاعدة حواف السور: لا نبدأ سورة جديدة في آخر اليوم إذا كان الوزن كافياً
                const nextAya = allAyahs[dayEndIndex];
                if (nextAya && nextAya.sura_no !== aya.sura_no && dayWeight >= avgWeightPerDay * 0.8) {
                    break;
                }

                if (dayWeight >= avgWeightPerDay) break;
            }

            // اليوم الأخير: يأخذ كل ما تبقى
            if (i === studyDates.length - 1) dayEndIndex = allAyahs.length;

            const dayAyahs = allAyahs.slice(ayaIndex, dayEndIndex);
            if (dayAyahs.length === 0) break;

            // تنظيم المقاطع حسب السورة
            const sections = window.QuranService.groupAyahsIntoSections(dayAyahs);

            schedule.push({
                date: studyDates[i],
                sections,
                totalAyahs: dayAyahs.length,
                targetStartPage: dayAyahs[0].page,
                targetEndPage: dayAyahs[dayAyahs.length - 1].page,
                _weight: dayWeight
            });

            ayaIndex = dayEndIndex;
        }

        return schedule;
    }

    /**
     * جلب ورد اليوم الفعلي للطالب (مع مراعاة الغياب والإنجازات السابقة)
     * هذه هي الدالة الرئيسية المستخدمة في واجهة المعلم
     */
    async function getTodayAssignment(studentId, planType, targetDate) {
        const plan = await loadStudentPlan(studentId, planType);
        if (!plan) return null;

        const schedule = await generateDailySchedule(plan);
        if (!schedule || schedule.length === 0) return null;

        // جلب السجلات المنجزة والغياب
        const records = await loadDailyRecords(plan.id);
        const completedDates = new Set(records.filter(r => r.status === 'completed').map(r => r.date));
        const absentDates = new Set(records.filter(r => r.status === 'absent').map(r => r.date));

        // خوارزمية الإزاحة: 
        // النظام يتجاهل أيام الغياب ويعيد توزيع الورود
        const effectiveSchedule = [];
        for (const day of schedule) {
            if (!absentDates.has(day.date)) {
                effectiveSchedule.push(day);
            }
        }

        // البحث عن ورد اليوم
        const todayEntry = effectiveSchedule.find(d => d.date === targetDate);

        return {
            plan,
            schedule: effectiveSchedule,
            todayEntry: todayEntry || null,
            completedDates,
            absentDates,
            isCompleted: completedDates.has(targetDate)
        };
    }

    /** حساب أيام الدراسة بين تاريخين (استثناء الجمعة والسبت) */
    function getStudyDatesBetween(startStr, endStr) {
        const dates = [];
        const start = new Date(startStr);
        const end = new Date(endStr);
        const current = new Date(start);

        while (current <= end) {
            if (DEFAULT_STUDY_DAYS.includes(current.getDay())) {
                dates.push(current.toISOString().split('T')[0]);
            }
            current.setDate(current.getDate() + 1);
        }
        return dates;
    }

    // =====================================================
    // 3. خوارزمية الإزاحة والمرونة (Dynamic Shifting)
    // =====================================================

    /** تسجيل إنجاز ورد اليوم + إضافة نقاط في scores */
    async function markDayCompleted(planId, studentId, date, todayEntry, planType) {
        try {
            const data = {
                plan_id: planId,
                student_id: studentId,
                date: date,
                planned_start_page: todayEntry.targetStartPage,
                planned_end_page: todayEntry.targetEndPage,
                planned_sections: todayEntry.sections || [],
                actual_start_page: todayEntry.targetStartPage,
                actual_end_page: todayEntry.targetEndPage,
                actual_sections: todayEntry.sections || [],
                status: 'completed'
            };

            // تحقق من وجود سجل سابق لنفس اليوم
            const q = ops().query(
                ops().collection(db(), "plan_daily_records"),
                ops().where("plan_id", "==", planId),
                ops().where("date", "==", date)
            );
            const snap = await ops().getDocs(q);

            if (!snap.empty) {
                await ops().updateDoc(ops().doc(db(), "plan_daily_records", snap.docs[0].id), data);
            } else {
                await ops().addDoc(ops().collection(db(), "plan_daily_records"), data);
            }

            showToast('✅ تم تسجيل إنجاز اليوم بنجاح', 'success');
            return true;
        } catch (e) {
            console.error("[Curriculum]", e);
            showToast('خطأ في تسجيل الإنجاز', 'error');
            return false;
        }
    }

    /** تسجيل الغياب (الإزاحة التلقائية) */
    async function markDayAbsent(planId, studentId, date, todayEntry) {
        try {
            const data = {
                plan_id: planId,
                student_id: studentId,
                date: date,
                planned_start_page: todayEntry ? todayEntry.targetStartPage : null,
                planned_end_page: todayEntry ? todayEntry.targetEndPage : null,
                planned_sections: todayEntry ? todayEntry.sections : [],
                status: 'absent'
            };

            const q = ops().query(
                ops().collection(db(), "plan_daily_records"),
                ops().where("plan_id", "==", planId),
                ops().where("date", "==", date)
            );
            const snap = await ops().getDocs(q);

            if (!snap.empty) {
                await ops().updateDoc(ops().doc(db(), "plan_daily_records", snap.docs[0].id), data);
            } else {
                await ops().addDoc(ops().collection(db(), "plan_daily_records"), data);
            }

            showToast('📋 تم تسجيل الغياب وترحيل الورد تلقائياً', 'info');
            return true;
        } catch (e) {
            console.error("[Curriculum]", e);
            showToast('خطأ في تسجيل الغياب', 'error');
            return false;
        }
    }

    /** إنجاز مختلف عن المخطط: يحفظ ما أنجزه فعلاً ويعيد حساب نقطة البداية */
    async function submitDifferentCompletion(planId, studentId, date, actualStartSura, actualStartAyah, actualEndSura, actualEndAyah, planType) {
        try {
            const actualSections = window.QuranService.getAyahsInRange(actualStartSura, actualStartAyah, actualEndSura, actualEndAyah);
            const sections = window.QuranService.groupAyahsIntoSections(actualSections);

            const data = {
                plan_id: planId,
                student_id: studentId,
                date: date,
                actual_sections: sections,
                actual_start_page: actualSections.length > 0 ? actualSections[0].page : null,
                actual_end_page: actualSections.length > 0 ? actualSections[actualSections.length - 1].page : null,
                status: 'completed'
            };

            const q = ops().query(
                ops().collection(db(), "plan_daily_records"),
                ops().where("plan_id", "==", planId),
                ops().where("date", "==", date)
            );
            const snap = await ops().getDocs(q);
            if (!snap.empty) {
                await ops().updateDoc(ops().doc(db(), "plan_daily_records", snap.docs[0].id), data);
            } else {
                await ops().addDoc(ops().collection(db(), "plan_daily_records"), data);
            }

            // تحديث نقطة البداية في الخطة ← الآية التالية للإنجاز الفعلي
            const nextAya = window.QuranService.getNextAyah(actualEndSura, actualEndAyah);
            if (nextAya) {
                const planRef = ops().doc(db(), "student_plans", planId);
                await ops().updateDoc(planRef, {
                    start_sura: nextAya.sura_no,
                    start_ayah: nextAya.aya_no,
                    start_page: window.QuranService.getPageForAyah(nextAya.sura_no, nextAya.aya_no)
                });
            } else {
                // أنهى كل المنهج
                const planRef = ops().doc(db(), "student_plans", planId);
                await ops().updateDoc(planRef, { status: 'completed' });
            }

            // إضافة النقاط
            const todayEntry = { sections, targetStartPage: data.actual_start_page, targetEndPage: data.actual_end_page };
            await addPlanPointsToScores(studentId, date, planType, todayEntry);

            showToast('✅ تم تسجيل الإنجاز وإعادة الجدولة', 'success');
            return true;
        } catch (e) {
            console.error("[Curriculum]", e);
            showToast('خطأ في الحفظ', 'error');
            return false;
        }
    }



    // =====================================================
    // 4. واجهة حفظ الخطة
    // =====================================================

    async function savePlan(planData) {
        try {
            const clean = {
                student_id: planData.student_id,
                plan_type: planData.plan_type,
                start_date: planData.start_date,
                end_date: planData.end_date,
                start_sura: Number(planData.start_sura),
                start_ayah: Number(planData.start_ayah),
                end_sura: Number(planData.end_sura),
                end_ayah: Number(planData.end_ayah),
                start_page: Number(planData.start_page),
                end_page: Number(planData.end_page),
                weekly_pages: planData.weekly_pages || {},
                level: planData.level,
                status: 'active'
            };

            if (planData.id) {
                const docRef = ops().doc(db(), "student_plans", planData.id);
                await ops().updateDoc(docRef, clean);
                return planData.id;
            } else {
                // إلغاء أي خطة سابقة نشطة من نفس النوع
                const oldQ = ops().query(
                    ops().collection(db(), "student_plans"),
                    ops().where("student_id", "==", clean.student_id),
                    ops().where("plan_type", "==", clean.plan_type),
                    ops().where("status", "==", "active")
                );
                const oldSnap = await ops().getDocs(oldQ);
                for (const d of oldSnap.docs) {
                    await ops().updateDoc(ops().doc(db(), "student_plans", d.id), { status: 'replaced' });
                }

                const res = await ops().addDoc(ops().collection(db(), "student_plans"), clean);
                return res.id;
            }
        } catch (e) {
            console.error("[Curriculum] Save plan error:", e);
            throw e;
        }
    }

    // =====================================================
    // 5. واجهات المودال (UI Modals)
    // =====================================================

    /** فتح مودال إدارة الخطة */
    async function openPlanModal(studentId, type = 'memorization') {
        const plan = await loadStudentPlan(studentId, type);
        renderPlanManagerModal(studentId, plan, type);
    }

    /** بناء واجهة إنشاء/تعديل الخطة */
    function renderPlanManagerModal(studentId, plan, requestedType) {
        const activeType = requestedType || (plan ? plan.plan_type : 'memorization');

        const html = `
            <div id="plan-manager-modal" class="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="font-bold text-lg">📝 إدارة الخطة الزمنية</h3>
                        <button onclick="CurriculumManager.closeModal()" class="text-gray-400 hover:text-gray-600"><i data-lucide="x"></i></button>
                    </div>

                    <div class="space-y-4">
                        <input type="hidden" id="plan-id" value="${plan ? plan.id : ''}">

                        <!-- تبديل نوع الخطة -->
                        <div class="mb-4">
                            <label class="block text-xs font-bold text-gray-500 mb-2">نوع الخطة:</label>
                            <div class="grid grid-cols-2 gap-2 p-1 bg-gray-100 dark:bg-gray-700/50 rounded-xl">
                                <button type="button" onclick="CurriculumManager.openPlanModal('${studentId}', 'memorization')"
                                    class="py-2.5 rounded-lg text-sm font-bold transition ${activeType === 'memorization' ? 'bg-white dark:bg-gray-600 shadow-sm text-teal-600' : 'text-gray-500 hover:bg-gray-200'}">
                                    📖 الحفظ
                                </button>
                                <button type="button" onclick="CurriculumManager.openPlanModal('${studentId}', 'review')"
                                    class="py-2.5 rounded-lg text-sm font-bold transition ${activeType === 'review' ? 'bg-white dark:bg-gray-600 shadow-sm text-purple-600' : 'text-gray-500 hover:bg-gray-200'}">
                                    🔄 المراجعة
                                </button>
                            </div>
                            <input type="hidden" id="plan-type" value="${activeType}">
                        </div>

                        <div class="col-span-2 p-2 ${activeType === 'memorization' ? 'bg-teal-50 dark:bg-teal-900/10 border-teal-100' : 'bg-purple-50 dark:bg-purple-900/10 border-purple-100'} border rounded-lg text-center">
                            <span class="text-xs font-bold ${activeType === 'memorization' ? 'text-teal-700' : 'text-purple-700'}">تحرير خطة ${activeType === 'memorization' ? 'الحفظ' : 'المراجعة'}</span>
                        </div>

                        <!-- التواريخ -->
                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-bold text-gray-500 mb-1">تاريخ البدء</label>
                                <input type="date" id="plan-start-date" value="${plan ? plan.start_date : new Date().toISOString().split('T')[0]}" class="w-full border rounded-xl px-3 py-2 bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-500 mb-1">تاريخ الانتهاء</label>
                                <input type="date" id="plan-end-date" value="${plan ? plan.end_date : ''}" class="w-full border rounded-xl px-3 py-2 bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600">
                            </div>
                        </div>

                        <!-- النطاق -->
                        <div class="bg-gray-50 dark:bg-gray-700 p-3 rounded-xl border border-dashed">
                            <p class="text-xs font-bold mb-2">النطاق المطلوب إنجازه</p>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-3 mb-2">
                                <div>
                                    <label class="text-[10px] text-gray-500 mb-1 block">من السورة / الآية</label>
                                    <div class="flex gap-1">
                                        <select id="plan-start-sura" class="flex-1 bg-white dark:bg-gray-700 dark:text-white border rounded text-xs p-1 min-w-0" onchange="CurriculumManager.updateAyas('start')"></select>
                                        <select id="plan-start-aya" class="w-16 bg-white dark:bg-gray-700 dark:text-white border rounded text-xs p-1 min-w-0"></select>
                                    </div>
                                </div>
                                <div>
                                    <label class="text-[10px] text-gray-500 mb-1 block">إلى السورة / الآية</label>
                                    <div class="flex gap-1">
                                        <select id="plan-end-sura" class="flex-1 bg-white dark:bg-gray-700 dark:text-white border rounded text-xs p-1 min-w-0" onchange="CurriculumManager.updateAyas('end')"></select>
                                        <select id="plan-end-aya" class="w-16 bg-white dark:bg-gray-700 dark:text-white border rounded text-xs p-1 min-w-0"></select>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="flex gap-2 mt-6">
                        <button onclick="CurriculumManager.closeModal()" class="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-bold hover:bg-gray-200 transition">إلغاء</button>
                        <button onclick="CurriculumManager.submitPlan('${studentId}')" class="flex-1 py-3 bg-teal-600 text-white hover:bg-teal-700 rounded-xl font-bold shadow-lg">حفظ الخطة</button>
                    </div>
                </div>
            </div>
        `;

        let oldModal = document.getElementById('plan-manager-modal');
        if (oldModal) oldModal.remove();
        document.body.insertAdjacentHTML('beforeend', html);
        if (typeof lucide !== 'undefined') lucide.createIcons();
        initSuraSelectors(plan);
    }

    /** تعبئة قوائم السور والآيات */
    async function initSuraSelectors(plan) {
        if (!QuranService.isLoaded()) await QuranService.loadData();
        const suras = QuranService.getSuras();
        let opts = '<option value="">--</option>';
        suras.forEach(s => opts += `<option value="${s.number}">${s.number}. ${s.name}</option>`);

        document.getElementById('plan-start-sura').innerHTML = opts;
        document.getElementById('plan-end-sura').innerHTML = opts;

        if (plan) {
            if (plan.start_sura) {
                document.getElementById('plan-start-sura').value = plan.start_sura;
                await updateAyas('start');
                if (plan.start_ayah) document.getElementById('plan-start-aya').value = plan.start_ayah;
            }
            if (plan.end_sura) {
                document.getElementById('plan-end-sura').value = plan.end_sura;
                await updateAyas('end');
                if (plan.end_ayah) document.getElementById('plan-end-aya').value = plan.end_ayah;
            }
        }
    }

    async function updateAyas(prefix) {
        const suraVal = document.getElementById(`plan-${prefix}-sura`).value;
        const selector = document.getElementById(`plan-${prefix}-aya`);
        if (!suraVal) { selector.innerHTML = ''; return; }

        const ayas = QuranService.getAyahs(suraVal);
        selector.innerHTML = ayas.map(a => `<option value="${a.aya_no}">${a.aya_no}</option>`).join('');
    }

    /** معالجة حفظ الخطة */
    async function submitPlan(studentId) {
        const startSura = document.getElementById('plan-start-sura').value;
        const startAya = document.getElementById('plan-start-aya').value;
        const endSura = document.getElementById('plan-end-sura').value;
        const endAya = document.getElementById('plan-end-aya').value;

        if (!startSura || !startAya || !endSura || !endAya) {
            showToast('الرجاء تحديد النطاق بالكامل', 'error'); return;
        }

        const stats = QuranService.getTotalStats(startSura, startAya, endSura, endAya);
        if (stats.totalAyahs === 0) {
            showToast('النطاق المحدد لا يحتوي على آيات', 'error'); return;
        }

        const startDateStr = document.getElementById('plan-start-date').value;
        const endDateStr = document.getElementById('plan-end-date').value;

        if (!startDateStr || !endDateStr) {
            showToast('الرجاء تحديد تاريخ البدء والانتهاء', 'error'); return;
        }
        if (new Date(endDateStr) < new Date(startDateStr)) {
            showToast('تاريخ الانتهاء يجب أن يكون بعد البدء', 'error'); return;
        }

        const studyDays = getStudyDatesBetween(startDateStr, endDateStr);
        if (studyDays.length === 0) {
            showToast('لا توجد أيام دراسة في هذا النطاق', 'error'); return;
        }

        const planData = {
            id: document.getElementById('plan-id').value || null,
            student_id: studentId,
            plan_type: document.getElementById('plan-type').value,
            start_date: startDateStr,
            end_date: endDateStr,
            start_sura: Number(startSura),
            start_ayah: Number(startAya),
            end_sura: Number(endSura),
            end_ayah: Number(endAya),
            start_page: stats.startPage,
            end_page: stats.endPage,
            weekly_pages: {},
            level: typeof state !== 'undefined' ? state.currentLevel : '',
            status: 'active'
        };

        showPlanPreview(planData);
    }

    /** معاينة الجدول المُولّد قبل الحفظ */
    async function showPlanPreview(planData) {
        const schedule = await generateDailySchedule(planData);
        if (!schedule || schedule.length === 0) {
            showToast('تعذر توليد جدول لهذه التواريخ', 'error'); return;
        }

        const stats = QuranService.getTotalStats(planData.start_sura, planData.start_ayah, planData.end_sura, planData.end_ayah);

        let tableHtml = `
            <div class="overflow-x-auto border rounded-xl">
                <table class="w-full text-sm text-right text-gray-500 dark:text-gray-400">
                    <thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                        <tr><th class="px-3 py-2 border-b">التاريخ</th><th class="px-3 py-2 border-b">المقرر</th></tr>
                    </thead>
                    <tbody class="divide-y">
        `;
        schedule.forEach(day => {
            const taskText = day.sections.map(s => `${s.suraName} (${s.fromAyah}-${s.toAyah})`).join(' | ');
            tableHtml += `<tr class="bg-white dark:bg-gray-800"><td class="px-3 py-2 font-bold">${day.date}</td><td class="px-3 py-2 text-xs">${taskText}</td></tr>`;
        });
        tableHtml += `</tbody></table></div>`;

        let previewModal = document.getElementById('plan-preview-modal');
        if (previewModal) previewModal.remove();

        const html = `
            <div id="plan-preview-modal" class="fixed inset-0 bg-black/60 z-[210] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
                <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl flex flex-col max-h-[90vh]">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="font-bold text-lg text-teal-600">📋 معاينة جدول الخطة</h3>
                        <button onclick="document.getElementById('plan-preview-modal').remove()" class="text-gray-400 hover:text-gray-600"><i data-lucide="x"></i></button>
                    </div>
                    <div class="flex-1 overflow-y-auto mb-6 pr-1">
                        <p class="text-xs text-gray-500 mb-4 bg-teal-50 dark:bg-teal-900/20 p-3 rounded-lg border border-teal-100 dark:border-teal-800">
                            سيتم تقسيم <b>${stats.totalAyahs} آية (${stats.totalPages} صفحة)</b> على <b>${schedule.length} يوم دراسة</b>
                        </p>
                        ${tableHtml}
                    </div>
                    <div class="flex gap-3">
                        <button onclick="document.getElementById('plan-preview-modal').remove()" class="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-bold">إلغاء / تعديل</button>
                        <button id="confirm-save-plan-btn" class="flex-1 py-3 bg-teal-600 text-white rounded-xl font-bold shadow-lg hover:bg-teal-700">موافق واعتماد</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        if (typeof lucide !== 'undefined') lucide.createIcons();

        document.getElementById('confirm-save-plan-btn').onclick = async () => {
            const btn = document.getElementById('confirm-save-plan-btn');
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin mx-auto"></i>';
            if (typeof lucide !== 'undefined') lucide.createIcons();

            try {
                await savePlan(planData);
                showToast('تمت الموافقة وحفظ الخطة بنجاح', 'success');
                document.getElementById('plan-preview-modal').remove();
                closeModal();
            } catch (e) {
                showToast('خطأ في الحفظ', 'error');
                btn.disabled = false;
                btn.textContent = 'موافق واعتماد';
            }
        };
    }

    function closeModal() {
        const modal = document.getElementById('plan-manager-modal');
        if (modal) modal.remove();
    }

    // =====================================================
    // 6. واجهة المصحف الرقمي (Quran Viewer Modals)
    // =====================================================

    function showQuranModal(sectionsHtml) {
        let old = document.getElementById('quran-viewer-modal');
        if (old) old.remove();

        const html = `
            <div id="quran-viewer-modal" class="fixed inset-0 bg-black/80 z-[300] flex items-center justify-center p-2 sm:p-4" onclick="if(event.target===this)this.remove()">
                <div class="bg-amber-50 dark:bg-[#1a1c1e] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col" style="height:88vh">
                    <div class="p-4 border-b border-amber-200 dark:border-gray-700 bg-gradient-to-l from-amber-100 to-amber-200 dark:from-gray-800 dark:to-gray-900 flex justify-between items-center shrink-0">
                        <h3 class="font-bold text-amber-900 dark:text-amber-100 text-lg flex items-center gap-2">📖 ورد التسميع</h3>
                        <button onclick="document.getElementById('quran-viewer-modal').remove()" class="w-8 h-8 flex items-center justify-center rounded-full bg-amber-300/50 hover:bg-amber-300 text-amber-800 transition"><i data-lucide="x" class="w-5 h-5"></i></button>
                    </div>
                    <div class="p-6 flex-1 overflow-y-auto text-2xl md:text-[1.7rem] font-quran" dir="rtl">${sectionsHtml}</div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    function showPaginatedQuranModal(sectionsRaw) {
        if (!sectionsRaw || sectionsRaw.length === 0) return;
        const pagesHtmlArray = sectionsRaw.map(sec => QuranService.getTextForSections([sec]));

        let currentIndex = 0;

        function renderPage() {
            document.getElementById('quran-viewer-content').innerHTML = pagesHtmlArray[currentIndex];
            document.getElementById('quran-page-indicator').textContent = `${currentIndex + 1} / ${pagesHtmlArray.length}`;
            document.getElementById('quran-prev-btn').disabled = currentIndex === 0;
            document.getElementById('quran-next-btn').disabled = currentIndex === pagesHtmlArray.length - 1;
        }

        window._nextQuranPage = () => { if (currentIndex < pagesHtmlArray.length - 1) { currentIndex++; renderPage(); } };
        window._prevQuranPage = () => { if (currentIndex > 0) { currentIndex--; renderPage(); } };

        let old = document.getElementById('quran-viewer-modal');
        if (old) old.remove();

        const html = `
            <div id="quran-viewer-modal" class="fixed inset-0 bg-black/80 z-[300] flex items-center justify-center p-2 sm:p-4 animate-fade-in" onclick="if(event.target===this)this.remove()">
                <div class="bg-amber-50 dark:bg-[#1a1c1e] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col" style="height:88vh" onclick="event.stopPropagation()">
                    <div class="p-4 border-b border-amber-200 dark:border-gray-700 bg-gradient-to-l from-amber-100 to-amber-200 dark:from-gray-800 dark:to-gray-900 flex justify-between items-center shrink-0">
                        <button onclick="document.getElementById('quran-viewer-modal').remove()" class="w-8 h-8 flex items-center justify-center rounded-full bg-amber-300/50 hover:bg-amber-300 text-amber-800 transition"><i data-lucide="x" class="w-5 h-5"></i></button>
                        <div class="flex items-center gap-3" dir="ltr">
                            <button id="quran-next-btn" onclick="window._nextQuranPage()" class="w-8 h-8 flex items-center justify-center bg-amber-600 disabled:opacity-50 text-white rounded-full font-bold shadow-md hover:bg-amber-700 transition"><i data-lucide="chevron-right" class="w-5 h-5"></i></button>
                            <span id="quran-page-indicator" class="text-sm font-bold text-amber-900 dark:text-amber-100 min-w-[50px] text-center"></span>
                            <button id="quran-prev-btn" onclick="window._prevQuranPage()" class="w-8 h-8 flex items-center justify-center bg-amber-600 disabled:opacity-50 text-white rounded-full font-bold shadow-md hover:bg-amber-700 transition"><i data-lucide="chevron-left" class="w-5 h-5"></i></button>
                        </div>
                        <h3 class="font-bold text-amber-900 dark:text-amber-100 text-lg flex items-center gap-2">ورد التسميع 📖</h3>
                    </div>
                    <div id="quran-viewer-content" class="p-6 flex-1 overflow-y-auto text-2xl md:text-[1.7rem] font-quran" dir="rtl"></div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        if (typeof lucide !== 'undefined') lucide.createIcons();
        renderPage();
    }

    // =====================================================
    // 7. مودال الإنجاز المختلف (Different Completion Modal)
    // =====================================================

    function openDifferentCompletionModal(plan, studentId, date, todayEntry) {
        let old = document.getElementById('diff-completion-modal');
        if (old) old.remove();

        const html = `
        <div id="diff-completion-modal" class="fixed inset-0 bg-black/60 z-[250] flex items-center justify-center p-4" onclick="if(event.target===this)this.remove()">
            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                <h3 class="font-bold text-lg mb-4">📝 إنجاز مختلف</h3>
                <p class="text-xs text-gray-500 mb-3">حدد ما أنجزه الطالب فعلياً (مختلف عن الخطة)</p>
                <div class="grid grid-cols-2 gap-2 mb-3">
                    <div>
                        <label class="text-[10px] text-gray-500">من السورة / الآية</label>
                        <div class="flex gap-1">
                            <select id="diff-start-sura" class="flex-1 bg-gray-50 dark:bg-gray-700 dark:text-white border rounded text-xs p-1.5" onchange="CurriculumManager.updateDiffAyas('start')"></select>
                            <select id="diff-start-aya" class="flex-1 bg-gray-50 dark:bg-gray-700 dark:text-white border rounded text-xs p-1.5"></select>
                        </div>
                    </div>
                    <div>
                        <label class="text-[10px] text-gray-500">إلى السورة / الآية</label>
                        <div class="flex gap-1">
                            <select id="diff-end-sura" class="flex-1 bg-gray-50 dark:bg-gray-700 dark:text-white border rounded text-xs p-1.5" onchange="CurriculumManager.updateDiffAyas('end')"></select>
                            <select id="diff-end-aya" class="flex-1 bg-gray-50 dark:bg-gray-700 dark:text-white border rounded text-xs p-1.5"></select>
                        </div>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="document.getElementById('diff-completion-modal').remove()" class="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-bold">إلغاء</button>
                    <button onclick="CurriculumManager.handleDiffSubmit('${plan.id}','${studentId}','${date}','${plan.plan_type}')" class="flex-1 py-3 bg-blue-600 text-white hover:bg-blue-700 rounded-xl font-bold">حفظ</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        initDiffSelectors(todayEntry);
    }

    async function initDiffSelectors(todayEntry) {
        if (!QuranService.isLoaded()) await QuranService.loadData();
        const suras = QuranService.getSuras();
        let opts = '<option value="">--</option>';
        suras.forEach(s => opts += `<option value="${s.number}">${s.number}. ${s.name}</option>`);
        document.getElementById('diff-start-sura').innerHTML = opts;
        document.getElementById('diff-end-sura').innerHTML = opts;

        if (todayEntry && todayEntry.sections && todayEntry.sections.length > 0) {
            const first = todayEntry.sections[0];
            const last = todayEntry.sections[todayEntry.sections.length - 1];
            document.getElementById('diff-start-sura').value = first.suraNo;
            await updateDiffAyas('start');
            document.getElementById('diff-start-aya').value = first.fromAyah;
            document.getElementById('diff-end-sura').value = last.suraNo;
            await updateDiffAyas('end');
            document.getElementById('diff-end-aya').value = last.toAyah;
        }
    }

    async function updateDiffAyas(prefix) {
        const sura = document.getElementById(`diff-${prefix}-sura`).value;
        const sel = document.getElementById(`diff-${prefix}-aya`);
        if (!sura) { sel.innerHTML = ''; return; }
        const ayas = QuranService.getAyahs(sura);
        sel.innerHTML = ayas.map(a => `<option value="${a.aya_no}">${a.aya_no}</option>`).join('');
    }

    async function handleDiffSubmit(planId, studentId, date, planType) {
        const startSura = parseInt(document.getElementById('diff-start-sura').value);
        const startAyah = parseInt(document.getElementById('diff-start-aya').value);
        const endSura = parseInt(document.getElementById('diff-end-sura').value);
        const endAyah = parseInt(document.getElementById('diff-end-aya').value);

        if (!startSura || !endSura) { showToast("يرجى اختيار السورة والآيات", "error"); return; }

        const success = await submitDifferentCompletion(planId, studentId, date, startSura, startAyah, endSura, endAyah, planType);
        if (success) {
            const modal = document.getElementById('diff-completion-modal');
            if (modal) modal.remove();
            // تحديث واجهة المعلم
            if (typeof openRateStudent === 'function') openRateStudent(studentId);
        }
    }

    // =====================================================
    // الواجهة العامة (Public API)
    // =====================================================
    return {
        // البيانات
        loadStudentPlan,
        generateDailySchedule,
        getTodayAssignment,

        // الإجراءات
        markDayCompleted,
        markDayAbsent,
        submitDifferentCompletion,
        savePlan,

        // واجهات المودال
        openPlanModal,
        renderPlanManagerModal,
        closeModal,
        updateAyas,
        submitPlan,

        // المصحف الرقمي
        showQuranModal,
        showPaginatedQuranModal,

        // الإنجاز المختلف
        openDifferentCompletionModal,
        updateDiffAyas,
        handleDiffSubmit
    };
})();
