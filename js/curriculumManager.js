/**
 * نظام إدارة الخطط وتقسيم المنهج (Curriculum Manager)
 */

window.CurriculumManager = (function() {
    let currentStudentId = null;
    let currentPlan = null;
    
    // الأيام المعتمدة للدراسة (0 الأحد، 1 الإثنين، ... 4 الخميس)
    const STUDY_DAYS = [0, 1, 2, 3, 4]; // الأحد إلى الخميس

    async function loadStudentPlan(studentId, planType = 'memorization') {
        try {
            const q = window.firebaseOps.query(
                window.firebaseOps.collection(window.db, "student_plans"),
                window.firebaseOps.where("student_id", "==", studentId),
                window.firebaseOps.where("plan_type", "==", planType),
                window.firebaseOps.where("status", "==", "active")
            );
            const snap = await window.firebaseOps.getDocs(q);
            if (snap.empty) return null;
            return { id: snap.docs[0].id, ...snap.docs[0].data() };
        } catch (e) {
            console.error("Error loading plan:", e);
            return null;
        }
    }

    async function generateDailySchedule(planData) {
        if (!planData) return [];
        
        // دعم الحقول القديمة والجديدة (snake_case vs camelCase) لضمان التوافقية
        const start_date = planData.start_date || planData.startDate;
        const end_date = planData.end_date || planData.endDate;
        const start_sura = planData.start_sura || planData.startSura;
        const start_ayah = planData.start_ayah || planData.startAyah;
        const end_sura = planData.end_sura || planData.endSura;
        const end_ayah = planData.end_ayah || planData.endAyah;
        const STUDY_DAYS = [0, 1, 2, 3, 4]; // الأحد إلى الخميس
        
        if (!window.QuranService.isLoaded()) await window.QuranService.loadData();
        
        // 1. 获取范围内的所有阿亚
        const allSuras = window.QuranService.getSuras();
        let allAyasInRange = [];
        let capturing = false;
        
        for (const sura of allSuras) {
            if (sura.number < Math.min(start_sura, end_sura)) continue;
            if (sura.number > Math.max(start_sura, end_sura)) continue;
            
            const ayas = window.QuranService.getAyahs(sura.number);
            for (const aya of ayas) {
                if (aya.sura_no == start_sura && aya.aya_no == start_ayah) capturing = true;
                if (capturing) {
                    // إضافة وزن للأية بناءً على طول النص (للتوزيع العادل)
                    aya.weight = (aya.aya_text || "").length;
                    allAyasInRange.push(aya);
                }
                if (aya.sura_no == end_sura && aya.aya_no == end_ayah) {
                    capturing = false;
                    break;
                }
            }
            if (!capturing && allAyasInRange.length > 0) break;
        }

        if (allAyasInRange.length === 0) return [];

        // 2. حساب أيام الدراسة
        let studyDates = [];
        let cDate = new Date(start_date);
        let eDate = new Date(end_date);
        while (cDate <= eDate) {
            if (STUDY_DAYS.includes(cDate.getDay())) {
                studyDates.push(cDate.toISOString().split('T')[0]);
            }
            cDate.setDate(cDate.getDate() + 1);
        }

        if (studyDates.length === 0) return [];

        // 3. التوزيع الميزان التسلسلي
        const totalWeight = allAyasInRange.reduce((sum, a) => sum + a.weight, 0);
        const avgWeightPerDay = totalWeight / studyDates.length;
        
        let schedule = [];
        let ayaIndex = 0;

        for (let i = 0; i < studyDates.length; i++) {
            if (ayaIndex >= allAyasInRange.length) break;

            let dayStartAya = allAyasInRange[ayaIndex];
            let dayWeight = 0;
            let dayEndIndex = ayaIndex;

            // تجميع الآيات حتى نصل للوزن المطلوب
            while (dayEndIndex < allAyasInRange.length) {
                const aya = allAyasInRange[dayEndIndex];
                
                // إذا أضفنا هذه الآية، هل سنتخطى الوزن بكثير؟
                if (dayWeight > 0 && (dayWeight + aya.weight > avgWeightPerDay * 1.2)) {
                    // توقف هنا لضمان عدم الضغط الزائد، إلا إذا كانت أول آية
                    break;
                }
                
                dayWeight += aya.weight;
                dayEndIndex++;

                // قاعدة "الريحية الذكية": إذا وصلنا لنهاية سورة، نتفحص السورة القادمة
                const nextAya = allAyasInRange[dayEndIndex];
                if (nextAya && nextAya.sura_no !== aya.sura_no) {
                    // إذا كان المتبقي من السورة الجديدة قليل جداً (أقل من 4 آيات)، لا نبدأها اليوم إذا كان الوزن كافياً
                    if (dayWeight >= avgWeightPerDay * 0.8) {
                        // تفحص كم آية متبقية من السورة الجديدة في نطاقنا
                        let nextSuraCount = 0;
                        for(let k=dayEndIndex; k < allAyasInRange.length && allAyasInRange[k].sura_no == nextAya.sura_no; k++) nextSuraCount++;
                        if (nextSuraCount < 4) break; 
                    }
                }
                
                if (dayWeight >= avgWeightPerDay) break;
            }

            // ضمان شمولية اليوم الأخير
            if (i === studyDates.length - 1) dayEndIndex = allAyasInRange.length;
            
            const dayAyas = allAyasInRange.slice(ayaIndex, dayEndIndex);
            if (dayAyas.length === 0) break;

            let daySections = [];
            let curr = null;
            dayAyas.forEach(a => {
                if (!curr || curr.suraNo !== a.sura_no) {
                    curr = { suraNo: a.sura_no, suraName: a.sura_name_ar, fromAyah: a.aya_no, toAyah: a.aya_no };
                    daySections.push(curr);
                } else {
                    curr.toAyah = a.aya_no;
                }
            });

            schedule.push({
                date: studyDates[i],
                targetStartPage: dayAyas[0].page,
                targetEndPage: dayAyas[dayAyas.length-1].page,
                sections: daySections,
                totalWeight: dayWeight
            });

            ayaIndex = dayEndIndex;
        }

        return schedule;
    }

    async function recalculatePlan(studentId, planId, nextSura, nextAyah, nextDateStr, forceExtend = false) {
        try {
            const planRef = window.firebaseOps.doc(window.db, "student_plans", planId);
            const planSnap = await window.firebaseOps.getDoc(planRef);
            if (!planSnap.exists()) return;
            
            const raw = planSnap.data();
            const plan = {
                ...raw,
                original_start_date: raw.original_start_date || raw.start_date || raw.startDate,
                end_date: raw.end_date || raw.endDate,
                start_date: raw.start_date || raw.startDate,
                start_sura: raw.start_sura || raw.startSura,
                start_ayah: raw.start_ayah || raw.startAyah,
                start_page: Number(raw.start_page || raw.startPage || 0)
            };

            let finalEndDate = plan.end_date;
            let finalNextDate = nextDateStr;
            
            // الحد من رقم السورة (1-114)
            let safeNextSura = Number(nextSura);
            let safeNextAyah = Number(nextAyah);
            if (safeNextSura > 114) {
               await window.firebaseOps.updateDoc(planRef, { status: 'completed' });
               return { warning: false, completed: true };
            }

            // إذا كان هناك تمديد صريح (غياب)
            if (forceExtend) {
                const eDate = new Date(plan.end_date);
                eDate.setDate(eDate.getDate() + 1);
                finalEndDate = eDate.toLocaleDateString('en-CA');
            }

            const updateData = {
                // لا نغير start_date الأصلي هنا للحفاظ على التاريخ في التقويم
                // بل سنحدث الحقول التي تدل على نقطة التقدم الحالية
                start_sura: safeNextSura,
                start_ayah: safeNextAyah,
                current_progress_date: finalNextDate,
                end_date: finalEndDate,
                original_start_date: plan.original_start_date, // نضمن بقاءه
                updated_at: new Date().toISOString()
            };

            await window.firebaseOps.updateDoc(planRef, updateData);
            return { warning: false, completed: false };
        } catch (e) {
            console.error("Error recalculating plan:", e);
            throw e;
        }
    }

    async function recalculatePlanAfterAchievement(studentId, planId, actualEndSura, actualEndAyah) {
        if (!window.QuranService.isLoaded()) await window.QuranService.loadData();
        
        const planRef = window.firebaseOps.doc(window.db, "student_plans", planId);
        const planSnap = await window.firebaseOps.getDoc(planRef);
        const planData = planSnap.data();
        
        // حساب الآية التالية
        const allAyas = window.QuranService.getAyahs(actualEndSura);
        const currIdx = allAyas.findIndex(a => a.aya_no == actualEndAyah);
        let nextSura = Number(actualEndSura);
        let nextAyah = Number(actualEndAyah) + 1;
        
        if (currIdx === allAyas.length - 1) {
            nextSura = nextSura + 1;
            nextAyah = 1;
        }

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toLocaleDateString('en-CA');

        // كشف التأخير (هل أنجز أقل مما هو مقرر اليوم؟)
        const todayStr = new Date().toLocaleDateString('en-CA');
        const fullSchedule = await generateDailySchedule(planSnap.data());
        const todayTarget = fullSchedule.find(d => d.date === todayStr);
        
        let shouldExtend = false;
        if (todayTarget && todayTarget.sections && todayTarget.sections.length > 0) {
            const lastPlanned = todayTarget.sections[todayTarget.sections.length - 1];
            const pPage = window.QuranService.getPageForAyah(lastPlanned.suraNo, lastPlanned.toAyah);
            const aPage = window.QuranService.getPageForAyah(actualEndSura, actualEndAyah);
            if (aPage < pPage) shouldExtend = true;
        }

        return await recalculatePlan(studentId, planId, nextSura, nextAyah, tomorrowStr, shouldExtend);
    }

    async function savePlan(planData) {
        try {
            if (planData.id) {
                const docRef = window.firebaseOps.doc(window.db, "student_plans", planData.id);
                await window.firebaseOps.updateDoc(docRef, planData);
                return planData.id;
            } else {
                const res = await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "student_plans"), planData);
                return res.id;
            }
        } catch (e) {
            console.error(e);
            throw e;
        }
    }

    // بناء واجهة الخطة في نافذة الطالب
    function renderPlanManagerModal(studentId, plan, requestedType) {
        const activeType = requestedType || (plan ? plan.plan_type : 'memorization');

        let html = `
            <div id="plan-manager-modal" class="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
                <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="font-bold text-lg">📝 إدارة الخطة الزمنية</h3>
                        <button onclick="CurriculumManager.closeModal()" class="text-gray-400 hover:text-gray-600"><i data-lucide="x"></i></button>
                    </div>

                    <div class="space-y-4">
                        <input type="hidden" id="plan-id" value="${plan ? plan.id : ''}">
                        
                        <div class="mb-4">
                            <label class="block text-xs font-bold text-gray-500 mb-2">نوع الخطة المراد عرضها:</label>
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

                        <div class="grid grid-cols-2 gap-3" id="plan-type-display">
                            <div class="col-span-2 p-2 bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800 rounded-lg text-center">
                                <span class="text-xs font-bold text-blue-700 dark:text-blue-400">تحرير تفاصيل خطة ${activeType === 'memorization' ? 'الحفظ' : 'المراجعة'}</span>
                            </div>
                        </div>

                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-bold text-gray-500 mb-1">تاريخ البدء</label>
                                <input type="date" id="plan-start-date" value="${plan ? plan.start_date : new Date().toISOString().split('T')[0]}" class="w-full border rounded-xl px-3 py-2 bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-500 mb-1">تاريخ النهاية المستهدف</label>
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
                                        <select id="plan-start-sura" class="flex-1 bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600 border rounded text-xs p-1 min-w-0" onchange="CurriculumManager.updateAyas('start')"></select>
                                        <select id="plan-start-aya" class="w-16 bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600 border rounded text-xs p-1 min-w-0"></select>
                                    </div>
                                </div>
                                <div>
                                    <label class="text-[10px] text-gray-500 mb-1 block">إلى السورة / الآية</label>
                                    <div class="flex gap-1">
                                        <select id="plan-end-sura" class="flex-1 bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600 border rounded text-xs p-1 min-w-0" onchange="CurriculumManager.updateAyas('end')"></select>
                                        <select id="plan-end-aya" class="w-16 bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600 border rounded text-xs p-1 min-w-0"></select>
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
        lucide.createIcons();
        initSuraSelectors(plan);
    }
    
    function translateDay(d) {
        return {sun:'الأحد', mon:'الإثنين', tue:'الثلاثاء', wed:'الأربعاء', thu:'الخميس'}[d];
    }

    async function initSuraSelectors(plan) {
        if (!QuranService.isLoaded()) await QuranService.loadData();
        const suras = QuranService.getSuras();
        let opts = '<option value="">--</option>';
        suras.forEach(s => opts += `<option value="${s.number}">${s.number}. ${s.name}</option>`);
        
        document.getElementById('plan-start-sura').innerHTML = opts;
        document.getElementById('plan-end-sura').innerHTML = opts;
        
        if (plan) {
            // دعم كلا التسميتين (snake_case vs camelCase) لضمان ظهور البيانات القديمة والجديدة
            const startSura = plan.start_sura || plan.startSura;
            const startAyah = plan.start_ayah || plan.startAyah;
            const endSura = plan.end_sura || plan.endSura;
            const endAyah = plan.end_ayah || plan.endAyah;

            if (startSura) {
                document.getElementById('plan-start-sura').value = startSura;
                await updateAyas('start');
                if (startAyah) document.getElementById('plan-start-aya').value = startAyah;
            }
            
            if (endSura) {
                document.getElementById('plan-end-sura').value = endSura;
                await updateAyas('end');
                if (endAyah) document.getElementById('plan-end-aya').value = endAyah;
            }
        }
    }

    async function updateAyas(prefix) {
        const sSura = document.getElementById(`plan-${prefix}-sura`).value;
        const selector = document.getElementById(`plan-${prefix}-aya`);
        if (!sSura) { selector.innerHTML = ''; return; }
        
        const ayas = QuranService.getAyahs(sSura);
        let opts = '';
        ayas.forEach(a => opts += `<option value="${a.aya_no}">${a.aya_no}</option>`);
        selector.innerHTML = opts;
    }

    async function submitPlan(studentId) {
        const id = document.getElementById('plan-id').value;
        const startSura = document.getElementById('plan-start-sura').value;
        const startAya = document.getElementById('plan-start-aya').value;
        const endSura = document.getElementById('plan-end-sura').value;
        const endAya = document.getElementById('plan-end-aya').value;
        
        if (!startSura || !startAya || !endSura || !endAya) {
            showToast('الرجاء تحديد النطاق بالكامل', 'error'); return;
        }

        const startPage = QuranService.getPageForAyah(startSura, startAya);
        const endPage = QuranService.getPageForAyah(endSura, endAya);
        
        if (startPage > endPage || (startPage == endPage && Number(startSura)>Number(endSura))) {
            showToast('الترتيب غير صحيح', 'error'); return;
        }

        const startDateStr = document.getElementById('plan-start-date').value;
        const endDateStr = document.getElementById('plan-end-date').value;
        
        if (!startDateStr || !endDateStr) {
            showToast('الرجاء تحديد تاريخ البدء والانتهاء', 'error'); return;
        }

        let sDate = new Date(startDateStr);
        let eDate = new Date(endDateStr);
        if (eDate < sDate) {
            showToast('تاريخ الانتهاء يجب أن يكون بعد تاريخ البدء', 'error'); return;
        }

        let studyDaysCount = 0;
        let cDate = new Date(sDate);
        while(cDate <= eDate) {
            if (STUDY_DAYS.includes(cDate.getDay())) studyDaysCount++;
            cDate.setDate(cDate.getDate() + 1);
        }

        if (studyDaysCount === 0) {
            showToast('الجدول لا يحتوي على أيام دراسة، يرجى توسيع النطاق', 'error'); return;
        }

        const totalPages = Math.abs(endPage - startPage) + 1;
        // round to nearest hundreth
        let pagesPerDay = Math.ceil((totalPages / studyDaysCount) * 100) / 100;

        const planData = {
            id: id || null,
            student_id: studentId,
            plan_type: document.getElementById('plan-type').value,
            start_date: startDateStr,
            end_date: endDateStr,
            start_sura: Number(startSura),
            start_ayah: Number(startAya),
            end_sura: Number(endSura),
            end_ayah: Number(endAya),
            start_page: startPage,
            end_page: endPage,
            weekly_pages: {
                sun: pagesPerDay,
                mon: pagesPerDay,
                tue: pagesPerDay,
                wed: pagesPerDay,
                thu: pagesPerDay,
            },
            level: state.currentLevel,
            status: 'active'
        };

        showPlanPreview(planData);
    }

    async function showPlanPreview(planData) {
        if (!window.CurriculumManager || typeof window.CurriculumManager.generateDailySchedule !== 'function') {
            showToast('خطأ في تحميل محرك الخطط', 'error');
            return;
        }

        const schedule = await window.CurriculumManager.generateDailySchedule(planData);
        if (!schedule || schedule.length === 0) {
            showToast('تعذر توليد جدول لهذه التواريخ', 'error');
            return;
        }

        let scheduleHtml = `
            <div class="overflow-x-auto border rounded-xl">
                <table class="w-full text-sm text-right text-gray-500 dark:text-gray-400">
                    <thead class="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-700 dark:text-gray-400">
                        <tr>
                            <th class="px-3 py-2 border-b">التاريخ</th>
                            <th class="px-3 py-2 border-b">المقرر المطلوب</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y">
        `;

        schedule.forEach(day => {
            let taskText = 'يوم دراسي';
            if (day.sections && day.sections.length > 0) {
                taskText = day.sections.map(s => `${s.suraName} (${s.fromAyah}-${s.toAyah})`).join(' | ');
            }
            scheduleHtml += `
                <tr class="bg-white dark:bg-gray-800 border-b dark:border-gray-700">
                    <td class="px-3 py-2 font-bold">${day.date}</td>
                    <td class="px-3 py-2 text-xs">${taskText}</td>
                </tr>
            `;
        });

        scheduleHtml += `</tbody></table></div>`;

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
                            سيتم تقسيم <b>${planData.end_page - planData.start_page + 1} صفحة</b> على <b>${schedule.length} أيام دراسة</b> بمعدل <b>${planData.weekly_pages.sun} صفحة يومياً</b>.
                        </p>
                        ${scheduleHtml}
                    </div>

                    <div class="flex gap-3">
                        <button onclick="document.getElementById('plan-preview-modal').remove()" class="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-bold hover:bg-gray-200 transition">
                            إلغاء / تعديل
                        </button>
                        <button id="confirm-save-plan-btn" class="flex-1 py-3 bg-teal-600 text-white rounded-xl font-bold shadow-lg hover:bg-teal-700 transition">
                            موافق واعتماد
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', html);
        lucide.createIcons();

        document.getElementById('confirm-save-plan-btn').onclick = async () => {
            const btn = document.getElementById('confirm-save-plan-btn');
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin mx-auto"></i>';
            lucide.createIcons();
            
            try {
                await savePlan(planData);
                showToast('تمت الموافقة وحفظ الخطة بنجاح', 'success');
                document.getElementById('plan-preview-modal').remove();
                closeModal();
                if (window.openStudentReport) window.openStudentReport(planData.student_id);
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
    
    function showQuranModal(sectionsHtml) {
        // Remove old modal if exists
        let old = document.getElementById('quran-viewer-modal');
        if (old) old.remove();
        
        let html = `
            <div id="quran-viewer-modal" class="fixed inset-0 bg-black/80 z-[300] flex items-center justify-center p-2 sm:p-4" onclick="if(event.target===this)this.remove()">
                <div class="bg-amber-50 dark:bg-[#1a1c1e] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col" style="height:88vh">
                    <div class="p-4 border-b border-amber-200 dark:border-gray-700 bg-gradient-to-l from-amber-100 to-amber-200 dark:from-gray-800 dark:to-gray-900 flex justify-between items-center shrink-0">
                        <h3 class="font-bold text-amber-900 dark:text-amber-100 text-lg flex items-center gap-2">📖 ورد التسميع</h3>
                        <button onclick="document.getElementById('quran-viewer-modal').remove()" class="w-8 h-8 flex items-center justify-center rounded-full bg-amber-300/50 hover:bg-amber-300 text-amber-800 transition"><i data-lucide="x" class="w-5 h-5"></i></button>
                    </div>
                    <div class="p-6 flex-1 overflow-y-auto text-2xl md:text-[1.7rem] font-quran" dir="rtl">
                        ${sectionsHtml}
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);
        lucide.createIcons();
    }
    
    function showPaginatedQuranModal(sectionsRaw) {
        if (!sectionsRaw || sectionsRaw.length === 0) return;
        // Map each section to a single HTML string
        const pagesHtmlArray = sectionsRaw.map(sec => typeof window.QuranService !== 'undefined' ? window.QuranService.getTextForSections([sec]) : '');
        
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
        
        let html = `
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
                    <div id="quran-viewer-content" class="p-6 flex-1 overflow-y-auto text-2xl md:text-[1.7rem] font-quran" dir="rtl">
                    </div>
                </div>
            </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        lucide.createIcons();
        renderPage();
    }

    async function markDayCompleted(planId, studentId, date, dayEntry, competitionId = null, groupId = null) {
        try {
            const planRef = window.firebaseOps.doc(window.db, "student_plans", planId);
            const planSnap = await window.firebaseOps.getDoc(planRef);
            if (!planSnap.exists()) return;
            const pData = planSnap.data();

            const sections = dayEntry.sections;
            const lastSec = sections[sections.length - 1];
            
            const allAyas = window.QuranService.getAyahs(lastSec.suraNo);
            const currIdx = allAyas.findIndex(a => a.aya_no == lastSec.toAyah);
            let nextSura = Number(lastSec.suraNo);
            let nextAyah = Number(lastSec.toAyah) + 1;
            
            if (currIdx === allAyas.length - 1) {
                nextSura = nextSura + 1;
                nextAyah = 1;
            }

            const tomorrow = new Date(date);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toLocaleDateString('en-CA');

            const planType = pData.plan_type || pData.planType || 'memorization';
            const planScoreId = planType === 'review' ? 'QURAN_REVIEW' : 'QURAN_MEMORIZATION';
            const planScoreName = planType === 'review' ? 'تسميع مراجعة' : 'تسميع حفظ';
            
            const scoreData = {
                student_id: studentId,
                competition_id: competitionId || window.currentGradingCompId || null,
                group_id: groupId || window.currentGradingGroupId || null,
                criteria_id: planScoreId,
                criteria_name: planScoreName,
                points: 10,
                type: 'positive',
                level: pData.level,
                date: date,
                timestamp: Date.now(),
                created_at: new Date().toISOString()
            };
            await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "scores"), scoreData);

            await recalculatePlan(studentId, planId, nextSura, nextAyah, tomorrowStr, false);
            showToast('✅ تم تسجيل الإنجاز بنجاح', 'success');
            if (window.openRateStudent) window.openRateStudent(studentId);
        } catch (e) {
            console.error("Error in markDayCompleted:", e);
            showToast('خطأ في معالجة الإنجاز', 'error');
        }
    }

    async function markDayAbsent(planId, studentId, date, dayEntry, competitionId = null, groupId = null) {
        try {
            const planRef = window.firebaseOps.doc(window.db, "student_plans", planId);
            const planSnap = await window.firebaseOps.getDoc(planRef);
            if (!planSnap.exists()) return;
            const pData = planSnap.data();

            const tomorrow = new Date(date);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toLocaleDateString('en-CA');

            const scoreData = {
                student_id: studentId,
                competition_id: competitionId || window.currentGradingCompId || null,
                group_id: groupId || window.currentGradingGroupId || null,
                criteria_id: 'ABSENCE_RECORD',
                criteria_name: 'غياب (تأجيل ورد)',
                points: 0,
                type: 'negative',
                level: pData.level,
                date: date,
                timestamp: Date.now(),
                created_at: new Date().toISOString()
            };
            await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "scores"), scoreData);

            const nextSura = pData.start_sura || pData.startSura;
            const nextAyah = pData.start_ayah || pData.startAyah;
            
            await recalculatePlan(studentId, planId, nextSura, nextAyah, tomorrowStr, true);
            showToast('✅ تم تسجيل الغياب وتأجيل الورد', 'success');
            if (window.openRateStudent) window.openRateStudent(studentId);
        } catch (e) {
            console.error("Error in markDayAbsent:", e);
            showToast('خطأ في معالجة الغياب', 'error');
        }
    }

    // === إنجاز مختلف ===
    function openDifferentCompletionModal(plan, studentId, date, entry) {
        const container = document.createElement('div');
        container.id = 'diff-completion-modal';
        container.className = 'fixed inset-0 bg-black/50 z-[150] flex items-center justify-center p-4 backdrop-blur-sm';
        
        container.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl animate-scale-in">
                <div class="flex justify-between items-center mb-6">
                    <h3 class="text-xl font-black text-gray-800 dark:text-gray-100 italic">ماذا أنجز الطالب اليوم؟</h3>
                    <button onclick="document.getElementById('diff-completion-modal').remove()" class="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition">
                        <i data-lucide="x" class="w-6 h-6"></i>
                    </button>
                </div>

                <div class="space-y-6">
                    <div class="p-4 bg-teal-50 dark:bg-teal-900/20 rounded-2xl border border-teal-100 dark:border-teal-800">
                        <p class="text-xs font-bold text-teal-600 mb-4 flex items-center gap-2">
                             <i data-lucide="info" class="w-4 h-4"></i> حدد نقطة التوقف النهائية التي وصل إليها الطالب:
                        </p>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div class="space-y-2">
                                <label class="text-[10px] font-bold text-gray-500 block px-1">سورة النهاية</label>
                                <select id="diff-end-sura" onchange="window.CurriculumManager.updateDiffAyas(this.value)"
                                    class="w-full bg-white dark:bg-gray-700 border-2 border-gray-100 dark:border-gray-600 rounded-xl px-4 py-3 text-sm font-bold focus:border-teal-500 outline-none transition cursor-pointer">
                                    ${window.QuranService.getSuras().map(s => `<option value="${s.id}" ${s.id == entry.sections[0].suraNo ? 'selected' : ''}>${s.id}. ${s.name}</option>`).join('')}
                                </select>
                            </div>
                            <div class="space-y-2">
                                <label class="text-[10px] font-bold text-gray-500 block px-1">آية النهاية</label>
                                <select id="diff-end-ayah" class="w-full bg-white dark:bg-gray-700 border-2 border-gray-100 dark:border-gray-600 rounded-xl px-4 py-3 text-sm font-bold focus:border-teal-500 outline-none transition cursor-pointer">
                                    ${window.QuranService.getAyahs(entry.sections[0].suraNo).map(a => `<option value="${a.aya_no}" ${a.aya_no == entry.sections[entry.sections.length - 1].toAyah ? 'selected' : ''}>${a.aya_no}</option>`).join('')}
                                </select>
                            </div>
                        </div>
                    </div>

                    <button onclick="window.CurriculumManager.submitDifferentCompletion('${plan.id}', '${studentId}', '${date}')" 
                        class="w-full py-4 bg-teal-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-teal-500/20 hover:bg-teal-700 active:scale-[0.98] transition-all flex items-center justify-center gap-3">
                        <i data-lucide="check-circle" class="w-6 h-6"></i>
                        حفظ الإنجاز الفعلي
                    </button>
                    <p class="text-center text-[10px] text-gray-400 font-bold">سيتم إعادة جدولة بقية الخطة تلقائياً بناءً على هذا الإنجاز</p>
                </div>
            </div>
        `;
        document.body.appendChild(container);
        lucide.createIcons();
    }

    async function initDiffSelectors(todayEntry) {
        if (!QuranService.isLoaded()) await QuranService.loadData();
        const suras = QuranService.getSuras();
        let opts = '<option value="">--</option>';
        suras.forEach(s => opts += `<option value="${s.number}">${s.number}. ${s.name}</option>`);
        document.getElementById('diff-start-sura').innerHTML = opts;
        document.getElementById('diff-end-sura').innerHTML = opts;
        // Pre-fill from todayEntry if available
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

    async function submitDifferentCompletion(planId, studentId, date) {
        try {
            const startSura = parseInt(document.getElementById('diff-start-sura').value);
            const startAyah = parseInt(document.getElementById('diff-start-aya').value);
            const endSura = parseInt(document.getElementById('diff-end-sura').value);
            const endAyah = parseInt(document.getElementById('diff-end-aya').value);

            if (!startSura || !endSura) {
                showToast("يرجى اختيار السورة والآيات", "error");
                return;
            }

            const data = {
                plan_id: planId, student_id: studentId, date: date,
                actual_sections: [{ suraNo: endSura, fromAyah: startAyah, toAyah: endAyah }],
                status: 'completed',
                updated_at: new Date().toISOString()
            };

            // إنجاز مختلف: نقوم فقط بتقديم الخطة إلى النقطة التي وصل إليها الطالب
            
            // 1. إضافة سجل في جدول scores ليظهر اللون الأخضر
            const planRef = window.firebaseOps.doc(window.db, "student_plans", planId);
            const planSnap = await window.firebaseOps.getDoc(planRef);
            const planRaw = planSnap.data();
            const planType = planRaw.plan_type || planRaw.planType || 'memorization';
            
            const planScoreId = planType === 'review' ? 'QURAN_REVIEW' : 'QURAN_MEMORIZATION';
            const planScoreName = planType === 'review' ? 'تسميع مراجعة' : 'تسميع حفظ';
            
            const scoreData = {
                student_id: studentId,
                criteria_id: planScoreId,
                criteria_name: planScoreName,
                points: 10,
                date: date,
                timestamp: Date.now()
            };
            await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "scores"), scoreData);

            // 2. تحديث الخطة
            const result = await recalculatePlanAfterAchievement(studentId, planId, endSura, endAyah);
            
            showToast('✅ تم تسجيل الإنجاز وإعادة الجدولة بنجاح', 'success');
            document.getElementById('diff-completion-modal').remove();
            if (window.openRateStudent) window.openRateStudent(studentId);
        } catch (e) {
            console.error(e);
            showToast('خطأ في الحفظ', 'error');
        }
    }

    // === إزالة وظائف المكثف المحذوفة ===

    async function openPlanModal(studentId, type = 'memorization') {
        currentStudentId = studentId;
        const plan = await loadStudentPlan(studentId, type);
        renderPlanManagerModal(studentId, plan, type);
    }

    return {
        loadStudentPlan,
        openPlanModal,
        renderPlanManagerModal,
        closeModal,
        updateAyas,
        submitPlan,
        generateDailySchedule,
        showQuranModal,
        showPaginatedQuranModal,
        markDayCompleted,
        markDayAbsent,
        openDifferentCompletionModal,
        updateDiffAyas,
        submitDifferentCompletion,
        recalculatePlanAfterAchievement
    };
})();
