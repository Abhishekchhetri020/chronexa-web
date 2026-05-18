/**
 * Tiny bilingual lookup. Every UI string passes through t("key").
 * Keys are short; English copy mirrors the original, Hindi is short + native.
 */
window.I18N = (function () {
  "use strict";

  const STRINGS = {
    appTitle:        { en: "Chronexa",                        hi: "क्रोनेक्सा" },
    tagline:         { en: "Open timetable. Yours to keep.",  hi: "खुली समय-सारणी, सदा आपकी।" },

    nav1:            { en: "1. Upload XML",                   hi: "१. एक्सएमएल" },
    nav2:            { en: "2. School Info",                  hi: "२. विद्यालय" },
    nav3:            { en: "3. Class Grid",                   hi: "३. कक्षा सूची" },
    nav4:            { en: "4. Teacher Grid",                 hi: "४. शिक्षक सूची" },
    nav5:            { en: "5. Room Grid",                    hi: "५. कक्ष सूची" },

    step1Title:      { en: "Upload aSc Timetable XML",        hi: "एएससी टाइमटेबल एक्सएमएल अपलोड करें" },
    step1Desc:       { en: "Drop your asctt2012*.xml export here. Everything stays in your browser — no upload to any server.",
                       hi: "अपनी asctt2012*.xml फ़ाइल यहाँ डालें। सब कुछ आपके ब्राउज़र में रहता है।" },
    step1Button:     { en: "Choose XML file",                 hi: "फ़ाइल चुनें" },

    step2Title:      { en: "School Info",                     hi: "विद्यालय जानकारी" },
    step2Desc:       { en: "Summary of what was parsed from your XML.",
                       hi: "एक्सएमएल फ़ाइल से प्राप्त जानकारी का सारांश।" },

    step3Title:      { en: "Class Grid",                      hi: "कक्षा सूची" },
    step3Desc:       { en: "Each row is a section. Each cell shows the subject, teacher, and room for that period.",
                       hi: "प्रत्येक पंक्ति एक कक्षा, प्रत्येक खण्ड में विषय, शिक्षक और कक्ष।" },

    step4Title:      { en: "Teacher Grid",                    hi: "शिक्षक सूची" },
    step4Desc:       { en: "Each row is a teacher. Each cell shows class + subject + room.",
                       hi: "प्रत्येक पंक्ति एक शिक्षक की।" },

    step5Title:      { en: "Room Grid",                       hi: "कक्ष सूची" },
    step5Desc:       { en: "Each row is a classroom. See which class + subject + teacher is in each period.",
                       hi: "प्रत्येक पंक्ति एक कक्ष की।" },

    searchPlaceholder: { en: "Search name / subject / room…",  hi: "खोजें…" },
    langToggleEN:    { en: "EN",                              hi: "EN" },
    langToggleHI:    { en: "हिं",                              hi: "हिं" },

    statSchool:      { en: "School",                          hi: "विद्यालय" },
    statTeachers:    { en: "Teachers",                        hi: "शिक्षक" },
    statClasses:     { en: "Classes / Sections",              hi: "कक्षाएँ" },
    statSubjects:    { en: "Subjects",                        hi: "विषय" },
    statRooms:       { en: "Classrooms",                      hi: "कक्ष" },
    statLessons:     { en: "Lessons",                         hi: "पाठ" },
    statCards:       { en: "Placed cards",                    hi: "कार्ड" },
    statPeriods:     { en: "Periods / day",                   hi: "खण्ड प्रति दिन" },

    days: {
      en: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
      hi: ["सोम", "मंगल", "बुध", "गुरु", "शुक्र", "शनि"],
    },
    daysFull: {
      en: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"],
      hi: ["सोमवार","मंगलवार","बुधवार","गुरुवार","शुक्रवार","शनिवार"],
    },

    period:          { en: "P",                               hi: "खं" },
    empty:           { en: "—",                               hi: "—" },
    free:            { en: "Free",                            hi: "खाली" },
    needXml:         { en: "Upload a timetable XML first.",   hi: "पहले एक्सएमएल फ़ाइल चुनें।" },
    parsing:         { en: "Parsing…",                        hi: "पढ़ रहा है…" },
    parseOK:         { en: "Parsed.",                         hi: "पढ़ लिया।" },
    parseFail:       { en: "Could not parse.",                hi: "पढ़ नहीं सका।" },
    inspectorTitle:  { en: "Lesson details",                  hi: "पाठ विवरण" },
    closeBtn:        { en: "Close",                           hi: "बंद करें" },
    noMatches:       { en: "No matches.",                     hi: "कुछ नहीं मिला।" },
    showAllDays:     { en: "All days",                        hi: "सभी दिन" },

    footer:          { en: "Runs entirely in your browser — no upload, no tracking.",
                       hi: "पूर्णतः आपके ब्राउज़र में चलता है — कोई अपलोड नहीं।" },
  };

  function t(key) {
    const e = STRINGS[key];
    if (!e) return key;
    const lang = (window.APP && window.APP.lang) || "en";
    return e[lang] !== undefined ? e[lang] : e.en;
  }

  function dayLabel(i, full) {
    const lang = (window.APP && window.APP.lang) || "en";
    const src = full ? STRINGS.daysFull[lang] : STRINGS.days[lang];
    return src[i] || "?";
  }

  return { t, dayLabel, STRINGS };
})();
