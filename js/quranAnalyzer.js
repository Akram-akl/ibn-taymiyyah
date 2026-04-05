// =====================================================
// quranAnalyzer.js - محرك البيانات القرآنية (Pure Data Engine)
// =====================================================
// نواة النظام: مصفوفات كاملة للمصحف الشريف
// يتعامل مع حواف السور بحذر عبر فهرسة خطية (Linear Index)
// =====================================================

window.QuranService = (function() {
    let quranData = [];    // مصفوفة كل آيات القرآن (6236 آية)
    let isLoaded = false;
    let loadingPromise = null;
    let surasCache = null;

    // ===== تحميل البيانات (مرة واحدة فقط) =====
    async function loadData() {
        if (isLoaded) return true;
        if (loadingPromise) return loadingPromise;

        loadingPromise = fetch('./data/hafsData_v2-0.json')
            .then(res => res.json())
            .then(data => {
                quranData = data;
                isLoaded = true;
                console.log(`[QuranEngine] تم تحميل ${quranData.length} آية بنجاح`);
                return true;
            })
            .catch(err => {
                console.error("[QuranEngine] فشل تحميل بيانات القرآن:", err);
                return false;
            });

        return loadingPromise;
    }

    // ===== قائمة السور مع الميتا =====
    function getSuras() {
        if (!isLoaded) return [];
        if (surasCache) return surasCache;

        const surasMap = new Map();
        quranData.forEach(aya => {
            if (!surasMap.has(aya.sura_no)) {
                surasMap.set(aya.sura_no, {
                    number: aya.sura_no,
                    name: aya.sura_name_ar,
                    name_en: aya.sura_name_en,
                    start_page: aya.page,
                    end_page: aya.page,
                    jozz: [aya.jozz],
                    total_ayahs: 1
                });
            } else {
                const s = surasMap.get(aya.sura_no);
                s.total_ayahs += 1;
                s.end_page = aya.page;
                if (!s.jozz.includes(aya.jozz)) s.jozz.push(aya.jozz);
            }
        });

        surasCache = Array.from(surasMap.values());
        return surasCache;
    }

    // ===== جلب آيات سورة معينة =====
    function getAyahs(suraNo) {
        if (!isLoaded) return [];
        return quranData.filter(a => a.sura_no == suraNo);
    }

    // ===== وصف السورة =====
    function getSuraInfo(suraNo) {
        const sura = getSuras().find(s => s.number == suraNo);
        if (!sura) return "";
        return `سورة ${sura.name} - أجزاء (${sura.jozz.join('، ')}) - من ص${sura.start_page} إلى ص${sura.end_page}`;
    }

    // =====================================================
    // الدوال الرياضية الجوهرية (Core Math Functions)
    // =====================================================

    /**
     * استخراج كل الآيات في نطاق معين (من سورة/آية إلى سورة/آية)
     * يتعامل مع حواف السور بسلاسة - لا أخطاء Indexing
     * @returns {Array} مصفوفة آيات مُرتّبة
     */
    function getAyahsInRange(startSura, startAyah, endSura, endAyah) {
        if (!isLoaded) return [];
        startSura = Number(startSura);
        startAyah = Number(startAyah);
        endSura = Number(endSura);
        endAyah = Number(endAyah);

        let capturing = false;
        const result = [];

        for (let i = 0; i < quranData.length; i++) {
            const aya = quranData[i];
            // بدء الالتقاط عند الوصول لنقطة البداية
            if (aya.sura_no == startSura && aya.aya_no == startAyah) {
                capturing = true;
            }
            if (capturing) {
                result.push(aya);
            }
            // إيقاف الالتقاط عند الوصول لنقطة النهاية
            if (aya.sura_no == endSura && aya.aya_no == endAyah) {
                break;
            }
        }
        return result;
    }

    /**
     * الآية التالية في المصحف (التعامل مع حواف السور)
     * إذا كانت الآية الحالية هي آخر آية في السورة، ينتقل لأول آية في السورة التالية
     * @returns {object|null} {sura_no, aya_no} أو null إذا كانت آخر آية في المصحف
     */
    function getNextAyah(suraNo, ayahNo) {
        if (!isLoaded) return null;
        suraNo = Number(suraNo);
        ayahNo = Number(ayahNo);

        for (let i = 0; i < quranData.length; i++) {
            if (quranData[i].sura_no == suraNo && quranData[i].aya_no == ayahNo) {
                if (i + 1 < quranData.length) {
                    return {
                        sura_no: quranData[i + 1].sura_no,
                        aya_no: quranData[i + 1].aya_no
                    };
                }
                return null; // آخر آية في المصحف
            }
        }
        return null;
    }

    /**
     * حساب إحصائيات النطاق: إجمالي الآيات، الصفحات
     */
    function getTotalStats(startSura, startAyah, endSura, endAyah) {
        const ayahs = getAyahsInRange(startSura, startAyah, endSura, endAyah);
        if (ayahs.length === 0) return { totalAyahs: 0, totalPages: 0, startPage: 0, endPage: 0 };

        const startPage = ayahs[0].page;
        const endPage = ayahs[ayahs.length - 1].page;
        return {
            totalAyahs: ayahs.length,
            totalPages: endPage - startPage + 1,
            startPage,
            endPage
        };
    }

    // ===== رقم الصفحة لآية معينة =====
    function getPageForAyah(suraNo, ayahNo) {
        if (!isLoaded) return null;
        const aya = quranData.find(a => a.sura_no == suraNo && a.aya_no == ayahNo);
        return aya ? aya.page : null;
    }

    // ===== آيات صفحة معينة =====
    function getAyahsOnPage(pageNo) {
        if (!isLoaded) return [];
        return quranData.filter(a => a.page == pageNo);
    }

    // ===== نطاق الصفحات =====
    function getPageRange(startSura, startAyah, endSura, endAyah) {
        if (!isLoaded) return null;
        const startPage = getPageForAyah(startSura, startAyah);
        const endPage = getPageForAyah(endSura, endAyah);
        if (startPage === null || endPage === null) return null;
        return { startPage, endPage, totalPages: endPage - startPage + 1 };
    }

    // ===== تنظيم المقاطع حسب السورة من مصفوفة آيات =====
    function groupAyahsIntoSections(ayahs) {
        const sections = [];
        let current = null;
        ayahs.forEach(a => {
            if (!current || current.suraNo !== a.sura_no) {
                current = {
                    suraNo: a.sura_no,
                    suraName: a.sura_name_ar,
                    fromAyah: a.aya_no,
                    toAyah: a.aya_no,
                    fromPage: a.page,
                    toPage: a.page
                };
                sections.push(current);
            } else {
                current.toAyah = a.aya_no;
                current.toPage = a.page;
            }
        });
        return sections;
    }

    // ===== المقاطع في نطاق صفحات =====
    function getSectionsForPageRange(fromPage, toPage) {
        if (!isLoaded) return [];
        const ayahs = quranData.filter(a => a.page >= fromPage && a.page <= toPage);
        return groupAyahsIntoSections(ayahs);
    }

    // ===== بحث في القرآن =====
    function searchAyahs(query) {
        if (!isLoaded || !query) return [];
        const cleanQuery = query.trim().replace(/[إأآا]/g, 'ا').replace(/[ةه]/g, 'ه');
        return quranData.filter(aya => {
            const emlaey = aya.aya_text_emlaey.replace(/[إأآا]/g, 'ا').replace(/[ةه]/g, 'ه');
            return emlaey.includes(cleanQuery);
        });
    }

    // ===== كل الصفحات (مُرتّبة) =====
    function getAllPages() {
        if (!isLoaded) return [];
        const pages = new Set();
        quranData.forEach(a => pages.add(a.page));
        return Array.from(pages).sort((a, b) => a - b);
    }

    // ===== أول وآخر آية في صفحة =====
    function getFirstAyahOnPage(pageNo) {
        if (!isLoaded) return null;
        const ayahs = quranData.filter(a => a.page == pageNo);
        if (ayahs.length === 0) return null;
        ayahs.sort((a, b) => a.sura_no !== b.sura_no ? a.sura_no - b.sura_no : a.aya_no - b.aya_no);
        return ayahs[0];
    }

    function getLastAyahOnPage(pageNo) {
        if (!isLoaded) return null;
        const ayahs = quranData.filter(a => a.page == pageNo);
        if (ayahs.length === 0) return null;
        ayahs.sort((a, b) => a.sura_no !== b.sura_no ? b.sura_no - a.sura_no : b.aya_no - a.aya_no);
        return ayahs[0];
    }

    // =====================================================
    // عرض النصوص القرآنية (Rendering)
    // =====================================================

    /**
     * توليد HTML لعرض مقاطع قرآنية
     * يمنع تكرار أرقام الآيات بفلتر ذكي
     */
    function getTextForSections(sections) {
        if (!isLoaded || !sections || sections.length === 0) return '';
        let html = '';
        sections.forEach(sec => {
            const ayahs = quranData.filter(a =>
                a.sura_no == sec.suraNo &&
                a.aya_no >= sec.fromAyah &&
                a.aya_no <= sec.toAyah
            );
            html += `<div class="mb-8">`;
            html += `<div class="bg-amber-200/60 dark:bg-amber-900/40 rounded-xl py-3 px-6 mb-4 text-center border border-amber-300 dark:border-amber-700">`;
            html += `<h3 class="text-xl font-bold text-amber-900 dark:text-amber-200">سورة ${sec.suraName}</h3>`;
            html += `<p class="text-xs text-amber-700 dark:text-amber-400 mt-1">آية ${sec.fromAyah} إلى ${sec.toAyah}</p>`;
            html += `</div>`;
            html += `<div class="leading-[2.8] text-right font-quran">`;
            html += ayahs.map(a => {
                // تنظيف النص من أي أرقام أو أقواس مدمجة لمنع التكرار
                const cleanText = (a.aya_text || "").replace(/[\s]*[0-9()[\]{}﴿﴾]+$/g, "").trim();
                return `${cleanText} <span class="text-amber-600 dark:text-amber-400 text-lg">﴿${Number(a.aya_no).toLocaleString('ar-EG')}﴾</span>`;
            }).join(' ');
            html += `</div></div>`;
        });
        return html;
    }

    // =====================================================
    // الواجهة العامة (Public API)
    // =====================================================
    return {
        loadData,
        getSuras,
        getAyahs,
        getSuraInfo,
        searchAyahs,
        isLoaded: () => isLoaded,

        // الدوال الرياضية الجوهرية
        getAyahsInRange,
        getNextAyah,
        getTotalStats,
        groupAyahsIntoSections,

        // أدوات الصفحات
        getPageForAyah,
        getAyahsOnPage,
        getPageRange,
        getSectionsForPageRange,
        getAllPages,
        getFirstAyahOnPage,
        getLastAyahOnPage,

        // عرض النصوص
        getTextForSections
    };
})();
