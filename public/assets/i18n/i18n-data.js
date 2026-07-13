/*
 * CampusVibe — translation data
 * =============================
 * This is the shared string table used by /assets/js/i18n.js to translate
 * the site-wide chrome (navigation, homepage hero, category filters,
 * footer, and a handful of very common buttons/labels) into every
 * language requested.
 *
 * IMPORTANT — please read before shipping to production:
 * This covers the highest-visibility, shared UI text across every page
 * (header nav, homepage hero + categories, footer, a few common words).
 * It is NOT yet a translation of every string on every page — organizer
 * dashboard forms, validation/error messages returned by the server, and
 * page-specific copy (event descriptions, ticket details, etc.) still
 * render in English regardless of the selected language. Extending
 * coverage just means adding more keys here and more data-i18n attributes
 * in the HTML — the mechanism already supports it, see i18n.js.
 *
 * Translation quality note: these were produced by an AI model, not a
 * native-speaker translator. Confidence is high for the widely-used
 * languages (Hindi, Bengali, Telugu, Marathi, Tamil, Gujarati, Kannada,
 * Malayalam, Odia, Punjabi, Urdu, Nepali, Sanskrit, Spanish, French,
 * German, Portuguese, Russian, Chinese, Japanese, Korean, Arabic).
 * Confidence is lower for Assamese, Maithili, Konkani, Kashmiri, Manipuri
 * (Meitei), Bodo, Dogri, Santali, and Sindhi — these have more dialectal/
 * script variation and less standardized digital UI convention, so please
 * have a native speaker review those specific ones before relying on them
 * publicly.
 */
window.I18N_STRINGS = {

  en: { name: "English", dir: "ltr",
    nav_home: "Home", nav_profile: "Profile", nav_help: "Help", nav_login: "Login",
    nav_register: "Register", nav_logout: "Logout", nav_my_tickets: "My Tickets", nav_dashboard: "Dashboard",
    hero_title: "Find your next campus moment", hero_subtitle: "Discover fests, workshops, and competitions. Register, pay, and get your e-ticket with a secure QR — in minutes.",
    browse_events: "Browse Events", my_tickets_btn: "My Tickets",
    quick_events: "Events", quick_profile: "Profile", quick_help: "Help",
    cat_all: "All Events", cat_technical: "Technical", cat_cultural: "Cultural", cat_sports: "Sports", cat_workshops: "Workshops",
    search_placeholder: "Search events (e.g., fest, workshop)...", footer_tagline: "Ideal Management, Ideal Moments",
    free_label: "Free", onwards_label: "onwards", lang_selector_label: "Language"
  },

  hi: { name: "हिन्दी", dir: "ltr",
    nav_home: "होम", nav_profile: "प्रोफ़ाइल", nav_help: "सहायता", nav_login: "लॉगिन",
    nav_register: "रजिस्टर करें", nav_logout: "लॉगआउट", nav_my_tickets: "मेरे टिकट", nav_dashboard: "डैशबोर्ड",
    hero_title: "अपना अगला कैंपस पल खोजें", hero_subtitle: "फेस्ट, वर्कशॉप और प्रतियोगिताएँ खोजें। कुछ ही मिनटों में रजिस्टर करें, भुगतान करें, और सुरक्षित QR के साथ अपना ई-टिकट पाएँ।",
    browse_events: "इवेंट्स देखें", my_tickets_btn: "मेरे टिकट",
    quick_events: "इवेंट्स", quick_profile: "प्रोफ़ाइल", quick_help: "सहायता",
    cat_all: "सभी इवेंट्स", cat_technical: "तकनीकी", cat_cultural: "सांस्कृतिक", cat_sports: "खेल", cat_workshops: "कार्यशालाएँ",
    search_placeholder: "इवेंट खोजें (जैसे, फेस्ट, वर्कशॉप)...", footer_tagline: "आदर्श प्रबंधन, आदर्श पल",
    free_label: "मुफ़्त", onwards_label: "से शुरू", lang_selector_label: "भाषा"
  },

  bn: { name: "বাংলা", dir: "ltr",
    nav_home: "হোম", nav_profile: "প্রোফাইল", nav_help: "সাহায্য", nav_login: "লগইন",
    nav_register: "নিবন্ধন করুন", nav_logout: "লগআউট", nav_my_tickets: "আমার টিকিট", nav_dashboard: "ড্যাশবোর্ড",
    hero_title: "আপনার পরবর্তী ক্যাম্পাস মুহূর্ত খুঁজুন", hero_subtitle: "উৎসব, কর্মশালা এবং প্রতিযোগিতা আবিষ্কার করুন। মিনিটেই নিবন্ধন করুন, পেমেন্ট করুন এবং নিরাপদ QR সহ আপনার ই-টিকিট পান।",
    browse_events: "ইভেন্ট দেখুন", my_tickets_btn: "আমার টিকিট",
    quick_events: "ইভেন্ট", quick_profile: "প্রোফাইল", quick_help: "সাহায্য",
    cat_all: "সব ইভেন্ট", cat_technical: "প্রযুক্তিগত", cat_cultural: "সাংস্কৃতিক", cat_sports: "খেলাধুলা", cat_workshops: "কর্মশালা",
    search_placeholder: "ইভেন্ট খুঁজুন (যেমন, উৎসব, কর্মশালা)...", footer_tagline: "আদর্শ ব্যবস্থাপনা, আদর্শ মুহূর্ত",
    free_label: "বিনামূল্যে", onwards_label: "থেকে শুরু", lang_selector_label: "ভাষা"
  },

  te: { name: "తెలుగు", dir: "ltr",
    nav_home: "హోమ్", nav_profile: "ప్రొఫైల్", nav_help: "సహాయం", nav_login: "లాగిన్",
    nav_register: "నమోదు చేయండి", nav_logout: "లాగ్అవుట్", nav_my_tickets: "నా టిక్కెట్లు", nav_dashboard: "డాష్‌బోర్డ్",
    hero_title: "మీ తదుపరి క్యాంపస్ క్షణాన్ని కనుగొనండి", hero_subtitle: "ఫెస్ట్‌లు, వర్క్‌షాప్‌లు మరియు పోటీలను కనుగొనండి. నిమిషాల్లో నమోదు చేసుకోండి, చెల్లించండి, సురక్షిత QRతో మీ ఇ-టికెట్ పొందండి.",
    browse_events: "ఈవెంట్‌లను చూడండి", my_tickets_btn: "నా టిక్కెట్లు",
    quick_events: "ఈవెంట్‌లు", quick_profile: "ప్రొఫైల్", quick_help: "సహాయం",
    cat_all: "అన్ని ఈవెంట్‌లు", cat_technical: "టెక్నికల్", cat_cultural: "సాంస్కృతిక", cat_sports: "క్రీడలు", cat_workshops: "వర్క్‌షాప్‌లు",
    search_placeholder: "ఈవెంట్‌లను వెతకండి (ఉదా. ఫెస్ట్, వర్క్‌షాప్)...", footer_tagline: "ఆదర్శ నిర్వహణ, ఆదర్శ క్షణాలు",
    free_label: "ఉచితం", onwards_label: "నుండి", lang_selector_label: "భాష"
  },

  mr: { name: "मराठी", dir: "ltr",
    nav_home: "होम", nav_profile: "प्रोफाइल", nav_help: "मदत", nav_login: "लॉगिन",
    nav_register: "नोंदणी करा", nav_logout: "लॉगआउट", nav_my_tickets: "माझी तिकिटे", nav_dashboard: "डॅशबोर्ड",
    hero_title: "तुमचा पुढचा कॅम्पस क्षण शोधा", hero_subtitle: "फेस्ट, कार्यशाळा आणि स्पर्धा शोधा. काही मिनिटांत नोंदणी करा, पैसे भरा आणि सुरक्षित QR सह तुमचे ई-तिकीट मिळवा.",
    browse_events: "इव्हेंट्स पहा", my_tickets_btn: "माझी तिकिटे",
    quick_events: "इव्हेंट्स", quick_profile: "प्रोफाइल", quick_help: "मदत",
    cat_all: "सर्व इव्हेंट्स", cat_technical: "तांत्रिक", cat_cultural: "सांस्कृतिक", cat_sports: "क्रीडा", cat_workshops: "कार्यशाळा",
    search_placeholder: "इव्हेंट्स शोधा (उदा. फेस्ट, कार्यशाळा)...", footer_tagline: "आदर्श व्यवस्थापन, आदर्श क्षण",
    free_label: "मोफत", onwards_label: "पासून पुढे", lang_selector_label: "भाषा"
  },

  ta: { name: "தமிழ்", dir: "ltr",
    nav_home: "முகப்பு", nav_profile: "சுயவிவரம்", nav_help: "உதவி", nav_login: "உள்நுழைவு",
    nav_register: "பதிவு செய்யவும்", nav_logout: "வெளியேறு", nav_my_tickets: "எனது டிக்கெட்டுகள்", nav_dashboard: "டாஷ்போர்டு",
    hero_title: "உங்கள் அடுத்த வளாக தருணத்தைக் கண்டறியுங்கள்", hero_subtitle: "விழாக்கள், பட்டறைகள் மற்றும் போட்டிகளைக் கண்டறியுங்கள். நிமிடங்களில் பதிவு செய்து, கட்டணம் செலுத்தி, பாதுகாப்பான QR உடன் உங்கள் இ-டிக்கெட்டைப் பெறுங்கள்.",
    browse_events: "நிகழ்வுகளைப் பார்க்க", my_tickets_btn: "எனது டிக்கெட்டுகள்",
    quick_events: "நிகழ்வுகள்", quick_profile: "சுயவிவரம்", quick_help: "உதவி",
    cat_all: "அனைத்து நிகழ்வுகள்", cat_technical: "தொழில்நுட்பம்", cat_cultural: "கலாச்சாரம்", cat_sports: "விளையாட்டு", cat_workshops: "பட்டறைகள்",
    search_placeholder: "நிகழ்வுகளைத் தேடுங்கள் (எ.கா. விழா, பட்டறை)...", footer_tagline: "சிறந்த மேலாண்மை, சிறந்த தருணங்கள்",
    free_label: "இலவசம்", onwards_label: "முதல்", lang_selector_label: "மொழி"
  },

  ur: { name: "اردو", dir: "rtl",
    nav_home: "ہوم", nav_profile: "پروفائل", nav_help: "مدد", nav_login: "لاگ ان",
    nav_register: "رجسٹر کریں", nav_logout: "لاگ آؤٹ", nav_my_tickets: "میرے ٹکٹ", nav_dashboard: "ڈیش بورڈ",
    hero_title: "اپنا اگلا کیمپس لمحہ تلاش کریں", hero_subtitle: "فیسٹ، ورکشاپس اور مقابلے دریافت کریں۔ منٹوں میں رجسٹر کریں، ادائیگی کریں، اور محفوظ QR کے ساتھ اپنا ای ٹکٹ حاصل کریں۔",
    browse_events: "ایونٹس دیکھیں", my_tickets_btn: "میرے ٹکٹ",
    quick_events: "ایونٹس", quick_profile: "پروفائل", quick_help: "مدد",
    cat_all: "تمام ایونٹس", cat_technical: "تکنیکی", cat_cultural: "ثقافتی", cat_sports: "کھیل", cat_workshops: "ورکشاپس",
    search_placeholder: "ایونٹس تلاش کریں (مثلاً فیسٹ، ورکشاپ)...", footer_tagline: "بہترین انتظام، بہترین لمحات",
    free_label: "مفت", onwards_label: "سے شروع", lang_selector_label: "زبان"
  },

  gu: { name: "ગુજરાતી", dir: "ltr",
    nav_home: "હોમ", nav_profile: "પ્રોફાઇલ", nav_help: "મદદ", nav_login: "લૉગિન",
    nav_register: "નોંધણી કરો", nav_logout: "લૉગઆઉટ", nav_my_tickets: "મારી ટિકિટ", nav_dashboard: "ડેશબોર્ડ",
    hero_title: "તમારી આગામી કેમ્પસ ક્ષણ શોધો", hero_subtitle: "ફેસ્ટ, વર્કશોપ અને સ્પર્ધાઓ શોધો. મિનિટોમાં નોંધણી કરો, ચુકવણી કરો, અને સુરક્ષિત QR સાથે તમારી ઈ-ટિકિટ મેળવો.",
    browse_events: "ઇવેન્ટ્સ જુઓ", my_tickets_btn: "મારી ટિકિટ",
    quick_events: "ઇવેન્ટ્સ", quick_profile: "પ્રોફાઇલ", quick_help: "મદદ",
    cat_all: "બધા ઇવેન્ટ્સ", cat_technical: "ટેકનિકલ", cat_cultural: "સાંસ્કૃતિક", cat_sports: "રમતગમત", cat_workshops: "વર્કશોપ",
    search_placeholder: "ઇવેન્ટ્સ શોધો (દા.ત. ફેસ્ટ, વર્કશોપ)...", footer_tagline: "આદર્શ સંચાલન, આદર્શ ક્ષણો",
    free_label: "મફત", onwards_label: "થી શરૂ", lang_selector_label: "ભાષા"
  },

  kn: { name: "ಕನ್ನಡ", dir: "ltr",
    nav_home: "ಮುಖಪುಟ", nav_profile: "ಪ್ರೊಫೈಲ್", nav_help: "ಸಹಾಯ", nav_login: "ಲಾಗಿನ್",
    nav_register: "ನೋಂದಣಿ ಮಾಡಿ", nav_logout: "ಲಾಗ್ಔಟ್", nav_my_tickets: "ನನ್ನ ಟಿಕೆಟ್‌ಗಳು", nav_dashboard: "ಡ್ಯಾಶ್‌ಬೋರ್ಡ್",
    hero_title: "ನಿಮ್ಮ ಮುಂದಿನ ಕ್ಯಾಂಪಸ್ ಕ್ಷಣವನ್ನು ಹುಡುಕಿ", hero_subtitle: "ಫೆಸ್ಟ್‌ಗಳು, ಕಾರ್ಯಾಗಾರಗಳು ಮತ್ತು ಸ್ಪರ್ಧೆಗಳನ್ನು ಅನ್ವೇಷಿಸಿ. ನಿಮಿಷಗಳಲ್ಲಿ ನೋಂದಾಯಿಸಿ, ಪಾವತಿಸಿ ಮತ್ತು ಸುರಕ್ಷಿತ QR ಜೊತೆ ನಿಮ್ಮ ಇ-ಟಿಕೆಟ್ ಪಡೆಯಿರಿ.",
    browse_events: "ಈವೆಂಟ್‌ಗಳನ್ನು ವೀಕ್ಷಿಸಿ", my_tickets_btn: "ನನ್ನ ಟಿಕೆಟ್‌ಗಳು",
    quick_events: "ಈವೆಂಟ್‌ಗಳು", quick_profile: "ಪ್ರೊಫೈಲ್", quick_help: "ಸಹಾಯ",
    cat_all: "ಎಲ್ಲಾ ಈವೆಂಟ್‌ಗಳು", cat_technical: "ತಾಂತ್ರಿಕ", cat_cultural: "ಸಾಂಸ್ಕೃತಿಕ", cat_sports: "ಕ್ರೀಡೆ", cat_workshops: "ಕಾರ್ಯಾಗಾರಗಳು",
    search_placeholder: "ಈವೆಂಟ್‌ಗಳನ್ನು ಹುಡುಕಿ (ಉದಾ. ಫೆಸ್ಟ್, ಕಾರ್ಯಾಗಾರ)...", footer_tagline: "ಆದರ್ಶ ನಿರ್ವಹಣೆ, ಆದರ್ಶ ಕ್ಷಣಗಳು",
    free_label: "ಉಚಿತ", onwards_label: "ರಿಂದ", lang_selector_label: "ಭಾಷೆ"
  },

  ml: { name: "മലയാളം", dir: "ltr",
    nav_home: "ഹോം", nav_profile: "പ്രൊഫൈൽ", nav_help: "സഹായം", nav_login: "ലോഗിൻ",
    nav_register: "രജിസ്റ്റർ ചെയ്യുക", nav_logout: "ലോഗ്ഔട്ട്", nav_my_tickets: "എന്റെ ടിക്കറ്റുകൾ", nav_dashboard: "ഡാഷ്ബോർഡ്",
    hero_title: "നിങ്ങളുടെ അടുത്ത ക്യാമ്പസ് നിമിഷം കണ്ടെത്തൂ", hero_subtitle: "ഫെസ്റ്റുകൾ, വർക്ക്ഷോപ്പുകൾ, മത്സരങ്ങൾ എന്നിവ കണ്ടെത്തൂ. മിനിറ്റുകൾക്കുള്ളിൽ രജിസ്റ്റർ ചെയ്ത്, പണമടച്ച്, സുരക്ഷിതമായ QR സഹിതം നിങ്ങളുടെ ഇ-ടിക്കറ്റ് നേടൂ.",
    browse_events: "ഇവന്റുകൾ കാണുക", my_tickets_btn: "എന്റെ ടിക്കറ്റുകൾ",
    quick_events: "ഇവന്റുകൾ", quick_profile: "പ്രൊഫൈൽ", quick_help: "സഹായം",
    cat_all: "എല്ലാ ഇവന്റുകളും", cat_technical: "സാങ്കേതികം", cat_cultural: "സാംസ്കാരികം", cat_sports: "കായികം", cat_workshops: "വർക്ക്ഷോപ്പുകൾ",
    search_placeholder: "ഇവന്റുകൾ തിരയുക (ഉദാ. ഫെസ്റ്റ്, വർക്ക്ഷോപ്പ്)...", footer_tagline: "മികച്ച മാനേജ്മെന്റ്, മികച്ച നിമിഷങ്ങൾ",
    free_label: "സൗജന്യം", onwards_label: "മുതൽ", lang_selector_label: "ഭാഷ"
  },

  or: { name: "ଓଡ଼ିଆ", dir: "ltr",
    nav_home: "ହୋମ୍", nav_profile: "ପ୍ରୋଫାଇଲ୍", nav_help: "ସାହାଯ୍ୟ", nav_login: "ଲଗଇନ୍",
    nav_register: "ପଞ୍ଜୀକରଣ କରନ୍ତୁ", nav_logout: "ଲଗଆଉଟ୍", nav_my_tickets: "ମୋର ଟିକେଟ୍", nav_dashboard: "ଡ୍ୟାସବୋର୍ଡ",
    hero_title: "ଆପଣଙ୍କର ପରବର୍ତ୍ତୀ କ୍ୟାମ୍ପସ୍ ମୁହୂର୍ତ୍ତ ଖୋଜନ୍ତୁ", hero_subtitle: "ଉତ୍ସବ, କର୍ମଶାଳା ଏବଂ ପ୍ରତିଯୋଗିତା ଆବିଷ୍କାର କରନ୍ତୁ। ମିନିଟ୍ ମଧ୍ୟରେ ପଞ୍ଜୀକରଣ କରନ୍ତୁ, ଦେୟ ଦିଅନ୍ତୁ, ଏବଂ ସୁରକ୍ଷିତ QR ସହିତ ଆପଣଙ୍କର ଇ-ଟିକେଟ୍ ପାଆନ୍ତୁ।",
    browse_events: "ଇଭେଣ୍ଟ ଦେଖନ୍ତୁ", my_tickets_btn: "ମୋର ଟିକେଟ୍",
    quick_events: "ଇଭେଣ୍ଟଗୁଡ଼ିକ", quick_profile: "ପ୍ରୋଫାଇଲ୍", quick_help: "ସାହାଯ୍ୟ",
    cat_all: "ସମସ୍ତ ଇଭେଣ୍ଟ", cat_technical: "ଟେକ୍ନିକାଲ୍", cat_cultural: "ସାଂସ୍କୃତିକ", cat_sports: "ଖେଳ", cat_workshops: "କର୍ମଶାଳା",
    search_placeholder: "ଇଭେଣ୍ଟ ଖୋଜନ୍ତୁ (ଯଥା, ଉତ୍ସବ, କର୍ମଶାଳା)...", footer_tagline: "ଆଦର୍ଶ ପରିଚାଳନା, ଆଦର୍ଶ ମୁହୂର୍ତ୍ତ",
    free_label: "ମାଗଣା", onwards_label: "ଠାରୁ", lang_selector_label: "ଭାଷା"
  },

  pa: { name: "ਪੰਜਾਬੀ", dir: "ltr",
    nav_home: "ਹੋਮ", nav_profile: "ਪ੍ਰੋਫਾਈਲ", nav_help: "ਮਦਦ", nav_login: "ਲੌਗਇਨ",
    nav_register: "ਰਜਿਸਟਰ ਕਰੋ", nav_logout: "ਲੌਗਆਊਟ", nav_my_tickets: "ਮੇਰੀਆਂ ਟਿਕਟਾਂ", nav_dashboard: "ਡੈਸ਼ਬੋਰਡ",
    hero_title: "ਆਪਣਾ ਅਗਲਾ ਕੈਂਪਸ ਪਲ ਲੱਭੋ", hero_subtitle: "ਫੈਸਟ, ਵਰਕਸ਼ਾਪਾਂ ਅਤੇ ਮੁਕਾਬਲੇ ਖੋਜੋ। ਮਿੰਟਾਂ ਵਿੱਚ ਰਜਿਸਟਰ ਕਰੋ, ਭੁਗਤਾਨ ਕਰੋ, ਅਤੇ ਸੁਰੱਖਿਅਤ QR ਨਾਲ ਆਪਣੀ ਈ-ਟਿਕਟ ਪ੍ਰਾਪਤ ਕਰੋ।",
    browse_events: "ਇਵੈਂਟਸ ਵੇਖੋ", my_tickets_btn: "ਮੇਰੀਆਂ ਟਿਕਟਾਂ",
    quick_events: "ਇਵੈਂਟਸ", quick_profile: "ਪ੍ਰੋਫਾਈਲ", quick_help: "ਮਦਦ",
    cat_all: "ਸਾਰੇ ਇਵੈਂਟਸ", cat_technical: "ਤਕਨੀਕੀ", cat_cultural: "ਸੱਭਿਆਚਾਰਕ", cat_sports: "ਖੇਡਾਂ", cat_workshops: "ਵਰਕਸ਼ਾਪਾਂ",
    search_placeholder: "ਇਵੈਂਟਸ ਖੋਜੋ (ਜਿਵੇਂ, ਫੈਸਟ, ਵਰਕਸ਼ਾਪ)...", footer_tagline: "ਆਦਰਸ਼ ਪ੍ਰਬੰਧਨ, ਆਦਰਸ਼ ਪਲ",
    free_label: "ਮੁਫ਼ਤ", onwards_label: "ਤੋਂ ਸ਼ੁਰੂ", lang_selector_label: "ਭਾਸ਼ਾ"
  },

  as: { name: "অসমীয়া", dir: "ltr",
    nav_home: "গৃহ", nav_profile: "প্ৰ'ফাইল", nav_help: "সহায়", nav_login: "লগইন",
    nav_register: "পঞ্জীয়ন কৰক", nav_logout: "লগআউট", nav_my_tickets: "মোৰ টিকট", nav_dashboard: "ডেশ্বব'ৰ্ড",
    hero_title: "আপোনাৰ পৰৱৰ্তী কেম্পাছ মুহূৰ্ত বিচাৰক", hero_subtitle: "ফেষ্ট, কৰ্মশালা আৰু প্ৰতিযোগিতা আৱিষ্কাৰ কৰক। মিনিটৰ ভিতৰতে পঞ্জীয়ন কৰক, পৰিশোধ কৰক আৰু সুৰক্ষিত QR ৰ সৈতে আপোনাৰ ই-টিকট লাভ কৰক।",
    browse_events: "কাৰ্যক্ৰম চাওক", my_tickets_btn: "মোৰ টিকট",
    quick_events: "কাৰ্যক্ৰম", quick_profile: "প্ৰ'ফাইল", quick_help: "সহায়",
    cat_all: "সকলো কাৰ্যক্ৰম", cat_technical: "কাৰিকৰী", cat_cultural: "সাংস্কৃতিক", cat_sports: "ক্ৰীড়া", cat_workshops: "কৰ্মশালা",
    search_placeholder: "কাৰ্যক্ৰম বিচাৰক (যেনে, ফেষ্ট, কৰ্মশালা)...", footer_tagline: "আদৰ্শ ব্যৱস্থাপনা, আদৰ্শ মুহূৰ্ত",
    free_label: "বিনামূলীয়া", onwards_label: "ৰ পৰা", lang_selector_label: "ভাষা"
  },

  mai: { name: "मैथिली", dir: "ltr",
    nav_home: "गृह", nav_profile: "प्रोफाइल", nav_help: "सहायता", nav_login: "लॉगिन",
    nav_register: "पंजीकरण करू", nav_logout: "लॉगआउट", nav_my_tickets: "हमर टिकट", nav_dashboard: "डैशबोर्ड",
    hero_title: "अपन अगिला कैंपस पल खोजू", hero_subtitle: "फेस्ट, कार्यशाला आ प्रतियोगिता खोजू। मिनट मे पंजीकरण करू, भुगतान करू आ सुरक्षित QR सहित अपन ई-टिकट पाबू।",
    browse_events: "इवेंट देखू", my_tickets_btn: "हमर टिकट",
    quick_events: "इवेंट", quick_profile: "प्रोफाइल", quick_help: "सहायता",
    cat_all: "सब इवेंट", cat_technical: "तकनीकी", cat_cultural: "सांस्कृतिक", cat_sports: "खेल", cat_workshops: "कार्यशाला",
    search_placeholder: "इवेंट खोजू (जेना, फेस्ट, कार्यशाला)...", footer_tagline: "आदर्श प्रबंधन, आदर्श पल",
    free_label: "मुफ्त", onwards_label: "सँ शुरू", lang_selector_label: "भाषा"
  },

  sa: { name: "संस्कृतम्", dir: "ltr",
    nav_home: "गृहम्", nav_profile: "परिचयः", nav_help: "सहायता", nav_login: "प्रवेशः",
    nav_register: "पञ्जीकरणम्", nav_logout: "निर्गमः", nav_my_tickets: "मम प्रवेशपत्राणि", nav_dashboard: "फलकम्",
    hero_title: "स्व अग्रिमं परिसर-क्षणं अन्विष्यताम्", hero_subtitle: "उत्सवान्, कार्यशालाः, स्पर्धाः च अन्विष्यताम्। निमेषेषु पञ्जीकरणं कुरुत, धनं ददातु, सुरक्षित-QR सहितं ई-प्रवेशपत्रं प्राप्नुत।",
    browse_events: "कार्यक्रमान् पश्यन्तु", my_tickets_btn: "मम प्रवेशपत्राणि",
    quick_events: "कार्यक्रमाः", quick_profile: "परिचयः", quick_help: "सहायता",
    cat_all: "सर्वे कार्यक्रमाः", cat_technical: "तान्त्रिकम्", cat_cultural: "सांस्कृतिकम्", cat_sports: "क्रीडा", cat_workshops: "कार्यशालाः",
    search_placeholder: "कार्यक्रमान् अन्विष्यताम्...", footer_tagline: "आदर्श-व्यवस्थापनम्, आदर्श-क्षणाः",
    free_label: "निःशुल्कम्", onwards_label: "आरभ्य", lang_selector_label: "भाषा"
  },

  kok: { name: "कोंकणी", dir: "ltr",
    nav_home: "घर", nav_profile: "प्रोफायल", nav_help: "मदत", nav_login: "लॉगीन",
    nav_register: "नोंदणी करात", nav_logout: "लॉगआवट", nav_my_tickets: "म्हजी तिकिटां", nav_dashboard: "डॅशबोर्ड",
    hero_title: "तुमचो फुडलो कॅम्पस क्षण सोदात", hero_subtitle: "फेस्त, कार्यशाळा आनी स्पर्धा सोदात. मिनिटांनी नोंदणी करात, पैसे दियात आनी सुरक्षित QR वांगडा तुमचें ई-तिकीट मेळयात.",
    browse_events: "कार्यावळी पळेयात", my_tickets_btn: "म्हजी तिकिटां",
    quick_events: "कार्यावळी", quick_profile: "प्रोफायल", quick_help: "मदत",
    cat_all: "सगळ्यो कार्यावळी", cat_technical: "तांत्रीक", cat_cultural: "सांस्कृतीक", cat_sports: "खेळ", cat_workshops: "कार्यशाळा",
    search_placeholder: "कार्यावळी सोदात...", footer_tagline: "आदर्श व्यवस्थापन, आदर्श क्षण",
    free_label: "फुकट", onwards_label: "सावन", lang_selector_label: "भास"
  },

  ks: { name: "کٲشُر", dir: "rtl",
    nav_home: "گَر", nav_profile: "پروفایل", nav_help: "مدد", nav_login: "لاگ اِن",
    nav_register: "رجسٹر کریو", nav_logout: "لاگ آؤٹ", nav_my_tickets: "میۆن ٹکٹ", nav_dashboard: "ڈیش بورڈ",
    hero_title: "پننہٕ اگلہٕ کیمپس گَھڑی ژھانڈیو", hero_subtitle: "فیسٹ، ورکشاپ تہٕ مقابلہٕ ژھانڈیو۔ منٹن منز رجسٹر کریو، ادایگی کریو تہٕ محفوظ QR سٟتؠ پننہٕ ای-ٹکٹ حاصل کریو۔",
    browse_events: "ایوینٹ ووچھیو", my_tickets_btn: "میۆن ٹکٹ",
    quick_events: "ایوینٹ", quick_profile: "پروفایل", quick_help: "مدد",
    cat_all: "سارے ایوینٹ", cat_technical: "تیکنیکی", cat_cultural: "ثقافتی", cat_sports: "کھیل", cat_workshops: "ورکشاپ",
    search_placeholder: "ایوینٹ ژھانڈیو...", footer_tagline: "بہترین انتظام, بہترین گَھڑؠ",
    free_label: "مفت", onwards_label: "پؠٹھۍ", lang_selector_label: "زبان"
  },

  mni: { name: "মৈতৈলোন্", dir: "ltr",
    nav_home: "য়ুম", nav_profile: "প্রোফাইল", nav_help: "মতেং", nav_login: "লগ ইন",
    nav_register: "রেজিস্টার তৌবিয়ু", nav_logout: "লগ আউট", nav_my_tickets: "ঐগী তিকেৎ", nav_dashboard: "ড্যাশবোর্ড",
    hero_title: "নহাক্কী মথংগী কেম্পস মখল অদু থীবিয়ু", hero_subtitle: "ফেস্ত, ৱার্কশপ অমসুং প্রতিযোগিতাশিং ফংনবা থীবিয়ু। মিনিট খরগীনমক্তা রেজিস্টার তৌবিয়ু, লান্নবা QR গা লোয়ননা নহাক্কী ই-তিকেৎ ফংগনি।",
    browse_events: "ইভেন্টশিং য়েংবিয়ু", my_tickets_btn: "ঐগী তিকেৎ",
    quick_events: "ইভেন্টশিং", quick_profile: "প্রোফাইল", quick_help: "মতেং",
    cat_all: "ইভেন্ট পুম্নমক", cat_technical: "তেক্নিকেল", cat_cultural: "কলচরেল", cat_sports: "স্পোর্ত্স", cat_workshops: "ৱার্কশপ",
    search_placeholder: "ইভেন্ট থীবিয়ু...", footer_tagline: "অহেনবা ম্যানেজমেন্ত, অহেনবা মখল",
    free_label: "মায় য়াওদ্রবা", onwards_label: "গী মথক্তা", lang_selector_label: "লোন্"
  },

  ne: { name: "नेपाली", dir: "ltr",
    nav_home: "गृह", nav_profile: "प्रोफाइल", nav_help: "सहयोग", nav_login: "लगइन",
    nav_register: "दर्ता गर्नुहोस्", nav_logout: "लगआउट", nav_my_tickets: "मेरो टिकटहरू", nav_dashboard: "ड्यासबोर्ड",
    hero_title: "आफ्नो अर्को क्याम्पस क्षण फेला पार्नुहोस्", hero_subtitle: "फेस्ट, कार्यशाला र प्रतियोगिताहरू पत्ता लगाउनुहोस्। मिनेटमै दर्ता गर्नुहोस्, भुक्तानी गर्नुहोस्, र सुरक्षित QR सहित आफ्नो ई-टिकट प्राप्त गर्नुहोस्।",
    browse_events: "कार्यक्रमहरू हेर्नुहोस्", my_tickets_btn: "मेरो टिकटहरू",
    quick_events: "कार्यक्रमहरू", quick_profile: "प्रोफाइल", quick_help: "सहयोग",
    cat_all: "सबै कार्यक्रम", cat_technical: "प्राविधिक", cat_cultural: "सांस्कृतिक", cat_sports: "खेलकुद", cat_workshops: "कार्यशालाहरू",
    search_placeholder: "कार्यक्रमहरू खोज्नुहोस्...", footer_tagline: "आदर्श व्यवस्थापन, आदर्श क्षणहरू",
    free_label: "निःशुल्क", onwards_label: "देखि सुरु", lang_selector_label: "भाषा"
  },

  brx: { name: "बड़ो", dir: "ltr",
    nav_home: "नु", nav_profile: "प्रोफाइल", nav_help: "मदद", nav_login: "लगिन",
    nav_register: "रजिस्टार खालाम", nav_logout: "लगआउट", nav_my_tickets: "आंनि टिकेट", nav_dashboard: "ड्याशबोर्ड",
    hero_title: "नोंगोआ थांखिनि क्याम्पास सोमोय नागिर", hero_subtitle: "फेस्ट, कार्यशाला आरो नाइथि नागिर। मिनिटआव रजिस्टार खालाम, बिबान होगोन आरो रोखा QR जोबोद नोंथांनि ई-टिकेट मोन।",
    browse_events: "बिथोन नु", my_tickets_btn: "आंनि टिकेट",
    quick_events: "बिथोन", quick_profile: "प्रोफाइल", quick_help: "मदद",
    cat_all: "गासै बिथोन", cat_technical: "टेक्निकेल", cat_cultural: "सांस्कृतिक", cat_sports: "खेल", cat_workshops: "कार्यशाला",
    search_placeholder: "बिथोन नागिर...", footer_tagline: "गोहोमोन बे-बादि, गोहोमोन सोमोय",
    free_label: "फ्री", onwards_label: "निफ्राय", lang_selector_label: "रावनि"
  },

  doi: { name: "डोगरी", dir: "ltr",
    nav_home: "घर", nav_profile: "प्रोफाइल", nav_help: "मदद", nav_login: "लॉगिन",
    nav_register: "रजिस्टर करो", nav_logout: "लॉगआउट", nav_my_tickets: "म्हारे टिकट", nav_dashboard: "डैशबोर्ड",
    hero_title: "अपना अगला कैंपस पल टोहलो", hero_subtitle: "फेस्ट, कार्यशाला ते मुकाबले टोहलो। मिनटें च रजिस्टर करो, भुगतान करो, ते सुरक्षित QR कन्नै अपना ई-टिकट हासल करो।",
    browse_events: "इवेंट दिक्खो", my_tickets_btn: "म्हारे टिकट",
    quick_events: "इवेंट", quick_profile: "प्रोफाइल", quick_help: "मदद",
    cat_all: "सारे इवेंट", cat_technical: "तकनीकी", cat_cultural: "सांस्कृतिक", cat_sports: "खेड्डां", cat_workshops: "कार्यशाला",
    search_placeholder: "इवेंट टोहलो...", footer_tagline: "आदर्श प्रबंधन, आदर्श पल",
    free_label: "मुफ्त", onwards_label: "थमां शुरू", lang_selector_label: "भाषा"
  },

  sat: { name: "ᱥᱟᱱᱛᱟᱲᱤ", dir: "ltr",
    nav_home: "ओड़ाक़", nav_profile: "प्रोफाइल", nav_help: "गोडो", nav_login: "लॉगिन",
    nav_register: "पंजीयन मे", nav_logout: "लॉगआउट", nav_my_tickets: "इंगाक् टिकट", nav_dashboard: "डैशबोर्ड",
    hero_title: "आमाक् सेटेराक् कैंपस समय नाम मे", hero_subtitle: "फेस्ट, कार्यशाला आर प्रतियोगिता नाम मे। मिनिट रे पंजीयन मे, बयार मे आर सुरक्षित QR तेयाक् आमाक् ई-टिकट नाम मे।",
    browse_events: "इवेंट नेल मे", my_tickets_btn: "इंगाक् टिकट",
    quick_events: "इवेंट", quick_profile: "प्रोफाइल", quick_help: "गोडो",
    cat_all: "सबेन इवेंट", cat_technical: "तकनीकी", cat_cultural: "सांस्कृतिक", cat_sports: "खेल", cat_workshops: "कार्यशाला",
    search_placeholder: "इवेंट नाम मे...", footer_tagline: "बेश ब्यवस्था, बेश समय",
    free_label: "बिनापैसा", onwards_label: "एतेखान", lang_selector_label: "पाड़हाव"
  },

  sd: { name: "سنڌي", dir: "rtl",
    nav_home: "هوم", nav_profile: "پروفائل", nav_help: "مدد", nav_login: "لاگ ان",
    nav_register: "رجسٽر ڪريو", nav_logout: "لاگ آئوٽ", nav_my_tickets: "منهنجا ٽڪيٽ", nav_dashboard: "ڊيش بورڊ",
    hero_title: "پنهنجو ايندڙ ڪئمپس پل ڳوليو", hero_subtitle: "فيسٽ، ورڪشاپ ۽ مقابلا ڳوليو. منٽن ۾ رجسٽر ڪريو، ادائيگي ڪريو، ۽ محفوظ QR سان پنهنجو اي-ٽڪيٽ حاصل ڪريو.",
    browse_events: "واقعا ڏسو", my_tickets_btn: "منهنجا ٽڪيٽ",
    quick_events: "واقعا", quick_profile: "پروفائل", quick_help: "مدد",
    cat_all: "سڀ واقعا", cat_technical: "فني", cat_cultural: "ثقافتي", cat_sports: "راند", cat_workshops: "ورڪشاپ",
    search_placeholder: "واقعا ڳوليو...", footer_tagline: "بهترين انتظام، بهترين پل",
    free_label: "مفت", onwards_label: "کان شروع", lang_selector_label: "ٻولي"
  },

  es: { name: "Español", dir: "ltr",
    nav_home: "Inicio", nav_profile: "Perfil", nav_help: "Ayuda", nav_login: "Iniciar sesión",
    nav_register: "Registrarse", nav_logout: "Cerrar sesión", nav_my_tickets: "Mis entradas", nav_dashboard: "Panel",
    hero_title: "Encuentra tu próximo momento en el campus", hero_subtitle: "Descubre festivales, talleres y competencias. Regístrate, paga y obtén tu entrada digital con código QR seguro en minutos.",
    browse_events: "Ver eventos", my_tickets_btn: "Mis entradas",
    quick_events: "Eventos", quick_profile: "Perfil", quick_help: "Ayuda",
    cat_all: "Todos los eventos", cat_technical: "Técnico", cat_cultural: "Cultural", cat_sports: "Deportes", cat_workshops: "Talleres",
    search_placeholder: "Buscar eventos (p. ej., festival, taller)...", footer_tagline: "Gestión ideal, momentos ideales",
    free_label: "Gratis", onwards_label: "en adelante", lang_selector_label: "Idioma"
  },

  fr: { name: "Français", dir: "ltr",
    nav_home: "Accueil", nav_profile: "Profil", nav_help: "Aide", nav_login: "Connexion",
    nav_register: "S'inscrire", nav_logout: "Déconnexion", nav_my_tickets: "Mes billets", nav_dashboard: "Tableau de bord",
    hero_title: "Trouvez votre prochain moment sur le campus", hero_subtitle: "Découvrez des festivals, ateliers et compétitions. Inscrivez-vous, payez et obtenez votre billet électronique avec QR sécurisé en quelques minutes.",
    browse_events: "Parcourir les événements", my_tickets_btn: "Mes billets",
    quick_events: "Événements", quick_profile: "Profil", quick_help: "Aide",
    cat_all: "Tous les événements", cat_technical: "Technique", cat_cultural: "Culturel", cat_sports: "Sports", cat_workshops: "Ateliers",
    search_placeholder: "Rechercher des événements...", footer_tagline: "Gestion idéale, moments idéaux",
    free_label: "Gratuit", onwards_label: "à partir de", lang_selector_label: "Langue"
  },

  de: { name: "Deutsch", dir: "ltr",
    nav_home: "Startseite", nav_profile: "Profil", nav_help: "Hilfe", nav_login: "Anmelden",
    nav_register: "Registrieren", nav_logout: "Abmelden", nav_my_tickets: "Meine Tickets", nav_dashboard: "Dashboard",
    hero_title: "Finde deinen nächsten Campus-Moment", hero_subtitle: "Entdecke Feste, Workshops und Wettbewerbe. Registriere dich, bezahle und erhalte dein E-Ticket mit sicherem QR-Code in wenigen Minuten.",
    browse_events: "Veranstaltungen ansehen", my_tickets_btn: "Meine Tickets",
    quick_events: "Veranstaltungen", quick_profile: "Profil", quick_help: "Hilfe",
    cat_all: "Alle Veranstaltungen", cat_technical: "Technisch", cat_cultural: "Kulturell", cat_sports: "Sport", cat_workshops: "Workshops",
    search_placeholder: "Veranstaltungen suchen...", footer_tagline: "Ideales Management, ideale Momente",
    free_label: "Kostenlos", onwards_label: "ab", lang_selector_label: "Sprache"
  },

  pt: { name: "Português", dir: "ltr",
    nav_home: "Início", nav_profile: "Perfil", nav_help: "Ajuda", nav_login: "Entrar",
    nav_register: "Registrar", nav_logout: "Sair", nav_my_tickets: "Meus ingressos", nav_dashboard: "Painel",
    hero_title: "Encontre seu próximo momento no campus", hero_subtitle: "Descubra festivais, workshops e competições. Registre-se, pague e receba seu e-ticket com QR seguro em minutos.",
    browse_events: "Ver eventos", my_tickets_btn: "Meus ingressos",
    quick_events: "Eventos", quick_profile: "Perfil", quick_help: "Ajuda",
    cat_all: "Todos os eventos", cat_technical: "Técnico", cat_cultural: "Cultural", cat_sports: "Esportes", cat_workshops: "Workshops",
    search_placeholder: "Buscar eventos...", footer_tagline: "Gestão ideal, momentos ideais",
    free_label: "Grátis", onwards_label: "a partir de", lang_selector_label: "Idioma"
  },

  ru: { name: "Русский", dir: "ltr",
    nav_home: "Главная", nav_profile: "Профиль", nav_help: "Помощь", nav_login: "Войти",
    nav_register: "Регистрация", nav_logout: "Выйти", nav_my_tickets: "Мои билеты", nav_dashboard: "Панель",
    hero_title: "Найдите свой следующий момент в кампусе", hero_subtitle: "Открывайте фестивали, мастер-классы и конкурсы. Регистрируйтесь, оплачивайте и получайте электронный билет с защищённым QR-кодом за считанные минуты.",
    browse_events: "Смотреть события", my_tickets_btn: "Мои билеты",
    quick_events: "События", quick_profile: "Профиль", quick_help: "Помощь",
    cat_all: "Все события", cat_technical: "Технические", cat_cultural: "Культурные", cat_sports: "Спорт", cat_workshops: "Мастер-классы",
    search_placeholder: "Поиск событий...", footer_tagline: "Идеальное управление, идеальные моменты",
    free_label: "Бесплатно", onwards_label: "от", lang_selector_label: "Язык"
  },

  zh: { name: "简体中文", dir: "ltr",
    nav_home: "首页", nav_profile: "个人资料", nav_help: "帮助", nav_login: "登录",
    nav_register: "注册", nav_logout: "退出登录", nav_my_tickets: "我的门票", nav_dashboard: "仪表盘",
    hero_title: "发现你的下一个校园时刻", hero_subtitle: "探索校园节、工作坊和比赛。几分钟内完成注册、付款，获取带有安全二维码的电子票。",
    browse_events: "浏览活动", my_tickets_btn: "我的门票",
    quick_events: "活动", quick_profile: "个人资料", quick_help: "帮助",
    cat_all: "全部活动", cat_technical: "技术类", cat_cultural: "文化类", cat_sports: "体育类", cat_workshops: "工作坊",
    search_placeholder: "搜索活动...", footer_tagline: "理想管理，理想时刻",
    free_label: "免费", onwards_label: "起", lang_selector_label: "语言"
  },

  ja: { name: "日本語", dir: "ltr",
    nav_home: "ホーム", nav_profile: "プロフィール", nav_help: "ヘルプ", nav_login: "ログイン",
    nav_register: "登録", nav_logout: "ログアウト", nav_my_tickets: "マイチケット", nav_dashboard: "ダッシュボード",
    hero_title: "次のキャンパスの瞬間を見つけよう", hero_subtitle: "フェスト、ワークショップ、コンテストを見つけよう。数分で登録・支払いを済ませ、安全なQR付きのeチケットを取得できます。",
    browse_events: "イベントを見る", my_tickets_btn: "マイチケット",
    quick_events: "イベント", quick_profile: "プロフィール", quick_help: "ヘルプ",
    cat_all: "すべてのイベント", cat_technical: "テクニカル", cat_cultural: "文化", cat_sports: "スポーツ", cat_workshops: "ワークショップ",
    search_placeholder: "イベントを検索...", footer_tagline: "理想の運営、理想の瞬間",
    free_label: "無料", onwards_label: "〜", lang_selector_label: "言語"
  },

  ko: { name: "한국어", dir: "ltr",
    nav_home: "홈", nav_profile: "프로필", nav_help: "도움말", nav_login: "로그인",
    nav_register: "회원가입", nav_logout: "로그아웃", nav_my_tickets: "내 티켓", nav_dashboard: "대시보드",
    hero_title: "다음 캠퍼스 순간을 찾아보세요", hero_subtitle: "축제, 워크숍, 대회를 발견하세요. 몇 분 만에 등록하고 결제하여 안전한 QR 코드가 포함된 전자 티켓을 받으세요.",
    browse_events: "이벤트 보기", my_tickets_btn: "내 티켓",
    quick_events: "이벤트", quick_profile: "프로필", quick_help: "도움말",
    cat_all: "모든 이벤트", cat_technical: "기술", cat_cultural: "문화", cat_sports: "스포츠", cat_workshops: "워크숍",
    search_placeholder: "이벤트 검색...", footer_tagline: "이상적인 관리, 이상적인 순간",
    free_label: "무료", onwards_label: "부터", lang_selector_label: "언어"
  },

  ar: { name: "العربية", dir: "rtl",
    nav_home: "الرئيسية", nav_profile: "الملف الشخصي", nav_help: "مساعدة", nav_login: "تسجيل الدخول",
    nav_register: "التسجيل", nav_logout: "تسجيل الخروج", nav_my_tickets: "تذاكري", nav_dashboard: "لوحة التحكم",
    hero_title: "اكتشف لحظتك الجامعية القادمة", hero_subtitle: "اكتشف المهرجانات وورش العمل والمسابقات. سجّل وادفع واحصل على تذكرتك الإلكترونية برمز QR آمن خلال دقائق.",
    browse_events: "تصفح الفعاليات", my_tickets_btn: "تذاكري",
    quick_events: "الفعاليات", quick_profile: "الملف الشخصي", quick_help: "مساعدة",
    cat_all: "كل الفعاليات", cat_technical: "تقني", cat_cultural: "ثقافي", cat_sports: "رياضي", cat_workshops: "ورش عمل",
    search_placeholder: "ابحث عن الفعاليات...", footer_tagline: "إدارة مثالية، لحظات مثالية",
    free_label: "مجاني", onwards_label: "فما فوق", lang_selector_label: "اللغة"
  }
};
