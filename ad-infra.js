'use strict';


/**
 * Известные рекламные платформы по домену URL (РФ/СНГ и международный рынок).
 * Порядок важен: первое совпадение с доменом выигрывает.
 * @type {Array<{ id: string, test: (host: string) => boolean, name: string, region: 'RU'|'INT', role: string, hint: string }>}
 */
const AD_INFRA_BY_HOST = [
  // —— Россия / СНГ ——
  { id: 'yandex', test: h => /(^|\.)yandex\.(ru|com|net|by|kz|uz)$/.test(h) || /(^|\.)yastatic\.net$/.test(h),
    name: 'Яндекс Реклама / сеть', region: 'RU', role: 'DSP / SSP / сеть',
    hint: 'Частые домены: an.yandex.ru, yabs.yandex.ru. Макросы и корректный HTTPS критичны для валидации.' },
  { id: 'adfox', test: h => /(^|\.)adfox\.(ru|yandex\.ru)$/.test(h),
    name: 'Adfox (Яндекс)', region: 'RU', role: 'Ad server / управление инвентарём',
    hint: 'Популярен у издателей РФ; проверяйте соответствие placement и размеров плеера.' },
  { id: 'vk-ads', test: h => /(^|\.)target\.my\.com$/.test(h) || /(^|\.)vk\.(com|ru)$/.test(h) || /(^|\.)vkuseraudio\.net$/.test(h),
    name: 'VK Реклама (myTarget)', region: 'RU', role: 'DSP / соцсети',
    hint: 'Таргет по соцдему и look-alike; для in-app часто нужны ifa и корректный storeurl.' },
  { id: 'mail-ru', test: h => /(^|\.)mail\.ru$/.test(h) || /(^|\.)ok\.ru$/.test(h) || /(^|\.)my\.com$/.test(h),
    name: 'VK / Mail.ru экосистема', region: 'RU', role: 'Сеть / порталы',
    hint: 'Пересечение с VK Ads; домены трекинга могут отличаться от медиа-CDN.' },
  { id: 'buzzoola', test: h => /(^|\.)buzzoola\.com$/.test(h),
    name: 'Buzzoola', region: 'RU', role: 'Видео SSP',
    hint: 'Российский видео-SSP; убедитесь в полном наборе progress-событий для отчётности.' },
  { id: 'hybrid', test: h => /(^|\.)hybrid\.(ai|ru)$/.test(h),
    name: 'Hybrid', region: 'RU', role: 'DSP / performance',
    hint: 'Performance-фокус; проверяйте атрибуцию post-click и макросы в финальных URL.' },
  { id: 'between', test: h => /(^|\.)between\.(ru|ai)$/.test(h) || /(^|\.)betweendigital\.(com|ru)$/.test(h),
    name: 'Between Digital', region: 'RU', role: 'SSP / видео',
    hint: 'Between Exchange (SSP, ViHub и др.); типичные хосты: ads.betweendigital.com, cdn.betweendigital.com. Длительность и креатив — по медиаплану и гайду поставщика.' },
  { id: 'soloway', test: h => /(^|\.)soloway\.ru$/.test(h),
    name: 'Soloway', region: 'RU', role: 'DSP',
    hint: 'Проверяйте лимиты частоты и соответствие категорий площадки.' },
  { id: 'getintent', test: h => /(^|\.)getintent\.com$/.test(h),
    name: 'Getintent', region: 'RU', role: 'DSP',
    hint: 'Российский DSP; важны корректные geo и device-параметры в bid-запросе/теге.' },
  { id: 'amberdata', test: h => /(^|\.)amberdata\.ru$/.test(h),
    name: 'Amberdata', region: 'RU', role: 'Ad tech / данные',
    hint: 'Участие data-провайдера; согласуйте обработку идентификаторов с политикой площадки.' },
  { id: 'mts-ads', test: h => /(^|\.)mts\.ru$/.test(h) && /ads|adv|media|rmx/i.test(h),
    name: 'МТС / операторская реклама', region: 'RU', role: 'Оператор / сеть',
    hint: 'Операторские домены; уточняйте требования к идентификаторам абонента.' },
  { id: 'sber-ads', test: h => /(^|\.)sberads\.ru$/.test(h) || (/(^|\.)sberbank\.ru$/.test(h) && /ads|adv|promo/i.test(h)),
    name: 'Сбер / рекламные продукты', region: 'RU', role: 'Фин / retail сеть',
    hint: 'Корпоративные домены; следите за политикой бренда и финансовой рекламы.' },
  { id: 'otm', test: h => /(^|\.)otm-r\.com$/.test(h) || /(^|\.)onetarget\.ru$/.test(h),
    name: 'OneTagMedia / OTM', region: 'RU', role: 'Видео сеть',
    hint: 'Региональные и performance-кампании; проверяйте совместимость плеера с VAST 3+.' },
  { id: 'adriver', test: h => /(^|\.)adriver\.ru$/.test(h) || /(^|\.)adriver\.net$/.test(h),
    name: 'AdRiver', region: 'RU', role: 'Ad network / видео',
    hint: 'Частый в РФ; трекинг и редиректы — сверяйте макросы с гайдом сети.' },
  { id: 'pladform', test: h => /(^|\.)pladform\.ru$/.test(h),
    name: 'Pladform', region: 'RU', role: 'SSP / биржа',
    hint: 'Российский programmatic; проверяйте deal и идентификаторы в bid/теге.' },
  { id: 'rutarget', test: h => /(^|\.)rutarget\.ru$/.test(h),
    name: 'Rutarget', region: 'RU', role: 'DSP / данные',
    hint: 'Таргетинг и данные; уточняйте согласование идентификаторов с площадкой.' },
  { id: 'admixer-ru', test: h => /(^|\.)admixer\.ru$/.test(h) || /(^|\.)admixer\.net$/.test(h),
    name: 'Admixer', region: 'RU', role: 'SSP / DSP',
    hint: 'Региональный full-stack; VAST может идти через несколько уровней.' },
  { id: 'segmento', test: h => /(^|\.)segmento\.ru$/.test(h),
    name: 'Segmento', region: 'RU', role: 'DSP / сеть',
    hint: 'Программатик в РФ; проверяйте соответствие креатива и частоты.' },
  // —— Международные ——
  { id: 'google-gam', test: h => /\.googleads?\.g\.doubleclick\.net$/.test(h) || /(^|\.)doubleclick\.net$/.test(h)
    || /(^|\.)googlesyndication\.com$/.test(h) || /(^|\.)googleadservices\.com$/.test(h) || /(^|\.)2mdn\.net$/.test(h)
    || /(^|\.)googlevideo\.com$/.test(h) || /^googleads\./.test(h),
    name: 'Google Ad Manager / GDFP', region: 'INT', role: 'Ad server / SSP',
    hint: 'Часто pubads.g.doubleclick.net; IMA SDK ожидает HTTPS, корректный [ERRORCODE] в Error URL.' },
  { id: 'amazon', test: h => /(^|\.)amazon-adsystem\.com$/.test(h) || /(^|\.)aax\.amazon-adsystem\.com$/.test(h),
    name: 'Amazon Advertising / APS', region: 'INT', role: 'DSP / retail media',
    hint: 'Retail и CTV; проверяйте соответствие inventory type и deal id в цепочке.' },
  { id: 'xandr', test: h => /(^|\.)adnxs\.com$/.test(h) || /(^|\.)xandr\.com$/.test(h),
    name: 'Microsoft Xandr (AppNexus)', region: 'INT', role: 'SSP / биржа',
    hint: 'Типичны домены ib.adnxs.com; глубокие wrapper-цепочки — следите за таймаутами.' },
  { id: 'magnite', test: h => /(^|\.)rubiconproject\.com$/.test(h) || /(^|\.)magnite\.com$/.test(h),
    name: 'Magnite (ex-Rubicon)', region: 'INT', role: 'SSP',
    hint: 'Крупный SSP; для CTV часто требуется строгий MP4 и квартильные события.' },
  { id: 'pubmatic', test: h => /(^|\.)pubmatic\.com$/.test(h),
    name: 'PubMatic', region: 'INT', role: 'SSP',
    hint: 'OpenWrap и header bidding; VAST может приходить через несколько обёрток.' },
  { id: 'openx', test: h => /(^|\.)openx\.(net|org)$/.test(h),
    name: 'OpenX', region: 'INT', role: 'SSP',
    hint: 'Проверяйте deal / private marketplace параметры в upstream URL.' },
  { id: 'index', test: h => /(^|\.)indexexchange\.com$/.test(h) || /(^|\.)casalemedia\.com$/.test(h),
    name: 'Index Exchange', region: 'INT', role: 'SSP',
    hint: 'Часто casalemedia.com в трекерах; убедитесь в консистентности imp id.' },
  { id: 'spotx', test: h => /(^|\.)spotx\.tv$/.test(h) || /(^|\.)spotxchange\.com$/.test(h),
    name: 'SpotX (Magnite CTV)', region: 'INT', role: 'Видео / CTV SSP',
    hint: 'CTV-фокус; VPAID на CTV обычно не работает — нужен чистый MP4.' },
  { id: 'springserve', test: h => /(^|\.)springserve\.com$/.test(h),
    name: 'SpringServe', region: 'INT', role: 'Видео SSP',
    hint: 'Часто в цепочке CTV; проверяйте latency между уровнями wrapper.' },
  { id: 'freewheel', test: h => /(^|\.)freewheel\.tv$/.test(h),
    name: 'FreeWheel', region: 'INT', role: 'CTV / кабельный ad server',
    hint: 'Типично для broadcasters; строгие требования к метаданным и длительности.' },
  { id: 'smart', test: h => /(^|\.)smartadserver\.com$/.test(h),
    name: 'Equativ (Smart)', region: 'INT', role: 'Ad server / SSP',
    hint: 'Популярен в EU; обратите внимание на GDPR / consent в query.' },
  { id: 'stickyads', test: h => /(^|\.)stickyadstv\.com$/.test(h),
    name: 'Equativ stickyads', region: 'INT', role: 'Видео',
    hint: 'Часто встречается в EU video стеках.' },
  { id: 'adform', test: h => /(^|\.)adform\.net$/.test(h),
    name: 'Adform', region: 'INT', role: 'DSP / ad server',
    hint: 'Сильны в Европе; проверяйте согласование user sync и VAST версии.' },
  { id: 'criteo', test: h => /(^|\.)criteo\.(com|net)$/.test(h),
    name: 'Criteo', region: 'INT', role: 'Retail / performance DSP',
    hint: 'Фокус на ретаргетинге; VAST может идти через обёртки retail-партнёров.' },
  { id: 'ttd', test: h => /(^|\.)adsrvr\.org$/.test(h) || /(^|\.)thetradedesk\.com$/.test(h),
    name: 'The Trade Desk', region: 'INT', role: 'DSP',
    hint: 'Часто adsrvr.org в трекерах; UID2 и identity — проверяйте макросы в конечных URL.' },
  { id: 'triplelift', test: h => /(^|\.)3lift\.com$/.test(h) || /(^|\.)triplelift\.com$/.test(h),
    name: 'TripleLift', region: 'INT', role: 'Native / видео SSP',
    hint: 'Native-in-feed; убедитесь, что плеер поддерживает нужный формат креатива.' },
  { id: 'sharethrough', test: h => /(^|\.)sharethrough\.com$/.test(h),
    name: 'Sharethrough', region: 'INT', role: 'Native SSP',
    hint: 'Фокус на native; VAST может комбинироваться с display.' },
  { id: 'taboola', test: h => /(^|\.)taboola\.com$/.test(h),
    name: 'Taboola', region: 'INT', role: 'Native / feed',
    hint: 'Часто recommendation; проверяйте disclosure и click-through поведение.' },
  { id: 'outbrain', test: h => /(^|\.)outbrain\.com$/.test(h),
    name: 'Outbrain', region: 'INT', role: 'Native / feed',
    hint: 'Схожий с Taboola use-case — валидация видео в ленте.' },
  { id: 'innovid', test: h => /(^|\.)innovid\.com$/.test(h),
    name: 'Innovid', region: 'INT', role: 'Креатив / измерения',
    hint: 'Часто VPAID/интерактив; на mobile/CTV проверьте фоллбэк на MP4.' },
  { id: 'ias', test: h => /(^|\.)integralads\.com$/.test(h) || /(^|\.)adsafeprotected\.com$/.test(h),
    name: 'IAS (Integral Ad Science)', region: 'INT', role: 'Verification',
    hint: 'Пиксели верификации; не путать с основным ad server — это измерение видимости/безопасности.' },
  { id: 'doubleverify', test: h => /(^|\.)doubleverify\.com$/.test(h),
    name: 'DoubleVerify', region: 'INT', role: 'Verification',
    hint: 'Viewability/brand safety; дополнительные запросы в цепочке.' },
  { id: 'moat', test: h => /(^|\.)moatads\.com$/.test(h),
    name: 'Oracle Moat', region: 'INT', role: 'Verification / аналитика',
    hint: 'Измерение вовлечённости; может увеличивать число сторонних запросов.' },
  { id: 'unity', test: h => /(^|\.)unityads\.unity3d\.com$/.test(h),
    name: 'Unity Ads', region: 'INT', role: 'Игровой mobile SDK',
    hint: 'In-app игры; Web VAST реже — чаще SDK-интеграция.' },
  { id: 'ironsource', test: h => /(^|\.)supersonicads\.com$/.test(h) || /(^|\.)isprog\.com$/.test(h),
    name: 'ironSource / Unity', region: 'INT', role: 'Mobile mediation',
    hint: 'Медиация приложений; VAST в вебе может отличаться от SDK-ответов.' },
  { id: 'applovin', test: h => /(^|\.)applovin\.com$/.test(h),
    name: 'AppLovin', region: 'INT', role: 'Mobile / игры',
    hint: 'MAX mediation; для web-плеера убедитесь, что endpoint отдаёт именно VAST XML.' },
  { id: 'vungle', test: h => /(^|\.)vungle\.com$/.test(h),
    name: 'Vungle / Liftoff', region: 'INT', role: 'Mobile video',
    hint: 'In-app видео; проверяйте ориентацию и rewarded vs interstitial.' },
  { id: 'chartboost', test: h => /(^|\.)chartboost\.com$/.test(h),
    name: 'Chartboost', region: 'INT', role: 'Игровая реклама',
    hint: 'Игровой трафик; креативы должны соответствовать store guidelines.' },
  { id: 'smaato', test: h => /(^|\.)smaato\.com$/.test(h),
    name: 'Smaato', region: 'INT', role: 'Mobile SSP',
    hint: 'Глобальный mobile exchange; следите за размером и таймаутом VAST.' },
  { id: 'yahoo', test: h => /(^|\.)advertising\.com$/.test(h) || (/(^|\.)yahoo\.com$/.test(h) && /(ads|advertising|gemini)/i.test(h)),
    name: 'Yahoo Advertising', region: 'INT', role: 'SSP / сеть',
    hint: 'Наследие Verizon Media; домены могут пересекаться с AOL/Advertising.com.' },
  { id: 'meta', test: h => /(^|\.)facebook\.com$/.test(h) || /(^|\.)fb\.com$/.test(h) || /(^|\.)fbcdn\.net$/.test(h) || /(^|\.)facebook\.net$/.test(h),
    name: 'Meta (Facebook)', region: 'INT', role: 'Сеть / аудитории',
    hint: 'Пиксели, трекинг, аудитории; VAST в цепочке — по документации Meta.' },
  { id: 'tiktok', test: h => /(^|\.)tiktok\.com$/.test(h) || /(^|\.)tiktokv\.com$/.test(h) || /(^|\.)byteoversea\.com$/.test(h) || /(^|\.)tiktokcdn\.com$/.test(h),
    name: 'TikTok / ByteDance Ads', region: 'INT', role: 'DSP / short video',
    hint: 'In-app и web; трекинг и viewability — по гайду TikTok Marketing API.' },
  { id: 'snap', test: h => /(^|\.)snapads\.com$/.test(h) || /(^|\.)sc-static\.net$/.test(h) || /(^|\.)snapchat\.com$/.test(h),
    name: 'Snapchat Ads', region: 'INT', role: 'Mobile / social',
    hint: 'Часто mobile; проверяйте MRC viewability и ограничения WebView.' },
  { id: 'twitter-x', test: h => /(^|\.)ads-twitter\.com$/.test(h) || /(^|\.)twimg\.com$/.test(h) || /(^|\.)t\.co$/.test(h) || /(^|\.)twitter\.com$/.test(h) || /(^|\.)x\.com$/.test(h),
    name: 'X (Twitter) Ads', region: 'INT', role: 'Соцсеть / сеть',
    hint: 'Трекеры и короткие URL; сверяйте развёрнутый хост в цепочке.' },
  { id: 'reddit', test: h => /(^|\.)reddit\.com$/.test(h) || /(^|\.)redditmedia\.com$/.test(h) || /(^|\.)redditstatic\.com$/.test(h),
    name: 'Reddit Ads', region: 'INT', role: 'Соцсеть / native',
    hint: 'Community и brand safety; проверяйте placement и формат креатива.' },
  { id: 'linkedin', test: h => /(^|\.)linkedin\.com$/.test(h) || /(^|\.)licdn\.com$/.test(h),
    name: 'LinkedIn Marketing', region: 'INT', role: 'B2B / сеть',
    hint: 'B2B-инвентарь; часто строгие требования к креативу и лендингу.' },
  { id: 'pinterest', test: h => /(^|\.)pinterest\.com$/.test(h) || /(^|\.)pinimg\.com$/.test(h),
    name: 'Pinterest Ads', region: 'INT', role: 'Discovery / visual',
    hint: 'Визуальный инвентарь; видео и idea pins — по спецификации сети.' },
  { id: 'bing-ms', test: h => /(^|\.)bat\.bing\.com$/.test(h) || /(^|\.)bingads\.microsoft\.com$/.test(h) || /(^|\.)ads\.msn\.com$/.test(h),
    name: 'Microsoft Advertising (Bing / MSN)', region: 'INT', role: 'Поиск / сеть',
    hint: 'Часто bat.bing.com в трекерах; помимо Xandr — отдельный стек Microsoft.' },
  { id: 'adobe-ec', test: h => /(^|\.)demdex\.net$/.test(h) || /(^|\.)adobedc\.net$/.test(h) || /(^|\.)everesttech\.net$/.test(h),
    name: 'Adobe Experience Cloud / Audience', region: 'INT', role: 'DMP / данные',
    hint: 'Синхронизация аудиторий и пиксели; не путать с основным ad server.' },
  { id: 'media-net', test: h => /(^|\.)media\.net$/.test(h) || /(^|\.)mnet\.com$/.test(h),
    name: 'Media.net (Yahoo / Bing contextual)', region: 'INT', role: 'SSP / contextual',
    hint: 'Контекстная монетизация; часто в связке с поисковым и display-инвентарём.' },
  { id: 'contextweb', test: h => /(^|\.)contextweb\.com$/.test(h),
    name: 'PulsePoint / ContextWeb', region: 'INT', role: 'SSP',
    hint: 'Программатик-инвентарь; проверяйте imp id в обёртках.' },
  { id: 'sovrn', test: h => /(^|\.)sovrn\.com$/.test(h) || /(^|\.)lijit\.com$/.test(h),
    name: 'Sovrn', region: 'INT', role: 'SSP / commerce',
    hint: 'Header bidding и commerce; VAST может идти через несколько уровней.' },
  { id: 'sonobi', test: h => /(^|\.)sonobi\.com$/.test(h),
    name: 'Sonobi', region: 'INT', role: 'SSP / HBS',
    hint: 'Header bidding; следите за таймаутами в wrapper-цепочке.' },
  { id: 'gumgum', test: h => /(^|\.)gumgum\.com$/.test(h),
    name: 'GumGum', region: 'INT', role: 'SSP / in-image',
    hint: 'In-image и видео; проверяйте совместимость с плеером и форматом.' },
  { id: '33across', test: h => /(^|\.)33across\.com$/.test(h),
    name: '33Across', region: 'INT', role: 'SSP',
    hint: 'Attention и viewability; дополнительные запросы в цепочке.' },
  { id: 'nexxen', test: h => /(^|\.)nexxen\.com$/.test(h) || /(^|\.)unruly\.co$/.test(h) || /(^|\.)videologygroup\.com$/.test(h),
    name: 'Nexxen (ex-Unruly)', region: 'INT', role: 'Видео / data',
    hint: 'Видео и данные; проверяйте бренд после ребрендингов в группе.' },
  { id: 'beachfront', test: h => /(^|\.)bfmio\.com$/.test(h) || /(^|\.)beachfrontmedia\.com$/.test(h),
    name: 'Beachfront', region: 'INT', role: 'Видео SSP / CTV',
    hint: 'CTV и OTT; квартильные события — по спецификации.' },
  { id: 'beeswax', test: h => /(^|\.)beeswax\.com$/.test(h) || /(^|\.)bidr\.io$/.test(h),
    name: 'Beeswax (Freewheel)', region: 'INT', role: 'DSP / bidders',
    hint: 'Bidder-as-a-service; проверяйте endpoint и аутентификацию.' },
  { id: 'bidswitch', test: h => /(^|\.)bidswitch\.net$/.test(h),
    name: 'BidSwitch', region: 'INT', role: 'Supply routing',
    hint: 'Маршрутизация supply/demand; не путать с конечным ad server.' },
  { id: 'inmobi', test: h => /(^|\.)inmobi\.com$/.test(h),
    name: 'InMobi', region: 'INT', role: 'Mobile SSP',
    hint: 'Mobile и in-app; проверяйте IFA и store URL.' },
  { id: 'ogury', test: h => /(^|\.)ogury\.com$/.test(h),
    name: 'Ogury', region: 'INT', role: 'Mobile / consent',
    hint: 'Choice и mobile; учитывайте согласие и ограничения ОС.' },
  { id: 'yieldmo', test: h => /(^|\.)yieldmo\.com$/.test(h),
    name: 'Yieldmo', region: 'INT', role: 'SSP / mobile',
    hint: 'Mobile-first форматы; проверяйте размеры и viewability.' },
  { id: 'emx', test: h => /(^|\.)emxdigital\.com$/.test(h),
    name: 'EMX (Engine)', region: 'INT', role: 'SSP',
    hint: 'Programmatic video; обёртки и deal id — по документации.' },
  { id: 'azerion', test: h => /(^|\.)azerion\.com$/.test(h) || /(^|\.)360yield\.com$/.test(h) || /(^|\.)improvedigital\.com$/.test(h),
    name: 'Azerion (Improve Digital)', region: 'INT', role: 'SSP / ad tech',
    hint: 'EU и global; 360yield — типичный bidder-домен в цепочке.' },
  { id: 'stackadapt', test: h => /(^|\.)stackadapt\.com$/.test(h),
    name: 'StackAdapt', region: 'INT', role: 'DSP / native',
    hint: 'Programmatic native и video; канадский вендор с глобальным охватом.' },
  { id: 'admixer-int', test: h => /(^|\.)admixer\.com$/.test(h),
    name: 'Admixer', region: 'INT', role: 'SSP / DSP',
    hint: 'Глобальный full-stack; не путать с региональными доменами admixer.ru.' },
  { id: 'vidoomy', test: h => /(^|\.)vidoomy\.com$/.test(h),
    name: 'Vidoomy', region: 'INT', role: 'Видео / outstream',
    hint: 'Outstream и видео; проверяйте autoplay и mute-политику плеера.' },
  { id: 'primis', test: h => /(^|\.)primis\.tech$/.test(h) || /(^|\.)sekindo\.com$/.test(h),
    name: 'Primis / Sekindo', region: 'INT', role: 'Видео / recommendation',
    hint: 'In-article video; часто outstream — сверяйте с площадкой.' },
  { id: 'minute-media', test: h => /(^|\.)minutemedia\.com$/.test(h) || /(^|\.)minute\.ly$/.test(h),
    name: 'Minute Media', region: 'INT', role: 'Publisher / video',
    hint: 'Контент и видео-инвентарь; проверяйте права на плеер и VAST.' },
  { id: 'jwplayer', test: h => /(^|\.)jwplayer\.com$/.test(h) || /(^|\.)jwpsrv\.com$/.test(h),
    name: 'JW Player', region: 'INT', role: 'Player / SSAI',
    hint: 'Плеер и иногда SSAI; VAST зависит от конфигурации издателя.' },
  { id: 'hulu-disney', test: h => /(^|\.)huluim\.com$/.test(h) || /(^|\.)bamgrid\.com$/.test(h) || /(^|\.)disneyadvertising\.com$/.test(h),
    name: 'Disney / Hulu Ads', region: 'INT', role: 'CTV / streaming',
    hint: 'Стриминг и CTV; строгие требования к бренду и длительности.' },
  { id: 'roku', test: h => /(^|\.)ads\.roku\.com$/.test(h) || /(^|\.)ravm\.tv$/.test(h),
    name: 'Roku Ads', region: 'INT', role: 'CTV',
    hint: 'CTV-инвентарь; проверяйте формат и сертификацию плеера.' },
];

/** Совпадения по тексту &lt;AdSystem&gt; (если домены не дали однозначности). */
const AD_INFRA_BY_ADSYSTEM = [
  { id: 'google-gam', re: /google|doubleclick|gdfp|ima(\s|\/|$)/i, name: 'Google Ad Manager / IMA', region: 'INT', role: 'Ad server', hint: 'Типичное объявление в GAM / через IMA SDK.' },
  { id: 'yandex', re: /яндекс|yandex|adfox/i, name: 'Яндекс / Adfox', region: 'RU', role: 'Сеть', hint: 'Указан Яндекс или Adfox в качестве рекламной системы.' },
  { id: 'vk-ads', re: /mytarget|mail\.ru ads|vk\s*ads|target\.my/i, name: 'VK Реклама / myTarget', region: 'RU', role: 'DSP', hint: 'Идентификация myTarget / VK в AdSystem.' },
  { id: 'xandr', re: /app ?nexus|adnxs|xandr/i, name: 'Xandr / AppNexus', region: 'INT', role: 'SSP', hint: 'Стек Microsoft Advertising / Xandr.' },
  { id: 'magnite', re: /magnite|rubicon/i, name: 'Magnite', region: 'INT', role: 'SSP', hint: 'Бывший Rubicon Project.' },
  { id: 'amazon', re: /amazon(\s|-)*ads|aax\.|aps/i, name: 'Amazon Advertising', region: 'INT', role: 'DSP / APS', hint: 'Amazon Ads или APS.' },
  { id: 'freewheel', re: /freewheel/i, name: 'FreeWheel', region: 'INT', role: 'CTV ad server', hint: 'Часто для broadcast / CTV.' },
  { id: 'smart', re: /smart\s*ad\s*server|equativ/i, name: 'Equativ / Smart', region: 'INT', role: 'Ad server', hint: 'Популярен в Европе.' },
  { id: 'innovid', re: /innovid/i, name: 'Innovid', region: 'INT', role: 'Креатив', hint: 'Интерактив и измерения.' },
  { id: 'spotx', re: /spotx/i, name: 'SpotX', region: 'INT', role: 'Видео SSP', hint: 'CTV и OTT.' },
  { id: 'meta', re: /facebook|meta(\s|\/|$)|fb\s*ads/i, name: 'Meta / Facebook', region: 'INT', role: 'Сеть', hint: 'Указание Meta или Facebook в AdSystem.' },
  { id: 'tiktok', re: /tiktok|byte(dance|oversea)/i, name: 'TikTok / ByteDance', region: 'INT', role: 'Сеть', hint: 'Указание TikTok в ответе.' },
  { id: 'adriver', re: /adriver/i, name: 'AdRiver', region: 'RU', role: 'Сеть', hint: 'Российская сеть AdRiver.' },
  { id: 'pladform', re: /pladform/i, name: 'Pladform', region: 'RU', role: 'SSP', hint: 'Российская биржа Pladform.' },
  { id: 'admixer', re: /admixer/i, name: 'Admixer', region: 'INT', role: 'SSP / DSP', hint: 'Платформа Admixer.' },
  { id: 'beeswax', re: /beeswax|bidr\.io/i, name: 'Beeswax', region: 'INT', role: 'DSP', hint: 'Beeswax bidder.' },
  { id: 'linkedin', re: /linkedin/i, name: 'LinkedIn', region: 'INT', role: 'B2B', hint: 'LinkedIn Marketing.' },
  { id: 'between', re: /betweendigital|between\s+digital|between\s+exchange|vihub/i, name: 'Between Digital', region: 'RU', role: 'SSP', hint: 'Between Digital / ViHub / Exchange.' },
];

/** @param {string} raw */
function hostnameFromVastUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const s = raw.trim();
  if (!/^https?:\/\//i.test(s)) return '';
  try {
    const h = new URL(s).hostname.toLowerCase();
    return h.startsWith('www.') ? h.slice(4) : h;
  } catch {
    return '';
  }
}

/**
 * Собирает все HTTP(S) URL из VAST-ответа (врапперы, трекеры, медиа, события).
 * @param {Record<string, unknown>} data
 */
function collectVastHttpUrls(data) {
  const out = [];
  const add = (/** @type {unknown} */ v) => {
    if (typeof v !== 'string') return;
    const t = v.trim();
    if (/^https?:\/\//i.test(t)) out.push(t);
  };
  if (data.wrapperUrl) add(data.wrapperUrl);
  if (Array.isArray(data.chain)) {
    data.chain.forEach((/** @type {{ wrapperUrl?: string }} */ n) => {
      if (n && n.wrapperUrl) add(n.wrapperUrl);
    });
  }
  if (Array.isArray(data.trackers)) data.trackers.forEach(t => add(t.url));
  if (Array.isArray(data.mediaFiles)) data.mediaFiles.forEach(m => add(m.url));
  const em = data.eventMap;
  if (em && typeof em === 'object') {
    Object.values(em).forEach(arr => {
      if (Array.isArray(arr)) arr.forEach(add);
    });
  }
  return out;
}

/**
 * Распознавание известных ad servers / SSP / verification по доменам и AdSystem.
 * @param {Record<string, unknown>} data
 */
function analyzeAdInfrastructure(data) {
  const seen = new Set();
  /** @type {Array<{ id: string, name: string, region: string, role: string, hint: string, sampleHost: string }>} */
  const items = [];
  const pushRule = (rule, sampleHost) => {
    if (seen.has(rule.id)) return;
    seen.add(rule.id);
    items.push({
      id: rule.id,
      name: rule.name,
      region: rule.region,
      role: rule.role,
      hint: rule.hint,
      sampleHost,
    });
  };

  const urls = collectVastHttpUrls(data);
  for (const u of urls) {
    const host = hostnameFromVastUrl(u);
    if (!host) continue;
    for (const rule of AD_INFRA_BY_HOST) {
      if (rule.test(host)) {
        pushRule(rule, host);
        break;
      }
    }
  }

  const adSys = typeof data.adSystem === 'string' ? data.adSystem.trim() : '';
  if (adSys) {
    for (const row of AD_INFRA_BY_ADSYSTEM) {
      if (row.re.test(adSys)) {
        const pseudo = { id: row.id, name: row.name, region: row.region, role: row.role, hint: row.hint, test: () => false };
        pushRule(pseudo, '<AdSystem>');
        break;
      }
    }
  }

  items.sort((a, b) => {
    const oa = a.region === 'RU' ? 0 : 1;
    const ob = b.region === 'RU' ? 0 : 1;
    if (oa !== ob) return oa - ob;
    return a.name.localeCompare(b.name, 'ru');
  });

  return { items, scannedUrls: urls.length };
}


function analyzeAdInfrastructureFromVastTag(base, params) {
  const urls = [];
  const add = (v) => {
    if (typeof v !== 'string') return;
    const t = v.trim();
    if (/^https?:\/\//i.test(t)) urls.push(t);
  };
  if (base) add(base);
  if (Array.isArray(params)) {
    params.forEach((p) => {
      if (p && p.enabled !== false && p.value != null) add(String(p.value));
    });
  }
  return analyzeAdInfrastructure({
    wrapperUrl: null,
    chain: [],
    trackers: urls.map((u) => ({ url: u })),
    mediaFiles: [],
    eventMap: {},
    adSystem: null,
  });
}

if (typeof window !== 'undefined') {
  window.analyzeAdInfrastructure = analyzeAdInfrastructure;
  window.analyzeAdInfrastructureFromVastTag = analyzeAdInfrastructureFromVastTag;
  window.hostnameFromVastUrl = hostnameFromVastUrl;
  window.collectVastHttpUrls = collectVastHttpUrls;
}
