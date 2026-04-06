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
        const STUDY_DAYS = planData.study_days || [0, 1, 2, 3, 4]; // الأيام المحددة للخطة
        
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

    async function recalculatePlanAfterAchievement(studentId, planId, actualEndSura, actualEndAyah) {
        try {
            // 1. جلب الخطة الحالية
            const planRef = window.firebaseOps.doc(window.db, "student_plans", planId);
            const planSnap = await window.firebaseOps.getDoc(planRef);
            if (!planSnap.exists()) return;
            const plan = planSnap.data();

            // 2. تحديد الآية التالية للإنجاز الفعلي
            if (!window.QuranService.isLoaded()) await window.QuranService.loadData();
            const allAyas = window.QuranService.getAyas(actualEndSura);
            const currIdx = allAyas.findIndex(a => a.aya_no == actualEndAyah);
            
            let nextSura = actualEndSura;
            let nextAyah = actualEndAyah + 1;
            
            if (currIdx === allAyas.length - 1) {
                nextSura = actualEndSura + 1;
                nextAyah = 1;
            }

            // 3. تحديث الخطة لتبدأ من الغد بالمقطع المتبقي
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowStr = tomorrow.toISOString().split('T')[0];

            if (new Date(tomorrowStr) > new Date(plan.end_date)) {
                // إذا انتهى الوقت، انتهت الخطة
                await window.firebaseOps.updateDoc(planRef, { status: 'completed' });
                return { warning: false, completed: true };
            }

            // حساب الوزن الجديد للتأكد من عدم وجود ضغط كبير
            const newPlanData = { ...plan, start_date: tomorrowStr, start_sura: nextSura, start_ayah: nextAyah };
            const oldSchedule = await generateDailySchedule(plan); 
            const newSchedule = await generateDailySchedule(newPlanData);
            
            const oldAvg = (oldSchedule[0]?.totalWeight || 1);
            const newAvg = (newSchedule[0]?.totalWeight || 1);
            const isHeavier = newAvg > oldAvg * 1.5;

            await window.firebaseOps.updateDoc(planRef, {
                start_date: tomorrowStr,
                start_sura: nextSura,
                start_ayah: nextAyah,
                updated_at: new Date().toISOString()
            });

            return { warning: isHeavier, completed: false };
        } catch (e) {
            console.error("Error recalculating plan:", e);
        }
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

                        <!-- خيارات أيام الحلقة -->
                        <div class="mb-4">
                            <label class="block text-xs font-bold text-gray-500 mb-2">أيام الحلقة (الغياب سيُرحّل الورد تلقائياً):</label>
                            <div class="flex flex-wrap gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600" id="plan-study-days">
                                <label class="flex items-center gap-1.5 text-sm cursor-pointer"><input type="checkbox" value="0" class="w-4 h-4 text-teal-600 rounded bg-white shadow-sm border-gray-300" ${!plan || (plan.study_days && plan.study_days.includes(0)) ? 'checked' : ''}> الأحد</label>
                                <label class="flex items-center gap-1.5 text-sm cursor-pointer"><input type="checkbox" value="1" class="w-4 h-4 text-teal-600 rounded bg-white shadow-sm border-gray-300" ${!plan || (plan.study_days && plan.study_days.includes(1)) ? 'checked' : ''}> الإثنين</label>
                                <label class="flex items-center gap-1.5 text-sm cursor-pointer"><input type="checkbox" value="2" class="w-4 h-4 text-teal-600 rounded bg-white shadow-sm border-gray-300" ${!plan || (plan.study_days && plan.study_days.includes(2)) ? 'checked' : ''}> الثلاثاء</label>
                                <label class="flex items-center gap-1.5 text-sm cursor-pointer"><input type="checkbox" value="3" class="w-4 h-4 text-teal-600 rounded bg-white shadow-sm border-gray-300" ${!plan || (plan.study_days && plan.study_days.includes(3)) ? 'checked' : ''}> الأربعاء</label>
                                <label class="flex items-center gap-1.5 text-sm cursor-pointer"><input type="checkbox" value="4" class="w-4 h-4 text-teal-600 rounded bg-white shadow-sm border-gray-300" ${!plan || (plan.study_days && plan.study_days.includes(4)) ? 'checked' : ''}> الخميس</label>
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

        const studyDaysCheckboxes = document.querySelectorAll('#plan-study-days input:checked');
        const study_days = Array.from(studyDaysCheckboxes).map(cb => parseInt(cb.value));
        if (study_days.length === 0) {
            showToast('الرجاء اختيار يوم واحد على الأقل من أيام الحلقة', 'error'); return;
        }
        
        if (study_days.length < 5) {
            alert('تنبيه: أيام الحلقة أقل من 5 أيام. سيستمر النظام بناءً على الأيام المحددة فقط.');
        }

        let studyDaysCount = 0;
        let cDate = new Date(sDate);
        while(cDate <= eDate) {
            if (study_days.includes(cDate.getDay())) studyDaysCount++;
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
            study_days: study_days,
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

    async function markDayCompleted(planId, studentId, date, todayEntry) {
        try {
            // Check if record already exists
            const q = window.firebaseOps.query(
                window.firebaseOps.collection(window.db, "plan_daily_records"),
                window.firebaseOps.where("plan_id", "==", planId),
                window.firebaseOps.where("date", "==", date)
            );
            const snap = await window.firebaseOps.getDocs(q);
            
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

            if (!snap.empty) {
                await window.firebaseOps.updateDoc(
                    window.firebaseOps.doc(window.db, "plan_daily_records", snap.docs[0].id), data
                );
            } else {
                await window.firebaseOps.addDoc(
                    window.firebaseOps.collection(window.db, "plan_daily_records"), data
                );
            }
            showToast('✅ تم تسجيل إنجاز اليوم بنجاح', 'success');
        } catch (e) {
            console.error(e);
            showToast('خطأ في تسجيل الإنجاز', 'error');
        }
    }

    async function markDayAbsent(planId, studentId, date, todayEntry) {
        try {
            const data = {
                plan_id: planId,
                student_id: studentId,
                date: date,
                planned_start_page: todayEntry.targetStartPage,
                planned_end_page: todayEntry.targetEndPage,
                planned_sections: todayEntry.sections || [],
                status: 'absent'
            };
            await window.firebaseOps.addDoc(
                window.firebaseOps.collection(window.db, "plan_daily_records"), data
            );
            
            // === خوارزمية الترحيل والإزاحة (Dynamic Shifting) ===
            // نؤجل النهاية بيوم دراسي واحد، ونعدل بداية الورد لغدٍ كأنه اليوم
            const planRef = window.firebaseOps.doc(window.db, "student_plans", planId);
            const planSnap = await window.firebaseOps.getDoc(planRef);
            if (planSnap.exists()) {
                const plan = planSnap.data();
                const studyDays = plan.study_days || [0, 1, 2, 3, 4];
                
                // حساب اليوم الدراسي التالي
                let nextDate = new Date(date);
                do {
                    nextDate.setDate(nextDate.getDate() + 1);
                } while(!studyDays.includes(nextDate.getDay()));
                
                // حساب يوم النهاية الجديد بإضافة يوم دراسي واحد للآخر
                let newEndDate = new Date(plan.end_date);
                do {
                    newEndDate.setDate(newEndDate.getDate() + 1);
                } while(!studyDays.includes(newEndDate.getDay()));
                
                if (todayEntry.sections && todayEntry.sections.length > 0) {
                    await window.firebaseOps.updateDoc(planRef, {
                        start_date: nextDate.toISOString().split('T')[0],
                        end_date: newEndDate.toISOString().split('T')[0],
                        start_sura: todayEntry.sections[0].suraNo,
                        start_ayah: todayEntry.sections[0].fromAyah,
                        updated_at: new Date().toISOString()
                    });
                }
            }

            showToast('تم تسجيل الغياب وترحيل ورد وتواريخ الخطة', 'info');
        } catch (e) {
            console.error(e);
            showToast('خطأ في تسجيل الغياب', 'error');
        }
    }

    // === إنجاز مختلف (زيادة أو نقصان) ===
    function openDifferentCompletionModal(plan, studentId, date, todayEntry) {
        let old = document.getElementById('diff-completion-modal');
        if (old) old.remove();

        let html = `
        <div id="diff-completion-modal" class="fixed inset-0 bg-black/60 z-[250] flex items-center justify-center p-4" onclick="if(event.target===this)this.remove()">
            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                <h3 class="font-bold text-lg mb-4 text-blue-600">📝 إنجاز مختلف (متقدم / متأخر)</h3>
                <p class="text-xs text-gray-500 mb-3">حدد ما أنجزه الطالب فعلياً. سيقوم النظام تلقائياً بترحيل المتبقى لأيام قادمة أو تقديم الورد الجديد بناءً على هذا التغيير.</p>
                <div class="grid grid-cols-2 gap-2 mb-3">
                    <div>
                        <label class="text-[10px] font-bold text-gray-600">من السورة / الآية (نقطة البداية)</label>
                        <div class="flex gap-1 mt-1">
                            <select id="diff-start-sura" class="flex-1 bg-gray-50 border rounded text-xs p-1.5" onchange="CurriculumManager.updateDiffAyas('start')"></select>
                            <select id="diff-start-aya" class="flex-1 bg-gray-50 border rounded text-xs p-1.5"></select>
                        </div>
                    </div>
                    <div>
                        <label class="text-[10px] text-gray-500">إلى السورة / الآية</label>
                        <div class="flex gap-1">
                            <select id="diff-end-sura" class="flex-1 bg-gray-50 border rounded text-xs p-1.5" onchange="CurriculumManager.updateDiffAyas('end')"></select>
                            <select id="diff-end-aya" class="flex-1 bg-gray-50 border rounded text-xs p-1.5"></select>
                        </div>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="document.getElementById('diff-completion-modal').remove()" class="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-bold hover:bg-gray-200 transition">إلغاء</button>
                    <button onclick="CurriculumManager.submitDifferentCompletion('${plan.id}','${studentId}','${date}')" class="flex-1 py-3 bg-blue-600 text-white hover:bg-blue-700 rounded-xl font-bold">حفظ</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        // Populate sura selectors
        initDiffSelectors(todayEntry);
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

            await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "plan_daily_records"), data);
            
            const result = await recalculatePlanAfterAchievement(studentId, planId, endSura, endAyah);
            if (result && result.warning) {
                alert('⚠️ تنبيه: الطالب لم ينجز الورد بالكامل؛ تم ضغط المتبقي لضمان الختم في الموعد.');
            }
            
            showToast('✅ تم تسجيل الإنجاز وإعادة الجدولة', 'success');
            document.getElementById('diff-completion-modal').remove();
            if (window.openRateStudent) window.openRateStudent(studentId);
        } catch (e) {
            console.error(e);
            showToast('خطأ في الحفظ', 'error');
        }
    }

    // === يوم مكثف ===
    function openIntensiveDayModal(plan, studentId, date) {
        let old = document.getElementById('intensive-day-modal');
        if (old) old.remove();

        let html = `
        <div id="intensive-day-modal" class="fixed inset-0 bg-black/60 z-[250] flex items-center justify-center p-4" onclick="if(event.target===this)this.remove()">
            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                <h3 class="font-bold text-lg mb-2 flex items-center gap-2">⚡ يوم مكثف</h3>
                <p class="text-xs text-gray-500 mb-3">الطالب أنجز أكثر من المعتاد. حدد ما أنجزه فعلياً:</p>
                <div class="grid grid-cols-2 gap-2 mb-3">
                    <div>
                        <label class="text-[10px] text-gray-500">من السورة / الآية</label>
                        <div class="flex gap-1">
                            <select id="intens-start-sura" class="flex-1 bg-gray-50 border rounded text-xs p-1.5" onchange="CurriculumManager.updateIntensAyas('start')"></select>
                            <select id="intens-start-aya" class="flex-1 bg-gray-50 border rounded text-xs p-1.5"></select>
                        </div>
                    </div>
                    <div>
                        <label class="text-[10px] text-gray-500">إلى السورة / الآية</label>
                        <div class="flex gap-1">
                            <select id="intens-end-sura" class="flex-1 bg-gray-50 border rounded text-xs p-1.5" onchange="CurriculumManager.updateIntensAyas('end')"></select>
                            <select id="intens-end-aya" class="flex-1 bg-gray-50 border rounded text-xs p-1.5"></select>
                        </div>
                    </div>
                </div>
                <div class="flex gap-2">
                    <button onclick="document.getElementById('intensive-day-modal').remove()" class="flex-1 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-xl font-bold hover:bg-gray-200 transition">إلغاء</button>
                    <button onclick="CurriculumManager.submitIntensiveDay('${plan.id}','${studentId}','${date}')" class="flex-1 py-3 bg-purple-600 text-white hover:bg-purple-700 rounded-xl font-bold">حفظ</button>
                </div>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', html);
        initIntensSelectors();
    }

    async function initIntensSelectors() {
        if (!QuranService.isLoaded()) await QuranService.loadData();
        const suras = QuranService.getSuras();
        let opts = '<option value="">--</option>';
        suras.forEach(s => opts += `<option value="${s.number}">${s.number}. ${s.name}</option>`);
        document.getElementById('intens-start-sura').innerHTML = opts;
        document.getElementById('intens-end-sura').innerHTML = opts;
    }

    async function updateIntensAyas(prefix) {
        const sura = document.getElementById(`intens-${prefix}-sura`).value;
        const sel = document.getElementById(`intens-${prefix}-aya`);
        if (!sura) { sel.innerHTML = ''; return; }
        const ayas = QuranService.getAyahs(sura);
        sel.innerHTML = ayas.map(a => `<option value="${a.aya_no}">${a.aya_no}</option>`).join('');
    }

    async function submitIntensiveDay(planId, studentId, date) {
        const ss = document.getElementById('intens-start-sura').value;
        const sa = document.getElementById('intens-start-aya').value;
        const es = document.getElementById('intens-end-sura').value;
        const ea = document.getElementById('intens-end-aya').value;
        if (!ss || !sa || !es || !ea) { showToast('حدد النطاق بالكامل', 'error'); return; }

        const actualStartPage = QuranService.getPageForAyah(ss, sa);
        const actualEndPage = QuranService.getPageForAyah(es, ea);
        const sections = QuranService.getSectionsForPageRange(actualStartPage, actualEndPage);

        try {
            const data = {
                plan_id: planId, student_id: studentId, date: date,
                actual_start_page: actualStartPage, actual_end_page: actualEndPage,
                actual_sections: sections, status: 'intensive'
            };
            const q = window.firebaseOps.query(
                window.firebaseOps.collection(window.db, "plan_daily_records"),
                window.firebaseOps.where("plan_id", "==", planId),
                window.firebaseOps.where("date", "==", date)
            );
            const snap = await window.firebaseOps.getDocs(q);
            if (!snap.empty) {
                await window.firebaseOps.updateDoc(window.firebaseOps.doc(window.db, "plan_daily_records", snap.docs[0].id), data);
            } else {
                await window.firebaseOps.addDoc(window.firebaseOps.collection(window.db, "plan_daily_records"), data);
            }
            showToast('⚡ تم تسجيل اليوم المكثف', 'success');
            document.getElementById('intensive-day-modal').remove();
        } catch (e) {
            console.error(e);
            showToast('خطأ في الحفظ', 'error');
        }
    }

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
        openIntensiveDayModal,
        updateIntensAyas,
        submitIntensiveDay,
        recalculatePlanAfterAchievement
    };
})();

