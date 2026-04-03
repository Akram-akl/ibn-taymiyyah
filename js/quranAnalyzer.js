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

    return {
        loadData,
        getSuras,
        getAyahs,
        getSuraInfo,
        searchAyahs,
        isLoaded: () => isLoaded
    };
})();
