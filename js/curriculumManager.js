/**
 * نظام إدارة الخطط وتقسيم المنهج (Curriculum Manager)
 */

window.CurriculumManager = (function() {
    let currentStudentId = null;
    let currentPlan = null;
    
    // الأيام المعتمدة للدراسة (0 الأحد، 1 الإثنين، ... 4 الخميس)
    const STUDY_DAYS = [0, 1, 2, 3, 4]; // الأحد إلى الخميس

    async function loadStudentPlan(studentId) {
        try {
            const q = window.firebaseOps.query(
                window.firebaseOps.collection(window.db, "student_plans"),
                window.firebaseOps.where("student_id", "==", studentId),
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

    // حساب توزيع الصفحات بين تاريخين بناءً على صفحات كل يوم
    function generateDailySchedule(startDateStr, endDateStr, startPage, endPage, weeklyPages) {
        let schedule = [];
        let currentDate = new Date(startDateStr);
        let endDate = new Date(endDateStr);
        let currentPage = startPage;
        
        // الأيام: {sun: 1, mon: 1, tue: 1, wed: 1, thu: 1}
        const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

        while (currentDate <= endDate && currentPage <= endPage) {
            let dayIndex = currentDate.getDay(); // 0-6
            let dayName = dayNames[dayIndex];
            
            // إضافة صفحات هذا اليوم إذا كان يوم دراسة وله كمية
            if (STUDY_DAYS.includes(dayIndex) && weeklyPages[dayName] > 0) {
                let pagesForToday = parseFloat(weeklyPages[dayName]);
                let targetEndPage = currentPage + pagesForToday - 1; // -1 لأن الصفحة الحالية محسوبة
                
                // التأكد من عدم تجاوز النهاية الكلية
                if (targetEndPage > endPage) {
                    targetEndPage = endPage;
                }

                schedule.push({
                    date: currentDate.toISOString().split('T')[0],
                    targetStartPage: currentPage,
                    targetEndPage: targetEndPage,
                    sections: window.QuranService.getSectionsForPageRange(Math.floor(currentPage), Math.ceil(targetEndPage))
                });
                
                currentPage = targetEndPage + 1;
            }
            
            // الانتقال لليوم التالي
            currentDate.setDate(currentDate.getDate() + 1);
        }

        return schedule;
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
    function renderPlanManagerModal(studentId, plan) {
        let html = `
            <div id="plan-manager-modal" class="fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4">
                <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
                    <div class="flex justify-between items-center mb-4">
                        <h3 class="font-bold text-lg">📝 إدارة الخطة الزمنية</h3>
                        <button onclick="CurriculumManager.closeModal()" class="text-gray-400 hover:text-gray-600"><i data-lucide="x"></i></button>
                    </div>

                    <div class="space-y-4">
                        <input type="hidden" id="plan-id" value="${plan ? plan.id : ''}">
                        
                        <div class="grid grid-cols-2 gap-3">
                            <div class="flex-1">
                                <label class="block text-xs font-bold text-gray-500 mb-1">نوع الخطة</label>
                                <select id="plan-type" class="w-full border rounded-xl px-3 py-2 bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600 text-sm font-bold">
                                    <option value="memorization" ${plan && plan.planType === 'memorization' ? 'selected' : ''}>حفظ</option>
                                    <option value="review" ${plan && plan.planType === 'review' ? 'selected' : ''}>مراجعة</option>
                                </select>
                            </div>
                            <div></div>
                        </div>

                        <div class="grid grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-bold text-gray-500 mb-1">تاريخ البدء</label>
                                <input type="date" id="plan-start-date" value="${plan ? plan.startDate : new Date().toISOString().split('T')[0]}" class="w-full border rounded-xl px-3 py-2 bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-500 mb-1">تاريخ النهاية المستهدف</label>
                                <input type="date" id="plan-end-date" value="${plan ? plan.endDate : ''}" class="w-full border rounded-xl px-3 py-2 bg-gray-50 dark:bg-gray-700 dark:text-white dark:border-gray-600">
                            </div>
                        </div>

                        <!-- النطاق -->
                        <div class="bg-gray-50 dark:bg-gray-700 p-3 rounded-xl border border-dashed">
                            <p class="text-xs font-bold mb-2">النطاق المطلوب إنجازه</p>
                            <div class="grid grid-cols-2 gap-x-2 gap-y-2 mb-2">
                                <label class="text-[10px] text-gray-500">من السورة / الآية</label>
                                <label class="text-[10px] text-gray-500">إلى السورة / الآية</label>
                                
                                <div class="flex gap-1">
                                    <select id="plan-start-sura" class="flex-1 bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600 border rounded text-xs p-1" onchange="CurriculumManager.updateAyas('start')"></select>
                                    <select id="plan-start-aya" class="flex-1 bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600 border rounded text-xs p-1"></select>
                                </div>
                                <div class="flex gap-1">
                                    <select id="plan-end-sura" class="flex-1 bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600 border rounded text-xs p-1" onchange="CurriculumManager.updateAyas('end')"></select>
                                    <select id="plan-end-aya" class="flex-1 bg-white dark:bg-gray-700 dark:text-white dark:border-gray-600 border rounded text-xs p-1"></select>
                                </div>
                            </div>
                        </div>

                        <!-- الأيام -->
                        <div>
                            <p class="text-xs font-bold mb-2">مقدار الحفظ/المراجعة اليومي (بالصفحات)</p>
                            <div class="bg-teal-50 dark:bg-gray-700/50 rounded-lg p-3 flex items-center gap-3 max-w-[200px]">
                                <input type="number" step="0.25" id="plan-daily-pages" class="w-full text-center border rounded-xl px-3 py-2 font-bold dark:bg-gray-700 dark:text-white dark:border-gray-600 shadow-sm" value="${plan ? (plan.weeklyPages['sun']||1) : 1}">
                                <span class="text-xs text-gray-500 font-bold whitespace-nowrap">صفحة يومياً</span>
                            </div>
                        </div>

                    </div>
                    
                    <div class="flex gap-2 mt-6">
                        <button onclick="CurriculumManager.closeModal()" class="flex-1 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold">إلغاء</button>
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
            document.getElementById('plan-start-sura').value = plan.startSura;
            await updateAyas('start');
            document.getElementById('plan-start-aya').value = plan.startAyah;
            
            document.getElementById('plan-end-sura').value = plan.endSura;
            await updateAyas('end');
            document.getElementById('plan-end-aya').value = plan.endAyah;
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

        const planData = {
            id: id || null,
            student_id: studentId,
            plan_type: document.getElementById('plan-type').value,
            start_date: document.getElementById('plan-start-date').value,
            end_date: document.getElementById('plan-end-date').value,
            start_sura: Number(startSura),
            start_ayah: Number(startAya),
            end_sura: Number(endSura),
            end_ayah: Number(endAya),
            start_page: startPage,
            end_page: endPage,
            weekly_pages: {
                sun: Number(document.getElementById('plan-daily-pages').value),
                mon: Number(document.getElementById('plan-daily-pages').value),
                tue: Number(document.getElementById('plan-daily-pages').value),
                wed: Number(document.getElementById('plan-daily-pages').value),
                thu: Number(document.getElementById('plan-daily-pages').value),
            },
            level: state.currentLevel,
            status: 'active'
        };

        try {
            await savePlan(planData);
            showToast('تم حفظ الخطة بنجاح', 'success');
            closeModal();
            if (window.openStudentReport) window.openStudentReport(studentId);
        } catch (e) {
            showToast('خطأ في الحفظ', 'error');
        }
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
            showToast('تم تسجيل الغياب', 'info');
        } catch (e) {
            console.error(e);
            showToast('خطأ في تسجيل الغياب', 'error');
        }
    }

    // === إنجاز مختلف ===
    function openDifferentCompletionModal(plan, studentId, date, todayEntry) {
        let old = document.getElementById('diff-completion-modal');
        if (old) old.remove();

        let html = `
        <div id="diff-completion-modal" class="fixed inset-0 bg-black/60 z-[250] flex items-center justify-center p-4" onclick="if(event.target===this)this.remove()">
            <div class="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                <h3 class="font-bold text-lg mb-4">📝 إنجاز مختلف</h3>
                <p class="text-xs text-gray-500 mb-3">حدد ما أنجزه الطالب فعلياً (مختلف عن الخطة)</p>
                <div class="grid grid-cols-2 gap-2 mb-3">
                    <div>
                        <label class="text-[10px] text-gray-500">من السورة / الآية</label>
                        <div class="flex gap-1">
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
                    <button onclick="document.getElementById('diff-completion-modal').remove()" class="flex-1 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold">إلغاء</button>
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
        const ss = document.getElementById('diff-start-sura').value;
        const sa = document.getElementById('diff-start-aya').value;
        const es = document.getElementById('diff-end-sura').value;
        const ea = document.getElementById('diff-end-aya').value;
        if (!ss || !sa || !es || !ea) { showToast('حدد النطاق بالكامل', 'error'); return; }

        const actualStartPage = QuranService.getPageForAyah(ss, sa);
        const actualEndPage = QuranService.getPageForAyah(es, ea);
        const sections = QuranService.getSectionsForPageRange(actualStartPage, actualEndPage);

        try {
            const data = {
                plan_id: planId, student_id: studentId, date: date,
                actual_start_page: actualStartPage, actual_end_page: actualEndPage,
                actual_sections: sections, status: 'different'
            };
            // Check existing
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
            showToast('✅ تم تسجيل الإنجاز المختلف', 'success');
            document.getElementById('diff-completion-modal').remove();
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
                    <button onclick="document.getElementById('intensive-day-modal').remove()" class="flex-1 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold">إلغاء</button>
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

    return {
        loadStudentPlan,
        openPlanModal: async (studentId) => {
            const plan = await loadStudentPlan(studentId);
            renderPlanManagerModal(studentId, plan);
        },
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
        submitIntensiveDay
    };
})();

