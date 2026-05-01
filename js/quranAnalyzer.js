// quranAnalyzer.js
window.QuranService = (function() {
    let quranData = [];
    let isLoaded = false;
    let loadingPromise = null;
    let surasCache = null;

    // Load data only once
    async function loadData() {
        if (isLoaded) return true;
        if (loadingPromise) return loadingPromise;

        loadingPromise = fetch('./data/hafsData_v2-0.json')
            .then(res => res.json())
            .then(data => {
                quranData = data;
                isLoaded = true;
                return true;
            })
            .catch(err => {
                console.error("فشل تحميل بيانات القرآن:", err);
                return false;
            });
        
        return loadingPromise;
    }

    // Get list of all Suras with their metadata
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
                    end_page: aya.page, // Will update below
                    jozz: [aya.jozz],
                    total_ayahs: 1
                });
            } else {
                const s = surasMap.get(aya.sura_no);
                s.total_ayahs += 1;
                s.end_page = aya.page; // Update to max page
                if (!s.jozz.includes(aya.jozz)) {
                    s.jozz.push(aya.jozz);
                }
            }
        });
        
        surasCache = Array.from(surasMap.values());
        return surasCache;
    }

    // Get ayahs for a specific sura
    function getAyahs(suraNo) {
        if (!isLoaded) return [];
        return quranData.filter(aya => aya.sura_no == suraNo);
    }
    
    // Quick helper to format sura description
    function getSuraInfo(suraNo) {
        const sura = getSuras().find(s => s.number == suraNo);
        if (!sura) return "";
        return `سورة ${sura.name} - أجزاء (${sura.jozz.join('، ')}) - من ص${sura.start_page} إلى ص${sura.end_page}`;
    }

    // Search ayahs by text or emlaey text
    function searchAyahs(query) {
        if (!isLoaded || !query) return [];
        const cleanQuery = query.trim().replace(/[إأآا]/g, 'ا').replace(/[ةه]/g, 'ه');
        
        return quranData.filter(aya => {
            const emlaey = aya.aya_text_emlaey.replace(/[إأآا]/g, 'ا').replace(/[ةه]/g, 'ه');
            return emlaey.includes(cleanQuery);
        });
    }

    // Get the page number for a specific Sura + Ayah
    function getPageForAyah(suraNo, ayahNo) {
        if (!isLoaded) return null;
        const aya = quranData.find(a => a.sura_no == suraNo && a.aya_no == ayahNo);
        return aya ? aya.page : null;
    }

    // Get all ayahs on a specific page
    function getAyahsOnPage(pageNo) {
        if (!isLoaded) return [];
        return quranData.filter(a => a.page == pageNo);
    }

    // Get page range for a sura/ayah range
    function getPageRange(startSura, startAyah, endSura, endAyah) {
        if (!isLoaded) return null;
        const startPage = getPageForAyah(startSura, startAyah);
        const endPage = getPageForAyah(endSura, endAyah);
        if (startPage === null || endPage === null) return null;
        return {
            startPage,
            endPage,
            totalPages: endPage - startPage + 1
        };
    }

    // Get organized sections for a page range (which suras/ayahs are on those pages)
    // Returns: [{suraNo, suraName, fromAyah, toAyah, fromPage, toPage}]
    function getSectionsForPageRange(fromPage, toPage) {
        if (!isLoaded) return [];
        // Get all ayahs in this page range
        const ayahs = quranData.filter(a => a.page >= fromPage && a.page <= toPage);
        if (ayahs.length === 0) return [];

        // Group by sura
        const suraMap = new Map();
        ayahs.forEach(a => {
            if (!suraMap.has(a.sura_no)) {
                suraMap.set(a.sura_no, {
                    suraNo: a.sura_no,
                    suraName: a.sura_name_ar,
                    fromAyah: a.aya_no,
                    toAyah: a.aya_no,
                    fromPage: a.page,
                    toPage: a.page
                });
            } else {
                const entry = suraMap.get(a.sura_no);
                if (a.aya_no < entry.fromAyah) entry.fromAyah = a.aya_no;
                if (a.aya_no > entry.toAyah) entry.toAyah = a.aya_no;
                if (a.page < entry.fromPage) entry.fromPage = a.page;
                if (a.page > entry.toPage) entry.toPage = a.page;
            }
        });

        return Array.from(suraMap.values());
    }

    // Get all unique page numbers in the Quran (sorted)
    function getAllPages() {
        if (!isLoaded) return [];
        const pages = new Set();
        quranData.forEach(a => pages.add(a.page));
        return Array.from(pages).sort((a, b) => a - b);
    }

    // Get the first ayah on a specific page
    function getFirstAyahOnPage(pageNo) {
        if (!isLoaded) return null;
        const ayahs = quranData.filter(a => a.page == pageNo);
        if (ayahs.length === 0) return null;
        ayahs.sort((a, b) => {
            if (a.sura_no !== b.sura_no) return a.sura_no - b.sura_no;
            return a.aya_no - b.aya_no;
        });
        return ayahs[0];
    }

    // Get the last ayah on a specific page
    function getLastAyahOnPage(pageNo) {
        if (!isLoaded) return null;
        const ayahs = quranData.filter(a => a.page == pageNo);
        if (ayahs.length === 0) return null;
        ayahs.sort((a, b) => {
            if (a.sura_no !== b.sura_no) return b.sura_no - a.sura_no;
            return b.aya_no - a.aya_no;
        });
        return ayahs[0];
    }

    // Expose global tab switcher for Quran modal
    window.switchQuranSurahTab = function(activeIndex, total) {
        for(let i=0; i<total; i++) {
            const btn = document.getElementById('quran-tab-btn-'+i);
            const content = document.getElementById('quran-tab-content-'+i);
            if(btn && content) {
                if(i === activeIndex) {
                    btn.className = 'px-4 py-2 rounded-full font-bold whitespace-nowrap text-sm transition-all bg-amber-600 text-white shadow-md';
                    content.className = 'block animate-fade-in pb-8';
                } else {
                    btn.className = 'px-4 py-2 rounded-full font-bold whitespace-nowrap text-sm transition-all bg-amber-100 text-amber-800 hover:bg-amber-200';
                    content.className = 'hidden pb-8';
                }
            }
        }
    };

    // Get formatted HTML for a sections array (for display in modal)
    function getTextForSections(sections) {
        if (!isLoaded || !sections || sections.length === 0) return '';
        
        let tabsHtml = '<div class="flex gap-2 overflow-x-auto pb-2 mb-4 hide-scrollbar justify-center">';
        let contentHtml = '';

        sections.forEach((sec, index) => {
            const ayahs = quranData.filter(a =>
                a.sura_no == sec.suraNo &&
                a.aya_no > 0 &&
                a.aya_no >= sec.fromAyah &&
                a.aya_no <= sec.toAyah
            );
            
            const isActive = index === 0;
            const btnClass = isActive ? 'bg-amber-600 text-white shadow-md' : 'bg-amber-100 text-amber-800 hover:bg-amber-200';
            
            tabsHtml += `<button onclick="window.switchQuranSurahTab(${index}, ${sections.length})" id="quran-tab-btn-${index}" class="px-4 py-2 rounded-full font-bold whitespace-nowrap text-sm transition-all ${btnClass}">سورة ${sec.suraName}</button>`;
            
            contentHtml += `<div id="quran-tab-content-${index}" class="${isActive ? 'block' : 'hidden'} animate-fade-in pb-8">`;
            contentHtml += `<div class="bg-amber-200/60 dark:bg-amber-900/40 rounded-xl py-3 px-6 mb-4 text-center border border-amber-300 dark:border-amber-700">`;
            contentHtml += `<h3 class="text-xl font-bold text-amber-900 dark:text-amber-200">سورة ${sec.suraName}</h3>`;
            contentHtml += `<p class="text-xs text-amber-700 dark:text-amber-400 mt-1">آية ${sec.fromAyah} إلى ${sec.toAyah}</p>`;
            contentHtml += `</div>`;
            contentHtml += `<div class="leading-[2.8] text-right font-quran">`;
            contentHtml += ayahs.map(a => {
                return `<span class="aya-item">${a.aya_text || ""}</span>`;
            }).join(' ');
            contentHtml += `</div></div>`;
        });
        
        tabsHtml += '</div>';

        return tabsHtml + contentHtml;
    }

    return {
        loadData,
        getSuras,
        getAyahs,
        getSuraInfo,
        searchAyahs,
        isLoaded: () => isLoaded,
        // Page utilities for curriculum
        getPageForAyah,
        getAyahsOnPage,
        getPageRange,
        getSectionsForPageRange,
        getAllPages,
        getFirstAyahOnPage,
        getLastAyahOnPage,
        getTextForSections
    };
})();
